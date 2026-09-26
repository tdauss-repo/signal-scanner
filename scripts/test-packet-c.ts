import assert from 'node:assert/strict'
import { build, stop } from 'esbuild'
import type { AuditState, FixItem } from '../src/types/audit.ts'
import { defaultProfile } from '../src/data/demoProfile.ts'
import { buildAuditItems } from '../src/data/auditCatalog.ts'
import { defaultManualWebsiteObservation } from '../src/utils/websiteAuditState.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { canPresentFinding, customerReviewKey, findingLifecycle, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'

// Synthetic UI acceptance data, not real customer scan evidence.
const montessori = normalizeWorkspaceProfile({ businessName: 'Montessori Center of Downriver', website: 'http://www.montessoridownriver.com/', localMarket: 'Southgate, MI' })
assert.equal(montessori.phone, '')
assert.deepEqual(montessori.phoneNumbers, [])
assert.equal(montessori.primaryServices, '')
assert.equal(montessori.contactStructureNote, '')
assert.equal(montessori.city, 'Southgate')
assert.equal(montessori.state, 'MI')
assert.equal(normalizeWorkspaceProfile(defaultProfile).phone, defaultProfile.phone)
assert.deepEqual(normalizeWorkspaceProfile(defaultProfile).phoneNumbers, defaultProfile.phoneNumbers)

const makeState = (profile = montessori): AuditState => ({
  profile: structuredClone(profile), businessProfile: { schemaVersion: 1, values: {} },
  checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '2026-09-16T12:00:00Z', reportSummary: '',
  websiteAudit: { lastSuccessful: null, latestAttempt: null, manualObservation: defaultManualWebsiteObservation(), browserObservation: null },
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const state = makeState()
const items = buildAuditItems(state.profile)
let summary = summarizeCustomerScan(state, items, [])
assert.equal(summary.websiteCompleted, 0)
assert.equal(summary.websiteGood, 0)
assert(summary.areas.every((area) => area.status === 'Not reviewed / Not checked'))
assert.equal(summary.findings.length, 0)

state.checks = { 'website-title': 'pass', 'website-schema': 'fail', 'obsolete-id': 'pass' }
summary = summarizeCustomerScan(state, items, [])
assert.equal(summary.websiteCompleted, items.filter((item) => item.area === 'website' && ['pass', 'fail'].includes(state.checks[item.id])).length)
assert.equal(summary.websiteGood, items.filter((item) => item.area === 'website' && state.checks[item.id] === 'pass').length)
assert.equal(summary.areas[0].status, 'Needs attention')
assert.equal(summary.areas[3].status, 'Not reviewed / Not checked', 'Business profile facts are not AI execution')
assert.equal(summarizeCustomerScan(state, items, [], true).areas[0].status, 'Scan in progress')

const fix: FixItem = {
  id: 'website-schema', issue: 'Business information in structured data', fix: 'Review the public business facts before proposing markup.',
  area: 'Website SEO', priority: 'Medium', status: 'fail', reviewed: true,
  evidenceNote: 'Synthetic example: no structured business data in the captured homepage.',
  whyItMatters: 'Structured data can help describe the business consistently.',
  verificationMethod: 'Validate the agreed public facts and recheck the homepage.', salesPackageFit: 'starter',
}
assert(canPresentFinding(fix))
assert.equal(summarizeCustomerScan(state, items, [fix]).findings.length, 0, 'Auto-classified reviewed fixes do not bypass presentation review')
for (const invalid of [{ ...fix, reviewed: false }, { ...fix, verificationMethod: ' ' }, { ...fix, evidenceNote: ' ' }, { ...fix, status: 'pass' as const }, { ...fix, salesPackageFit: 'excluded' as const }]) {
  assert.equal(canPresentFinding(invalid), false)
}
state.customerFindingReviews = { [fix.id]: customerReviewKey(state, fix) }
summary = summarizeCustomerScan(state, items, [fix])
assert.equal(summary.findings.length, 1)
assert.equal(summarizeCustomerScan(state, items, [fix, fix]).findings.length, 1, 'Duplicate IDs do not inflate reviewed finding counts')
assert.equal(summary.improvementCount, 1)
assert.equal(summary.confirmationCount, 0)
const serialized = JSON.parse(JSON.stringify(state)) as AuditState
assert.equal(summarizeCustomerScan(serialized, items, [fix]).findings.length, 1, 'Review survives JSON persistence')
assert.equal(summarizeCustomerScan({ ...state, lastUpdated: 'later' }, items, [fix]).findings.length, 1)
assert.equal(summarizeCustomerScan({ ...state, notes: { changed: 'new evidence' } }, items, [fix]).findings.length, 0)
assert.equal(summarizeCustomerScan(state, items, [{ ...fix, fix: 'Changed recommendation' }]).findings.length, 0)
assert.equal(summarizeCustomerScan({ ...state, profile: defaultProfile }, items, [fix]).findings.length, 0, 'Copied approval cannot leak to another business')

const owner = { ...fix, id: 'owner', salesPackageFit: 'owner_action' as const }
const later = { ...fix, id: 'later', salesPackageFit: 'later' as const }
state.customerFindingReviews[owner.id] = customerReviewKey(state, owner)
state.customerFindingReviews[later.id] = customerReviewKey(state, later)
summary = summarizeCustomerScan(state, items, [fix, owner, later])
assert.equal(summary.findings.length, 3)
assert.equal(summary.confirmationCount, 1)

const query = items.find((item) => item.area === 'keywords')!
const google = { ...defaultSearchDestinationObservation('Google Search', state.profile.businessName), reviewed: true, overallResult: 'found_prominently' as const, evidenceNotes: 'Synthetic Google observation.' }
state.searchDestinationObservations[query.id] = { 'Google Search': google }
assert.equal(summarizeCustomerScan(state, items, []).areas[1].status, 'Confirmation needed', 'One search result must not imply Maps was checked')
state.searchDestinationObservations = { staleQuery: { 'Google Search': google } }
assert.equal(summarizeCustomerScan(state, items, []).areas[1].status, 'Not reviewed / Not checked')
state.searchDestinationObservations = {}
const blocked = structuredClone(state)
blocked.websiteAudit.latestAttempt = { ok: false } as AuditState['websiteAudit']['latestAttempt']
assert.equal(summarizeCustomerScan(blocked, items, []).areas[0].status, 'Confirmation needed')
assert.match(summarizeCustomerScan(blocked, items, []).areas[0].detail, /earlier results/)
assert.equal(summarizeCustomerScan(state, items, [], false, true).areas[0].status, 'Confirmation needed', 'Network errors cannot leave a successful-looking latest scan')
assert.deepEqual(findingLifecycle.slice(-4), ['Approved', 'Implemented', 'Re-scanned', 'Verified'])

// Render the real React customer component without browser/network dependencies or writes.
// esbuild is already installed by the existing Vite/tsx toolchain.
const compiled = await build({
  stdin: { contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { CustomerScanView } from './src/components/CustomerScanView'; import App from './src/App'; export const render = (props) => renderToStaticMarkup(React.createElement(CustomerScanView, props)); export const renderApp = () => renderToStaticMarkup(React.createElement(App));`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` },
})
const { render, renderApp } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const props = {
  state, items, fixes: [fix, owner, later], loading: false, scanError: false, onScan() {}, onWorkbench() {}, onView() {}, onReview() {}, onSaveRefinement() {},
  currentScanId: '', dirty: true, scans: [], onProfileChange() {}, onSaveCurrent() {}, onSaveAsNew() {}, onLoad() {}, onDuplicate() {}, onRename() {}, onDelete() {}, onExportFullScan() {}, onImportFullScan() {}, onStartBlank() {},
}
for (const view of ['Business', 'Scan', 'Review', 'Package', 'Customer Review', 'Verification']) {
  const html = render({ ...props, view }) as string
  assert(html.includes('Montessori Center of Downriver'))
  assert(!html.includes('JEM Photography'))
  assert(!html.includes('419.410.4974'))
  assert(html.includes('Detailed evidence &amp; tools'))
  assert(html.includes('aria-current="page"'))
  assert(!html.includes('>Settings<'))
  if (view === 'Business') {
    for (const control of ['Business name', 'Website', 'Street address', 'Primary category / business type', 'Save Business', 'Continue to Scan', 'Change business']) assert(html.includes(control))
    for (const internalConcept of ['Business Seed', 'Business Profile', 'Saved Scans', 'Profile completeness']) assert(!html.includes(internalConcept), `${internalConcept} must not be a primary Business-page concept`)
    assert(!html.includes('class="customer-workspace"') && !html.includes('<h1>Montessori Center of Downriver</h1>'), 'Business identity is not repeated as a large persistent block and page hero')
    assert(html.indexOf('Business name') < html.indexOf('Additional business context'), 'Primary inputs appear before secondary detail')
  }
  if (view === 'Scan') assert(html.includes('Operational scan') && html.includes('Evidence health'))
  if (view === 'Review') assert(html.includes(fix.issue) && html.includes('Evidence summary') && html.includes('Business information to confirm') && html.includes('Continue to Package'))
  if (view === 'Package') assert(html.includes('Package Preparation') && html.includes('Customer/platform ownership required') && html.includes('Continue to Customer Review'))
  if (view === 'Customer Review') assert(html.includes('Final quality gate') && html.includes('Customer Review — operator QA') && html.includes('Copy Review Text'))
  if (view === 'Verification') assert(html.includes('No implementation has been recorded yet.'))
}
const handoffProfile = normalizeWorkspaceProfile({ ...montessori, primaryCategory: 'Montessori school', streetAddress: '15575 Northline Road', zip: '48195', phone: '734-282-6465', primaryServices: 'Toddler Program, Preschool, Kindergarten' })
const handoffState = makeState(handoffProfile)
handoffState.customerFindingReviews = Object.fromEntries([fix, owner, later].map((finding) => [finding.id, customerReviewKey(handoffState, finding)]))
const handoff = render({ ...props, state: handoffState, items: buildAuditItems(handoffProfile), view: 'Customer Review' }) as string
assert(handoff.includes('Ready for customer presentation'))
assert(handoff.includes('Copy Customer Review JSON') && handoff.includes('Export Customer Review JSON'))
assert(handoff.includes('Copy Review Text') && handoff.includes('Exact customer-safe preview'))
assert(handoff.includes('Montessori school') && !handoff.includes('Photography studio'))
const unsafeState = makeState(defaultProfile)
unsafeState.businessProfile = { schemaVersion: 1, values: {
  businessName: { value: 'Montessori Center of Downriver', source: 'operator', confidence: 'high', status: 'operator_reviewed' },
  primaryCategory: { value: 'Montessori school', source: 'operator', confidence: 'high', status: 'operator_reviewed' },
  website: { value: 'https://montessoridownriver.example/', source: 'operator', confidence: 'high', status: 'operator_reviewed' },
  city: { value: 'Southgate', source: 'operator', confidence: 'high', status: 'operator_reviewed' },
  state: { value: 'MI', source: 'operator', confidence: 'high', status: 'operator_reviewed' },
} }
unsafeState.customerFindingReviews = { [fix.id]: customerReviewKey(unsafeState, fix) }
const unsafeHandoff = render({ ...props, state: unsafeState, items: buildAuditItems(unsafeState.profile), fixes: [fix], view: 'Customer Review' }) as string
assert(unsafeHandoff.includes('Primary category mismatch'))
assert(unsafeHandoff.includes('Photography studio') && unsafeHandoff.includes('Montessori school'))
assert(!unsafeHandoff.includes('Export Customer Review JSON'), 'Unsafe identity mismatch blocks export')
const jem = makeState(defaultProfile)
const jemHtml = render({ ...props, state: jem, items: buildAuditItems(jem.profile), fixes: [], view: 'Scan' }) as string
assert(jemHtml.includes('JEM Photography'))
assert(!jemHtml.includes('Montessori'))
assert(!jemHtml.includes('Southgate'))
assert.equal(summarizeCustomerScan(jem, buildAuditItems(jem.profile), []).websiteCompleted, 0)
assert.equal(makeState().customerFindingReviews, undefined)
const frozen = structuredClone(state)
summarizeCustomerScan(state, items, [fix])
assert.deepEqual(state, frozen, 'Customer projection must not mutate persisted evidence')

// Exercise the application's actual load/normalization path with isolated LocalStorage records.
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} })
storage.set('business-scanner-active-view', 'Settings')
storage.set('local-signal-scanner-state', JSON.stringify({ profile: { businessName: montessori.businessName, website: montessori.website, localMarket: 'Southgate, MI' } }))
const loadedMontessori = renderApp() as string
assert(loadedMontessori.includes('Montessori Center of Downriver'))
assert(!loadedMontessori.includes('JEM'))
assert(!loadedMontessori.includes('419.'))
assert(!loadedMontessori.includes('Sylvania'))
assert(!loadedMontessori.includes('Business Seed'), 'Seed/profile provenance stays beneath the consolidated Business form')
assert(!loadedMontessori.includes('Workbench · internal tools &amp; evidence'), 'Persisted internal tab must not open the Workbench on reload')
assert(loadedMontessori.includes('Business Scanner Tool'))
storage.set('local-signal-scanner-state', JSON.stringify(jem))
const loadedJem = renderApp() as string
assert(loadedJem.includes('JEM Photography'))
assert(!loadedJem.includes('Montessori'))
assert(!loadedJem.includes('Southgate'))
storage.set('local-signal-scanner-state', JSON.stringify(unsafeState))
const loadedConflict = renderApp() as string
assert(loadedConflict.includes('Primary category mismatch') && loadedConflict.includes('Photography studio') && loadedConflict.includes('Montessori school'))
assert(loadedConflict.includes('Confirm reviewed facts'), 'Load-time profile conflicts remain visible until the operator confirms the reviewed business')
storage.set('local-signal-scanner-state', JSON.stringify({ profile: montessori }))
assert(!renderApp().includes('JEM'))
console.log('Packet C: customer summary, review gates, freshness, isolation, JSON compatibility, and all four React surfaces passed for two separate profiles.')
stop()
