import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type {
  AuditState,
  BusinessProfile,
  BusinessProfileField,
  BusinessProfileState,
  SavedScanFile,
  SearchDestination,
  SearchDestinationObservation,
} from '../src/types/audit.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS } from '../src/utils/brandPresenceAcquisitionResilience.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildBrandPresenceVerification } from '../src/utils/brandPresenceVerification.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { evidenceFingerprint, matchesEvidenceFingerprint } from '../src/utils/evidenceFingerprint.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { summarizePublicPresence } from '../src/utils/publicPresence.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { defaultSearchDestinationObservation, searchDestinations } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { mergeAutomatedObservation, retainedBingSourceFromVisibilityRuns } from '../src/utils/visibilityScan.ts'
import { scanProfileKey } from '../src/utils/visibilityScanState.ts'
import { recoverRetainedBingVerificationFromWorkspace } from '../src/utils/bingWorkspaceRetention.ts'

Object.assign(globalThis, { React })

const now = Date.parse('2026-09-29T16:00:00.000Z')
const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()
const currentAt = new Date(now).toISOString()
const query = 'Montessori Center of Downriver Southgate MI'
const observationQuery = 'Montessori Center of Downriver'
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
const sourceProfileReviewKey = evidenceFingerprint(profileState)
const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
const capture = (outcome: 'success' | 'failed', acquiredAt: string, blocker = outcome === 'success' ? 'none' : 'network_failure'): AcquisitionResult => ({
  version: 1, requestedUrl: bingUrl, finalUrl: bingUrl, acquiredAt, provider: 'bing-native-fetch', method: 'server_fetch',
  outcome, confidence: outcome === 'success' ? 'scanner_observed' : 'unavailable', blocker,
  resultRegionInspected: outcome === 'success', visibleText: outcome === 'success' ? 'Generic Montessori result set' : '', notes: [],
  ...(outcome === 'failed' ? { error: 'Fixture network failure.' } : {}),
})
const candidate = (id: string, fields: BusinessResultCandidate['fields']): BusinessResultCandidate => ({
  id, kind: 'semantic_card', sourceType: 'organic', resultUrl: 'https://montessoridownriver.com/', fields, evidence: [],
})
const verifiedAssessment = () => assessBusinessCandidates([candidate('mary', {
  name: profile.businessName, website: profile.website, phone: profile.phone,
})], profile, profileState, 'brand', { automaticIdentityPolicy: 'bing_search' })
const noMatchAssessment = (): SearchEntityAssessment => ({
  matches: [], confidence: 'low', automaticObservation: false, visibilityResult: 'review_required',
  operatorReviewRequired: true, resultRegionInspected: true,
  ambiguityReasons: ['The normal Bing result region did not contain a sufficient business identity match.'],
  blocker: 'no_match', tier3Candidate: false,
})
const unavailableAssessment = (): SearchEntityAssessment => ({
  matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable',
  operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: ['The native Bing request was unavailable.'],
  blocker: 'acquisition_failure', tier3Candidate: false,
})
const observation = (
  assessment: SearchEntityAssessment,
  observedAt: string,
  runId: string,
  acquisition: AcquisitionResult,
): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation('Bing Search', observationQuery),
  verificationUrl: bingUrl,
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed',
  observedResultTypes: assessment.automaticObservation ? ['official_website', 'business_name_correct', 'phone_correct', 'website_correct'] : [],
  observedAt, confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceNotes: assessment.automaticObservation ? 'Bing business identity matched.' : 'Current Bing refresh was inconclusive.',
  evidenceKind: assessment.matches.length ? 'external_observation' : assessment.visibilityResult === 'unavailable' ? 'acquisition_failure' : 'unable_to_verify',
  provenance: 'automated_acquisition', reviewed: false,
  ...(assessment.selected?.candidate.resultUrl ? { observedResultUrl: assessment.selected.candidate.resultUrl } : {}),
  automation: {
    runId, queryMode: 'brand', state: assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured',
    inspectedUrl: bingUrl, captures: [acquisition], evidence: 'Bounded Bing acquisition evidence.',
    interpreted: assessment.automaticObservation, automaticObservation: assessment.automaticObservation, assessment,
  },
})

const prior = observation(verifiedAssessment(), oneDayAgo, 'bing-prior', capture('success', oneDayAgo))
assert.equal(prior.automation?.assessment?.bingIdentityDecision?.decision, 'verified')
const currentNoMatch = observation(noMatchAssessment(), currentAt, 'bing-current-no-match', capture('success', currentAt))
const retained = mergeAutomatedObservation(prior, currentNoMatch, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(retained.automation?.runId, 'bing-current-no-match', '12: current inconclusive acquisition remains the parent record')
assert.equal(retained.automation?.assessment?.blocker, 'no_match')
assert.equal(retained.retainedBrandVerification?.sourceRunId, 'bing-prior', '1: recent automatic verification remains separately retained')
assert.equal(retained.retainedBrandVerification?.verifiedAt, oneDayAgo)

const retainedSales = projectSalesVisibility(retained, { profile, profileState, now })
assert.equal(retainedSales.state, 'verified_recent', '3: retained Bing state is recent rather than fresh')
assert.equal(retainedSales.headline, 'Verified from recent evidence')
assert.equal(retainedSales.operatorReviewRequired, false)
assert.equal(retainedSales.identitySummary, 'Matches reviewed business details from recent verified evidence')
assert.match(retainedSales.explanation, /latest automated refresh did not return enough matching information to reconfirm it/)
const retainedSummary = brandPresenceEvidenceSummary(retained, retainedSales)
assert.equal(retainedSummary.lastVerifiedAt, oneDayAgo)
assert.equal(retainedSummary.automationState, 'Inconclusive')
assert.equal(retainedSummary.decision, 'Verified from recent evidence')
assert(retainedSummary.identityEvidence?.some((item) => item.label === 'Website'), 'recent detail explains prior matched identity fields')

const currentUnavailable = observation(unavailableAssessment(), currentAt, 'bing-current-unavailable', capture('failed', currentAt))
const retainedUnavailable = mergeAutomatedObservation(prior, currentUnavailable, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(projectSalesVisibility(retainedUnavailable, { profile, profileState, now }).state, 'verified_recent', '2: unavailable refresh retains recent verified evidence')
assert.equal(brandPresenceEvidenceSummary(retainedUnavailable, projectSalesVisibility(retainedUnavailable, { profile, profileState, now })).automationState, 'Unavailable')

const expiredPrior = observation(verifiedAssessment(), eightDaysAgo, 'bing-expired', capture('success', eightDaysAgo))
const expired = mergeAutomatedObservation(expiredPrior, currentNoMatch, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(expired.retainedBrandVerification, undefined, '4: evidence older than the shared seven-day window is rejected')
assert.equal(projectSalesVisibility(expired, { profile, profileState, now }).state, 'manual_verification_needed')
const boundaryAt = new Date(now - BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS).toISOString()
const boundary = mergeAutomatedObservation(observation(verifiedAssessment(), boundaryAt, 'bing-boundary', capture('success', boundaryAt)), currentNoMatch, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(projectSalesVisibility(boundary, { profile, profileState, now }).state, 'verified_recent', 'seven-day boundary remains inclusive')

const changedProfile = normalizeWorkspaceProfile({ ...profile, phone: '313-555-0100', website: 'https://new-montessori.example/', streetAddress: '999 Other Road' })
const changedState = reviewed(changedProfile)
const changed = mergeAutomatedObservation(prior, currentNoMatch, { profile: changedProfile, profileState: changedState, sourceProfileReviewKey, now })
assert.equal(changed.retainedBrandVerification, undefined, '5: material reviewed identity change invalidates retention')

const conflictAssessment = assessBusinessCandidates([candidate('conflict', {
  name: profile.businessName, website: profile.website, phone: '313-555-0100',
})], profile, profileState, 'brand', { automaticIdentityPolicy: 'bing_search' })
const currentConflict = observation(conflictAssessment, currentAt, 'bing-current-conflict', capture('success', currentAt))
const conflictMerged = mergeAutomatedObservation(prior, currentConflict, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(conflictMerged.retainedBrandVerification, undefined, '6: a current material conflict clears prior positivity')
assert.equal(projectSalesVisibility(conflictMerged, { profile, profileState, now }).state, 'conflicting_evidence')

const correction = buildBrandPresenceVerification(prior, profile, profileState, {
  outcome: 'found_correction_needed', mismatches: ['phone'], reviewedAt: oneDayAgo,
})
assert.equal(correction.ok, true)
const correctedPrior = { ...prior, operatorVerification: correction.ok ? correction.verification : undefined }
const corrected = mergeAutomatedObservation(correctedPrior, currentNoMatch, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(corrected.retainedBrandVerification, undefined, '7: operator correction prevents retained automatic positivity')
assert.equal(projectSalesVisibility(corrected, { profile, profileState, now }).state, 'reconfirmation_needed', 'the preserved correction follows existing material-evidence reconfirmation semantics')

const operatorBase = observation(noMatchAssessment(), oneDayAgo, 'bing-operator-only', capture('success', oneDayAgo))
const operatorResult = buildBrandPresenceVerification(operatorBase, profile, profileState, { outcome: 'found_correct', reviewedAt: oneDayAgo })
assert.equal(operatorResult.ok, true)
const operatorOnly = { ...operatorBase, operatorVerification: operatorResult.ok ? operatorResult.verification : undefined }
const operatorMerged = mergeAutomatedObservation(operatorOnly, currentNoMatch, { profile, profileState, sourceProfileReviewKey, now })
assert.equal(operatorMerged.retainedBrandVerification, undefined, '8: operator-only evidence is never relabeled retained automatic evidence')
assert.equal(projectSalesVisibility(operatorMerged, { profile, profileState, now }).state, 'verified_by_operator', 'operator-only evidence retains its own provenance and semantics')

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const freshAutomatic = (destination: SearchDestination): SearchDestinationObservation => ({
  ...unresolved(destination), overallResult: 'found_match', provenance: 'automated_acquisition',
  automation: { runId: `${destination}-run`, state: 'evidence_captured', queryMode: 'brand', inspectedUrl: '', captures: [], evidence: '', interpreted: true, automaticObservation: true,
    assessment: { matches: [], confidence: 'high', automaticObservation: true, visibilityResult: 'found', operatorReviewRequired: false, resultRegionInspected: true, ambiguityReasons: [], blocker: 'none', tier3Candidate: false } },
})
const observations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Bing Search' ? retained
    : ['Google Search', 'Google Maps', 'DuckDuckGo'].includes(destination) ? freshAutomatic(destination) : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const state: AuditState = {
  profile, businessProfile: profileState, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: currentAt, reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': observations }, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
  visibilityRuns: [
    { version: 2, id: 'bing-prior', profileKey: scanProfileKey(profile), profileReviewKey: sourceProfileReviewKey, startedAt: oneDayAgo, endedAt: oneDayAgo, status: 'completed', checks: [{
      id: 'search-brand-canonical:Bing Search', area: 'SearchMaps', state: 'evidence_captured', destination: 'Bing Search',
      queryId: 'search-brand-canonical', query: observationQuery, queryMode: 'brand', url: bingUrl,
      captures: prior.automation!.captures, assessment: prior.automation!.assessment,
      evidenceCaptured: true, interpreted: true,
    }], businessEvidence: [] },
    { version: 2, id: 'bing-current-no-match', profileKey: scanProfileKey(profile), profileReviewKey: sourceProfileReviewKey, startedAt: currentAt, endedAt: currentAt, status: 'completed_with_review', checks: [], businessEvidence: [] },
  ],
}
const historicalState = structuredClone(state)
historicalState.searchDestinationObservations['search-brand-canonical']['Bing Search'] = currentNoMatch
const historicalSource = retainedBingSourceFromVisibilityRuns(historicalState, 'search-brand-canonical:Bing Search', profile)
assert(historicalSource, 'workspace run history exposes the earlier verified Bing assessment after an already-completed no-match overwrite')
const recoveredFromHistory = recoverRetainedBingVerificationFromWorkspace(historicalState, now)
  .searchDestinationObservations['search-brand-canonical']['Bing Search']!
assert.equal(projectSalesVisibility(recoveredFromHistory, { profile, profileState, now }).state, 'verified_recent', 'the next refresh can recover the still-current prior success from existing workspace history')
const conflictHistory = structuredClone(historicalState)
conflictHistory.visibilityRuns!.splice(1, 0, {
  version: 2, id: 'bing-history-conflict', profileKey: scanProfileKey(profile), profileReviewKey: sourceProfileReviewKey,
  startedAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(), endedAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(), status: 'completed_with_review',
  checks: [{ id: 'search-brand-canonical:Bing Search', area: 'SearchMaps', state: 'interactive_review_required', destination: 'Bing Search',
    queryId: 'search-brand-canonical', query: observationQuery, queryMode: 'brand', url: bingUrl, captures: currentConflict.automation!.captures,
    assessment: currentConflict.automation!.assessment, evidenceCaptured: true, interpreted: false }], businessEvidence: [],
})
assert.equal(retainedBingSourceFromVisibilityRuns(conflictHistory, 'search-brand-canonical:Bing Search', profile), undefined, 'a later historical conflict is a hard barrier to recovering an older success')
const records = searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: observations[destination]! }))
const cockpit = salesCockpitVisibility(records, { profile, profileState, now })
assert.equal(cockpit.deeperReview.length, 4, '10: retained Bing is excluded from the neutral destination count')
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'Yelp', 'Facebook', 'Instagram']))
assert.equal(summarizePublicPresence(state).automatic, 1, 'retained Bing remains automatic provider-acquired evidence in the workspace summary')
const retainedStrength = customerStrengthCandidates(state, []).find((item) => item.id === 'search:Bing Search')
assert(retainedStrength, '9: retained Bing remains eligible as a strength')
const freshState = structuredClone(state)
freshState.searchDestinationObservations['search-brand-canonical']['Bing Search'] = prior
assert.equal(customerStrengthCandidates(freshState, []).find((item) => item.id === 'search:Bing Search')?.evidenceKey, retainedStrength.evidenceKey, 'strength material fingerprint does not churn')
const review = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(review.needsReview.includes('Bing Search'), false, '11: retained Bing stays out of Still being verified')
assert(review.verifiedStrengths.some((item) => item.title === 'Bing Search'))
const customerJson = serializeCustomerVisibilityReview(review)
for (const internal of ['retainedBrandVerification', 'no_match', 'bing-native-fetch', 'bingIdentityDecision', 'sourceRunId']) {
  assert.equal(customerJson.includes(internal), false, `13: ${internal} stays outside customer JSON`)
}

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Bing Search': retained } }}
  onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
const bingStart = markup.indexOf('<summary>Bing Search — Verified from recent evidence</summary>')
const appleStart = markup.indexOf('<summary>Apple Maps —', bingStart)
assert(bingStart >= 0)
const bingMarkup = markup.slice(bingStart, appleStart)
assert(bingMarkup.includes('Latest refresh</dt><dd>Inconclusive'))
assert(bingMarkup.includes('No operator action required.'))
assert.equal(bingMarkup.includes('aria-label="Bing Search assisted verification"'), false)

const reopened = JSON.parse(JSON.stringify(state)) as AuditState
assert.equal(projectSalesVisibility(reopened.searchDestinationObservations['search-brand-canonical']['Bing Search']!, {
  profile: reopened.profile, profileState: reopened.businessProfile, now,
}).state, 'verified_recent', 'saved workspace round-trip preserves retained Bing evidence')

// Real persisted-workspace shape: current no-match is already saved, while the
// prior verified run has the same material identity but older non-identity
// profile metadata and a no-longer-equal full Business Profile fingerprint.
const persistedFile = JSON.parse(readFileSync(new URL('./fixtures/mary-bing-retention-workspace.json', import.meta.url), 'utf8')) as SavedScanFile
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
assert.match(appSource, /return recoverRetainedBrandPresenceFromWorkspace\(normalized\)/, 'the real App saved-workspace normalization path applies shared Brand Presence recovery')
assert.match(appSource, /normalizeAuditState\(matching\.payload\)/, 'active-workspace hydration may use only the matching saved scan as a legacy recovery source')
const loadStateSource = appSource.slice(appSource.indexOf('const loadState ='), appSource.indexOf('const savedScanFromWorkspace'))
assert.doesNotMatch(loadStateSource, /acquireBing|runVisibilityScan|fetch\(/, 'workspace hydration cannot make an external Bing request')
const persistedWorkspace = persistedFile.scan.payload
persistedWorkspace.profile = normalizeWorkspaceProfile(persistedWorkspace.profile)
persistedWorkspace.salesReadiness = normalizeSalesReadiness(persistedWorkspace.salesReadiness, persistedWorkspace.profile)
persistedWorkspace.websiteAudit = normalizeWebsiteAuditWorkspaceState(persistedWorkspace.websiteAudit)
persistedWorkspace.visibilityRuns!.at(-1)!.profileReviewKey = evidenceFingerprint(persistedWorkspace.businessProfile)
const persistedCurrent = persistedWorkspace.searchDestinationObservations['search-brand-canonical']['Bing Search']!
assert.equal(projectSalesVisibility(persistedCurrent, {
  profile: persistedWorkspace.profile,
  profileState: persistedWorkspace.businessProfile,
  now: Date.parse('2026-10-03T12:00:00.000Z'),
}).state, 'manual_verification_needed', 'persisted no-match has no retained projection before load-time recovery')
assert.equal(matchesEvidenceFingerprint(persistedWorkspace.visibilityRuns![0].profileKey, persistedWorkspace.profile), false, 'persisted prior run differs in non-identity profile metadata')
assert.equal(matchesEvidenceFingerprint(persistedWorkspace.visibilityRuns![0].profileReviewKey, persistedWorkspace.businessProfile), false, 'persisted prior run differs in non-material Business Profile metadata')
assert(retainedBingSourceFromVisibilityRuns(persistedWorkspace, 'search-brand-canonical:Bing Search', persistedWorkspace.profile), 'material identity lookup recovers the prior verified run')

const recoveredWorkspace = recoverRetainedBingVerificationFromWorkspace(persistedWorkspace, Date.parse('2026-10-03T12:00:00.000Z'))
const recoveredBing = recoveredWorkspace.searchDestinationObservations['search-brand-canonical']['Bing Search']!
const recoveredSales = projectSalesVisibility(recoveredBing, {
  profile: recoveredWorkspace.profile,
  profileState: recoveredWorkspace.businessProfile,
  now: Date.parse('2026-10-03T12:00:00.000Z'),
})
assert.equal(recoveredSales.state, 'verified_recent', 'persisted workspace recovers Bing without another scan')
assert.equal(recoveredBing.automation?.runId, 'visibility-mary-current', 'latest inconclusive acquisition remains the active technical record')
assert.equal(recoveredBing.automation?.assessment?.blocker, 'no_match')
assert.equal(recoveredBing.retainedBrandVerification?.sourceRunId, 'visibility-mary-prior')
assert.equal(recoveredWorkspace.brandPresenceLastKnownVerified?.bing_search?.sourceRunId, 'visibility-mary-prior', 'load migration writes a bounded workspace-level verified fact')
assert.equal('automation' in recoveredWorkspace.brandPresenceLastKnownVerified!.bing_search!, false, 'bounded retention does not duplicate captures or provider payloads')
assert.equal(salesCockpitVisibility([{ queryId: 'search-brand-canonical', observation: recoveredBing }], {
  profile: recoveredWorkspace.profile,
  profileState: recoveredWorkspace.businessProfile,
  now: Date.parse('2026-10-03T12:00:00.000Z'),
}).deeperReview.length, 0, 'recovered Bing is excluded from neutral destinations')
assert.equal(summarizePublicPresence(recoveredWorkspace).automatic, 1, 'recovered Bing remains automatic public-presence evidence')
assert(customerStrengthCandidates(recoveredWorkspace, []).some((item) => item.id === 'search:Bing Search'), 'recovered Bing is strength eligible')
const recoveredReview = buildCustomerVisibilityReviewExport(recoveredWorkspace, [], [])
assert.equal(recoveredReview.needsReview.includes('Bing Search'), false)
assert(recoveredReview.verifiedStrengths.some((item) => item.title === 'Bing Search'))

// Normal lifecycle: Run N verifies, both normal persistence layers round-trip,
// Run N+1 saves a no-match as the latest technical fact, and a second restart
// restores verified_recent without any acquisition dependency.
const lifecycleSource = retainedBingSourceFromVisibilityRuns(
  persistedWorkspace,
  'search-brand-canonical:Bing Search',
  persistedWorkspace.profile,
)!
const runNWorkspace = structuredClone(persistedWorkspace)
runNWorkspace.visibilityRuns = [structuredClone(runNWorkspace.visibilityRuns![0])]
runNWorkspace.searchDestinationObservations['search-brand-canonical']['Bing Search'] = lifecycleSource.observation
delete runNWorkspace.bingLastKnownVerified
delete runNWorkspace.brandPresenceLastKnownVerified
const afterRunN = recoverRetainedBingVerificationFromWorkspace(runNWorkspace, Date.parse('2026-10-02T12:00:00.000Z'))
assert.equal(afterRunN.brandPresenceLastKnownVerified?.bing_search?.verificationState, 'automatic_verified', '1: Run N persists automatic verification immediately')
const savedRunN = JSON.stringify(afterRunN)
const loadedRunN = recoverRetainedBingVerificationFromWorkspace(JSON.parse(savedRunN) as AuditState, Date.parse('2026-10-02T12:01:00.000Z'))

const legacyActiveNoMatch = structuredClone(persistedWorkspace)
legacyActiveNoMatch.visibilityRuns = [structuredClone(legacyActiveNoMatch.visibilityRuns!.at(-1)!)]
delete legacyActiveNoMatch.bingLastKnownVerified
delete legacyActiveNoMatch.brandPresenceLastKnownVerified
delete legacyActiveNoMatch.searchDestinationObservations['search-brand-canonical']['Bing Search']!.retainedBrandVerification
const recoveredAcrossNormalStores = recoverRetainedBingVerificationFromWorkspace(
  legacyActiveNoMatch,
  Date.parse('2026-10-03T12:00:00.000Z'),
  loadedRunN,
)
assert.equal(recoveredAcrossNormalStores.brandPresenceLastKnownVerified?.bing_search?.sourceRunId, 'visibility-mary-prior', 'matching Saved Scan Run N repairs a legacy active workspace whose latest observation replaced it')
assert.equal(recoveredAcrossNormalStores.searchDestinationObservations['search-brand-canonical']['Bing Search']?.automation?.assessment?.blocker, 'no_match')
const legacyActiveWithConflict = structuredClone(legacyActiveNoMatch)
legacyActiveWithConflict.visibilityRuns = structuredClone(conflictHistory.visibilityRuns)
const laterMaterialConflict = legacyActiveWithConflict.visibilityRuns!.find((run) => run.id === 'bing-history-conflict')!
laterMaterialConflict.startedAt = '2026-10-02T17:00:00.000Z'
laterMaterialConflict.endedAt = '2026-10-02T17:01:00.000Z'
assert.equal(recoverRetainedBingVerificationFromWorkspace(
  legacyActiveWithConflict,
  Date.parse('2026-10-03T12:00:00.000Z'),
  loadedRunN,
).brandPresenceLastKnownVerified?.bing_search, undefined, 'a later material conflict blocks the matching-saved-workspace migration path')

const afterNoMatch = structuredClone(loadedRunN)
afterNoMatch.visibilityRuns = structuredClone(persistedWorkspace.visibilityRuns)
afterNoMatch.searchDestinationObservations['search-brand-canonical']['Bing Search'] = structuredClone(persistedCurrent)
const afterRunNPlusOne = recoverRetainedBingVerificationFromWorkspace(afterNoMatch, Date.parse('2026-10-03T12:00:00.000Z'))
assert.equal(afterRunNPlusOne.searchDestinationObservations['search-brand-canonical']['Bing Search']?.automation?.assessment?.blocker, 'no_match', '3: no-match remains the latest technical evidence')
assert.equal(afterRunNPlusOne.brandPresenceLastKnownVerified?.bing_search?.sourceRunId, 'visibility-mary-prior', '2: the bounded fact survives the no-match save')
const savedRunNPlusOne = JSON.stringify(afterRunNPlusOne)
const reloadedRunNPlusOne = recoverRetainedBingVerificationFromWorkspace(JSON.parse(savedRunNPlusOne) as AuditState, Date.parse('2026-10-03T12:01:00.000Z'))
const lifecycleBing = reloadedRunNPlusOne.searchDestinationObservations['search-brand-canonical']['Bing Search']!
assert.equal(projectSalesVisibility(lifecycleBing, {
  profile: reloadedRunNPlusOne.profile,
  profileState: reloadedRunNPlusOne.businessProfile,
  now: Date.parse('2026-10-03T12:01:00.000Z'),
}).state, 'verified_recent', '4: restart after no-match restores verified_recent')
assert.equal(lifecycleBing.automation?.assessment?.blocker, 'no_match')
assert.equal(buildCustomerVisibilityReviewExport(reloadedRunNPlusOne, [], []).needsReview.includes('Bing Search'), false, '9: retained Bing is excluded from needsReview after restart')
assert(customerStrengthCandidates(reloadedRunNPlusOne, []).some((item) => item.id === 'search:Bing Search'), '10: retained Bing remains strength eligible after restart')

const nonMaterialEdit = structuredClone(reloadedRunNPlusOne)
nonMaterialEdit.profile.operatorNote = 'A changed workspace note must not affect Bing identity.'
nonMaterialEdit.profile.primaryCategory = 'Montessori preschool and school'
const afterNonMaterialEdit = recoverRetainedBingVerificationFromWorkspace(nonMaterialEdit, Date.parse('2026-10-03T12:02:00.000Z'))
assert(afterNonMaterialEdit.brandPresenceLastKnownVerified?.bing_search, '6: non-material workspace metadata does not invalidate retention')

const materialEdit = structuredClone(reloadedRunNPlusOne)
materialEdit.profile.phone = '313-555-0100'
materialEdit.businessProfile.values.phone = { value: '313-555-0100', source: 'operator_entered', status: 'operator_reviewed', confidence: 'high' }
const afterMaterialEdit = recoverRetainedBingVerificationFromWorkspace(materialEdit, Date.parse('2026-10-03T12:02:00.000Z'))
assert.equal(afterMaterialEdit.brandPresenceLastKnownVerified?.bing_search, undefined, '5: material identity change invalidates the bounded fact')
assert.equal(projectSalesVisibility(afterMaterialEdit.searchDestinationObservations['search-brand-canonical']['Bing Search']!, {
  profile: afterMaterialEdit.profile, profileState: afterMaterialEdit.businessProfile, now: Date.parse('2026-10-03T12:02:00.000Z'),
}).state, 'manual_verification_needed')

const operatorConflict = structuredClone(reloadedRunNPlusOne)
operatorConflict.searchDestinationObservations['search-brand-canonical']['Bing Search']!.operatorVerification = correctedPrior.operatorVerification
const afterOperatorConflict = recoverRetainedBingVerificationFromWorkspace(operatorConflict, Date.parse('2026-10-03T12:02:00.000Z'))
assert.equal(afterOperatorConflict.brandPresenceLastKnownVerified?.bing_search, undefined, '7: explicit operator correction invalidates retained verification')

const expiredWorkspace = recoverRetainedBingVerificationFromWorkspace(reloadedRunNPlusOne, Date.parse('2026-10-09T16:00:31.000Z'))
assert.equal(expiredWorkspace.brandPresenceLastKnownVerified?.bing_search, undefined, '8: the bounded fact expires after seven days')
assert.equal(projectSalesVisibility(expiredWorkspace.searchDestinationObservations['search-brand-canonical']['Bing Search']!, {
  profile: expiredWorkspace.profile, profileState: expiredWorkspace.businessProfile, now: Date.parse('2026-10-09T16:00:31.000Z'),
}).state, 'manual_verification_needed')

console.log('Bing recent-evidence resilience PASS: no-match/unavailable retention, bounded Run N/Run N+1 save/reload lifecycle, shared freshness, identity/conflict/operator invalidation, UI, stable strength, neutral count, persisted-workspace recovery, and customer boundary.')
