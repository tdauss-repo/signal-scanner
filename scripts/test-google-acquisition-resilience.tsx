import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  acquireGoogleWithBrightData,
  brightDataProductionCapture,
  GOOGLE_SERP_RETRY_DELAY_MS,
  googleSearchUrl,
  type NormalizedGoogleAcquisition,
} from '../server/brightDataGoogle.ts'
import {
  googleBrandBrowserNavigationTimeoutMs,
  googleBrandBrowserSettleTimeoutMs,
  googleBrandSerpAttemptTimeoutMs,
} from '../server/acquisitionRuntime.ts'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type {
  AuditState,
  BusinessProfile,
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
import {
  GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS,
  googleBrandBusinessIdentityKey,
} from '../src/utils/googleAcquisitionResilience.ts'
import { summarizePublicPresence } from '../src/utils/publicPresence.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { mergeAutomatedObservation, defaultGoogleBrandOperationTimeoutMs } from '../src/utils/visibilityScan.ts'
import { scanProfileKey } from '../src/utils/visibilityScanState.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })

const now = Date.now()
const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()
const query = 'Montessori Center of Downriver Southgate MI'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool',
  secondaryCategories: 'Montessori School, Kindergarten', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465',
  website: 'http://www.montessoridownriver.com/',
})
const reviewed = (value: BusinessProfile): BusinessProfileState => {
  const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'secondaryCategories', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
  return { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
    value: value[field], source: 'fixture review', status: 'operator_reviewed', confidence: 'high', recordedAt: oneDayAgo,
  }])) as BusinessProfileState['values'] }
}
const profileState = reviewed(profile)
const orchestratorConfig = {
  query, token: 'test-token', zone: 'test-zone', country: 'us', language: 'en',
  rawProviderMetadataReference: 'fixture:serp', browserCdpUrl: 'wss://redacted.invalid',
  browserMetadataReference: 'fixture:browser', requestTimeoutMs: googleBrandSerpAttemptTimeoutMs,
  navigationTimeoutMs: googleBrandBrowserNavigationTimeoutMs, networkIdleTimeoutMs: googleBrandBrowserSettleTimeoutMs,
}
const normalized = (
  outcome: 'success' | 'unavailable',
  blocker: NormalizedGoogleAcquisition['blocker'],
  provider: NormalizedGoogleAcquisition['provider'] = 'brightdata_serp_api',
): NormalizedGoogleAcquisition => ({
  contractVersion: 1, provider, provenance: provider, query, requestedUrl: googleSearchUrl(query),
  finalUrl: googleSearchUrl(query), outcome, usable: outcome === 'success', resultRegionInspected: outcome === 'success',
  candidates: outcome === 'success' ? [{
    id: `${provider}-mary`, resultType: 'knowledge_panel', name: profile.businessName,
    businessWebsite: profile.website, businessDomain: 'montessoridownriver.com', phone: profile.phone,
    address: `${profile.streetAddress}, ${profile.city}, ${profile.state} ${profile.zip}`,
    provenance: { provider, responsePath: 'knowledge', websiteBasis: 'explicit_business_website' },
  }] : [],
  blocker, challengeClassification: blocker === 'google_sorry' ? 'google_sorry' : 'none', elapsedMs: 5,
  rawProviderMetadataReference: `fixture:${provider}`, diagnostic: { httpStatus: 200 },
})
const serp = (value: NormalizedGoogleAcquisition) => ({ ...value, rawResponse: {} })

let serpCalls = 0
let browserCalls = 0
const retrySuccess = await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async (config) => {
    serpCalls += 1
    assert.equal(config.query, query)
    assert.equal(new URL(googleSearchUrl(config.query)).searchParams.get('q'), query)
    assert.equal([...new URL(googleSearchUrl(config.query)).searchParams.keys()].some((key) => ['sxsrf', 'ei', 'source', 'iflsig', 'sca_esv', 'sclient'].includes(key)), false)
    return serp(serpCalls === 1 ? normalized('unavailable', 'embedded_5xx') : normalized('success', 'none'))
  },
  acquireBrowser: async () => { browserCalls += 1; return normalized('success', 'none', 'brightdata_browser_api') },
  wait: async (delayMs) => { assert.equal(delayMs, GOOGLE_SERP_RETRY_DELAY_MS) },
})
assert.equal(serpCalls, 2, 'transient SERP acquisition retries exactly once')
assert.equal(browserCalls, 0, 'successful retry stops before Browser fallback')
assert.equal(retrySuccess.selected, retrySuccess.serpRetry)
assert.equal(retrySuccess.retryTriggered, true)
const retryCapture = brightDataProductionCapture(retrySuccess, googleSearchUrl(query))
assert.deepEqual(retryCapture.providerAttempts?.map((attempt) => attempt.stage), ['serp_initial', 'serp_retry'])
const retryAssessment = assessSearchCapture(retryCapture, profile, profileState, 'Google Search', 'brand')
assert.equal(retryAssessment.googleIdentityDecision?.decision, 'verified', 'successful retry enters the unchanged automatic matcher')

serpCalls = 0
browserCalls = 0
const authFailure = await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async () => { serpCalls += 1; return serp(normalized('unavailable', 'authentication_failure')) },
  acquireBrowser: async () => { browserCalls += 1; return normalized('success', 'none', 'brightdata_browser_api') },
  wait: async () => { throw new Error('deterministic authentication failures must not wait or retry') },
})
assert.equal(serpCalls, 1)
assert.equal(browserCalls, 0)
assert.equal(authFailure.blocker, 'authentication_failure')

serpCalls = 0
browserCalls = 0
const allUnavailable = await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async () => { serpCalls += 1; return serp(normalized('unavailable', 'embedded_5xx')) },
  acquireBrowser: async () => { browserCalls += 1; return normalized('unavailable', 'google_sorry', 'brightdata_browser_api') },
  wait: async () => undefined,
})
assert.equal(serpCalls, 2, 'no unbounded SERP loop is possible')
assert.equal(browserCalls, 1, 'Browser fallback is attempted once and not repeated after google_sorry')
assert.equal(allUnavailable.blocker, 'google_sorry')
const unavailableCapture = brightDataProductionCapture(allUnavailable, googleSearchUrl(query))
assert.deepEqual(unavailableCapture.providerAttempts?.map((attempt) => attempt.stage), ['serp_initial', 'serp_retry', 'browser_fallback'])
assert(googleBrandSerpAttemptTimeoutMs * 2 + GOOGLE_SERP_RETRY_DELAY_MS + googleBrandBrowserNavigationTimeoutMs + googleBrandBrowserSettleTimeoutMs < defaultGoogleBrandOperationTimeoutMs)
assert(defaultGoogleBrandOperationTimeoutMs < 180_000, 'Google resilience remains within the existing overall scan safety budget')

const selected = retryAssessment.selected!
const automaticObservation = (observedAt: string): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  observedAt, provenance: 'automated_acquisition', overallResult: 'found_match', reviewed: false,
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
  evidenceNotes: 'Google identity evidence matched the reviewed business.',
  observedResultTypes: ['official_website', 'business_name_correct', 'website_correct', 'phone_correct', 'address_correct'],
  observedResultUrl: 'https://montessoridownriver.com/',
  automation: {
    runId: 'prior-google-run', state: 'evidence_captured', inspectedUrl: googleSearchUrl(query),
    captures: [{ ...retryCapture, acquiredAt: observedAt }], evidence: 'Prior normalized Google identity evidence.',
    interpreted: true, automaticObservation: true, queryMode: 'brand',
    businessIdentityKey: googleBrandBusinessIdentityKey(profile, profileState),
    assessment: retryAssessment,
  },
}, { profile, brandPresence: true })
const failedObservation = (): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  observedAt: new Date(now).toISOString(), provenance: 'automated_acquisition', overallResult: 'manual_review_needed',
  confidence: 'manual_needs_confirmation', evidenceKind: 'acquisition_failure', reviewed: false,
  automation: {
    runId: 'current-google-run', state: 'interactive_review_required', inspectedUrl: googleSearchUrl(query),
    captures: [unavailableCapture], evidence: '', interpreted: false, automaticObservation: false, queryMode: 'brand',
    businessIdentityKey: googleBrandBusinessIdentityKey(profile, profileState),
    assessment: {
      matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable',
      operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: ['Provider unavailable.'],
      blocker: 'runtime_unavailable', tier3Candidate: false,
    },
  },
}, { profile, brandPresence: true })
const prior = automaticObservation(oneDayAgo)
const sourceProfileReviewKey = evidenceFingerprint(profileState)
const retained = mergeAutomatedObservation(prior, failedObservation(), { profile, profileState, sourceProfileReviewKey, now })
assert.equal(retained.automation?.assessment?.visibilityResult, 'unavailable', 'current failed refresh remains the current acquisition fact')
assert.equal(retained.automation?.captures[0].blocker, 'google_sorry')
assert.equal(retained.retainedBrandVerification?.assessment.googleIdentityDecision?.decision, 'verified', 'prior successful evidence remains separately retained')
assert.equal(retained.retainedBrandVerification?.verifiedAt, oneDayAgo)
const retainedSales = projectSalesVisibility(retained, { profile, profileState, now })
assert.equal(retainedSales.state, 'verified_recent')
assert.equal(retainedSales.headline, 'Verified from recent evidence')
assert.equal(retainedSales.operatorReviewRequired, false)
assert.match(retainedSales.explanation, /current automated refresh was unavailable/)
const retainedSummary = brandPresenceEvidenceSummary(retained, retainedSales)
assert.equal(retainedSummary.decision, 'Verified from recent evidence')
assert.equal(retainedSummary.lastVerifiedAt, oneDayAgo)
assert.equal(retainedSummary.automationState, 'Unavailable')
assert.equal(retainedSummary.reason, 'Provider access was restricted.')

const fresh = automaticObservation(new Date(now).toISOString())
fresh.automation = { ...fresh.automation!, runId: 'retry-success-current' }
const freshMerged = mergeAutomatedObservation(prior, fresh, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(freshMerged.retainedBrandVerification, undefined, 'fresh retry success wins without invoking retained evidence')
assert.equal(projectSalesVisibility(freshMerged, { profile, profileState, now }).state, 'verified_correct')

const atBoundary = automaticObservation(new Date(now - GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS).toISOString())
assert.equal(projectSalesVisibility(mergeAutomatedObservation(atBoundary, failedObservation(), { profile, profileState, sourceProfileReviewKey, now }), { profile, profileState, now }).state, 'verified_recent', 'the documented seven-day boundary is inclusive')
const expired = mergeAutomatedObservation(automaticObservation(tenDaysAgo), failedObservation(), { profile, profileState, sourceProfileReviewKey, now })
assert.equal(expired.retainedBrandVerification, undefined)
assert.equal(projectSalesVisibility(expired, { profile, profileState, now }).state, 'manual_verification_needed')

const changedProfile = normalizeWorkspaceProfile({ ...profile, phone: '313-555-0100', website: 'https://new-montessori.example/', streetAddress: '999 Other Road' })
const changedProfileState = reviewed(changedProfile)
const changedIdentity = mergeAutomatedObservation(prior, failedObservation(), {
  profile: changedProfile, profileState: changedProfileState, sourceProfileReviewKey, now,
})
assert.equal(changedIdentity.retainedBrandVerification, undefined, 'material reviewed identity change invalidates prior evidence')
assert.equal(projectSalesVisibility(changedIdentity, { profile: changedProfile, profileState: changedProfileState, now }).operatorReviewRequired, true)

const conflictPrevious: SearchDestinationObservation = {
  ...retained,
  automation: {
    ...retained.automation!,
    assessment: {
      ...retained.automation!.assessment!, visibilityResult: 'review_required', confidence: 'high', blocker: 'identifier_conflict',
      googleIdentityDecision: {
        version: 1, decision: 'review_required', matchedSignals: selected.matchedFields.slice(0, 2),
        conflictingSignals: [{ field: 'phone', expected: profile.phone, observed: '313-555-0100' }],
        candidateIds: ['later-conflict'], sourceTypes: ['knowledge_panel'],
        rule: 'two_strong_identifiers_with_name_or_domain_no_conflict',
      },
    },
  },
}
const afterConflict = mergeAutomatedObservation(conflictPrevious, failedObservation(), { profile, profileState, sourceProfileReviewKey, now })
assert.equal(afterConflict.retainedBrandVerification, undefined, 'a later automated conflict prevents positive evidence reuse')
assert.equal(projectSalesVisibility(conflictPrevious, { profile, profileState, now }).state, 'conflicting_evidence')

const operatorOnlyBase = failedObservation()
const operatorBuilt = buildBrandPresenceVerification(operatorOnlyBase, profile, profileState, { outcome: 'found_correct', reviewedAt: oneDayAgo })
assert.equal(operatorBuilt.ok, true)
const operatorOnly = { ...operatorOnlyBase, operatorVerification: operatorBuilt.ok ? operatorBuilt.verification : undefined }
const operatorMerged = mergeAutomatedObservation(operatorOnly, failedObservation(), { profile, profileState, sourceProfileReviewKey, now })
assert.equal(operatorMerged.retainedBrandVerification, undefined)
assert.equal(projectSalesVisibility(operatorMerged, { profile, profileState, now }).state, 'verified_by_operator', 'operator-only evidence keeps its own provenance and semantics')

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const destinations: SearchDestination[] = ['Google Search', 'Google Maps', 'Bing Search', 'Apple Maps', 'DuckDuckGo', 'Yelp', 'Facebook', 'Instagram']
const observations = Object.fromEntries(destinations.map((destination) => [destination, destination === 'Google Search' ? retained : unresolved(destination)])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const state: AuditState = {
  profile, businessProfile: profileState, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: new Date(now).toISOString(), reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': observations }, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
  visibilityRuns: [
    { version: 2, id: 'prior-google-run', profileKey: scanProfileKey(profile), profileReviewKey: sourceProfileReviewKey, startedAt: oneDayAgo, endedAt: oneDayAgo, status: 'completed', checks: [], businessEvidence: [] },
    { version: 2, id: 'current-google-run', profileKey: scanProfileKey(profile), profileReviewKey: sourceProfileReviewKey, startedAt: new Date(now).toISOString(), endedAt: new Date(now).toISOString(), status: 'completed_with_review', checks: [], businessEvidence: [] },
  ],
}
const cockpit = salesCockpitVisibility(destinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: observations[destination]! })), { profile, profileState, now })
assert.equal(cockpit.lookingGood.some((item) => item.destination === 'Google Search'), true)
assert.equal(cockpit.deeperReview.length, 7)
assert.equal(summarizePublicPresence(state).automatic, 1)
assert.equal(summarizePublicPresence(state).reviewRequired, 7)
const retainedStrengths = customerStrengthCandidates(state, [])
assert.deepEqual(retainedStrengths.map((item) => item.id), ['search:Google Search'])
const priorState = structuredClone(state)
priorState.searchDestinationObservations['search-brand-canonical']['Google Search'] = prior
assert.equal(customerStrengthCandidates(priorState, [])[0].evidenceKey, retainedStrengths[0].evidenceKey, 'a failed refresh does not invalidate existing strength presentation for unchanged retained evidence')
const expiredState = structuredClone(state)
expiredState.searchDestinationObservations['search-brand-canonical']['Google Search'] = expired
assert.equal(customerStrengthCandidates(expiredState, []).some((item) => item.id === 'search:Google Search'), false, 'expired evidence no longer supports a Google strength')
const review = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(review.needsReview.includes('Google Search'), false)
assert(review.verifiedStrengths.some((item) => item.title === 'Google Search'))
const customerJson = serializeCustomerVisibilityReview(review)
for (const internal of ['retainedBrandVerification', 'google_sorry', 'embedded_5xx', 'providerAttempts', 'fixture:']) assert.equal(customerJson.includes(internal), false)

const markup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Search': retained } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
const googleStart = markup.indexOf('<summary>Google Search — Verified from recent evidence</summary>')
const mapsStart = markup.indexOf('<summary>Google Maps —', googleStart)
assert(googleStart >= 0)
const googleMarkup = markup.slice(googleStart, mapsStart)
assert(googleMarkup.includes('Last verified'))
assert(googleMarkup.includes('Latest refresh</dt><dd>Unavailable'))
assert(googleMarkup.includes('No operator action required.'))
assert.equal(googleMarkup.includes('aria-label="Google Search assisted verification"'), false)

const reopened = JSON.parse(JSON.stringify(state)) as AuditState
assert.equal(projectSalesVisibility(reopened.searchDestinationObservations['search-brand-canonical']['Google Search']!, { profile: reopened.profile, profileState: reopened.businessProfile, now }).state, 'verified_recent', 'workspace JSON round-trip preserves the bounded retained-evidence state')

assert.notEqual(projectSalesVisibility(expired, { profile, profileState, now }).state, 'not_found', 'provider failure never becomes absence')
console.log('Google acquisition resilience PASS: one transient retry, bounded fallback, recent automatic evidence retention, expiry/conflict/identity invalidation, UI, strength, neutral count, and customer boundary.')
