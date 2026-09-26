import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { build, stop } from 'esbuild'
import type { AuditState, BusinessProfile, BusinessProfileState } from '../src/types/audit.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import { auditWebsite } from '../server/websiteAudit.ts'
import { captureMachineMetadata } from '../server/machineReadabilityCapture.ts'
import { assessSearchCapture, jsonLdResultExtractor, semanticResultExtractor } from '../src/utils/searchResultExtraction.ts'
import { assessBusinessCandidates, matchBusinessCandidate } from '../src/utils/entityMatcher.ts'
import { applicationScanDependencies, mergeAutomatedObservation, runVisibilityScan } from '../src/utils/visibilityScan.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { evaluateMachineReadability, deriveMachineFindings, currentMachineReadability, inspectRobots } from '../src/utils/machineReadability.ts'
import { deriveWebsiteFindings } from '../src/utils/findingIntelligence.ts'
import { summarizePublicPresence } from '../src/utils/publicPresence.ts'
import { workspaceFindings } from '../src/utils/workspaceFindings.ts'
import { customerReviewKey, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { defaultProfile } from '../src/data/demoProfile.ts'

// All network responses below are controlled fixtures, NOT new live Mary evidence.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8'))
const profile = normalizeWorkspaceProfile({ businessName: fixture.request.businessName, website: 'http://montessoridownriver.com/', streetAddress: '123 Fixture Street', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-555-0100', primaryCategory: 'School' })
const reviewedState = (p: BusinessProfile): BusinessProfileState => ({ schemaVersion: 1, values: Object.fromEntries(Object.entries(p).map(([field, value]) => [field, { value, source: 'synthetic operator review', status: 'operator_reviewed', confidence: 'high' }])) })
const makeState = (p = profile): AuditState => ({ profile: structuredClone(p), businessProfile: reviewedState(p), checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: { entityClarity: [], customerQuestions: [] } })
const record = { '@type': 'Organization', '@id': 'https://fixture-directory.example.org/place/1', name: profile.businessName, url: profile.website, telephone: '+1 (734) 555-0100', address: { '@type': 'PostalAddress', streetAddress: '123 Fixture St.', addressLocality: 'Southgate', addressRegion: 'Michigan', postalCode: '48195' } }
const jsonld = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`
const capture = (html: string, url = 'https://www.google.com/search?q=fixture', method: AcquisitionResult['method'] = 'server_fetch', outcome: AcquisitionResult['outcome'] = 'success'): AcquisitionResult => ({ version: 1, requestedUrl: url, finalUrl: url, method, provider: `fixture-${method}`, acquiredAt: new Date().toISOString(), outcome, html, notes: [], confidence: 'captured' })
const goodCapture = capture(jsonld(record))
const good = assessSearchCapture(goodCapture, profile, reviewedState(profile), 'Google Search')
assert.equal(good.automaticObservation, true, '5: strong reviewed name/location/identifier creates an automatic observation')
assert.equal(good.confidence, 'high')
assert(good.selected?.matchedFields.some((field) => field.field === 'phone'))
assert(good.selected?.matchedFields.some((field) => field.field === 'region'))
assert.equal(assessSearchCapture(capture(`<h3><a href="${profile.website}">${profile.businessName}</a></h3>`), profile, reviewedState(profile), 'Google Search').automaticObservation, false, '6: name/domain without location remains ambiguous')
const bad = { ...record, url: 'https://other.example.org', telephone: '734-555-0199', address: { ...record.address, streetAddress: '999 Other Road' } }
const conflicted = assessSearchCapture(capture(jsonld(bad)), profile, reviewedState(profile), 'Google Search')
assert.equal(conflicted.automaticObservation, false)
for (const field of ['phone', 'website', 'streetAddress']) assert(conflicted.selected?.conflictingFields.some((conflict) => conflict.field === field), `7: ${field} conflict survives`)
const multiple = assessSearchCapture(capture(jsonld([record, { ...record, '@id': 'place-2', address: { ...record.address, streetAddress: '77 Other Street' } }])), profile, reviewedState(profile), 'Google Maps')
assert.equal(multiple.automaticObservation, false)
assert.equal(multiple.blocker, 'multiple_entities')
const unreviewed = assessSearchCapture(goodCapture, profile, { schemaVersion: 1, values: {} }, 'Google Search')
assert.equal(unreviewed.automaticObservation, false, 'Provisional seed values cannot establish a high-confidence match')
assert.equal(unreviewed.blocker, 'unreviewed_profile')
const staleReview = reviewedState(profile)
staleReview.values.phone!.value = '734-555-0198'
assert(matchBusinessCandidate(good.selected!.candidate, profile, staleReview).unreviewedProfileFields.includes('phone'))
const mergedRepresentations = assessBusinessCandidates([...good.matches.map((match) => match.candidate), { ...good.selected!.candidate, id: 'partial-link', kind: 'result_link', fields: { name: profile.businessName, website: profile.website } }], profile, reviewedState(profile))
assert.equal(mergedRepresentations.automaticObservation, true, 'A consistent partial link does not invent a second entity')
const semantic = `<article itemscope itemtype="https://schema.org/LocalBusiness"><h2 itemprop="name">${profile.businessName}</h2><span itemprop="streetAddress">123 Fixture Street</span><span itemprop="addressLocality">Southgate</span><span itemprop="addressRegion">MI</span><span itemprop="postalCode">48195</span><a itemprop="url" href="${profile.website}">Website</a><a href="tel:7345550100">Call</a></article>`
assert.equal(assessSearchCapture(capture(semantic), profile, reviewedState(profile), 'Bing Search').automaticObservation, true, 'Semantic DOM fields support source/rendered capture')
assert.equal(semanticResultExtractor.extract(capture(`<div hidden>${semantic}</div>`)).length, 0, 'Explicit hidden HTML is not visible result evidence')
assert.equal(assessSearchCapture(capture(`<title>${profile.businessName} Southgate MI</title>`), profile, reviewedState(profile), 'Google Search').matches.length, 0, 'Query echo is not a result')
const graph = { '@graph': [{ ...record, address: { '@id': '#address' } }, { '@id': '#address', ...record.address }] }
assert.equal(jsonLdResultExtractor.extract(capture(jsonld(graph)))[0].fields.locality, 'Southgate')
const linkedLocation = { '@graph': [{ ...record, address: undefined, location: { '@id': '#place' } }, { '@type': 'Place', '@id': '#place', address: record.address }] }
assert.equal(jsonLdResultExtractor.extract(capture(jsonld(linkedLocation)))[0].fields.locality, 'Southgate', 'Explicit location relationships retain their observed address facts')

const interactive = assessSearchCapture(capture(`<main role="main"><h1>${profile.businessName}</h1><button>Open business details and hours</button></main>`), profile, reviewedState(profile), 'Google Maps')
assert.equal(interactive.tier3Candidate, true, 'Actual captured public controls can justify a Tier-3 candidate')
const blocked = assessSearchCapture(capture('<title>Access denied</title><button>Continue</button>', undefined, 'server_fetch', 'blocked'), profile, reviewedState(profile), 'Google Maps')
assert.equal(blocked.tier3Candidate, false, 'Access barriers are not challenge-bypass candidates')
const failed = assessSearchCapture({ ...capture(''), outcome: 'failed', error: 'EAI_AGAIN' }, profile, reviewedState(profile), 'Google Maps')
assert.equal(failed.blocker, 'acquisition_failure')
assert.equal(failed.tier3Candidate, false, 'DNS failures do not establish interaction blockers')

const originalFetch = globalThis.fetch
const originalInfo = console.info
console.info = () => undefined
const respond = (text: string, url: string, headers?: Record<string, string>) => { const response = new Response(text, { status: 200, headers }); Object.defineProperty(response, 'url', { value: url }); return response }
let state = makeState()
let websiteCalls = 0
const requests: string[] = []
const snapshots: AuditState[] = []
try {
  globalThis.fetch = async (input, options) => {
    const url = String(input)
    if (url === '/api/audit-website') { websiteCalls++; return new Response(JSON.stringify(await auditWebsite(JSON.parse(String(options?.body))))) }
    if (url.startsWith('https:')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
    if (url.includes('/robots.txt')) return respond('User-agent: *\nAllow: /\nSitemap: http://montessoridownriver.com/sitemap.xml', url, { 'content-type': 'text/plain' })
    if (options?.method === 'HEAD') return respond('', url)
    return respond(`<html><head><title>${profile.businessName}</title>${fixture.descriptionElements.join('')}<link rel="canonical" href="${profile.website}"><meta name="robots" content="index,follow"><meta property="og:title" content="${profile.businessName}">${jsonld(fixture.response.jsonLdSchemaBlocks)}</head><body><h1>${profile.businessName}</h1><p>${profile.streetAddress}, ${profile.city}, ${profile.state} ${profile.zip}. ${profile.primaryCategory}. Phone ${profile.phone}.</p><h2>Our programs</h2><a href="/programs">Programs</a></body></html>`, profile.website)
  }
  const run = await runVisibilityScan(state, { ...applicationScanDependencies,
    async acquire(url, method) {
      requests.push(`${url}:${method}`)
      if (url.includes('instagram') || url.includes('facebook')) return { ...capture('', url, method), outcome: 'failed', error: 'Fixture connection failed' }
      if (url.includes('maps.apple')) return capture('<main><button>Choose a place to see details and contact information</button></main>', url, method)
      if (url.includes('google.com/maps') && method === 'server_fetch') return capture('<main>Loading public place results</main>', url, method, 'partial')
      return capture(jsonld(record), url, method)
    },
  }, (update) => { state = update(state); snapshots.push(structuredClone(state)) })
  assert.equal(websiteCalls, 1)
  assert.equal(run.version, 2)
  const search = run.checks.filter((check) => check.destination)
  assert.equal(search.filter((check) => check.queryMode === 'brand').length, 8, '1: brand mode runs across all destinations')
  assert.equal(search.filter((check) => check.queryMode === 'location').length, 8, '1: location mode runs without a Workbench prerequisite')
  assert.notEqual(search.find((check) => check.queryMode === 'brand')?.url, search.find((check) => check.queryMode === 'location')?.url)
  const brand = state.searchDestinationObservations['search-brand-canonical']
  const location = state.searchDestinationObservations['search-brand-market']
  assert(brand && location)
  assert.notEqual(brand['Google Search']?.query, location['Google Search']?.query, '2: observations have independent keys and query text')
  assert.equal(brand['Google Search']?.overallResult, 'found_match')
  assert.equal(brand['Google Search']?.reviewed, false, 'Automatic observation never approves an Action Plan')
  const summary = summarizePublicPresence(state)
  assert.equal(summary.attempted, 19, 'Brand/Location plus three destinations for the approved category query')
  assert.equal(summary.automatic, 13)
  assert.equal(summary.reviewRequired, 6)
  assert.equal(summary.label, 'Needs review', '3: attempts requiring review must not say Not tested')
  const corrected = structuredClone(state)
  corrected.searchDestinationObservations['search-brand-canonical']['Google Search'] = { ...brand['Google Search']!, provenance: 'operator_observation', evidenceNotes: 'Operator reports a different observed record.', reviewed: false }
  assert.equal(summarizePublicPresence(corrected).reviewRequired, 7, 'A manual correction overrides the old automatic conclusion in the summary')
  assert.equal(mergeAutomatedObservation({ ...brand['Google Search']!, query: 'JEM Photography', evidenceNotes: 'JEM-only evidence' }, brand['Google Search']!).evidenceNotes, brand['Google Search']!.evidenceNotes, 'Different business/query evidence is not merged into a new observation')
  const unconfirmed = structuredClone(state)
  unconfirmed.businessProfile.values.businessName!.status = 'inferred'
  assert.equal(summarizePublicPresence(unconfirmed).automatic, 0, 'Revoked profile review invalidates automatic-confidence counts')

  for (const observations of [brand, location]) for (const observation of Object.values(observations)) assert.notEqual(observation?.overallResult, 'not_found', '4: no evidence never becomes absence')
  assert.equal(brand['Google Maps']?.automation?.captures.length, 2)
  assert.deepEqual(state.profile, profile, '8: public evidence never overwrites reviewed business facts')
  const report = state.machineReadability!
  assert.equal(report.status, 'evidence_captured')
  assert(report.schemaTypes.includes('WebSite') && report.schemaTypes.includes('WebPage'), '9: parses captured JSON-LD graph')
  assert.equal(report.entities.length, 0, '10: generic schema is not a business entity')
  assert.equal(report.checks.find((check) => check.id === 'business-entity')?.result, 'not_observed')
  assert.equal(report.checks.find((check) => check.id === 'robots-behavior')?.result, 'observed')
  assert.equal(report.checks.find((check) => check.id === 'indexability')?.result, 'observed')
  assert.equal(report.checks.find((check) => check.id === 'description')?.result, 'needs_review')
  assert.equal(report.answerTesting, 'not_performed')
  assert(report.conditions.some((condition) => condition.id === 'missing_business_entity'), '11: enough reviewed/visible identity supports a missing business entity candidate')
  const machineFixes = deriveMachineFindings(state)
  assert.equal(machineFixes.length, 1)
  const reordered = JSON.parse(JSON.stringify(state)) as AuditState
  reordered.profile = Object.fromEntries(Object.entries(reordered.profile).reverse()) as unknown as BusinessProfile
  reordered.businessProfile.values = Object.fromEntries(Object.entries(reordered.businessProfile.values).reverse())
  assert.equal(deriveMachineFindings(reordered).length, 1, 'Save/load property ordering does not invalidate equivalent evidence')
  assert.equal(summarizePublicPresence(reordered).automatic, summary.automatic)

  assert(!workspaceFindings(state).some((fix) => fix.id === 'website-schema'), 'Specific entity findings replace the overlapping generic schema recommendation')
  assert(machineFixes.every((fix) => !fix.reviewed))
  assert(machineFixes[0].intelligence?.remediation?.rollbackRecovery)
  assert.equal(machineFixes[0].intelligence?.remediation?.lifecycle, 'Evidence captured')
  const provisional = { ...state, businessProfile: { schemaVersion: 1 as const, values: {} } }
  assert.equal(evaluateMachineReadability(provisional).conditions.length, 0, '11: unconfirmed profile cannot generate entity remediation candidates')
  const noVisible = structuredClone(state)
  noVisible.websiteAudit.latestAttempt = { ...state.websiteAudit.lastSuccessful!, machineReadabilityCapture: { ...state.websiteAudit.lastSuccessful!.machineReadabilityCapture!, visibleText: 'Generic welcome page' } }
  assert.equal(evaluateMachineReadability(noVisible).conditions.length, 0)
  const unknownType = structuredClone(state)
  unknownType.websiteAudit.latestAttempt = { ...state.websiteAudit.lastSuccessful!, jsonLdSchemaBlocks: [{ '@type': 'UnrecognizedBusinessSubtype', name: profile.businessName }] }
  assert.equal(evaluateMachineReadability(unknownType).conditions.length, 0, 'Unknown schema types require interpretation, not automatic missing-entity claims')
  const machineArea = summarizeCustomerScan(state, [], workspaceFindings(state)).areas[3]
  assert.equal(machineArea.scanState, 'evidence_captured', '12: AI Discovery derives from actual machine evidence')
  assert(machineArea.detail.includes('AI answer testing was not performed'))
  assert.equal(summarizeCustomerScan(state, [], workspaceFindings(state)).findings.length, 0)
  for (const fix of machineFixes) assert.match(fix.intelligence!.customer.why, /do not guarantee rankings or AI citations/, '13: no ranking/citation guarantee')
  const websiteFixes = deriveWebsiteFindings(state)
  assert.equal(websiteFixes.length, 2, '14: secure connection + duplicate descriptions survive full E.1 scan')
  assert(websiteFixes.some((fix) => fix.intelligence?.checkId === 'website-https'))
  assert(websiteFixes.some((fix) => fix.intelligence?.checkId === 'website-meta-description'))
  const changedReview = structuredClone(state)
  changedReview.customerFindingReviews = { [machineFixes[0].id]: customerReviewKey(changedReview, machineFixes[0]) }
  assert.equal(summarizeCustomerScan(changedReview, [], machineFixes).findings.length, 1)
  changedReview.websiteAudit.lastSuccessful!.machineReadabilityCapture!.titles.push('Changed evidence')
  assert.equal(currentMachineReadability(changedReview), undefined)
  assert.equal(deriveMachineFindings(changedReview).length, 0, 'Changed website evidence withdraws stale machine candidates')
  assert.equal(summarizeCustomerScan(changedReview, [], machineFixes).findings.length, 0)
  const jem = makeState(defaultProfile)
  assert.equal(deriveMachineFindings({ ...state, profile: defaultProfile, businessProfile: jem.businessProfile }).length, 0)
  let isolated = structuredClone(jem)
  await runVisibilityScan(makeState(), { automationVersion: 2, website: async () => state.websiteAudit.lastSuccessful!, acquire: async () => undefined }, (update) => { isolated = update(isolated) })
  assert.deepEqual(isolated, jem, '16: asynchronous Mary run cannot update JEM workspace')
  assert(!JSON.stringify(isolated).includes('Montessori'))

  // Associated complete business records expose facts without inventing optional-field findings.
  const complete = structuredClone(state)
  complete.websiteAudit.latestAttempt = { ...complete.websiteAudit.lastSuccessful!, jsonLdSchemaBlocks: [record] }
  const completeReport = evaluateMachineReadability(complete)
  assert(completeReport.entities.length)
  assert.equal(completeReport.conditions.length, 0, 'Missing logo/sameAs/hours alone is not a remediation finding')
  const linkedState = structuredClone(complete)
  linkedState.websiteAudit.latestAttempt = { ...complete.websiteAudit.lastSuccessful!, jsonLdSchemaBlocks: [linkedLocation] }
  assert.equal(evaluateMachineReadability(linkedState).conditions.length, 0, 'An explicit location relationship must not be called missing just because Organization.address is absent')

  assert.equal(completeReport.checks.find((check) => check.id === 'entity-sameAs')?.result, 'not_observed')
  complete.websiteAudit.latestAttempt = { ...complete.websiteAudit.lastSuccessful!, jsonLdSchemaBlocks: [bad] }
  assert(evaluateMachineReadability(complete).conditions.some((condition) => condition.id === 'business_profile_conflict'))
  const noAddress = { ...record, address: undefined }
  complete.websiteAudit.latestAttempt = { ...complete.websiteAudit.lastSuccessful!, jsonLdSchemaBlocks: [noAddress] }
  assert(evaluateMachineReadability(complete).conditions.some((condition) => condition.id === 'location_not_represented'))

  const meta = captureMachineMetadata(`<meta content='noindex' name='robots'><meta property='og:title' content='Observed title'><script>"<meta name='robots' content='index'>"</script><link href='/primary' rel='canonical'><link rel='canonical' href='/other'><title>One</title><title>Two</title>`, profile.website, new Headers({ 'x-robots-tag': 'googlebot: noindex' }))
  assert.equal(meta.metaRobots.length, 1)
  assert.equal(meta.canonicals.length, 2)
  assert.equal(meta.titles.length, 2)
  assert.equal(meta.openGraph['og:title'][0], 'Observed title')
  const robotsBase = { requestedUrl: 'http://example.org/robots.txt', status: 200, acquiredAt: 'now' }
  assert.equal(inspectRobots({ ...robotsBase, text: 'User-agent: *\nDisallow: /' }, 'http://example.org/').result, 'needs_review')
  assert.equal(inspectRobots({ ...robotsBase, text: 'User-agent: *\nDisallow: /\nAllow: /public/' }, 'http://example.org/public/test').result, 'observed')
  assert(!inspectRobots({ ...robotsBase, text: 'User-agent: *\nDisallow:\nUser-agent: ExampleBot\nDisallow: /' }, 'http://example.org/').conclusion.includes('rules disallow'), 'An empty general Disallow must not inherit the next named-agent group')
  assert.equal(inspectRobots({ ...robotsBase, text: 'User-agent: *\nDisallow: /*.pdf$' }, 'http://example.org/files/a.pdf').result, 'needs_review')
  assert.equal(inspectRobots({ ...robotsBase, text: 'User-agent: *\nDisallow: /*.pdf$' }, 'http://example.org/files/a.pdf/more').result, 'observed')
  assert.equal(inspectRobots({ ...robotsBase, truncated: true, text: 'User-agent: *\nAllow: /' }, 'http://example.org/').result, 'unavailable', 'A truncated robots document cannot establish crawler access')
  assert.equal(inspectRobots({ ...robotsBase, text: '<html>Not a robots file</html>' }, 'http://example.org/').result, 'unavailable')
  assert.equal(inspectRobots({ ...robotsBase, text: 'User-agent: *\nAllow: /\nUser-agent: ExampleBot\nDisallow: /' }, 'http://example.org/').result, 'needs_review')

  const compiled = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {CustomerScanView} from './src/components/CustomerScanView'; import {SearchVisibilityPanel} from './src/components/SearchVisibilityPanel'; import {MachineReadabilityPanel} from './src/components/MachineReadabilityPanel'; export const customer=(props)=>renderToStaticMarkup(React.createElement(CustomerScanView,props)); export const presence=(props)=>renderToStaticMarkup(React.createElement(SearchVisibilityPanel,props)); export const machine=(props)=>renderToStaticMarkup(React.createElement(MachineReadabilityPanel,props));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } })
  const renderPath = new URL('../.packet-e1-render.mjs', import.meta.url)
  writeFileSync(renderPath, compiled.outputFiles[0].text)
  try {
    const { customer, presence, machine } = await import(renderPath.href)
    const props = { state, items: [], fixes: workspaceFindings(state), loading: false, scanError: false, onScan() {}, onWorkbench() {}, onView() {} }
    assert(customer({ ...props, view: 'Verification' }).includes('No implementation has been recorded yet'), '15: no implementation/verification means empty Results')
    const scan = customer({ ...props, view: 'Scan' })
    assert(scan.includes('website readability checks have evidence'))
    for (const internal of ['Playwright', 'fixture-server_fetch', 'confidence algorithm', 'DOM extraction', 'JSON-LD']) assert(!scan.includes(internal))
    const publicForm = presence({ profile, profileState: state.businessProfile, legacyTests: {}, observations: state.searchDestinationObservations, onChange() {}, onAddToActionPlan() {} })
    assert(publicForm.includes('location diagnostic'))
    assert(publicForm.includes('Automatically matched observation'))
    for (const control of ['Reviewed for Action Plan', 'Competitors observed', 'Evidence notes', 'Recommended action', 'Observed at']) assert(publicForm.includes(control))
    const workbench = machine({ state })
    assert(workbench.includes('Machine Readability / AI Readiness') && workbench.includes('AI Presence / Answer Testing'))
    assert(workbench.includes('Parsed entity facts') && workbench.includes('Rollback/recovery'))
    const first = snapshots[0]
    const before = customer({ ...props, state: first, view: 'Scan', loading: true })
    assert(!before.includes('website readability checks have evidence'), 'Queued machine checks cannot show finished evidence')
  } finally { unlinkSync(renderPath); stop() }
  console.log('Packet E.1 PASS: all 16 acceptance cases; real audit/client replay; Brand+Location; matching/conflicts/review provenance; semantic/JSON-LD extraction; robots/metadata; machine findings; UI gates; lifecycle/rollback; isolation. Controlled fixtures, not live Mary claims.')
} finally { globalThis.fetch = originalFetch; console.info = originalInfo; stop() }
