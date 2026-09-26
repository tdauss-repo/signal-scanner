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
import { visibilityRunIsTerminal, visibilityRunStatus } from '../src/utils/visibilityScanState.ts'
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
const completeRun = await runVisibilityScan(completeState, { automationVersion: 2, website: async () => fixture.response, acquire: async (url) => capture(url), operationTimeoutMs: 20, overallTimeoutMs: 100 }, (update) => { completeState = update(completeState) })
assert(visibilityRunIsTerminal(completeRun))
assert(completeRun.endedAt)
assert(!completeRun.checks.some((check) => ['queued', 'scanning'].includes(check.state)))

let resolveLate!: (capture: AcquisitionResult | undefined) => void
let timedState = makeState()
const timedRun = await runVisibilityScan(timedState, {
  automationVersion: 2, website: async () => fixture.response,
  acquire: () => new Promise((resolve) => { resolveLate = resolve }), operationTimeoutMs: 5, overallTimeoutMs: 20,
}, (update) => { timedState = update(timedState) })
assert.equal(visibilityRunStatus(timedRun), 'completed_with_review')
assert(timedRun.endedAt)
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
  operationTimeoutMs: 20, overallTimeoutMs: 100,
}, (update) => { failedState = update(failedState) })
assert.equal(visibilityRunStatus(failedRun), 'failed')
assert(failedRun.failure)
assert(failedRun.endedAt)
assert(!failedRun.checks.some((check) => ['queued', 'scanning'].includes(check.state)))

const finding: FixItem = {
  id: 'website-local-content', area: 'Website SEO', sourceArea: 'website', priority: 'Medium', status: 'partial', reviewed: true,
  issue: 'Service-area copy', whyItMatters: 'Generic scanner interpretation.', fix: 'Add generic service-area copy.',
  evidenceSummary: 'Service-area phrases found on homepage: Downriver', verificationMethod: 'Recheck the homepage.', salesPackageFit: 'starter',
}
assert.equal(defaultCustomerFindingWording(finding, makeState()).title, 'Homepage local identity clarity', 'Mary-like fixture remains school-aware')
const runningState = makeState()
runningState.visibilityRuns = [{ ...completeRun, id: 'running-fixture', status: 'running', endedAt: undefined, checks: completeRun.checks.map((check, index) => ({ ...check, state: index ? 'queued' : 'awaiting_review' })) }]
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
  assert(!runningHtml.includes('Continue to Review →'), 'Continue to Review is unavailable while running')
  const terminalHtml = render({ ...props, state: completeState, loading: false }) as string
  assert(terminalHtml.includes('Continue to Review →'), 'Continue to Review is available after terminal state')
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
