import assert from 'node:assert/strict'
import type { AuditState, FixItem } from '../src/types/audit.ts'
import type { VisibilityRun } from '../src/types/visibilityScan.ts'
import { currentRunFindings, customerReviewKey, findingsNeedingReconciliation, isPresentedFinding, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { evidenceFingerprint } from '../src/utils/evidenceFingerprint.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', website: 'http://www.montessoridownriver.com/',
  primaryCategory: 'Montessori school', city: 'Southgate', state: 'MI',
})
const state: AuditState = {
  profile, businessProfile: { schemaVersion: 1, values: {} }, checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: '2026-10-11T17:34:00.000Z', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {},
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const finding = (id: string): FixItem => ({
  id, area: 'Website', sourceArea: 'website', priority: 'Medium', status: 'fail', reviewed: true,
  issue: `Finding ${id}`, fix: `Fix ${id}`, whyItMatters: `${id} matters.`, evidenceSummary: `Run evidence for ${id}.`,
  verificationMethod: `Verify ${id}.`, salesPackageFit: 'starter',
})
const findings = ['one', 'two', 'three', 'four'].map(finding)
for (const fix of findings) {
  const key = customerReviewKey(state, fix)
  state.customerFindingReviews = { ...state.customerFindingReviews, [fix.id]: key }
  state.customerFindingDecisionSnapshots = { ...state.customerFindingDecisionSnapshots,
    [fix.id]: { evidenceKey: key, disposition: 'approved', finding: structuredClone(fix), customerWording: {
      title: fix.issue, priority: fix.priority, summary: fix.whyItMatters!, recommendedAction: fix.fix,
    } },
  }
}

const run = (id: string, ids: string[]): VisibilityRun => ({
  version: 2, id, profileKey: evidenceFingerprint(profile), startedAt: '2026-10-11T17:30:00.000Z', endedAt: '2026-10-11T17:34:00.000Z',
  status: 'completed_with_review', checks: [], businessEvidence: [], summary: {
    attempted: 10, successful: 8, evidenceCaptured: 8, operatorReview: ids.length, interactiveReview: 2,
    manualInterventionsRequired: 2, acquisitionFailures: 1, providerEscalations: 0,
    candidateFindings: ids.length, candidateFindingIds: ids, customerApprovedFindings: 0,
  },
})

state.visibilityRuns = [run('run-a', findings.map((fix) => fix.id))]
assert.equal(currentRunFindings(state, findings).length, 4, 'Run A exposes its four supported findings')
assert(currentRunFindings(state, findings).every((fix) => isPresentedFinding(state, fix)), 'unchanged Run A decisions remain active')

state.visibilityRuns.push(run('run-b', findings.slice(0, 3).map((fix) => fix.id)))
const runB = currentRunFindings(state, findings)
assert.deepEqual(runB.map((fix) => fix.id), ['one', 'two', 'three'])
assert.equal(summarizeCustomerScan(state, [], findings).cockpit.confirmedIssues.length, 3, 'Scan page count is limited to Run B findings')
assert.equal(findingsNeedingReconciliation(state, runB).filter((item) => item.absentFromLatestScan).some((item) => item.finding.id === 'four'), true,
  'the absent fourth decision remains historical reconciliation state')
assert(runB.every((fix) => isPresentedFinding(state, fix)), 'unchanged Run B evidence retains prior decisions')

state.visibilityRuns.push(run('run-b-same-four', findings.map((fix) => fix.id)))
assert.equal(currentRunFindings(state, findings).length, 4)
assert(currentRunFindings(state, findings).every((fix) => isPresentedFinding(state, fix)), 'same four unchanged findings retain all prior decisions')

const running = run('run-c-running', [])
running.status = 'running'
running.endedAt = undefined
running.summary = undefined
state.visibilityRuns.push(running)
assert.equal(currentRunFindings(state, findings).length, 0, 'starting Run C resets current-run candidate projection without erasing decisions')
assert.equal(Object.keys(state.customerFindingReviews || {}).length, 4)

console.log('Current-run finding count PASS: 4-to-3 replacement, historical reconciliation, unchanged-decision retention, and new-run candidate reset.')
