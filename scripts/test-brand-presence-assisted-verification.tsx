import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { AuditState, BusinessProfileField, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import {
  brandPresenceVerificationIsStale,
  buildBrandPresenceVerification,
  currentBrandPresenceVerification,
  deriveBrandPresenceFindings,
  expectedBrandPresenceIdentity,
} from '../src/utils/brandPresenceVerification.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { mergeAutomatedObservation } from '../src/utils/visibilityScan.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { projectSalesVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { workspaceFindings } from '../src/utils/workspaceFindings.ts'

Object.assign(globalThis, { React })
process.env.TZ = 'America/Detroit'

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

const observedResultUrl = 'http://montessoridownriver.com/infographic-parenting-book-recommendations/'
const candidate = { id: 'organic', kind: 'result_link' as const, resultUrl: observedResultUrl, fields: { name: profile.businessName, website: observedResultUrl }, evidence: [] }
const match = { candidate, matchedFields: [], conflictingFields: [], missingFields: [], unreviewedProfileFields: [], confidence: 'medium' as const, automaticObservation: false, ambiguityReasons: ['Business identity requires review.'], evidence: [] }
const google = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  observedAt: '2026-09-27T02:39:00Z', provenance: 'automated_acquisition', overallResult: 'manual_review_needed',
  automation: {
    runId: 'run-one', state: 'awaiting_review', inspectedUrl: 'https://www.google.com/search?q=transient&ei=123', captures: [],
    evidence: 'A business-domain page was observed.', interpreted: true, automaticObservation: false, queryMode: 'brand',
    assessment: { matches: [match], selected: match, confidence: 'medium', automaticObservation: false, visibilityResult: 'review_required', operatorReviewRequired: true, resultRegionInspected: true, ambiguityReasons: match.ambiguityReasons, blocker: 'insufficient_identity', tier3Candidate: false },
  },
}, { profile, brandPresence: true })

assert.equal(google.verificationUrl, 'https://www.google.com/search?q=Montessori%20Center%20of%20Downriver%20Southgate%20MI')
assert.equal(projectSalesVisibility(google, { profile, profileState }).state, 'website_result_discovered')
assert.deepEqual(expectedBrandPresenceIdentity(profile, profileState), {
  businessName: profile.businessName,
  categories: ['Preschool', 'Montessori School', 'Kindergarten'],
  streetAddress: '15575 Northline Road', locality: 'Southgate, MI 48195', phone: '734-282-6465', website: profile.website,
})

const verify = (observation: SearchDestinationObservation, outcome: Parameters<typeof buildBrandPresenceVerification>[3]['outcome'], extra: Partial<Parameters<typeof buildBrandPresenceVerification>[3]> = {}) => {
  const built = buildBrandPresenceVerification(observation, profile, profileState, { outcome, reviewedAt: '2026-09-27T12:00:00Z', ...extra })
  assert.equal(built.ok, true)
  return { ...observation, operatorVerification: built.ok ? built.verification : undefined }
}

// Montessori A — organic evidence remains raw while a human decision verifies Google Search.
const rawGoogleAcquisition = structuredClone({ automation: google.automation, observedResultUrl: google.observedResultUrl, canonicalProfileUrl: google.canonicalProfileUrl, observedAt: google.observedAt })
const verifiedGoogle = verify(google, 'found_correct', { operatorObservedUrl: 'https://www.google.com/search?q=Montessori%20Center%20of%20Downriver' })
assert.equal(verifiedGoogle.operatorVerification?.provenance, 'operator_verified')
assert.equal(verifiedGoogle.observedResultUrl, observedResultUrl)
assert.equal(verifiedGoogle.operatorVerification?.operatorObservedUrl?.startsWith('https://www.google.com/search?'), true)
assert.equal(verifiedGoogle.operatorVerification?.classifiedCanonicalProfileUrl, undefined, 'a search URL is not a canonical profile')
assert.equal(projectSalesVisibility(verifiedGoogle, { profile, profileState }).state, 'verified_by_operator')
assert.deepEqual({ automation: verifiedGoogle.automation, observedResultUrl: verifiedGoogle.observedResultUrl, canonicalProfileUrl: verifiedGoogle.canonicalProfileUrl, observedAt: verifiedGoogle.observedAt }, rawGoogleAcquisition, 'operator verification does not rewrite acquisition evidence')

const neutral = (destination: SearchDestination) => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'unable_to_verify', provenance: 'automated_acquisition',
  automation: { runId: 'failed', state: 'interactive_review_required', inspectedUrl: 'https://provider.invalid/request', captures: [], evidence: '', interpreted: false, queryMode: 'brand', assessment: { matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable', operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: ['Provider unavailable.'], blocker: 'runtime_unavailable', tier3Candidate: false } },
}, { profile, brandPresence: true })

// Montessori B — correction details are bounded and become an unapproved candidate.
const maps = neutral('Google Maps')
assert.equal(projectSalesVisibility(maps, { profile, profileState }).headline, 'Automated check unavailable — verification needed')
const invalidCorrection = buildBrandPresenceVerification(maps, profile, profileState, { outcome: 'found_correction_needed' })
assert.deepEqual(invalidCorrection, { ok: false, error: 'Select at least one mismatch or add a short operator note.' })
const correctedMaps = verify(maps, 'found_correction_needed', { mismatches: ['address'], operatorObservedUrl: 'https://www.google.com/maps/place/Montessori+Center+of+Downriver/' })
assert.match(correctedMaps.operatorVerification?.classifiedCanonicalProfileUrl || '', /google\.com\/maps\/place/)
assert.equal(projectSalesVisibility(correctedMaps, { profile, profileState }).state, 'operator_correction_needed')

// Montessori C/D — ambiguity stays neutral; only explicit operator absence creates a candidate.
const unableYelp = verify(neutral('Yelp'), 'unable_to_determine')
const missingApple = verify(neutral('Apple Maps'), 'not_found')
assert.equal(projectSalesVisibility(unableYelp, { profile, profileState }).state, 'operator_unable_to_determine')
assert.equal(projectSalesVisibility(missingApple, { profile, profileState }).state, 'operator_not_found')
assert.equal(projectSalesVisibility(neutral('Apple Maps'), { profile, profileState }).state, 'manual_verification_needed', 'provider failure is never operator absence')

const makeState = (): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: '2026-09-27T12:00:00Z', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: { 'search-brand-canonical': { 'Google Search': verifiedGoogle, 'Google Maps': correctedMaps, 'Apple Maps': missingApple, Yelp: unableYelp } },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const state = makeState()
const strengths = customerStrengthCandidates(state, [])
assert.deepEqual(strengths.map((item) => item.id), ['search:Google Search'])
assert.match(strengths[0].defaultSummary, /Google Search/)
assert.doesNotMatch(strengths[0].defaultSummary, /Maps|Bing/)
const findings = deriveBrandPresenceFindings(state)
assert.deepEqual(findings.map((item) => item.platform).sort(), ['Apple Maps', 'Google Maps'])
assert(findings.every((item) => item.reviewed === false), 'assisted findings enter Review unapproved')
assert.match(findings.find((item) => item.platform === 'Google Maps')?.whyItMatters || '', /Address/)
assert.equal(findings.some((item) => item.platform === 'Yelp'), false)
assert.deepEqual(workspaceFindings(state).filter((item) => item.id.startsWith('brand-presence:')).map((item) => item.platform).sort(), ['Apple Maps', 'Google Maps'], 'operator evidence enters the normal Review candidate set')

// JSON persistence retains the review and normalizes old saved-workspace input safely.
const reopened = JSON.parse(JSON.stringify(verifiedGoogle)) as SearchDestinationObservation
const normalizedReopened = normalizeSearchDestinationObservation(reopened, { profile, brandPresence: true })
assert.equal(currentBrandPresenceVerification(normalizedReopened, profile, profileState)?.outcome, 'found_correct')

// Non-material refreshes preserve a current decision; material evidence/profile changes require reconfirmation.
const sameIncoming = structuredClone(google)
sameIncoming.observedAt = '2026-09-28T12:00:00Z'
sameIncoming.automation = { ...sameIncoming.automation!, runId: 'run-two', inspectedUrl: 'https://provider.invalid/another', captures: [{ provider: 'another-provider', requestedUrl: 'https://provider.invalid/another', acquiredAt: '2026-09-28T12:00:00Z', outcome: 'success', confidence: 'captured', notes: [] }] }
const preserved = mergeAutomatedObservation(verifiedGoogle, sameIncoming)
assert.equal(currentBrandPresenceVerification(preserved, profile, profileState)?.outcome, 'found_correct')
const failedRefresh = mergeAutomatedObservation(verifiedGoogle, neutral('Google Search'))
assert.equal(failedRefresh.observedResultUrl, observedResultUrl, 'a provider failure does not erase retained acquired result evidence')
assert.equal(currentBrandPresenceVerification(failedRefresh, profile, profileState)?.outcome, 'found_correct', 'provider failure metadata alone does not invalidate operator verification')
const changedIncoming = { ...sameIncoming, observedResultUrl: 'https://montessoridownriver.com/different-page/' }
const staleEvidence = mergeAutomatedObservation(verifiedGoogle, changedIncoming)
assert.equal(brandPresenceVerificationIsStale(staleEvidence, profile, profileState), true)
assert.equal(projectSalesVisibility(staleEvidence, { profile, profileState }).state, 'reconfirmation_needed')
const changedProfile = { ...profile, phone: '734-555-0100' }
const changedProfileState = structuredClone(profileState)
changedProfileState.values.phone = { ...changedProfileState.values.phone!, value: changedProfile.phone }
assert.equal(brandPresenceVerificationIsStale(verifiedGoogle, changedProfile, changedProfileState), true)

const customerJson = serializeCustomerVisibilityReview(buildCustomerVisibilityReviewExport(state, [], findings))
for (const forbidden of ['operatorVerification', 'operator_verified', 'evidenceKey', 'operatorObservedUrl', 'classifiedCanonicalProfileUrl', 'reviewedAt', 'Provider unavailable', 'https://www.google.com/maps/place/']) {
  assert.equal(customerJson.includes(forbidden), false, `${forbidden} stays outside customer JSON`)
}
assert.equal(JSON.parse(customerJson).confirmedIssues.length, 0, 'candidate findings are not customer-approved automatically')

const markup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Search': google } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
for (const expected of ['Open Google Search', 'Expected business identity', 'Montessori Center of Downriver', '15575 Northline Road', '734-282-6465', 'Found — looks correct', 'Found — correction needed', 'Unable to determine', 'Observed profile/result URL']) assert(markup.includes(expected), `UI includes ${expected}`)
assert.equal(markup.includes('Reviewed for Action Plan'), false)
assert.equal(markup.includes('Add reviewed primary evidence to Action Plan'), false)

console.log('Brand Presence assisted verification PASS: Montessori A-D, structured outcomes, identity, evidence separation, findings/strengths, reconciliation, persistence, and customer boundary.')
