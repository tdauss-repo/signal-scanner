import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type {
  AuditState,
  BusinessProfile,
  BusinessProfileField,
  BusinessProfileState,
  SearchDestination,
  SearchDestinationObservation,
} from '../src/types/audit.ts'
import type { EntityMatch, SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { brandPresenceEvidenceSummary, serializeBrandPresenceTechnicalEvidence } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildBrandPresenceVerification } from '../src/utils/brandPresenceVerification.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { evidenceFingerprint } from '../src/utils/evidenceFingerprint.ts'
import { googleBrandBusinessIdentityKey } from '../src/utils/googleAcquisitionResilience.ts'
import { deriveGoogleMapsVerification } from '../src/utils/googleMapsDerivedVerification.ts'
import { summarizePublicPresence } from '../src/utils/publicPresence.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, searchDestinations } from '../src/utils/searchVisibility.ts'
import { mergeAutomatedObservation } from '../src/utils/visibilityScan.ts'
import { scanProfileKey } from '../src/utils/visibilityScanState.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })

const now = Date.now()
const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()
const mapsUrlWithTracking = 'https://www.google.com/maps/place/Montessori+Center+of+Downriver/data=!4m2!3m1!1s0x883b37b6f519905b:0x4e6922460f4e86cc?entry=ttu&g_ep=tracking'
const mapsUrl = 'https://www.google.com/maps/place/Montessori+Center+of+Downriver/data=!4m2!3m1!1s0x883b37b6f519905b:0x4e6922460f4e86cc'
const placeIdentity = '0x883b37b6f519905b:0x4e6922460f4e86cc'

const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver',
  primaryCategory: 'Preschool', secondaryCategories: 'Montessori School, Kindergarten',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195',
  phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const reviewed = (value: BusinessProfile): BusinessProfileState => {
  const fields: BusinessProfileField[] = [
    'businessName', 'primaryCategory', 'secondaryCategories', 'streetAddress',
    'city', 'state', 'zip', 'phone', 'website',
  ]
  return {
    schemaVersion: 1,
    values: Object.fromEntries(fields.map((field) => [field, {
      value: value[field], source: 'fixture review', confidence: 'high',
      status: 'operator_reviewed', recordedAt: oneDayAgo,
    }])) as BusinessProfileState['values'],
  }
}
const profileState = reviewed(profile)

const knowledgeMatch = (options: {
  phone?: string
  matchedPhone?: boolean
  matchedName?: boolean
  placeIdentity?: string
  publicProfileUrl?: string
  id?: string
} = {}): EntityMatch => {
  const phone = options.phone ?? '(734) 282-6465'
  const matchedFields = [
    ...(options.matchedName === false ? [] : [{ field: 'name' as const, expected: profile.businessName, observed: profile.businessName }]),
    ...(options.matchedPhone === false ? [] : [{ field: 'phone' as const, expected: profile.phone, observed: phone }]),
  ]
  const conflictingFields = options.matchedPhone === false && phone
    ? [{ field: 'phone' as const, expected: profile.phone, observed: phone }] : []
  return {
    candidate: {
      id: options.id || 'mary-knowledge-panel', kind: 'semantic_card', sourceType: 'knowledge_panel',
      resultUrl: mapsUrlWithTracking,
      fields: {
        name: profile.businessName, phone, category: 'Preschool in Southgate, Michigan',
        ...(options.placeIdentity === '' ? {} : { placeIdentity: options.placeIdentity || placeIdentity }),
        ...(options.publicProfileUrl === '' ? {} : { publicProfileUrl: options.publicProfileUrl || mapsUrlWithTracking }),
      },
      evidence: [],
    },
    matchedFields, conflictingFields, missingFields: [], unreviewedProfileFields: [],
    confidence: conflictingFields.length ? 'medium' : 'high', automaticObservation: !conflictingFields.length && matchedFields.length >= 2,
    ambiguityReasons: conflictingFields.length ? ['Observed identifiers differ from reviewed profile: phone.'] : [], evidence: [],
  }
}

const organicMatch: EntityMatch = {
  candidate: {
    id: 'mary-organic', kind: 'result_link', sourceType: 'organic',
    resultUrl: 'https://montessoridownriver.com/',
    fields: { name: profile.businessName, website: profile.website }, evidence: [],
  },
  matchedFields: [
    { field: 'name', expected: profile.businessName, observed: profile.businessName },
    { field: 'website', expected: profile.website, observed: 'montessoridownriver.com' },
  ],
  conflictingFields: [], missingFields: [], unreviewedProfileFields: [], confidence: 'high',
  automaticObservation: true, ambiguityReasons: [], evidence: [],
}

const verifiedAssessment = (matches: EntityMatch[]): SearchEntityAssessment => ({
  matches, selected: matches[0], confidence: 'high', automaticObservation: true,
  visibilityResult: 'found', operatorReviewRequired: false, resultRegionInspected: true,
  ambiguityReasons: [], blocker: 'none', tier3Candidate: false,
  googleIdentityDecision: {
    version: 1, decision: 'verified',
    matchedSignals: [organicMatch.matchedFields[0], organicMatch.matchedFields[1], {
      field: 'phone', expected: profile.phone, observed: '(734) 282-6465',
    }],
    conflictingSignals: [], candidateIds: matches.map((match) => match.candidate.id),
    sourceTypes: [...new Set(matches.map((match) => match.candidate.sourceType).filter(Boolean))] as ('organic' | 'knowledge_panel' | 'local_place')[],
    rule: 'two_strong_identifiers_with_name_or_domain_no_conflict',
  },
})

const googleObservation = (observedAt: string, assessment = verifiedAssessment([knowledgeMatch(), organicMatch])) => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  overallResult: 'found_match', provenance: 'automated_acquisition', observedAt,
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation', reviewed: false,
  observedResultUrl: 'https://montessoridownriver.com/', evidenceNotes: 'Normalized Google identity evidence.',
  automation: {
    runId: 'mary-google-run', state: 'evidence_captured', queryMode: 'brand',
    businessIdentityKey: googleBrandBusinessIdentityKey(profile, profileState),
    inspectedUrl: 'https://www.google.com/search?q=Montessori+Center+of+Downriver+Southgate+MI',
    captures: [{ version: 1, provider: 'fixture-provider', method: 'server_fetch', requestedUrl: 'https://www.google.com/search?q=fixture', finalUrl: 'https://www.google.com/search?q=fixture', acquiredAt: observedAt, outcome: 'success', confidence: 'captured', notes: [] }],
    evidence: 'Normalized Search candidates.', interpreted: true, automaticObservation: true, assessment,
  },
}, { profile, brandPresence: true })

const unavailableMaps = (): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Maps', profile.businessName),
  overallResult: 'manual_review_needed', provenance: 'automated_acquisition', observedAt: new Date(now).toISOString(),
  confidence: 'manual_needs_confirmation', evidenceKind: 'acquisition_failure', reviewed: false,
  automation: {
    runId: 'mary-google-run', state: 'interactive_review_required', queryMode: 'brand',
    inspectedUrl: 'https://www.google.com/maps/search/Montessori+Center+of+Downriver',
    captures: [{ version: 1, provider: 'fixture-maps-provider', method: 'server_fetch', requestedUrl: 'https://www.google.com/maps/search/fixture', finalUrl: 'https://www.google.com/maps/search/fixture', acquiredAt: new Date(now).toISOString(), outcome: 'failed', confidence: 'unavailable', blocker: 'provider_timeout', notes: [] }],
    evidence: '', interpreted: false, automaticObservation: false,
    assessment: {
      matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable',
      operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: ['Provider timeout.'],
      blocker: 'runtime_unavailable', tier3Candidate: false,
    },
  },
}, { profile, brandPresence: true })

const google = googleObservation(oneDayAgo)
const maps = unavailableMaps()
const rawGoogleBefore = structuredClone(google)
const derived = deriveGoogleMapsVerification(google, profile, profileState, now)
assert(derived, '1: a verified Search knowledge panel with a matching Maps entity derives Maps verification')
assert.equal(derived.provenance, 'derived_from_google_search')
assert.equal(derived.sourceType, 'knowledge_panel')
assert.equal(derived.placeIdentity, placeIdentity)
assert.equal(derived.canonicalProfileUrl, mapsUrl, '4: tracking-only query parameters are excluded from the canonical Maps profile URL')
assert.deepEqual(new Set(derived.matchedSignals.map((signal) => signal.field)), new Set(['name', 'phone']))
const unchangedRescanObservation = googleObservation(new Date(now).toISOString())
unchangedRescanObservation.automation = { ...unchangedRescanObservation.automation!, runId: 'semantically-unchanged-rescan' }
const unchangedRescan = deriveGoogleMapsVerification(unchangedRescanObservation, profile, profileState, now)
assert.equal(unchangedRescan?.evidenceKey, derived.evidenceKey, 'timestamps and run metadata do not churn the material Maps identity')

const mapsSales = projectSalesVisibility(maps, { profile, profileState, now, googleSearchObservation: google })
assert.equal(mapsSales.state, 'verified_correct')
assert.equal(mapsSales.headline, 'Verified automatically')
assert.equal(mapsSales.operatorReviewRequired, false, '3: derived automatic Maps evidence removes required assisted verification')
assert.equal(mapsSales.knownProfileUrl, mapsUrl)
assert.equal(mapsSales.canonicalProfileUrl, mapsUrl)
assert.equal(mapsSales.derivedGoogleMapsVerification?.provenance, 'derived_from_google_search', '5: provenance remains derived rather than direct Maps acquisition')
assert.match(mapsSales.evidenceSourceSummary || '', /Google business profile discovered during automated Google Search verification/)
const mapsDetail = brandPresenceEvidenceSummary(maps, mapsSales)
assert.equal(mapsDetail.source, 'Google Search knowledge panel')
assert.equal(mapsDetail.decision, 'Verified automatically')
assert.equal(mapsDetail.identityEvidence?.some((item) => item.label === 'Phone' && item.result.includes('(734) 282-6465')), true)
assert.equal(serializeBrandPresenceTechnicalEvidence(maps, mapsSales).includes('Normalized Search candidates.'), false, 'Maps detail references but does not duplicate the Search raw payload')
assert.deepEqual(google, rawGoogleBefore, '17: deriving Maps leaves raw Search evidence unchanged')

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName),
  overallResult: 'manual_review_needed', provenance: 'operator_observation', reviewed: false,
})
const observations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Google Search' ? google : destination === 'Google Maps' ? maps : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const cockpit = salesCockpitVisibility(searchDestinations.map((destination) => ({
  queryId: 'search-brand-canonical', observation: observations[destination]!,
})), { profile, profileState, now })
assert.equal(cockpit.lookingGood.some((item) => item.destination === 'Google Maps'), true)
assert.equal(cockpit.deeperReview.length, 6, '2: Search and Maps are excluded from the six remaining neutral destinations')

const state: AuditState = {
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: new Date(now).toISOString(), reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: { 'search-brand-canonical': observations }, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
  visibilityRuns: [{
    version: 2, id: 'mary-google-run', profileKey: scanProfileKey(profile), profileReviewKey: evidenceFingerprint(profileState),
    startedAt: oneDayAgo, endedAt: oneDayAgo, status: 'completed_with_review', checks: [], businessEvidence: [],
  }],
}
assert.equal(summarizePublicPresence(state).automatic, 2)
assert.equal(summarizePublicPresence(state).reviewRequired, 6)
const strengths = customerStrengthCandidates(state, [])
assert.deepEqual(strengths.map((strength) => strength.id), ['search:Google Search', 'search:Google Maps'], '6: Maps is eligible as its own strength')
assert.equal(strengths[1].defaultSummary, 'We verified that Montessori Center of Downriver has a Google Maps business profile matching the reviewed business information.')
const customerReview = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(customerReview.needsReview.includes('Google Search'), false)
assert.equal(customerReview.needsReview.includes('Google Maps'), false, '7: customer Still being verified excludes derived Maps')
assert(customerReview.verifiedStrengths.some((strength) => strength.title === 'Google Maps'))
const customerJson = serializeCustomerVisibilityReview(customerReview)
for (const internal of ['placeIdentity', 'derived_from_google_search', 'fixture-provider', 'sourceCandidateId', 'businessIdentityKey']) {
  assert.equal(customerJson.includes(internal), false, `${internal} stays outside customer JSON`)
}
const reopenedState = JSON.parse(JSON.stringify(state)) as AuditState
assert(customerStrengthCandidates(reopenedState, []).some((strength) => strength.id === 'search:Google Maps'), 'workspace persistence retains derivation from the saved Search evidence')

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': observations }} onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
const mapsStart = markup.indexOf('<summary>Google Maps — Verified automatically</summary>')
const bingStart = markup.indexOf('<summary>Bing Search —', mapsStart)
assert(mapsStart >= 0)
const mapsMarkup = markup.slice(mapsStart, bingStart)
assert(mapsMarkup.includes('Google Search knowledge panel'))
assert(mapsMarkup.includes('Open Google Maps profile'))
assert(mapsMarkup.includes('No operator action required.'))
assert.equal(mapsMarkup.includes('aria-label="Google Maps assisted verification"'), false)

// Negative 1: the Maps-bearing knowledge panel itself has a material conflict.
const conflictingKnowledge = knowledgeMatch({ phone: '313-555-0100', matchedPhone: false })
const searchWithConflictingPanel = googleObservation(oneDayAgo, verifiedAssessment([organicMatch, conflictingKnowledge]))
assert.equal(deriveGoogleMapsVerification(searchWithConflictingPanel, profile, profileState, now), undefined, '8: mismatched phone blocks Maps derivation')

// Negative 2/3: a Maps URL alone or a name-only Maps entity is insufficient.
const urlOnly = knowledgeMatch({ matchedName: false, matchedPhone: false, phone: '' })
urlOnly.conflictingFields = []
assert.equal(deriveGoogleMapsVerification(googleObservation(oneDayAgo, verifiedAssessment([organicMatch, urlOnly])), profile, profileState, now), undefined, '9: URL-only evidence is insufficient')
const nameOnly = knowledgeMatch({ matchedPhone: false, phone: '' })
nameOnly.conflictingFields = []
assert.equal(deriveGoogleMapsVerification(googleObservation(oneDayAgo, verifiedAssessment([organicMatch, nameOnly])), profile, profileState, now), undefined, 'name-only knowledge panel is insufficient')
const secondEntity = knowledgeMatch({
  id: 'second-maps-entity', placeIdentity: 'different-place-id',
  publicProfileUrl: 'https://www.google.com/maps/place/Another+Montessori/data=!4m2!3m1!1sdifferent-place-id',
})
assert.equal(deriveGoogleMapsVerification(googleObservation(oneDayAgo, verifiedAssessment([knowledgeMatch(), secondEntity, organicMatch])), profile, profileState, now), undefined, 'multiple plausible Maps entities block derivation')

// Negative 4: verified organic Search identity without a Maps entity does not establish Maps presence.
assert.equal(deriveGoogleMapsVerification(googleObservation(oneDayAgo, verifiedAssessment([organicMatch])), profile, profileState, now), undefined)

// Negative 5: current direct Maps conflict wins over the derived positive.
const directConflict: SearchDestinationObservation = {
  ...maps,
  automation: {
    ...maps.automation!, state: 'interactive_review_required',
    assessment: {
      ...maps.automation!.assessment!, visibilityResult: 'review_required', confidence: 'high', blocker: 'identifier_conflict',
      matches: [conflictingKnowledge], selected: conflictingKnowledge,
    },
  },
}
assert.equal(projectSalesVisibility(directConflict, { profile, profileState, now, googleSearchObservation: google }).state, 'conflicting_evidence', '10: direct Maps conflict takes precedence')
const directVerified: SearchDestinationObservation = {
  ...maps, canonicalProfileUrl: mapsUrl,
  automation: {
    ...maps.automation!, state: 'evidence_captured', interpreted: true, automaticObservation: true,
    captures: [{ ...maps.automation!.captures[0], outcome: 'success', confidence: 'captured', blocker: undefined }],
    assessment: {
      matches: [knowledgeMatch()], selected: knowledgeMatch(), confidence: 'high', automaticObservation: true,
      visibilityResult: 'found', operatorReviewRequired: false, resultRegionInspected: true,
      ambiguityReasons: [], blocker: 'none', tier3Candidate: false,
    },
  },
}
const directSales = projectSalesVisibility(directVerified, { profile, profileState, now, googleSearchObservation: google })
assert.equal(directSales.state, 'verified_correct')
assert.equal(directSales.derivedGoogleMapsVerification, undefined, 'fresh direct Maps verification remains the effective provenance')
assert.match(directSales.automationSummary || '', /acquired Google Maps evidence/)

// Negative 6 / resilience: recent retained Search evidence supports Maps until the shared freshness window expires.
const failedGoogle: SearchDestinationObservation = {
  ...google,
  overallResult: 'manual_review_needed', observedAt: new Date(now).toISOString(),
  automation: {
    ...google.automation!, runId: 'refresh-failed', state: 'interactive_review_required', interpreted: false, automaticObservation: false,
    captures: [{ ...google.automation!.captures[0], acquiredAt: new Date(now).toISOString(), outcome: 'failed', confidence: 'unavailable', blocker: 'provider_timeout' }],
    assessment: {
      matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable',
      operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: ['Provider timeout.'], blocker: 'runtime_unavailable', tier3Candidate: false,
    },
  },
}
const retainedGoogle = mergeAutomatedObservation(google, failedGoogle, {
  profile, profileState, sourceProfileReviewKey: evidenceFingerprint(profileState), now,
})
const recentMaps = projectSalesVisibility(maps, { profile, profileState, now, googleSearchObservation: retainedGoogle })
assert.equal(recentMaps.state, 'verified_recent', '11: recent retained Search evidence supports recent Maps verification')
assert.equal(recentMaps.derivedGoogleMapsVerification?.freshness, 'recent')
const expiredGoogle = mergeAutomatedObservation(googleObservation(eightDaysAgo), failedGoogle, {
  profile, profileState, sourceProfileReviewKey: evidenceFingerprint(profileState), now,
})
assert.equal(projectSalesVisibility(maps, { profile, profileState, now, googleSearchObservation: expiredGoogle }).state, 'manual_verification_needed', '12: expired Search evidence cannot verify Maps')

// Negative 7: material reviewed identity change invalidates the source identity key.
const changedProfile = normalizeWorkspaceProfile({ ...profile, phone: '313-555-0111', streetAddress: '999 Other Road' })
const changedProfileState = reviewed(changedProfile)
assert.equal(deriveGoogleMapsVerification(google, changedProfile, changedProfileState, now), undefined, '13: material identity change invalidates derivation')

// Negative 8: an explicit current operator conflict remains authoritative.
const operatorCorrection = buildBrandPresenceVerification(maps, profile, profileState, {
  outcome: 'found_correction_needed', mismatches: ['address'], reviewedAt: new Date(now).toISOString(),
})
assert.equal(operatorCorrection.ok, true)
const operatorConflictMaps = { ...maps, operatorVerification: operatorCorrection.ok ? operatorCorrection.verification : undefined }
assert.equal(projectSalesVisibility(operatorConflictMaps, { profile, profileState, now, googleSearchObservation: google }).state, 'operator_correction_needed')

console.log('Google Maps derived verification PASS: trusted Search entity derivation, direct/operator conflict precedence, freshness and identity invalidation, UI, strength, neutral-count, and customer boundaries.')
