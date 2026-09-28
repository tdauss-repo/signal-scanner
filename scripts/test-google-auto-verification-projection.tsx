import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type {
  AuditState,
  BusinessProfileField,
  BusinessProfileState,
  SearchDestination,
  SearchDestinationObservation,
} from '../src/types/audit.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildBrandPresenceVerification } from '../src/utils/brandPresenceVerification.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { evidenceFingerprint } from '../src/utils/evidenceFingerprint.ts'
import { summarizePublicPresence } from '../src/utils/publicPresence.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import {
  effectiveGoogleAutomaticIdentityState,
  projectSalesVisibility,
  salesCockpitVisibility,
} from '../src/utils/salesVisibilityProjection.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { scanProfileKey } from '../src/utils/visibilityScanState.ts'
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
const reviewedFields: BusinessProfileField[] = [
  'businessName', 'primaryCategory', 'secondaryCategories', 'streetAddress',
  'city', 'state', 'zip', 'phone', 'website',
]
const profileState: BusinessProfileState = {
  schemaVersion: 1,
  values: Object.fromEntries(reviewedFields.map((field) => [field, {
    value: profile[field], source: 'operator_entered', confidence: 'high',
    status: 'operator_reviewed', recordedAt: '2026-09-28T12:00:00Z',
  }])) as BusinessProfileState['values'],
}

const observedResultUrl = 'http://montessoridownriver.com/infographic-parenting-book-recommendations/'
const selected = {
  candidate: {
    id: 'brightdata-serp-knowledge-panel', kind: 'semantic_card' as const,
    sourceType: 'knowledge_panel' as const, resultUrl: observedResultUrl,
    fields: { name: profile.businessName, website: profile.website, phone: profile.phone }, evidence: [],
  },
  matchedFields: [
    { field: 'name' as const, expected: profile.businessName, observed: profile.businessName },
    { field: 'website' as const, expected: profile.website, observed: 'montessoridownriver.com' },
    { field: 'phone' as const, expected: profile.phone, observed: '(734) 282-6465' },
  ],
  conflictingFields: [], missingFields: [], unreviewedProfileFields: [],
  confidence: 'high' as const, automaticObservation: true, ambiguityReasons: [], evidence: [],
}

const google: SearchDestinationObservation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  // These retained compatibility fields reproduce the live workspace shape.
  provenance: 'operator_observation', evidenceKind: 'external_observation',
  confidence: 'scanner_detected_public_page', overallResult: 'manual_review_needed',
  evidenceNotes: 'Retained legacy observation detail.', reviewed: false,
  observedAt: '2026-09-28T12:00:00Z', observedResultUrl,
  automation: {
    runId: 'mary-live-google', state: 'evidence_captured',
    inspectedUrl: 'https://www.google.com/search?q=Montessori%20Center%20of%20Downriver%20Southgate%20MI',
    captures: [{
      version: 1, provider: 'fixture-provider', method: 'server_fetch',
      requestedUrl: 'https://www.google.com/search?q=fixture', finalUrl: 'https://www.google.com/search?q=fixture',
      acquiredAt: '2026-09-28T12:00:00Z', outcome: 'success', confidence: 'captured', notes: [],
    }],
    evidence: 'Retained normalized acquisition evidence.', interpreted: true,
    automaticObservation: true, queryMode: 'brand',
    assessment: {
      matches: [selected], selected, confidence: 'high', automaticObservation: true,
      visibilityResult: 'found', operatorReviewRequired: false, resultRegionInspected: true,
      ambiguityReasons: [], blocker: 'none', tier3Candidate: false,
      googleIdentityDecision: {
        version: 1, decision: 'verified', matchedSignals: selected.matchedFields,
        conflictingSignals: [], candidateIds: ['brightdata-serp-organic', 'brightdata-serp-knowledge-panel'],
        sourceTypes: ['organic', 'knowledge_panel'],
        rule: 'two_strong_identifiers_with_name_or_domain_no_conflict',
      },
    },
  },
}, { profile, brandPresence: true })

const weakGoogle = (): SearchDestinationObservation => ({
  ...structuredClone(google), overallResult: 'manual_review_needed',
  automation: {
    ...structuredClone(google.automation!), state: 'interactive_review_required', interpreted: false, automaticObservation: false,
    assessment: {
      ...structuredClone(google.automation!.assessment!), automaticObservation: false,
      visibilityResult: 'review_required', operatorReviewRequired: true, confidence: 'medium',
      blocker: 'insufficient_identity',
      googleIdentityDecision: {
        version: 1, decision: 'review_required', matchedSignals: [selected.matchedFields[1]],
        conflictingSignals: [], candidateIds: ['brightdata-serp-organic'], sourceTypes: ['organic'],
        rule: 'two_strong_identifiers_with_name_or_domain_no_conflict',
      },
    },
  },
})

const rawBefore = structuredClone(google)
assert.equal(effectiveGoogleAutomaticIdentityState(google), 'verified')
const projected = projectSalesVisibility(google, { profile, profileState })
assert.equal(projected.state, 'verified_correct', 'current verified assessment overrides legacy manual-review fields')
assert.equal(projected.headline, 'Verified automatically')
assert.equal(projected.operatorReviewRequired, false)
assert.equal(projected.identitySummary, 'Matches reviewed business details')
assert.equal(projected.automationSummary, 'Verified from acquired Google evidence')
assert.equal(projected.nextAction, 'No action needed')
assert.match(projected.explanation, /Google Search shows business information that matches the reviewed details for Montessori Center of Downriver/)

const detail = brandPresenceEvidenceSummary(google, projected)
assert.equal(detail.decision, 'Verified automatically')
assert.match(detail.interpretation || '', /matches the reviewed details/)
assert.doesNotMatch(detail.interpretation || '', /needs an operator review/i)

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Search': google } }}
  onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
const googleStart = markup.indexOf('<summary>Google Search — Verified automatically</summary>')
const mapsStart = markup.indexOf('<summary>Google Maps —', googleStart)
assert(googleStart >= 0, 'verified assessment renders the verified primary Google state')
const googleMarkup = markup.slice(googleStart, mapsStart)
assert(googleMarkup.includes('No operator action required.'), 'required assisted controls are replaced by the automatic result')
assert(googleMarkup.includes('Review manually'), 'manual review remains an optional secondary action')
assert.equal(googleMarkup.includes('aria-label="Google Search assisted verification"'), false)
assert(googleMarkup.includes('Interpretation</dt><dd>Google Search shows business information that matches'))

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName),
  provenance: 'operator_observation', overallResult: 'manual_review_needed', reviewed: false,
})
const destinations: SearchDestination[] = ['Google Search', 'Google Maps', 'Bing Search', 'Apple Maps', 'DuckDuckGo', 'Yelp', 'Facebook', 'Instagram']
const observations = Object.fromEntries(destinations.map((destination) => [destination, destination === 'Google Search' ? google : unresolved(destination)])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const cockpit = salesCockpitVisibility(destinations.map((destination) => ({
  queryId: 'search-brand-canonical', observation: observations[destination]!,
})), { profile, profileState })
assert.equal(cockpit.lookingGood.some((item) => item.destination === 'Google Search'), true)
assert.equal(cockpit.deeperReview.some((item) => item.destination === 'Google Search'), false)
assert.equal(cockpit.deeperReview.length, 7, 'Google is excluded from the seven remaining neutral destinations')

const state: AuditState = {
  profile: structuredClone(profile), businessProfile: structuredClone(profileState),
  checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '2026-09-28T12:00:00Z', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: { 'search-brand-canonical': observations },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
  visibilityRuns: [{
    version: 2, id: 'mary-live-google', profileKey: scanProfileKey(profile),
    profileReviewKey: evidenceFingerprint(profileState), startedAt: '2026-09-28T11:59:00Z',
    endedAt: '2026-09-28T12:01:00Z', status: 'completed_with_review', checks: [], businessEvidence: [],
  }],
}
const presence = summarizePublicPresence(state)
assert.equal(presence.automatic, 1, 'public-presence summary trusts the current assessment despite legacy provenance')
assert.equal(presence.reviewRequired, 7)

const strengths = customerStrengthCandidates(state, [])
assert.deepEqual(strengths.map((item) => item.id), ['search:Google Search'])
assert.equal(strengths[0].defaultSummary, 'We verified that the business identity shown in Google Search matches the reviewed information for Montessori Center of Downriver.')
const review = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(review.needsReview.includes('Google Search'), false, 'Customer Review no longer lists Google under Still being verified')
assert.equal(review.needsReview.length, 7)
assert(review.verifiedStrengths.some((item) => item.title === 'Google Search'))
const customerJson = serializeCustomerVisibilityReview(review)
for (const internal of ['googleIdentityDecision', 'matchedSignals', 'fixture-provider', 'operator_observation', 'manual_review_needed']) {
  assert.equal(customerJson.includes(internal), false, `${internal} remains outside customer JSON`)
}

const weak = weakGoogle()
assert.equal(projectSalesVisibility(weak, { profile, profileState }).headline, 'Verification needed', 'insufficient evidence still requires verification')

const unavailable: SearchDestinationObservation = {
  ...weakGoogle(), overallResult: 'unable_to_verify',
  automation: {
    ...weakGoogle().automation!, state: 'interactive_review_required',
    captures: [{ ...weakGoogle().automation!.captures[0], outcome: 'failed', confidence: 'unavailable', blocker: 'provider_timeout', error: 'Timed out.' }],
    assessment: {
      ...weakGoogle().automation!.assessment!, visibilityResult: 'unavailable', confidence: 'unavailable',
      blocker: 'runtime_unavailable', googleIdentityDecision: undefined,
    },
  },
}
assert.equal(projectSalesVisibility(unavailable, { profile, profileState }).headline, 'Automated check unavailable — verification needed')

const conflict: SearchDestinationObservation = {
  ...weakGoogle(),
  automation: {
    ...weakGoogle().automation!,
    assessment: {
      ...weakGoogle().automation!.assessment!, blocker: 'identifier_conflict',
      googleIdentityDecision: {
        version: 1, decision: 'review_required', matchedSignals: selected.matchedFields.slice(0, 2),
        conflictingSignals: [{ field: 'phone', expected: profile.phone, observed: '313-555-0100' }],
        candidateIds: ['conflicting-google-entity'], sourceTypes: ['knowledge_panel'],
        rule: 'two_strong_identifiers_with_name_or_domain_no_conflict',
      },
    },
  },
}
assert.equal(projectSalesVisibility(conflict, { profile, profileState }).state, 'conflicting_evidence')

const unableBuilt = buildBrandPresenceVerification(weak, profile, profileState, {
  outcome: 'unable_to_determine', reviewedAt: '2026-09-28T13:00:00Z',
})
assert.equal(unableBuilt.ok, true)
const operatorUnable = { ...weak, operatorVerification: unableBuilt.ok ? unableBuilt.verification : undefined }
assert.equal(projectSalesVisibility(operatorUnable, { profile, profileState }).state, 'operator_unable_to_determine')

const noMatch: SearchDestinationObservation = {
  ...weakGoogle(), overallResult: 'not_found',
  automation: {
    ...weakGoogle().automation!,
    assessment: {
      ...weakGoogle().automation!.assessment!, matches: [], selected: undefined,
      visibilityResult: 'not_found', operatorReviewRequired: false, blocker: 'no_match',
      googleIdentityDecision: undefined,
    },
  },
}
assert.equal(projectSalesVisibility(noMatch, { profile, profileState }).state, 'manual_verification_needed', 'automated no-match is not absence')
assert.equal(projectSalesVisibility(unresolved('Google Maps'), { profile, profileState }).state, 'manual_verification_needed')
assert.equal(projectSalesVisibility(unresolved('Bing Search'), { profile, profileState }).state, 'manual_verification_needed')

const genericLegacy = { ...defaultSearchDestinationObservation('Google Search', profile.businessName), overallResult: 'found_match' as const, provenance: 'operator_observation' as const }
assert.equal(projectSalesVisibility(genericLegacy, { profile, profileState }).state, 'manual_verification_needed', 'generic legacy metadata cannot create automatic verification')

const staleReviewBuilt = buildBrandPresenceVerification(weak, profile, profileState, {
  outcome: 'found_correct', reviewedAt: '2026-09-27T13:00:00Z',
})
assert.equal(staleReviewBuilt.ok, true)
const verifiedWithStaleReview = { ...google, operatorVerification: staleReviewBuilt.ok ? staleReviewBuilt.verification : undefined }
assert.equal(projectSalesVisibility(verifiedWithStaleReview, { profile, profileState }).state, 'verified_correct', 'historical operator review does not override newer conclusive automation')

assert.deepEqual(google, rawBefore, 'projection leaves retained raw and compatibility evidence unchanged')
console.log('Google automatic verification projection PASS: current assessment precedence, UI/detail agreement, neutral count, strength/customer projection, and bounded negative states.')
