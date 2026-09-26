import assert from 'node:assert/strict'
import type { AuditState, FixItem, SearchDestinationObservation } from '../src/types/audit.ts'
import { buildCustomerVisibilityReviewExport, customerVisibilityReviewQaText, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerReviewKey, customerReviewReadiness, summarizeCustomerScan } from '../src/utils/customerScan.ts'
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
const observation = (destination: SearchDestinationObservation['destination'], result: 'found' | 'review_required', profileUrl?: string): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, 'Montessori Center of Downriver'), provenance: 'automated_acquisition', overallResult: result === 'found' ? 'found_match' : 'manual_review_needed', automation: {
    runId: 'operator-only-run', state: 'evidence_captured', inspectedUrl: 'https://operator.example/search', captures: [{ provider: 'brightdata', requestedUrl: '', finalUrl: '', acquiredAt: '', outcome: 'success', confidence: 'captured', notes: [] }], evidence: 'operator-only raw evidence', interpreted: true, automaticObservation: result === 'found', queryMode: 'brand', assessment: {
      visibilityResult: result, automaticObservation: result === 'found', operatorReviewRequired: result !== 'found', resultRegionInspected: result === 'found', confidence: result === 'found' ? 'high' : 'low', blocker: result === 'found' ? 'none' : 'provider_permission_blocked', ambiguityReasons: [], matches: profileUrl ? [{ candidate: { fields: { publicProfileUrl: profileUrl }, resultUrl: profileUrl } }] : [],
    },
  },
})
const fix = (id: string, issue: string, sourceArea: FixItem['sourceArea'] = 'website'): FixItem => ({
  id, priority: 'Medium', area: 'Website', issue, fix: `Correct ${issue}`, status: 'fail', evidenceSummary: 'Operator-only evidence text must not be exported.', evidenceNote: 'internal note', verificationMethod: 'Recheck after implementation.', sourceArea, salesPackageFit: 'starter', reviewed: true,
})

const state = makeState()
const fixes = [
  fix('website-https', 'Secure website connection'),
  fix('website-meta-description', 'Homepage search description'),
  fix('website-schema', 'Business identity for search & AI'),
  fix('unapproved-one', 'Must not appear without customer approval'),
  fix('unapproved-two', 'Still awaiting operator disposition'),
  fix('unapproved-three', 'Another finding awaiting disposition'),
  fix('unapproved-four', 'Final finding awaiting disposition'),
  fix('website-title', 'Supporting observation stays outside the primary queue'),
]
state.searchDestinationObservations = {
  'search-brand-canonical': { 'Google Search': observation('Google Search', 'found'), 'Google Maps': observation('Google Maps', 'found'), Yelp: observation('Yelp', 'review_required', 'https://www.yelp.com/biz/montessori-example') },
  'search-brand-market': { Yelp: observation('Yelp', 'review_required', 'https://www.yelp.com/biz/montessori-example'), 'Apple Maps': observation('Apple Maps', 'review_required') },
}
const primaryFixes = fixes.filter((item) => item.id !== 'website-title')
const summary = () => summarizeCustomerScan(state, [], fixes)
const beforeApproval = customerReviewReadiness(state, summary())
assert.equal(beforeApproval.state, 'not_ready')
assert.equal(beforeApproval.candidateFindings, 7, 'supporting observations are excluded from primary candidates')
assert.equal(beforeApproval.approvedFindings, 0)
assert.equal(beforeApproval.dismissedFindings, 0)
assert.equal(beforeApproval.awaitingDisposition, 7, 'unreviewed primary candidates block readiness')
assert.equal(beforeApproval.needsReview, 2, 'manual review destinations remain visible and deduplicated')
for (const approved of primaryFixes.slice(0, 3)) state.customerFindingReviews = { ...(state.customerFindingReviews || {}), [approved.id]: customerReviewKey(state, approved) }

const partiallyAdjudicated = customerReviewReadiness(state, summary())
assert.equal(partiallyAdjudicated.state, 'not_ready', 'approved findings do not bypass unresolved primary candidates')
assert.equal(partiallyAdjudicated.approvedFindings, 3)
assert.equal(partiallyAdjudicated.dismissedFindings, 0)
assert.equal(partiallyAdjudicated.awaitingDisposition, 4)

for (const dismissed of primaryFixes.slice(3)) state.customerFindingDismissals = { ...(state.customerFindingDismissals || {}), [dismissed.id]: customerReviewKey(state, dismissed) }
const afterDisposition = customerReviewReadiness(state, summary())
assert.equal(afterDisposition.state, 'ready', 'approved plus explicitly dismissed primary findings permit export while neutral destination review remains open')
assert.equal(afterDisposition.candidateFindings, 7)
assert.equal(afterDisposition.approvedFindings, 3)
assert.equal(afterDisposition.dismissedFindings, 4)
assert.equal(afterDisposition.awaitingDisposition, 0)
assert.equal(afterDisposition.needsReview, 2)

const review = buildCustomerVisibilityReviewExport(state, [{ id: 'website-robots', area: 'website', label: 'Robots file', description: '', weight: 1, fix: '' }], fixes)
assert.equal(review.reviewVersion, '1.0')
assert.deepEqual(review.business, { name: 'Montessori Center of Downriver', category: 'Montessori school', city: 'Southgate', state: 'MI', website: 'http://www.montessoridownriver.com/', displayWebsite: 'montessoridownriver.com', websitePreview: { headline: 'Montessori Center of Downriver', subheadline: 'Montessori school in Southgate, MI' } })
assert.equal(review.confirmedIssues.length, 3, 'only explicitly approved findings export')
assert.equal(review.confirmedIssues.some((item) => item.id.startsWith('unapproved')), false, 'dismissed and unresolved findings never export')
assert.equal(review.recommendedPackage.name, 'Starter Visibility Cleanup')
assert(review.recommendedPackage.included.includes('Secure website setup'))
assert(review.recommendedPackage.included.includes('Search description cleanup'))
assert(review.recommendedPackage.included.includes('Business identity / structured data cleanup'))
assert.deepEqual(review.recommendedPackage.included, ['Secure website setup', 'Search description cleanup', 'Business identity / structured data cleanup'], 'package scope comes only from approved Starter findings')
assert.equal(review.scanAreas.find((area) => area.id === 'website')?.state, 'issue')
assert.equal(review.scanAreas.find((area) => area.id === 'search_maps')?.state, 'review', 'Neutral destination uncertainty is review, not issue')
assert.equal(review.scanAreas.find((area) => area.id === 'business_information')?.state, 'review', 'Website findings do not mark unrelated business information as issue')
assert.equal(review.scanAreas.find((area) => area.id === 'ai_discovery')?.state, 'review', 'Website findings do not mark unrelated AI discovery as issue')
assert.equal(review.verifiedStrengths.filter((item) => item.title === 'Google Search').length, 1, 'strengths deduplicate destinations')
assert.equal(review.needsReview.filter((item) => item === 'Yelp').length, 1, 'review labels deduplicate destinations')
assert(review.needsReview.includes('Apple Maps'))

const serialized = serializeCustomerVisibilityReview(review)
const qaText = customerVisibilityReviewQaText(review, true)
assert.doesNotThrow(() => JSON.parse(serialized))
for (const issue of review.confirmedIssues) for (const value of [issue.title, issue.summary, issue.foundLocalAction]) assert(qaText.includes(value), 'QA text reuses the exact customer-safe finding projection')
for (const forbidden of ['brightdata', 'provider_permission_blocked', 'operator-only-run', 'operator-only raw evidence', 'internal note', 'confidence', 'blocker', 'provenance', 'resultRegionInspected', 'captures']) {
  assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, `customer export must omit ${forbidden}`)
  assert.equal(qaText.toLowerCase().includes(forbidden.toLowerCase()), false, `customer QA text must omit ${forbidden}`)
}

const jemProfile = normalizeWorkspaceProfile({ businessName: 'JEM Photography', primaryCategory: 'Photography studio', city: 'Detroit', state: 'MI', website: 'https://jem.example/' })
const jemState = makeState(jemProfile)
const jem = buildCustomerVisibilityReviewExport(jemState, [], [])
assert.equal(jem.business.name, 'JEM Photography')
assert.equal(jem.confirmedIssues.length, 0)
assert.equal(jem.recommendedPackage.name, 'No package recommended yet')
assert.equal(jem.recommendedPackage.included.length, 0)
assert.equal(jem.overall.state, 'not_fully_verified')
assert.equal(customerReviewReadiness(jemState, summarizeCustomerScan(jemState, [], [])).state, 'not_ready', 'an unscanned workspace is not ready merely because it has no candidates')

const jemCheck = { id: 'website-homepage', area: 'website' as const, label: 'Website homepage', description: '', weight: 1, fix: '' }
jemState.checks[jemCheck.id] = 'pass'
assert.equal(customerReviewReadiness(jemState, summarizeCustomerScan(jemState, [jemCheck], [])).state, 'ready', 'a reviewed all-clear payload can be ready without inventing an issue')

const neutralOnlyState = makeState()
neutralOnlyState.searchDestinationObservations = state.searchDestinationObservations
const neutralOnly = customerReviewReadiness(neutralOnlyState, summarizeCustomerScan(neutralOnlyState, [], []))
assert.equal(neutralOnly.state, 'ready', 'verified strengths plus neutral manual/provider review remain a valid all-clear review')
assert.equal(neutralOnly.candidateFindings, 0, 'provider/manual states do not create customer findings')
assert.equal(neutralOnly.needsReview, 2, 'neutral states remain visible without becoming blockers')

console.log('Customer Visibility Review Export PASS: v1 contract, explicit approval/dismissal readiness, neutral manual review, safe projection, package behavior, Mary and JEM fixtures, and forbidden-field audit.')
