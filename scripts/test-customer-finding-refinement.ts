import assert from 'node:assert/strict'
import type { AuditState, FixItem } from '../src/types/audit.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import {
  activeCustomerFindingRefinement,
  buildCustomerFindingRefinement,
  customerReviewKey,
  customerReviewReadiness,
  effectiveCustomerFindingWording,
  hasStaleCustomerFindingRefinement,
  isPresentedFinding,
  summarizeCustomerScan,
} from '../src/utils/customerScan.ts'
import { derivePackagePreparation } from '../src/utils/packagePreparation.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const maryProfile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver',
  primaryCategory: 'Montessori school',
  city: 'Southgate',
  state: 'MI',
  streetAddress: '15575 Northline Road',
  postalCode: '48195',
  website: 'https://montessoridownriver.example/',
})

const makeState = (): AuditState => ({
  profile: maryProfile,
  businessProfile: { schemaVersion: 1, values: {} },
  checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, maryProfile),
})

const rawFinding: FixItem = {
  id: 'website-service-area-copy',
  priority: 'Medium',
  area: 'Website',
  issue: 'Service-area copy',
  fix: 'Add a service-area statement to the homepage.',
  whyItMatters: 'Service businesses should say where they work.',
  status: 'fail',
  evidenceSummary: 'No explicit service-area phrase detected on the homepage.',
  evidenceNote: 'RAW-SCANNER-EVIDENCE: No explicit service-area phrase detected on the homepage.',
  evidenceSources: ['provider://operator-only-provenance'],
  verificationMethod: 'Recheck the homepage after the approved change.',
  sourceArea: 'website',
  salesPackageFit: 'starter',
  reviewed: true,
}

const maryWording = {
  title: 'Homepage local identity clarity',
  priority: 'Medium' as const,
  summary: 'The homepage identifies the school, but does not clearly state Southgate, Michigan or connect its location to the broader Downriver community.',
  recommendedAction: 'Add a natural statement that Montessori education serves Southgate and surrounding Downriver families, and make the Southgate address clearly visible.',
}

const state = makeState()
const originalFinding = structuredClone(rawFinding)
const refinement = buildCustomerFindingRefinement(state, rawFinding, maryWording)
assert(refinement)
state.customerFindingRefinements = { [rawFinding.id]: refinement }

assert.deepEqual(rawFinding, originalFinding, 'saving customer wording must not mutate scanner evidence or interpretation')
assert.equal(activeCustomerFindingRefinement(state, rawFinding)?.title, maryWording.title)
assert.deepEqual(effectiveCustomerFindingWording(state, rawFinding), maryWording)

let readiness = customerReviewReadiness(state, summarizeCustomerScan(state, [], [rawFinding]))
assert.equal(readiness.awaitingDisposition, 1, 'refinement alone does not adjudicate a finding')
assert.equal(readiness.state, 'not_ready')
assert.equal(derivePackagePreparation(state, [rawFinding]).starterItems.length, 0)
assert.equal(buildCustomerVisibilityReviewExport(state, [], [rawFinding]).confirmedIssues.length, 0)

state.customerFindingReviews = { [rawFinding.id]: customerReviewKey(state, rawFinding) }
assert.equal(isPresentedFinding(state, rawFinding), true)
readiness = customerReviewReadiness(state, summarizeCustomerScan(state, [], [rawFinding]))
assert.equal(readiness.approvedFindings, 1)
assert.equal(readiness.awaitingDisposition, 0)
assert.equal(readiness.state, 'ready')

const preparation = derivePackagePreparation(state, [rawFinding])
assert.equal(preparation.starterItems[0]?.finding, maryWording.title)
assert.equal(preparation.starterItems[0]?.priority, maryWording.priority)
assert.equal(preparation.starterItems[0]?.remediationAction, maryWording.recommendedAction)

const review = buildCustomerVisibilityReviewExport(state, [], [rawFinding])
assert.equal(review.reviewVersion, '1.0')
assert.equal(review.confirmedIssues[0]?.title, maryWording.title)
assert.equal(review.confirmedIssues[0]?.summary, maryWording.summary)
assert.equal(review.confirmedIssues[0]?.foundLocalAction, maryWording.recommendedAction)
const serialized = serializeCustomerVisibilityReview(review)
for (const forbidden of ['RAW-SCANNER-EVIDENCE', 'operator-only-provenance', 'evidenceKey', 'customerFindingRefinements']) {
  assert.equal(serialized.includes(forbidden), false, `${forbidden} must not cross the customer-safe boundary`)
}
assert.deepEqual(rawFinding, originalFinding, 'package/export projection must leave raw evidence unchanged')

const unrefinedState = makeState()
unrefinedState.customerFindingReviews = { [rawFinding.id]: customerReviewKey(unrefinedState, rawFinding) }
const unrefinedReview = buildCustomerVisibilityReviewExport(unrefinedState, [], [rawFinding])
assert.equal(unrefinedReview.confirmedIssues[0]?.title, rawFinding.issue)
assert.equal(unrefinedReview.confirmedIssues[0]?.foundLocalAction, rawFinding.fix)

const dismissedState = makeState()
dismissedState.customerFindingRefinements = { [rawFinding.id]: buildCustomerFindingRefinement(dismissedState, rawFinding, maryWording)! }
dismissedState.customerFindingDismissals = { [rawFinding.id]: customerReviewKey(dismissedState, rawFinding) }
assert.equal(derivePackagePreparation(dismissedState, [rawFinding]).starterItems.length, 0)
assert.equal(buildCustomerVisibilityReviewExport(dismissedState, [], [rawFinding]).confirmedIssues.length, 0)

const changedEvidenceState = structuredClone(state)
changedEvidenceState.notes = { 'website-service-area-copy': 'Materially changed evidence.' }
assert.equal(activeCustomerFindingRefinement(changedEvidenceState, rawFinding), undefined)
assert.equal(hasStaleCustomerFindingRefinement(changedEvidenceState, rawFinding), true)
assert.equal(isPresentedFinding(changedEvidenceState, rawFinding), false, 'evidence changes invalidate approval and refinement together')
assert.equal(derivePackagePreparation(changedEvidenceState, [rawFinding]).starterItems.length, 0)
assert.equal(buildCustomerVisibilityReviewExport(changedEvidenceState, [], [rawFinding]).confirmedIssues.length, 0)

const persisted = JSON.parse(JSON.stringify(state)) as AuditState
assert.equal(activeCustomerFindingRefinement(persisted, rawFinding)?.title, maryWording.title, 'saved-scan JSON round-trip preserves current refinement')
const legacy = JSON.parse(JSON.stringify(makeState())) as AuditState
assert.equal(effectiveCustomerFindingWording(legacy, rawFinding).title, rawFinding.issue, 'older scans without refinement state use generated defaults')

const supporting = { ...rawFinding, id: 'website-title', issue: 'Supporting title observation' }
const supportingReadiness = customerReviewReadiness(makeState(), summarizeCustomerScan(makeState(), [], [supporting]))
assert.equal(supportingReadiness.candidateFindings, 0)
assert.equal(supportingReadiness.awaitingDisposition, 0, 'supporting observations remain outside the primary disposition queue')

console.log('Customer finding refinement PASS: Mary wording, immutable evidence, approval/readiness, approved-only package/export, dismissal, fingerprint invalidation, saved compatibility, and supporting-observation behavior.')
