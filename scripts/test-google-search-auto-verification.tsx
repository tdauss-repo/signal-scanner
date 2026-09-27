import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState, SearchDestinationObservation } from '../src/types/audit.ts'
import type { BusinessResultCandidate } from '../src/types/entityMatch.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { projectSalesVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })

const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver',
  primaryCategory: 'Preschool',
  secondaryCategories: 'Montessori School, Kindergarten',
  streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465',
  website: 'http://www.montessoridownriver.com/',
})
const reviewedFields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'secondaryCategories', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = {
  schemaVersion: 1,
  values: Object.fromEntries(reviewedFields.map((field) => [field, {
    value: profile[field], source: 'operator_entered', confidence: 'high', status: 'operator_reviewed', recordedAt: '2026-09-27T12:00:00Z',
  }])) as BusinessProfileState['values'],
}

const reference = { sourceUrl: 'https://www.google.com/search?q=Montessori', acquiredAt: '2026-09-27T12:00:00Z', method: 'server_fetch' as const, provider: 'brightdata_serp_api', locator: 'fixture', excerpt: 'bounded fixture evidence' }
const candidate = (id: string, fields: BusinessResultCandidate['fields'], extra: Partial<BusinessResultCandidate> = {}): BusinessResultCandidate => ({
  id, kind: 'semantic_card', sourceType: 'knowledge_panel', fields, evidence: [reference], ...extra,
})
const capture = (candidates: BusinessResultCandidate[]): AcquisitionResult => ({
  version: 1, requestedUrl: 'https://www.google.com/search?q=Montessori%20Center%20of%20Downriver%20Southgate%20MI',
  finalUrl: 'https://www.google.com/search?q=Montessori%20Center%20of%20Downriver%20Southgate%20MI', acquiredAt: '2026-09-27T12:00:00Z',
  method: 'server_fetch', provider: 'brightdata_serp_api', outcome: 'success', confidence: 'captured', notes: [],
  resultRegionInspected: true, normalizedSearchCandidates: candidates,
})
const assess = (candidates: BusinessResultCandidate[]) => assessSearchCapture(capture(candidates), profile, profileState, 'Google Search', 'brand')

const organicUrl = 'http://montessoridownriver.com/infographic-parenting-book-recommendations/'
const domainOnlyCandidate = candidate('domain-only', {}, { kind: 'result_link', sourceType: 'organic', resultUrl: organicUrl })
const domainOnly = assess([domainOnlyCandidate])
assert.equal(domainOnly.automaticObservation, false, '1: an official-domain organic URL alone is not identity verification')
assert.equal(domainOnly.googleIdentityDecision?.decision, 'review_required')
const titledInternalPage = assess([candidate('titled-internal', { name: profile.businessName }, { kind: 'result_link', sourceType: 'organic', resultUrl: organicUrl })])
assert.equal(titledInternalPage.automaticObservation, false, 'one internal organic page cannot verify from a title name and domain alone')

const maryCandidates = [
  candidate('mary-panel', {
    name: profile.businessName, website: 'https://montessoridownriver.com/',
    address: '15575 Northline Rd, Southgate, MI 48195', phone: '(734) 282-6465',
    locality: 'Southgate', region: 'Michigan', postalCode: '48195', category: 'Montessori school',
    placeIdentity: 'google-place-mary',
  }),
  candidate('mary-organic', { name: profile.businessName }, { kind: 'result_link', sourceType: 'organic', resultUrl: organicUrl }),
]
const rawCandidates = structuredClone(maryCandidates)
const mary = assess(maryCandidates)
assert.equal(mary.automaticObservation, true, 'Montessori knowledge-panel identity verifies automatically')
assert.equal(mary.googleIdentityDecision?.decision, 'verified')
assert.deepEqual(new Set(mary.googleIdentityDecision?.matchedSignals.map((signal) => signal.field)), new Set(['name', 'website', 'address', 'phone']))
assert(mary.googleIdentityDecision?.sourceTypes.includes('knowledge_panel'), 'knowledge-panel provenance is retained explicitly')
assert.deepEqual(maryCandidates, rawCandidates, '13: identity classification does not mutate raw acquired candidates')

const liveShape = assess([
  candidate('live-panel', { name: 'Montessori Center of Downriver in Southgate, Michigan', address: '15575 Northline Rd, Southgate, MI 48195', phone: '(734) 282-6465', category: 'Preschool' }),
  candidate('live-about-page', { name: 'About Our School' }, { kind: 'result_link', sourceType: 'organic', resultUrl: 'http://montessoridownriver.com/about/' }),
  candidate('live-home-result', { name: profile.businessName }, { kind: 'result_link', sourceType: 'organic', resultUrl: 'http://montessoridownriver.com/' }),
  candidate('nearby-competitor', { name: 'Creative Montessori Center | Southgate MI' }, { kind: 'result_link', sourceType: 'organic', resultUrl: 'https://www.facebook.com/creative-montessori/' }),
])
assert.equal(liveShape.automaticObservation, true, 'official page titles and nearby SERP competitors do not contradict a strongly matched knowledge-panel identity')
assert.equal(liveShape.blocker, 'none')

assert.equal(assess([candidate('name-domain-city', { name: profile.businessName, locality: 'Southgate' }, { kind: 'result_link', sourceType: 'organic', resultUrl: organicUrl })]).automaticObservation, true, '2: name + domain + city verifies')
assert.equal(assess([candidate('name-address', { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195' })]).automaticObservation, true, '3: name + address verifies')
assert.equal(assess([candidate('name-phone', { name: profile.businessName, phone: '(734) 282-6465' })]).automaticObservation, true, '4: name + phone verifies')
assert.equal(assess([candidate('panel-domain', { name: profile.businessName, website: 'https://www.montessoridownriver.com/' })]).automaticObservation, true, '5: knowledge-panel identity + domain verifies')

const phoneConflict = assess([candidate('phone-conflict', { name: profile.businessName, website: profile.website, phone: '313-555-0100' })])
assert.equal(phoneConflict.automaticObservation, false, '6: a strong match with conflicting phone never verifies')
assert.equal(phoneConflict.blocker, 'identifier_conflict')
assert(phoneConflict.googleIdentityDecision?.conflictingSignals.some((signal) => signal.field === 'phone'))

const multiple = assess([
  candidate('entity-one', { name: profile.businessName, website: profile.website, placeIdentity: 'place-one' }),
  candidate('entity-two', { name: profile.businessName, website: profile.website, placeIdentity: 'place-two' }),
])
assert.equal(multiple.automaticObservation, false, '7: multiple plausible entities never verify')
assert.equal(multiple.blocker, 'multiple_entities')

const failedCapture: AcquisitionResult = { ...capture([]), outcome: 'failed', confidence: 'unavailable', error: 'provider timeout', resultRegionInspected: false }
const failed = assessSearchCapture(failedCapture, profile, profileState, 'Google Search', 'brand')
assert.equal(failed.visibilityResult, 'unavailable', '8: provider failure remains neutral')
assert.equal(failed.automaticObservation, false)
const genericName = assess([candidate('generic-name', { name: profile.businessName })])
assert.equal(genericName.automaticObservation, false, 'generic/name-only evidence remains verification-needed')

const observation = (assessment: typeof mary, candidates = maryCandidates): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  observedAt: '2026-09-27T12:00:00Z', provenance: 'automated_acquisition',
  overallResult: assessment.automaticObservation ? 'found_match' : assessment.visibilityResult === 'unavailable' ? 'unable_to_verify' : 'manual_review_needed',
  observedResultUrl: candidates.find((item) => item.resultUrl)?.resultUrl,
  automation: {
    runId: 'google-auto-fixture', state: assessment.automaticObservation ? 'evidence_captured' : 'awaiting_review',
    inspectedUrl: 'https://www.google.com/search?q=fixture', captures: [capture(candidates)], evidence: 'bounded evidence', interpreted: assessment.automaticObservation,
    automaticObservation: assessment.automaticObservation, queryMode: 'brand', assessment,
  },
}, { profile, brandPresence: true })

const maryObservation = observation(mary)
const marySales = projectSalesVisibility(maryObservation, { profile, profileState })
assert.equal(marySales.state, 'verified_correct')
assert.equal(marySales.headline, 'Verified automatically')
assert.equal(marySales.operatorReviewRequired, false)
assert.equal(marySales.automationSummary, 'Verified from acquired Google evidence')
assert.match(marySales.explanation, /Montessori Center of Downriver/)
const marySummary = brandPresenceEvidenceSummary(maryObservation, marySales)
assert.equal(marySummary.decision, 'Verified automatically')
assert(marySummary.identityEvidence?.some((item) => item.label === 'Phone' && item.result.includes('734')))

const autoMarkup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Search': maryObservation } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
assert(autoMarkup.includes('No operator action required.'), '9: auto-verified Google hides required assisted controls')
assert(autoMarkup.includes('Review manually'), '10: optional manual review remains available')
assert.equal(autoMarkup.includes('aria-label="Google Search assisted verification"'), false)

const weakObservation = observation(domainOnly, [domainOnlyCandidate])
const fallbackMarkup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Search': weakObservation } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
assert(fallbackMarkup.includes('aria-label="Google Search assisted verification"'), 'assisted verification remains the incomplete-evidence fallback')

const conflictObservation = observation(phoneConflict, [candidate('phone-conflict', { name: profile.businessName, website: profile.website, phone: '313-555-0100' })])
const conflictSales = projectSalesVisibility(conflictObservation, { profile, profileState })
assert.equal(conflictSales.state, 'conflicting_evidence')
assert.equal(conflictSales.headline, 'Conflicting evidence — review needed')
assert.equal(conflictSales.customerFindingEligible, false, 'raw automated conflict does not auto-create a customer issue')
assert(brandPresenceEvidenceSummary(conflictObservation, conflictSales).identityEvidence?.some((item) => item.result.includes('313-555-0100')))

const makeState = (google: SearchDestinationObservation): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: '2026-09-27T12:00:00Z', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: { 'search-brand-canonical': { 'Google Search': google } }, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const state = makeState(maryObservation)
const strengths = customerStrengthCandidates(state, [])
assert.deepEqual(strengths.map((item) => item.id), ['search:Google Search'], '11: auto-verified Google is strength-eligible')
assert.match(strengths[0].defaultSummary, /^We verified that the business identity shown in Google Search/)
assert.doesNotMatch(strengths[0].defaultSummary, /Maps|Bing|rank|visibility is strong/i, '12: wording stays Google-only')

const changedState = makeState(conflictObservation)
assert.equal(customerStrengthCandidates(changedState, []).length, 0, '14: material conflicting rescan recomputes and removes current strength eligibility')
const sameAssessment = assess(structuredClone(maryCandidates))
assert.deepEqual(sameAssessment.googleIdentityDecision, mary.googleIdentityDecision, 'semantically unchanged evidence produces a stable decision')

const customerJson = serializeCustomerVisibilityReview(buildCustomerVisibilityReviewExport(state, [], []))
for (const internal of ['googleIdentityDecision', 'brightdata_serp_api', 'matchedSignals', 'candidateIds', 'placeIdentity', 'provider']) {
  assert.equal(customerJson.includes(internal), false, `15: ${internal} stays outside customer JSON`)
}
assert(customerJson.includes('Google Search'), 'customer-safe Google strength remains exportable')

console.log('Google Search automatic verification PASS: Montessori auto-verification, weak/conflicting/unavailable fallback, UI, strength, rescan, and customer boundary.')
