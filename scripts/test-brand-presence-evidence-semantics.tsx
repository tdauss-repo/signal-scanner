import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { BusinessProfile, BusinessProfileState, SearchDestinationObservation } from '../src/types/audit.ts'
import { formatEvidenceTimestamp, evidenceTimestampToLocalInput, localInputToEvidenceTimestamp, normalizeEvidenceTimestamp } from '../src/utils/evidenceTime.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, searchDestinations } from '../src/utils/searchVisibility.ts'
import { projectSalesVisibility, salesVisibilityGroups } from '../src/utils/salesVisibilityProjection.ts'

process.env.TZ = 'America/Detroit'
Object.assign(globalThis, { React })

const profile: BusinessProfile = {
  businessName: 'Montessori Center of Downriver', website: 'http://montessoridownriver.com/',
  streetAddress: '', city: 'Southgate', state: 'MI', zip: '', phone: '', knownListingUrl: '', operatorNote: '',
  phoneNumbers: [], contactStructureNote: '', primaryCategory: 'Montessori school', secondaryCategories: '', industryTags: '',
  localMarket: '', existingDirectoryUrls: '', serviceArea: '', primaryServices: '', targetLocation: '', keywords: '',
}
const profileState: BusinessProfileState = { schemaVersion: 1, values: {} }
const observedResultUrl = 'http://montessoridownriver.com/infographic-parenting-book-recommendations/'
const capture = { provider: 'fixture-provider', requestedUrl: 'https://www.google.com/search?q=old&ei=session', acquiredAt: '2026-09-26T22:39:00Z', outcome: 'success' as const, confidence: 'captured' as const, notes: [] }
const organicCandidate = { id: 'organic-1', kind: 'result_link' as const, resultUrl: observedResultUrl, fields: { name: profile.businessName, website: observedResultUrl }, evidence: [] }
const organic = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  provenance: 'automated_acquisition', observedAt: '2026-09-26T22:39:00Z', overallResult: 'manual_review_needed',
  automation: { runId: 'run', state: 'interactive_review_required', inspectedUrl: capture.requestedUrl, captures: [capture], evidence: 'Organic result captured.', interpreted: false, automaticObservation: false, queryMode: 'brand', assessment: {
    matches: [{ candidate: organicCandidate, matchedFields: [], conflictingFields: [], missingFields: [], unreviewedProfileFields: [], confidence: 'low', automaticObservation: false, ambiguityReasons: [], evidence: [] }],
    selected: { candidate: organicCandidate, matchedFields: [], conflictingFields: [], missingFields: [], unreviewedProfileFields: [], confidence: 'low', automaticObservation: false, ambiguityReasons: [], evidence: [] },
    confidence: 'low', automaticObservation: false, visibilityResult: 'review_required', operatorReviewRequired: true,
    resultRegionInspected: true, ambiguityReasons: ['Business details require verification.'], blocker: 'insufficient_identity', tier3Candidate: false,
  } },
}, { profile, brandPresence: true })

assert.equal(organic.observedResultUrl, observedResultUrl, 'organic destination is retained as observed evidence')
assert.equal(organic.canonicalProfileUrl, undefined, 'organic webpage is not promoted to canonical profile')
assert.notEqual(organic.verificationUrl, observedResultUrl, 'organic webpage is not used as verification destination')
assert.equal(organic.verificationUrl, 'https://www.google.com/search?q=Montessori%20Center%20of%20Downriver%20Southgate%20MI')
for (const transient of ['sxsrf', 'ei', 'source', 'iflsig', 'sca_esv', 'sclient']) assert.equal(new URL(organic.verificationUrl).searchParams.has(transient), false)

const projected = projectSalesVisibility(organic)
assert.equal(projected.state, 'website_result_discovered')
assert.equal(projected.headline, 'Website result discovered — verify business identity')
assert.equal(projected.explanation, 'Google returned a page from the business website, but the business information shown in search has not yet been verified.')
assert.equal(projected.identitySummary, 'Still requires verification')
assert.equal(projected.nextAction, 'Open Google Search and verify business details')
assert.equal(projected.actionLabel, 'Open Google Search')
assert.equal(projected.actionUrl, organic.verificationUrl)
assert.doesNotMatch(`${projected.headline} ${projected.explanation}`, /profile discovered/i)
assert.equal(projected.customerFindingEligible, false, 'organic evidence remains neutral')
assert.equal(projected.starterPackageEligible, false, 'organic evidence creates no package strength')
assert.equal(salesVisibilityGroups([organic]).lookingGood.length, 0, 'organic URL alone creates no verified strength')

const highScoringOrganic = { ...organic, overallResult: 'found_match' as const, automation: { ...organic.automation!, automaticObservation: true, assessment: { ...organic.automation!.assessment!, automaticObservation: true, operatorReviewRequired: false, visibilityResult: 'found' as const, confidence: 'high' as const, blocker: 'none' as const } } }
assert.equal(projectSalesVisibility(highScoringOrganic).state, 'website_result_discovered', 'unreviewed organic-only acquisition cannot become a verified strength')
assert.equal(salesVisibilityGroups([highScoringOrganic]).lookingGood.length, 0, 'matcher confidence does not promote organic-only evidence')

const canonicalUrl = 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate'
const legacyCanonical = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Yelp', profile.businessName), verificationUrl: '',
  overallResult: 'manual_review_needed', provenance: 'automated_acquisition',
  automation: { runId: 'legacy', state: 'interactive_review_required', inspectedUrl: 'https://www.yelp.com/search?find_desc=legacy', captures: [capture], evidence: '', interpreted: false, assessment: {
    matches: [{ candidate: { id: 'yelp', kind: 'semantic_card', resultUrl: canonicalUrl, fields: { publicProfileUrl: canonicalUrl }, evidence: [] }, matchedFields: [], conflictingFields: [], missingFields: [], unreviewedProfileFields: [], confidence: 'low', automaticObservation: false, ambiguityReasons: [], evidence: [] }],
    confidence: 'low', automaticObservation: false, visibilityResult: 'review_required', operatorReviewRequired: true,
    resultRegionInspected: true, ambiguityReasons: [], blocker: 'insufficient_identity', tier3Candidate: false,
  } },
} as SearchDestinationObservation, { profile, brandPresence: true })
assert.equal(legacyCanonical.observedResultUrl, canonicalUrl, 'saved-workspace matcher evidence restores observed result URL')
assert.equal(legacyCanonical.canonicalProfileUrl, canonicalUrl, 'saved-workspace matcher evidence restores genuine canonical profile')
assert.equal(projectSalesVisibility(legacyCanonical).actionUrl, canonicalUrl)
assert.equal(projectSalesVisibility(legacyCanonical).actionLabel, 'Open profile')

for (const destination of searchDestinations) {
  const neutral = normalizeSearchDestinationObservation(defaultSearchDestinationObservation(destination, profile.businessName), { profile, brandPresence: true })
  assert.equal(projectSalesVisibility(neutral).actionLabel, `Open ${destination}`, `${destination} neutral action names its verification destination`)
}

assert.equal(organic.observedAt, '2026-09-26T22:39:00.000Z', 'stored evidence remains UTC ISO-8601')
assert.equal(evidenceTimestampToLocalInput(organic.observedAt), '2026-09-26T18:39', 'UTC evidence renders as operator-local datetime input')
assert.match(formatEvidenceTimestamp(organic.observedAt), /09\/26\/2026.*6:39 PM/, 'operator detail renders browser-local time')
assert.equal(localInputToEvidenceTimestamp('2026-09-26T18:39'), '2026-09-26T22:39:00.000Z', 'local edit returns to UTC storage')
assert.equal(normalizeEvidenceTimestamp('2026-09-26T18:39'), '2026-09-26T22:39:00.000Z', 'legacy timezone-less values preserve local wall-clock meaning')

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Search': organic } }}
  onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
assert(markup.includes('Website result discovered — verify business identity'))
assert(markup.includes(`href="${organic.verificationUrl.replaceAll('&', '&amp;')}"`), 'primary Google action opens verificationUrl')
assert(markup.includes('>Open Google Search</a>'))
assert(markup.includes('Observed search result:'))
assert(markup.includes('montessoridownriver.com/infographic-parenting-book-recommendations'))
assert(markup.includes('Observed at: 09/26/2026, 6:39 PM (local time)'))
assert(!markup.includes(`href="${observedResultUrl}">Open profile</a>`), 'observed organic page is never the profile action')

console.log('Brand Presence evidence semantics PASS: URL roles, neutral wording/actions, canonical profiles, local time rendering, and saved-workspace compatibility.')
