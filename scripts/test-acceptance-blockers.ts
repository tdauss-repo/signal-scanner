import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { build, stop } from 'esbuild'
import type { AuditState, BusinessProfile, FixItem } from '../src/types/audit.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { WebsiteAuditResult } from '../src/types/websiteAudit.ts'
import { normalizeWorkspaceProfile, blankProfile } from '../src/utils/workspaceProfile.ts'
import { normalizeBusinessProfileState, recordOperatorProfileChanges, reviewedBusinessProfile } from '../src/utils/businessProfileState.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { profileCompleteness } from '../src/utils/profileCompleteness.ts'
import { createIsolatedBusinessWorkspace } from '../src/utils/workspaceIsolation.ts'
import { runVisibilityScan } from '../src/utils/visibilityScan.ts'
import { formatVisibilityRunDuration, restoreVisibilityRuns, visibilityRunDurationLabel, visibilityRunIsTerminal, visibilityRunStatus } from '../src/utils/visibilityScanState.ts'
import { customerReviewReadiness, defaultCustomerFindingWording, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { writeStorageJson } from '../src/utils/browserStorage.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')) as { response: WebsiteAuditResult }
const maryProfile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', website: 'https://montessoridownriver.example/', primaryCategory: 'Montessori school',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465',
  primaryServices: 'Toddler Program, Preschool, Kindergarten', localMarket: 'Southgate and Downriver, MI', keywords: 'Montessori school Southgate',
})
const makeState = (profile: BusinessProfile = maryProfile): AuditState => ({
  profile: structuredClone(profile), businessProfile: normalizeBusinessProfileState(profile, undefined, '2026-09-26T12:00:00Z'), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: '2026-09-26T12:00:00Z', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const capture = (url: string): AcquisitionResult => ({ version: 1, requestedUrl: url, finalUrl: url, acquiredAt: new Date().toISOString(), method: 'server_fetch', provider: 'acceptance-fixture', outcome: 'failed', confidence: 'unavailable', notes: ['Unavailable fixture; not evidence of absence.'], blocker: 'acquisition_failure' })
const runClock = (startedAt: string, elapsedMs: number) => {
  const start = Date.parse(startedAt)
  let wallCalls = 0
  let monotonicCalls = 0
  return {
    wallNow: () => wallCalls++ === 0 ? start : start + elapsedMs,
    monotonicNow: () => monotonicCalls++ === 0 ? 1_000 : 1_000 + elapsedMs,
  }
}

// Minimum scan identity includes category; old workspaces and isolated workspaces cannot inherit it.
const missingCategory = makeState({ ...maryProfile, primaryCategory: '' })
delete missingCategory.businessProfile.values.primaryCategory
assert.equal(profileCompleteness(missingCategory).readyToScan, false)
assert.equal(profileCompleteness(makeState()).readyToScan, true)
const blank = createIsolatedBusinessWorkspace(makeState())
assert.equal(blank.profile.primaryCategory, '')
assert.equal(profileCompleteness(blank).readyToScan, false)

// Reviewed facts survive the same JSON storage boundary used by Save Business.
const reviewedState = makeState(blankProfile)
reviewedState.profile = maryProfile
reviewedState.businessProfile = recordOperatorProfileChanges(blankProfile, maryProfile, reviewedState.businessProfile, '2026-09-26T12:05:00Z')
const stored = new Map<string, string>()
const storage = { setItem(key: string, value: string) { stored.set(key, value) } }
assert.equal(writeStorageJson(storage, 'workspace', reviewedState).ok, true)
const reopened = JSON.parse(stored.get('workspace')!) as AuditState
assert.equal(reviewedBusinessProfile(reopened.profile, reopened.businessProfile).primaryCategory, 'Montessori school')
assert.equal(reviewedBusinessProfile(reopened.profile, reopened.businessProfile).businessName, 'Montessori Center of Downriver')
const quota = writeStorageJson({ setItem() { throw new DOMException('Quota exceeded', 'QuotaExceededError') } }, 'workspace', reviewedState)
assert.equal(quota.ok, false, 'browser-storage rejection is returned to the operator instead of escaping React')

// A normal run and provider timeouts both reach explicit terminal states.
let completeState = makeState()
const completeRun = await runVisibilityScan(completeState, { automationVersion: 2, website: async () => fixture.response, acquire: async (url) => capture(url), operationTimeoutMs: 20, overallTimeoutMs: 100, runClock: runClock('2026-10-25T14:00:00.000Z', 48_000) }, (update) => { completeState = update(completeState) })
assert(visibilityRunIsTerminal(completeRun))
assert.equal(completeRun.startedAt, '2026-10-25T14:00:00.000Z')
assert.equal(completeRun.endedAt, '2026-10-25T14:00:48.000Z')
assert.equal(completeRun.elapsedMs, 48_000)
assert.equal(formatVisibilityRunDuration(completeRun.elapsedMs), '48s')
assert(!completeRun.checks.some((check) => ['queued', 'scanning'].includes(check.state)))

const firstRunIdentity = completeRun.id
const firstRunTiming = { startedAt: completeRun.startedAt, endedAt: completeRun.endedAt, elapsedMs: completeRun.elapsedMs }
const rerun = await runVisibilityScan(completeState, { automationVersion: 2, website: async () => fixture.response, acquire: async (url) => capture(url), operationTimeoutMs: 20, overallTimeoutMs: 100, runClock: runClock('2026-10-25T15:00:00.000Z', 12_000) }, (update) => { completeState = update(completeState) })
assert.notEqual(rerun.id, firstRunIdentity, 'each scan has its own run identity')
assert.equal(rerun.elapsedMs, 12_000, 'a re-run records its own elapsed time')
const persistedFirstRun = completeState.visibilityRuns?.find((run) => run.id === firstRunIdentity)
assert.deepEqual(
  { startedAt: persistedFirstRun?.startedAt, endedAt: persistedFirstRun?.endedAt, elapsedMs: persistedFirstRun?.elapsedMs },
  firstRunTiming,
  'the prior run timing remains unchanged',
)
assert.equal(completeState.visibilityRuns?.at(-1)?.id, rerun.id)
assert.equal(completeState.visibilityRuns?.at(-1)?.elapsedMs, 12_000)

const latestRunBeforeOperatorEdit = structuredClone(completeState.visibilityRuns?.at(-1))
completeState = { ...completeState, lastUpdated: '2026-10-25T16:00:00.000Z', reportSummary: 'Operator edited the summary after scanning.' }
assert.deepEqual(completeState.visibilityRuns?.at(-1), latestRunBeforeOperatorEdit, 'operator activity does not alter scan completion metadata')
assert.equal(formatVisibilityRunDuration(134_000), '2m 14s')
assert.equal(formatVisibilityRunDuration(3_780_000), '1h 03m')
assert.equal(formatVisibilityRunDuration(-1), 'Not recorded')

let resolveLate!: (capture: AcquisitionResult | undefined) => void
let timedState = makeState()
const timedRun = await runVisibilityScan(timedState, {
  automationVersion: 2, website: async () => fixture.response,
  acquire: () => new Promise((resolve) => { resolveLate = resolve }), operationTimeoutMs: 5, overallTimeoutMs: 20,
  runClock: runClock('2026-10-25T17:00:00.000Z', 134_000),
}, (update) => { timedState = update(timedState) })
assert.equal(visibilityRunStatus(timedRun), 'completed_with_review')
assert.equal(timedRun.endedAt, '2026-10-25T17:02:14.000Z')
assert.equal(timedRun.elapsedMs, 134_000)
assert(!timedRun.checks.some((check) => ['queued', 'scanning'].includes(check.state)))
for (const destinations of Object.values(timedState.searchDestinationObservations)) for (const observation of Object.values(destinations)) {
  assert.notEqual(observation?.overallResult, 'not_found', 'provider timeout remains neutral')
}
const finalized = JSON.stringify(timedState.visibilityRuns)
resolveLate?.(capture('https://late.example/'))
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(JSON.stringify(timedState.visibilityRuns), finalized, 'late provider response cannot reopen or alter a finalized run')

// An unexpected processing exception is caught at the run boundary and terminalizes remaining checks.
let failedState = makeState()
const failedRun = await runVisibilityScan(failedState, {
  automationVersion: 2, website: async () => fixture.response,
  acquire: async (url) => ({ ...capture(url), outcome: 'success', confidence: 'captured', html: {} as string }),
  operationTimeoutMs: 20, overallTimeoutMs: 100, runClock: runClock('2026-10-25T18:00:00.000Z', 7_000),
}, (update) => { failedState = update(failedState) })
assert.equal(visibilityRunStatus(failedRun), 'failed')
assert(failedRun.failure)
assert.equal(failedRun.endedAt, '2026-10-25T18:00:07.000Z')
assert.equal(failedRun.elapsedMs, 7_000)
assert(!failedRun.checks.some((check) => ['queued', 'scanning'].includes(check.state)))

let cancelled = false
let interruptedState = makeState()
const interruptedRun = await runVisibilityScan(interruptedState, {
  automationVersion: 2,
  website: async () => { cancelled = true; return fixture.response },
  acquire: async () => { throw new Error('Cancelled scan must not continue acquisition') },
  cancelled: () => cancelled,
}, (update) => { interruptedState = update(interruptedState) })
assert.equal(interruptedRun.endedAt, undefined)
assert.equal(interruptedRun.elapsedMs, undefined, 'an incomplete run does not claim a completed duration')
const restoredInterruptedRun = restoreVisibilityRuns(interruptedState.visibilityRuns)?.at(-1)
assert.equal(restoredInterruptedRun?.interrupted, true)
assert.equal(restoredInterruptedRun?.elapsedMs, undefined, 'restoration does not invent timing for an interrupted run')
assert.equal(visibilityRunDurationLabel(restoredInterruptedRun), 'Not recorded')

const finding: FixItem = {
  id: 'website-local-content', area: 'Website SEO', sourceArea: 'website', priority: 'Medium', status: 'partial', reviewed: true,
  issue: 'Service-area copy', whyItMatters: 'Generic scanner interpretation.', fix: 'Add generic service-area copy.',
  evidenceSummary: 'Service-area phrases found on homepage: Downriver', verificationMethod: 'Recheck the homepage.', salesPackageFit: 'starter',
}
assert.equal(defaultCustomerFindingWording(finding, makeState()).title, 'Homepage local identity clarity', 'Mary-like fixture remains school-aware')
const runningState = makeState()
runningState.visibilityRuns = [{ ...completeRun, id: 'running-fixture', status: 'running', endedAt: undefined, elapsedMs: undefined, checks: completeRun.checks.map((check, index) => ({ ...check, state: index ? 'queued' : 'awaiting_review' })) }]
assert.equal(visibilityRunDurationLabel(runningState.visibilityRuns[0]), 'In progress')
assert.equal(customerReviewReadiness(runningState, summarizeCustomerScan(runningState, [], [finding], true)).scanIncomplete, true)
assert.equal(customerReviewReadiness(runningState, summarizeCustomerScan(runningState, [], [finding], true)).state, 'not_ready')

// Server rendering verifies the exact primary CTA and save-failure surfaces without a browser dependency.
const compiled = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {CustomerScanView} from './src/components/CustomerScanView'; export const render=(props)=>renderToStaticMarkup(React.createElement(CustomerScanView,props));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } })
const renderPath = new URL('../.acceptance-blocker-render.mjs', import.meta.url)
writeFileSync(renderPath, compiled.outputFiles[0].text)
try {
  const { render } = await import(renderPath.href)
  const props = { state: runningState, items: [], fixes: [finding], view: 'Scan', loading: true, scanError: false, onScan() {}, onWorkbench() {}, onView() {}, onReview() {}, onSaveRefinement() {}, currentScanId: 'mary', dirty: false, scans: [], onProfileChange() {}, onSaveCurrent() {}, saveNotice: null, onSaveAsNew() {}, onLoad() {}, onDuplicate() {}, onRename() {}, onDelete() {}, onExportFullScan() {}, onImportFullScan() {}, onStartBlank() {} }
  const runningHtml = render(props) as string
  assert(runningHtml.includes('Partial evidence is preserved'))
  assert(runningHtml.includes('Scan still running'))
  assert(runningHtml.includes('Scan duration') && runningHtml.includes('In progress'))
  assert(runningHtml.includes('Completed at') && runningHtml.includes('Not complete'))
  assert(!runningHtml.includes('Continue to Review →'), 'Continue to Review is unavailable while running')
  const terminalHtml = render({ ...props, state: completeState, loading: false }) as string
  assert(terminalHtml.includes('Continue to Review →'), 'Continue to Review is available after terminal state')
  assert(terminalHtml.includes('12s') && terminalHtml.includes('Completed at'))
  assert(terminalHtml.includes('Workspace activity'), 'general operator activity remains separate from scan completion')
  assert(terminalHtml.includes('customer-brand-wordmark') && terminalHtml.includes('customer-product-name'), 'header keeps the brand and product identity grouped')
  const customerViewCss = readFileSync(new URL('../src/components/CustomerScanView.css', import.meta.url), 'utf8')
  assert.match(customerViewCss, /\.customer-brand-wordmark\s*\{[^}]*white-space:\s*nowrap/, 'desktop wordmark remains on one line')
  assert.match(customerViewCss, /@media \(max-width: 640px\)[\s\S]*\.customer-header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/, 'mobile header collapses without a fixed-width column')
  const historicalState = structuredClone(completeState)
  delete historicalState.visibilityRuns?.at(-1)?.elapsedMs
  assert(render({ ...props, state: historicalState, loading: false }).includes('Not recorded'), 'historical runs do not receive an invented duration')
  const categoryHtml = render({ ...props, state: missingCategory, view: 'Business', loading: false }) as string
  assert(categoryHtml.includes('Primary category is required before scanning'))
  assert(categoryHtml.includes('Save Business'))
  const saveFailureHtml = render({ ...props, state: reviewedState, view: 'Business', loading: false, saveNotice: { kind: 'error', text: 'Found Local could not save this workspace in browser storage.' } }) as string
  assert(saveFailureHtml.includes('Found Local could not save this workspace'))
  assert(saveFailureHtml.includes('Business details') && saveFailureHtml.includes('Save Business'), 'save failure retains a valid Business page')
  const savedHtml = render({ ...props, state: reopened, view: 'Business', loading: false, saveNotice: { kind: 'success', text: 'Saved Montessori Center of Downriver.' } }) as string
  assert(savedHtml.includes('Saved Montessori Center of Downriver.'))
  assert(savedHtml.includes('Montessori school') && savedHtml.includes('Southgate'), 'saved reviewed facts remain visible after storage round-trip')
} finally {
  unlinkSync(renderPath)
  stop()
}

console.log('Acceptance blockers PASS: safe save persistence, required category, terminal scan lifecycle, timeout/exception finalization, neutral failures, late-response isolation, and Review gating.')
