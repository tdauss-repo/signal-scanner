import assert from 'node:assert/strict'
import type { AuditState, FixItem, SearchDestinationObservation } from '../src/types/audit.ts'
import { buildCustomerVisibilityReviewExport } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerReviewKey } from '../src/utils/customerScan.ts'
import { derivePackagePreparation } from '../src/utils/packagePreparation.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const maryProfile = normalizeWorkspaceProfile({ businessName: 'Montessori Center of Downriver', primaryCategory: 'Montessori school', city: 'Southgate', state: 'MI', website: 'http://www.montessoridownriver.com/' })
const makeState = (profile = maryProfile): AuditState => ({
  profile, businessProfile: { schemaVersion: 1, values: {} }, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const fix = (id: string, issue: string, action: string, fit: NonNullable<FixItem['salesPackageFit']> = 'starter'): FixItem => ({
  id, priority: 'Medium', area: 'Website', issue, fix: action, status: 'fail', evidenceSummary: `Evidence for ${issue}`, verificationMethod: `Verify ${issue}`, sourceArea: 'website', salesPackageFit: fit, reviewed: true,
})
const needsReviewObservation = (): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation('Apple Maps', 'Montessori Center of Downriver'),
  provenance: 'automated_acquisition', overallResult: 'manual_review_needed', reviewed: true, evidenceNotes: 'Automatic verification unavailable; manual review remains open.',
  automation: { runId: 'neutral-provider-run', state: 'evidence_captured', inspectedUrl: '', captures: [], evidence: '', interpreted: true, automaticObservation: false, queryMode: 'brand', assessment: { visibilityResult: 'review_required', automaticObservation: false, operatorReviewRequired: true, resultRegionInspected: false, confidence: 'low', blocker: 'provider_permission_blocked', ambiguityReasons: [], matches: [] } },
})

const primary = [
  fix('website-https', 'Secure website connection', 'Enable HTTPS and verify the secure canonical site.'),
  fix('website-meta-description', 'Homepage search description', 'Correct the homepage search description.'),
  fix('website-schema', 'Business identity for Search & AI', 'Add complete business identity structured data.'),
  fix('candidate-four', 'Candidate four', 'Correct candidate four.'),
  fix('candidate-five', 'Candidate five', 'Correct candidate five.'),
  fix('candidate-six', 'Candidate six', 'Correct candidate six.'),
  fix('candidate-seven', 'Candidate seven', 'Correct candidate seven.'),
]
const supporting = fix('website-title', 'Supporting title observation', 'Correct the reviewed title issue.')
const fixes = [...primary, supporting]
const state = makeState()
state.searchDestinationObservations = { 'search-brand-market': { 'Apple Maps': needsReviewObservation() } }

let preparation = derivePackagePreparation(state, fixes)
assert.equal(preparation.recommendedPackage, null, 'zero approved findings cannot recommend a package')
assert.deepEqual(preparation.starterItems, [])

for (const approved of primary.slice(0, 3)) state.customerFindingReviews = { ...(state.customerFindingReviews || {}), [approved.id]: customerReviewKey(state, approved) }
preparation = derivePackagePreparation(state, fixes)
assert.equal(preparation.recommendedPackage, 'Starter Visibility Cleanup', 'approved Starter-eligible findings justify Starter')
assert.deepEqual(preparation.starterItems.map((item) => item.findingId), ['website-https', 'website-meta-description', 'website-schema'])
assert.deepEqual(preparation.starterItems.map((item) => item.includedScope), ['Secure website setup', 'Search description cleanup', 'Business identity / structured data cleanup'], 'Mary scope contains exactly the three approved finding-derived items')
assert.equal(preparation.starterItems.some((item) => item.findingId === supporting.id), false, 'supporting observations need explicit promotion')
assert.equal(preparation.starterItems.some((item) => item.findingId.startsWith('candidate-')), false, 'unresolved candidates cannot create scope')

for (const dismissed of primary.slice(3)) state.customerFindingDismissals = { ...(state.customerFindingDismissals || {}), [dismissed.id]: customerReviewKey(state, dismissed) }
preparation = derivePackagePreparation(state, fixes)
assert.equal(preparation.starterItems.length, 3, 'dismissed findings cannot create scope')
assert.equal(preparation.starterItems.some((item) => /Apple Maps/.test(item.finding)), false, 'neutral provider/manual review does not create package scope')

const exported = buildCustomerVisibilityReviewExport(state, [], fixes)
assert.equal(exported.recommendedPackage.name, preparation.recommendedPackage)
assert.deepEqual(exported.recommendedPackage.included, preparation.starterItems.map((item) => item.includedScope), 'customer export uses the same approved package determination')
assert.equal(exported.recommendedPackage.included.includes('Priority listing review'), false, 'neutral review work is not inferred into package scope')

const supportingState = structuredClone(state)
supportingState.customerFindingReviews = { ...(supportingState.customerFindingReviews || {}), [supporting.id]: customerReviewKey(supportingState, supporting) }
assert(derivePackagePreparation(supportingState, fixes).starterItems.some((item) => item.findingId === supporting.id), 'an explicitly promoted supporting observation can create scope')

const separate = fix('owner-access', 'Platform ownership required', 'Guide the owner through platform access.', 'owner_action')
const separateState = makeState()
separateState.customerFindingReviews = { [separate.id]: customerReviewKey(separateState, separate) }
const separatePreparation = derivePackagePreparation(separateState, [separate])
assert.equal(separatePreparation.recommendedPackage, null, 'approved non-Starter work alone does not justify Starter')
assert.equal(separatePreparation.separateScopeItems[0]?.packageAssignment, 'Customer/platform ownership required')

const jemState = makeState(normalizeWorkspaceProfile({ businessName: 'JEM Photography', primaryCategory: 'Photography studio', city: 'Detroit', state: 'MI', website: 'https://jem.example/' }))
assert.equal(derivePackagePreparation(jemState, fixes).recommendedPackage, null, 'JEM zero-approved state remains neutral')
assert.equal(buildCustomerVisibilityReviewExport(jemState, [], fixes).recommendedPackage.name, 'No package recommended yet')

console.log('Package Preparation PASS: approved-only scope, Starter eligibility, dismissal/unresolved/neutral exclusion, promoted supporting observations, Mary three-item scope, export consistency, and neutral JEM state.')
