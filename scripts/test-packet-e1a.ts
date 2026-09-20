import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { build, stop } from 'esbuild'
import type { AuditState, BusinessProfileState } from '../src/types/audit.ts'
import { auditWebsite } from '../server/websiteAudit.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { mapAutoAuditToWebsiteChecks } from '../src/utils/websiteAutoAudit.ts'
import { evaluateMachineReadability, summarizeMachineReadability, deriveMachineFindings } from '../src/utils/machineReadability.ts'
import { deriveWebsiteFindings } from '../src/utils/findingIntelligence.ts'
import { workspaceFindings } from '../src/utils/workspaceFindings.ts'
import { canReviewFinding, customerReviewKey, isPresentedFinding, isSupportingCustomerFinding, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { defaultProfile } from '../src/data/demoProfile.ts'

// Historical metadata + controlled transport and synthetic review. No live Mary assertions.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8'))
const profile = normalizeWorkspaceProfile({ businessName: fixture.request.businessName, website: 'http://montessoridownriver.com/', city: 'Southgate', state: 'MI' })
const profileReview: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(Object.entries(profile).map(([field, value]) => [field, { value, status: 'operator_reviewed', source: 'synthetic fixture review', confidence: 'high' }])) }
const response = (body: string, url: string, status = 200) => {
  const result = new Response(body, { status })
  Object.defineProperty(result, 'url', { value: url })
  return result
}
const originalFetch = globalThis.fetch
const originalInfo = console.info
console.info = () => undefined
let state: AuditState
try {
  globalThis.fetch = async (input, options) => {
    const url = String(input)
    if (url.startsWith('https:')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
    if (url.endsWith('/robots.txt')) return response('Not acceptable', url, 406)
    if (options?.method === 'HEAD') return response('', url)
    return response(`<html><head><title>${fixture.response.title}</title>${fixture.descriptionElements.join('')}<script type="application/ld+json">${JSON.stringify(fixture.response.jsonLdSchemaBlocks)}</script></head><body><h1>${profile.businessName}</h1><p>Southgate, MI</p><a href="/contact">Contact and registration</a></body></html>`, profile.website)
  }
  const result = await auditWebsite({ ...profile, phoneNumbers: [], services: [], serviceAreas: [], machineReadability: true })
  assert(result.ok)
  const mapping = mapAutoAuditToWebsiteChecks(result, profile)
  state = { profile, businessProfile: profileReview, checks: mapping.statuses, notes: mapping.notes, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
    websiteAudit: normalizeWebsiteAuditWorkspaceState({ latestAttempt: result, lastSuccessful: result }),
    selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: { entityClarity: [], customerQuestions: [] } }
  state.machineReadability = evaluateMachineReadability(state)
} finally { globalThis.fetch = originalFetch; console.info = originalInfo }

const pristineState = structuredClone(state)
const findings = workspaceFindings(state)
const entity = findings.find((fix) => fix.intelligence?.condition === 'missing_business_entity')!
assert(entity)
assert.equal(entity.issue, 'Incomplete machine-readable business identity', '1: customer finding label')
assert.equal(entity.intelligence!.customer.title, entity.issue)
assert.match(entity.intelligence!.customer.found, /general page\/website structured data/)
assert.match(entity.intelligence!.customer.found, /no explicit structured organization\/business entity/)
assert.match(entity.fix, /rather than forcing a generic LocalBusiness/)
assert.equal(state.machineReadability!.entities.length, 0, '2: generic schema alone is not business identity')
assert(state.machineReadability!.schemaTypes.includes('WebSite') && state.machineReadability!.schemaTypes.includes('WebPage'))
assert.match(entity.intelligence!.customer.why, /reduce ambiguity/)
assert.match(entity.intelligence!.customer.why, /do not guarantee rankings or AI citations/, '3: no outcome guarantee')
for (const term of ['refetch', 'JSON-LD', 'entity type', 'name/address/phone/URL', 'contradictory structured identity', 'Machine Readability / AI Readiness']) assert(entity.verificationMethod!.includes(term))
assert(entity.intelligence!.delivery.customerInput.length)
for (const value of Object.values(entity.intelligence!.remediation!)) assert(value.length, 'Execution-compatible proposal fields remain populated')
assert.equal(entity.intelligence!.remediation!.lifecycle, 'Evidence captured')
assert.equal(entity.reviewed, false)

const broad = findings.find((fix) => fix.id === 'website-homepage-clarity')!
assert(broad && broad.evidenceNote, '4: broad underlying observation remains available')
assert.equal(broad.salesPackageFit, 'later')
assert.equal(canReviewFinding(broad), false, 'Composite does not enter customer review queue')
assert.equal(isPresentedFinding({ ...state, customerFindingReviews: { [broad.id]: customerReviewKey(state, broad) } }, broad), false, 'An old saved composite approval cannot bypass the gate')
const weakIds = ['website-mobile-conversion', 'website-social-links', 'website-title']
for (const id of weakIds) {
  const fix = findings.find((entry) => entry.id === id)!
  assert(fix, `${id} evidence exists in fixture`)
  assert(canReviewFinding(fix), '5: weaker findings retain explicit review controls')
  assert(isSupportingCustomerFinding(fix))
  assert(!isPresentedFinding(state, fix), 'Weaker observation is not automatically customer-approved')
  const laterReview = { ...state, customerFindingReviews: { [id]: customerReviewKey(state, fix) } }
  assert(isPresentedFinding(laterReview, fix), 'Future explicit promotion remains possible')
}

const coverage = summarizeMachineReadability(state)
assert(coverage.evaluated > 0 && coverage.evidence > 0, '6: machine checks counted independently of AI answer observations')
assert.equal(coverage.evaluated, state.machineReadability!.checks.length)
assert.equal(coverage.evidence + coverage.unavailable, coverage.evaluated)
assert.equal(coverage.reviewRequired, state.machineReadability!.checks.filter((check) => check.result === 'needs_review').length)
assert.equal(summarizeCustomerScan(state, [], findings).areas[3].scanState, coverage.scanState)
const robots = state.machineReadability!.checks.find((check) => check.id === 'robots-behavior')!
assert.equal(robots.result, 'unavailable')
assert.match(robots.conclusion, /Targeted verification/)
assert.match(robots.conclusion, /does not establish/)
assert(!state.machineReadability!.conditions.some((condition) => /robot|crawl/.test(condition.id)), '7: no crawler defect generated from 406')
const legacyRobots = findings.find((fix) => fix.id === 'website-sitemap-robots')!
assert(legacyRobots.evidenceSummary!.includes('HTTP 406'))
assert(!canReviewFinding(legacyRobots), 'Legacy composite mapper cannot promote 406 as a publish-robots defect')
assert(!isPresentedFinding(state, legacyRobots))

const website = deriveWebsiteFindings(state)
assert.deepEqual(website.map((fix) => fix.issue), ['Secure website connection', 'Homepage search description'], '8: existing strong website findings unchanged')
assert.equal(website[0].intelligence!.condition, 'https_endpoint_connection_failed')
assert.equal(website[1].intelligence!.condition, 'multiple_meta_descriptions')
assert.deepEqual(findings.filter((fix) => fix.intelligence?.checkId.startsWith('website-')), website)
const initial = [...website, entity]
assert(initial.every(canReviewFinding))
assert.equal(summarizeCustomerScan(state, [], findings).findings.length, 0, 'No findings before explicit presentation approval')
state.customerFindingReviews = Object.fromEntries(initial.map((fix) => [fix.id, customerReviewKey(state, fix)]))
assert.deepEqual(new Set(summarizeCustomerScan(state, [], findings).findings.map((fix) => fix.issue)), new Set(['Secure website connection', 'Homepage search description', 'Incomplete machine-readable business identity']))
assert.deepEqual(state.profile, pristineState.profile, 'No public fact replaces profile data')
const other = { ...structuredClone(state), profile: normalizeWorkspaceProfile(defaultProfile), businessProfile: { schemaVersion: 1 as const, values: {} } }
assert.equal(deriveMachineFindings(other).length, 0, '10: Mary evidence cannot create a JEM machine finding')
assert.equal(deriveWebsiteFindings(other).length, 0)
assert.equal(summarizeCustomerScan(other, [], findings).findings.length, 0, 'Approvals cannot cross workspaces')
assert.equal(summarizeMachineReadability(other).evaluated, 0, 'Stale/foreign evidence cannot count as current checks')

const compiled = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {CustomerScanView} from './src/components/CustomerScanView'; import {CustomerFindingReview} from './src/components/CustomerFindingReview'; import {ScoreCard} from './src/components/ScoreCard'; export const customer=(p)=>renderToStaticMarkup(React.createElement(CustomerScanView,p)); export const review=(p)=>renderToStaticMarkup(React.createElement(CustomerFindingReview,p)); export const card=(p)=>renderToStaticMarkup(React.createElement(ScoreCard,p));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } })
const renderPath = new URL('../.packet-e1a-render.mjs', import.meta.url)
writeFileSync(renderPath, compiled.outputFiles[0].text)
try {
  const { customer, review, card } = await import(renderPath.href)
  const props = { state, items: [], fixes: findings, loading: false, scanError: false, onScan() {}, onWorkbench() {}, onView() {} }
  const html = customer({ ...props, view: 'Findings' })
  assert(html.includes(entity.issue))
  for (const title of ['Homepage SEO clarity', 'Contact info visibility', 'Social profile links', 'Homepage title quality']) assert(!html.includes(title), 'Initial customer package contains only selected strong findings')
  const results = customer({ ...props, view: 'Results' })
  assert(results.includes('Verified improvements will appear here'), '9: no results without implementation/verification')
  assert(!results.includes(entity.issue))
  const queue = review({ state: pristineState, fixes: findings, onReview() {} })
  assert(!queue.includes('Homepage SEO clarity'))
  assert(queue.includes('Supporting observations — operator review required'))
  assert(queue.includes('Contact info visibility') && queue.includes('Approve evidence &amp; customer wording'))
  const aiCard = card({ label: 'AI Visibility', result: { score: null, status: 'Gray', earned: 0, possible: 0, checked: coverage.evaluated, statusLabel: coverage.statusLabel }, details: `${coverage.detail} · 0 AI answer observations reviewed` })
  assert(!aiCard.includes('0 checked'))
  assert(aiCard.includes(`${coverage.evaluated} evaluated`) && aiCard.includes(`${coverage.evidence} with evidence`))
  assert(aiCard.includes('Evidence captured — awaiting review'))
} finally { unlinkSync(renderPath); stop() }
console.log('Packet E.1a PASS: all 10 finding-quality cases; customer copy, delivery proposal, supporting review controls, normalized AI counts, robots 406, unchanged HTTPS/descriptions, empty Results and workspace isolation. Controlled fixtures, not live Mary proving.')
