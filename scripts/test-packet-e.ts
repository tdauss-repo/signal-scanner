import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build, stop } from 'esbuild'
import { auditWebsite } from '../server/websiteAudit.ts'
import { runtimeAllowedUrl, runtimeRenderedProvider } from '../server/acquisitionRuntime.ts'
import type { AuditState } from '../src/types/audit.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import { runVisibilityScan, applicationScanDependencies, mergeAutomatedObservation, restoreVisibilityRuns, scanAreaState } from '../src/utils/visibilityScan.ts'
import { compareIdentity, interpretPresence } from '../src/utils/presenceExtraction.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { deriveWebsiteFindings } from '../src/utils/findingIntelligence.ts'
import { customerReviewKey, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { defaultProfile } from '../src/data/demoProfile.ts'

// Controlled transport replay + acquisition fixtures. Never live customer evidence.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8'))
const profile = normalizeWorkspaceProfile({ businessName: fixture.request.businessName, website: 'http://montessoridownriver.com/', existingDirectoryUrls: 'https://directory.example.org/records', localMarket: 'Southgate, MI' })
const makeState = (p = profile): AuditState => ({
  profile: structuredClone(p), businessProfile: { schemaVersion: 1, values: {} }, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: { entityClarity: [], customerQuestions: [] },
})
const capture = (url: string, method: AcquisitionResult['method'], html = '', outcome: AcquisitionResult['outcome'] = 'success'): AcquisitionResult => ({ version: 1, requestedUrl: url, finalUrl: url, method, provider: method === 'server_fetch' ? 'fixture-fetch' : 'fixture-browser', acquiredAt: new Date().toISOString(), outcome, html, confidence: html ? 'captured' : 'unavailable', notes: ['Synthetic Packet E fixture'] })
const link = `<a href="${profile.website}">${profile.businessName}</a>`
const record = `<script type="application/ld+json">${JSON.stringify({ '@type': 'School', name: profile.businessName, url: profile.website, telephone: '734-555-0199', address: { streetAddress: '123 Fixture St', addressLocality: 'Southgate' } })}</script><p>${profile.businessName}</p>`
const originalFetch = globalThis.fetch
const originalInfo = console.info
const snapshots: AuditState[] = []
console.info = () => undefined
let websiteCalls = 0
let state = makeState()
const calls: string[] = []
try {
  globalThis.fetch = async (input, options) => {
    if (String(input) === '/api/audit-website') {
      websiteCalls++
      return new Response(JSON.stringify(await auditWebsite(JSON.parse(String(options?.body)))))
    }
    if (String(input).startsWith('https:')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
    const response = new Response(options?.method === 'HEAD' ? '' : `<title>${fixture.response.title}</title>${fixture.descriptionElements.join('')}<body>${fixture.response.visibleTextSummary}</body>`, { status: 200 })
    Object.defineProperty(response, 'url', { value: profile.website })
    return response
  }
  const run = await runVisibilityScan(state, {
    website: applicationScanDependencies.website,
    async acquire(url, method) {
      calls.push(`${url}:${method}`)
      if (url.includes('directory.example.org')) return capture(url, method, record)
      if (url.includes('/maps/') || url.includes('maps.apple')) return capture(url, method, '', 'failed')
      if (url.includes('instagram')) return method === 'server_fetch' ? capture(url, method, '<p>Public page shell</p>', 'partial') : undefined
      if (url.includes('facebook')) return capture(url, method, '<title>Access denied</title>', 'blocked')
      if (url.includes('google') && method === 'server_fetch') return capture(url, method, '<p>Loading results</p>', 'partial')
      return capture(url, method, link)
    },
  }, (update) => { state = update(state); snapshots.push(structuredClone(state)) })
  assert.equal(websiteCalls, 1, '1: one runner invokes the existing website API once')
  assert.equal(run.checks.filter((check) => check.destination).length, 8)
  assert(run.checks.some((check) => check.id === 'identity-comparison' && check.startedAt))
  assert.equal(scanAreaState(run, 'AIDiscovery'), 'not_checked')
  assert.equal(state.websiteAudit.lastSuccessful?.transportEvidence?.https.errorCode, 'ECONNRESET')
  const candidates = deriveWebsiteFindings(state)
  assert.equal(candidates.length, 2, '2–4: real website mapper retains secure-website and duplicate-description candidates')
  assert(candidates.some((fix) => fix.id.includes('https')))
  assert(candidates.some((fix) => fix.intelligence?.checkId === 'website-meta-description'))
  assert(candidates.every((fix) => !fix.reviewed))
  assert((run.summary?.candidateFindings || 0) >= candidates.length, 'Summary includes Packet D and the existing website evaluator candidates')
  assert.equal(run.summary?.customerApprovedFindings, 0)
  assert.equal(summarizeCustomerScan(state, [], candidates).findings.length, 0)
  const observations = state.searchDestinationObservations['search-brand-canonical']
  assert.equal(observations.Instagram?.automation?.state, 'interactive_review_required', '5: unsupported/unavailable rendered destination needs interaction')
  for (const observation of Object.values(observations)) {
    assert.notEqual(observation?.overallResult, 'not_found', '6: no acquisition outcome asserts absence')
    assert(!observation?.observedResultTypes.includes('not_found'))
    assert.equal(observation?.reviewed, false)
  }
  const google = observations['Google Search']!
  assert.equal(google.automation?.captures.length, 2, '7: insufficient fetch escalates to rendered acquisition')
  assert.deepEqual(google.observedResultTypes, ['official_website'])
  assert.equal(google.automation?.state, 'awaiting_review', '8: captured evidence remains a reviewable observation')
  assert.equal(google.overallResult, 'manual_review_needed')
  assert(google.evidenceNotes.includes(profile.businessName))
  assert(!calls.some((call) => call.includes('facebook') && call.endsWith('rendered_browser')), 'No challenge retry/bypass')
  const edited = normalizeSearchDestinationObservation({ ...google, provenance: 'operator_observation', evidenceNotes: 'Operator correction', competitorsObserved: 'Other business', recommendedAction: 'Confirm category', overallResult: 'found_weak', reviewed: true })
  const merged = mergeAutomatedObservation(edited, { ...google, observedAt: 'later' })
  assert.equal(merged.evidenceNotes, 'Operator correction', '9: manual correction survives rescan')
  assert.equal(merged.competitorsObserved, 'Other business')
  assert.equal(merged.recommendedAction, 'Confirm category')
  assert.equal(merged.reviewed, false, '10: new acquisition requires another review')
  state.customerFindingReviews = Object.fromEntries(candidates.map((fix) => [fix.id, customerReviewKey(state, fix)]))
  assert.equal(summarizeCustomerScan(state, [], candidates).findings.length, 2)
  const changed = structuredClone(state)
  changed.searchDestinationObservations['search-brand-canonical']['Google Search'] = merged
  assert.equal(summarizeCustomerScan(changed, [], candidates).findings.length, 0)
  const jem = makeState(defaultProfile)
  let isolated = structuredClone(jem)
  await runVisibilityScan(makeState(), { website: async () => state.websiteAudit.lastSuccessful!, acquire: async () => undefined }, (update) => { isolated = update(isolated) })
  assert.deepEqual(isolated, jem, '11–12: async Montessori events cannot enter JEM workspace')
  assert.equal(deriveWebsiteFindings({ ...state, profile: defaultProfile }).length, 0)
  assert(!JSON.stringify(isolated).includes('Montessori'))
  assert.equal(observations['Google Maps']?.automation?.state, 'interactive_review_required', '13: failed capture is separate from visibility verdict')
  assert.equal(run.summary?.acquisitionFailures, 5)
  assert(run.businessEvidence.some((item) => item.field === 'Phone' && item.observedValue === '734-555-0199'))
  assert(run.businessEvidence.every((item) => !item.reviewed))
  assert.equal(state.profile.phone, '', 'Business evidence never overwrites seed')
  assert.equal(state.salesReadiness.consistencyObservations?.length, run.businessEvidence.length)
  assert.equal(interpretPresence(capture('https://www.google.com/search?q=foo', 'server_fetch', `<title>${profile.businessName} - Search</title>`), profile, 'Google Search').evidence, '', 'Query echo is not a search result')
  assert.deepEqual(compareIdentity(capture('https://www.google.com/search?q=foo', 'server_fetch', `<title>${profile.businessName} - Search</title>`), profile), [], 'Query echo is not business identity evidence')
  assert.deepEqual(compareIdentity(capture('https://directory.example.org', 'server_fetch', record.replaceAll(profile.businessName, 'Unrelated Business').replaceAll(profile.website, 'https://other.example.org')), profile), [], 'Directory entities must match this business')
  assert.deepEqual(interpretPresence(capture('https://www.google.com/search', 'server_fetch', `<title>Access denied</title>${link}`, 'blocked'), profile, 'Google Search').types, [])
  const differences = compareIdentity(capture('https://directory.example.org', 'server_fetch', record), { ...profile, phone: '734-555-0100' })
  assert.equal(differences.find((item) => item.field === 'Phone')?.result, 'Conflict')

  const compiled = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {CustomerScanView} from './src/components/CustomerScanView'; import {SearchVisibilityPanel} from './src/components/SearchVisibilityPanel'; export const render=(props)=>renderToStaticMarkup(React.createElement(CustomerScanView,props)); export const presence=(props)=>renderToStaticMarkup(React.createElement(SearchVisibilityPanel,props));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } })
  // Load beside node_modules so external React imports resolve normally.
  const { writeFileSync, unlinkSync } = await import('node:fs')
  const renderPath = new URL('../.packet-e-render.mjs', import.meta.url)
  writeFileSync(renderPath, compiled.outputFiles[0].text)
  try {
    const { render, presence } = await import(renderPath.href)
    const props = { state, items: [], fixes: candidates, view: 'Results', loading: false, scanError: false, onScan() {}, onWorkbench() {}, onView() {} }
    assert(render(props).includes('Verified improvements will appear here'), '14: no implementation/verification means no Results')
    const beforeWebsite = snapshots.find((snapshot) => snapshot.visibilityRuns?.at(-1)?.checks[0].state === 'scanning')!
    const progress = render({ ...props, state: beforeWebsite, view: 'Scan', loading: true })
    assert(progress.includes('Checking website'))
    assert(progress.includes('Waiting for the preceding scan work.'))
    assert(!progress.includes('Checking public search presence'), '15: unstarted work is queued, never fake scanning')
    assert(!progress.includes('playwright') && !progress.includes('fixture-fetch'))
    assert(progress.includes('Run') && !progress.includes('Scan website'))
    assert(!progress.includes('Not reviewed / Not checked'))
    const interrupted = render({ ...props, state: beforeWebsite, view: 'Scan', loading: false })
    assert(!interrupted.includes('Checking website'), 'Reloading an interrupted run cannot claim work is still executing')
    const form = presence({ profile, profileState: state.businessProfile, legacyTests: {}, observations: state.searchDestinationObservations, onChange() {}, onAddToActionPlan() {} })
    for (const label of ['Open Google Search', 'Observed at', 'Observed result types', 'Evidence notes', 'Competitors observed', 'Recommended action', 'Reviewed for Action Plan']) assert(form.includes(label))
  } finally { unlinkSync(renderPath) }
  stop()
  // Pending promise verifies progress really waits for work, independent of clocks/timers.
  let resolveWebsite!: (value: NonNullable<AuditState['websiteAudit']['lastSuccessful']>) => void
  let deferredState = makeState()
  const deferred = runVisibilityScan(deferredState, { website: () => new Promise((resolve) => { resolveWebsite = resolve }), acquire: async () => undefined }, (update) => { deferredState = update(deferredState) })
  assert.equal(scanAreaState(deferredState.visibilityRuns!.at(-1)!, 'WebsiteTechnical'), 'scanning')
  assert.equal(scanAreaState(deferredState.visibilityRuns!.at(-1)!, 'SearchMaps'), 'queued')
  resolveWebsite(state.websiteAudit.lastSuccessful!)
  await deferred
  assert.equal(deferredState.visibilityRuns!.at(-1)!.checks[0].state, 'awaiting_review')
  let cancelled = false
  let cancelState = makeState()
  const cancelledRun = await runVisibilityScan(cancelState, { website: async () => { cancelled = true; return state.websiteAudit.lastSuccessful! }, acquire: async () => { throw new Error('Must not start another check') }, cancelled: () => cancelled }, (update) => { cancelState = update(cancelState) })
  assert(!cancelledRun.endedAt)
  const restored = restoreVisibilityRuns(cancelState.visibilityRuns)!
  assert.equal(restored[0].interrupted, true)
  assert.equal(restored[0].checks[0].state, 'interactive_review_required')
  assert(restored[0].checks.filter((check) => check.area === 'SearchMaps').every((check) => check.state === 'not_checked'))
  assert.equal(cancelState.websiteAudit.lastSuccessful, null)
  const modulePath = process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE
  delete process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE
  assert.equal(await runtimeRenderedProvider(), undefined)
  if (modulePath !== undefined) process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE = modulePath
  assert.throws(() => runtimeAllowedUrl('http://127.0.0.1/'))
  assert.throws(() => runtimeAllowedUrl('https://unconfigured.example.org', ''))
  assert.equal(runtimeAllowedUrl('https://directory.example.org/records', 'directory.example.org').hostname, 'directory.example.org')
  assert.equal(runtimeAllowedUrl('https://www.google.com/search?q=fixture', '').hostname, 'www.google.com')
  assert.equal(runtimeAllowedUrl('https://facebook.com/public-profile', '').hostname, 'facebook.com')
  let linked = makeState({ ...profile, knownListingUrl: 'https://www.google.com/maps/place/fixture' })
  const linkedRun = await runVisibilityScan(linked, { website: async () => state.websiteAudit.lastSuccessful!, acquire: async () => undefined }, (update) => { linked = update(linked) })
  assert.equal(linkedRun.checks.find((check) => check.destination === 'Google Maps')?.url, 'https://www.google.com/maps/place/fixture')
  assert(linkedRun.checks.find((check) => check.destination === 'Google Search')?.url?.includes('/search?q='), 'A recorded Maps URL cannot replace Google Search')
  assert.deepEqual(JSON.parse(JSON.stringify(state)).visibilityRuns, state.visibilityRuns, 'Run history survives JSON export')
  // New network failure must withdraw old presentation approval, not reuse old candidates as current.
  let failed = structuredClone(state)
  await runVisibilityScan(failed, { website: async () => { throw new Error('Offline') }, acquire: async () => undefined }, (update) => { failed = update(failed) })
  assert.equal(deriveWebsiteFindings(failed).length, 0)
  assert.equal(failed.visibilityRuns!.at(-1)!.checks[0].state, 'failed')
  assert.equal(failed.websiteAudit.lastSuccessful?.metaDescriptions?.length, 2)
  console.log('Packet E PASS: shared orchestration; live-shaped HTTPS + duplicates; escalation; evidence/review/manual gates; isolation; real progress; unsupported/failure semantics; business comparisons; empty Results; runtime configuration and persistence.')
} finally { globalThis.fetch = originalFetch; console.info = originalInfo; stop() }
