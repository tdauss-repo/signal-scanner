import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type {
  AuditState,
  BusinessProfileField,
  BusinessProfileState,
  RetainedBrandAutomaticVerification,
  RetainedBrandPresenceDestination,
  SearchDestination,
  SearchDestinationObservation,
} from '../src/types/audit.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { brandPresenceBusinessIdentityKey, BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS } from '../src/utils/brandPresenceAcquisitionResilience.ts'
import {
  assessmentHasTrueMaterialIdentityConflict,
  brandPresenceRetainedKey,
  recoverRetainedBrandPresenceFromWorkspace,
} from '../src/utils/brandPresenceWorkspaceRetention.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { evidenceFingerprint } from '../src/utils/evidenceFingerprint.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const verifiedAt = '2026-10-05T16:00:00.000Z'
const currentAt = '2026-10-11T15:00:00.000Z'
const now = Date.parse('2026-10-11T16:00:00.000Z')
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Montessori school',
  secondaryCategories: 'Preschool, Kindergarten', website: 'http://www.montessoridownriver.com/',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465',
  operatorNote: 'Mary workspace operator note', localMarket: 'Southgate, MI', serviceArea: 'Downriver',
})
const reviewedFields: BusinessProfileField[] = ['businessName', 'website', 'streetAddress', 'city', 'state', 'zip', 'phone', 'primaryCategory', 'secondaryCategories']
const profileState: BusinessProfileState = {
  schemaVersion: 1,
  values: Object.fromEntries(reviewedFields.map((field) => [field, {
    value: profile[field], source: 'operator_entered', status: 'operator_reviewed', confidence: 'high', recordedAt: verifiedAt,
  }])) as BusinessProfileState['values'],
}
const supported: RetainedBrandPresenceDestination[] = ['Google Search', 'Google Maps', 'Bing Search', 'DuckDuckGo']
const allDestinations: SearchDestination[] = [...supported, 'Apple Maps', 'Yelp', 'Facebook', 'Instagram']
const query = 'Montessori Center of Downriver Southgate MI'
const reference = { sourceUrl: 'https://example.test/result', acquiredAt: verifiedAt, method: 'server_fetch' as const, provider: 'fixture', locator: 'business-card', excerpt: 'Compact identity evidence.' }
const candidate = (id: string, fields: BusinessResultCandidate['fields']): BusinessResultCandidate => ({
  id, kind: 'semantic_card', sourceType: 'knowledge_panel', fields, evidence: [reference],
})
const matchedCandidate = (id = 'mary-entity') => candidate(id, {
  name: profile.businessName, website: profile.website, phone: profile.phone,
  address: `${profile.streetAddress}, ${profile.city}, ${profile.state} ${profile.zip}`,
  locality: profile.city, region: profile.state, postalCode: profile.zip,
  placeIdentity: 'google-place-mary', publicProfileUrl: 'https://www.google.com/maps/place/Montessori+Center+of+Downriver',
})
const policy = (destination: RetainedBrandPresenceDestination) => destination === 'Google Search' ? 'google_search' as const
  : destination === 'Bing Search' ? 'bing_search' as const
    : destination === 'DuckDuckGo' ? 'duckduckgo_search' as const : undefined
const assessed = (destination: RetainedBrandPresenceDestination, candidates: BusinessResultCandidate[]) => {
  const assessment = assessBusinessCandidates(candidates, profile, profileState, 'brand', { automaticIdentityPolicy: policy(destination) })
  assessment.resultRegionInspected = true
  return assessment
}
const capture = (destination: RetainedBrandPresenceDestination, acquiredAt: string): AcquisitionResult => ({
  version: 1, requestedUrl: `https://example.test/${encodeURIComponent(destination)}`, acquiredAt,
  method: 'server_fetch', provider: 'fixture', outcome: 'success', confidence: 'captured', notes: [], resultRegionInspected: true,
})
const observation = (
  destination: RetainedBrandPresenceDestination,
  assessment: SearchEntityAssessment,
  observedAt: string,
  runId: string,
): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, query), observedAt, provenance: 'automated_acquisition', reviewed: false,
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed',
  observedResultTypes: assessment.automaticObservation ? ['business_name_correct', 'website_correct', 'phone_correct', 'address_correct'] : [],
  confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceKind: assessment.automaticObservation ? 'external_observation' : 'unable_to_verify',
  evidenceNotes: assessment.automaticObservation ? `${destination} matched the reviewed business identity.` : `${destination} refresh was inconclusive.`,
  canonicalProfileUrl: destination === 'Google Maps' ? 'https://www.google.com/maps/place/Montessori+Center+of+Downriver' : undefined,
  automation: {
    runId, queryMode: 'brand', state: assessment.automaticObservation ? 'evidence_captured' : 'interactive_review_required',
    inspectedUrl: `https://example.test/${encodeURIComponent(destination)}`, captures: [capture(destination, observedAt)],
    evidence: 'Bounded fixture evidence.', interpreted: assessment.automaticObservation,
    automaticObservation: assessment.automaticObservation,
    businessIdentityKey: brandPresenceBusinessIdentityKey(profile, profileState), assessment,
  },
})
const unresolved = (destination: Exclude<SearchDestination, RetainedBrandPresenceDestination>): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, query), overallResult: 'manual_review_needed', reviewed: false,
})
const baseState = (observations: Partial<Record<SearchDestination, SearchDestinationObservation>>): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: currentAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: { 'search-brand-canonical': observations }, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})

const fresh = Object.fromEntries(supported.map((destination) => [destination,
  observation(destination, assessed(destination, [matchedCandidate(`${brandPresenceRetainedKey(destination)}-mary`)]), verifiedAt, `run-n-${brandPresenceRetainedKey(destination)}`),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
for (const destination of ['Apple Maps', 'Yelp', 'Facebook', 'Instagram'] as const) fresh[destination] = unresolved(destination)

// Run N: all four automatic facts become compact durable records.
const afterRunN = recoverRetainedBrandPresenceFromWorkspace(baseState(fresh), now)
for (const destination of supported) {
  const retained = afterRunN.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)]
  assert.equal(retained?.verificationState, 'automatic_verified', `${destination}: Run N persists automatic verification`)
  assert.equal(retained?.verificationMethod, 'direct_automatic')
  assert.equal('automation' in retained!, false, `${destination}: retained state excludes captures and provider payloads`)
}
const loadedRunN = recoverRetainedBrandPresenceFromWorkspace(JSON.parse(JSON.stringify(afterRunN)) as AuditState, now)

const unavailableAssessment = (): SearchEntityAssessment => ({
  matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable', operatorReviewRequired: true,
  resultRegionInspected: false, ambiguityReasons: ['Provider unavailable.'], blocker: 'network_failure', tier3Candidate: false,
})
const noMatchAssessment = (): SearchEntityAssessment => ({
  matches: [], confidence: 'low', automaticObservation: false, visibilityResult: 'review_required', operatorReviewRequired: true,
  resultRegionInspected: true, ambiguityReasons: ['No sufficient match.'], blocker: 'no_match', tier3Candidate: false,
})
const current = {
  'Google Search': observation('Google Search', assessed('Google Search', [matchedCandidate('run-n1-google-mary')]), currentAt, 'run-n1-google'),
  'Google Maps': observation('Google Maps', assessed('Google Maps', [matchedCandidate('run-n1-maps-mary')]), currentAt, 'run-n1-maps'),
  'Bing Search': observation('Bing Search', noMatchAssessment(), currentAt, 'run-n1-bing'),
  DuckDuckGo: observation('DuckDuckGo', unavailableAssessment(), currentAt, 'run-n1-ddg'),
} satisfies Partial<Record<SearchDestination, SearchDestinationObservation>>
for (const destination of ['Apple Maps', 'Yelp', 'Facebook', 'Instagram'] as const) current[destination] = unresolved(destination) as never
current['Bing Search'].automation!.captures[0].blocker = 'no_match'
current.DuckDuckGo.automation!.captures[0] = {
  ...current.DuckDuckGo.automation!.captures[0],
  outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, blocker: 'network_failure',
  error: 'Fixture network failure.',
}

assert.equal(assessmentHasTrueMaterialIdentityConflict(current['Bing Search'].automation?.assessment), false,
  'a generic no-match result is inconclusive, not a true identity conflict')

// Run N+1 and the second restart keep the latest acquisition technical truth
// while projecting each valid recent fact.
const runNPlusOne = structuredClone(loadedRunN)
runNPlusOne.searchDestinationObservations['search-brand-canonical'] = current
delete runNPlusOne.brandPresenceLastKnownVerified
for (const latest of Object.values(runNPlusOne.searchDestinationObservations['search-brand-canonical'])) {
  if (latest) delete latest.retainedBrandVerification
}
const afterRunNPlusOne = recoverRetainedBrandPresenceFromWorkspace(runNPlusOne, now, loadedRunN)
const reloaded = recoverRetainedBrandPresenceFromWorkspace(JSON.parse(JSON.stringify(afterRunNPlusOne)) as AuditState, now)
for (const destination of supported) {
  const latest = reloaded.searchDestinationObservations['search-brand-canonical'][destination]!
  assert.equal(latest.automation?.runId, `run-n1-${destination === 'Google Search' ? 'google' : destination === 'Google Maps' ? 'maps' : destination === 'Bing Search' ? 'bing' : 'ddg'}`)
  assert.equal(projectSalesVisibility(latest, {
    profile: reloaded.profile, profileState: reloaded.businessProfile, now,
    googleSearchObservation: reloaded.searchDestinationObservations['search-brand-canonical']['Google Search'],
  }).state, ['Bing Search', 'DuckDuckGo'].includes(destination) ? 'verified_recent' : 'verified_correct',
  `${destination}: second save/reload projects the expected effective state`)
  assert(reloaded.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)], `${destination}: bounded fact survives second save`)
}
assert.equal(reloaded.searchDestinationObservations['search-brand-canonical']['Bing Search']?.automation?.assessment?.blocker, 'no_match')
assert.equal(reloaded.searchDestinationObservations['search-brand-canonical']['Bing Search']?.automation?.captures[0].outcome, 'success')
assert.equal(reloaded.searchDestinationObservations['search-brand-canonical'].DuckDuckGo?.automation?.assessment?.blocker, 'network_failure')
assert.equal(reloaded.searchDestinationObservations['search-brand-canonical'].DuckDuckGo?.automation?.captures[0].outcome, 'failed')

const records = allDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: reloaded.searchDestinationObservations['search-brand-canonical'][destination]! }))
const cockpit = salesCockpitVisibility(records, { profile: reloaded.profile, profileState: reloaded.businessProfile, now })
assert.deepEqual(new Set(cockpit.lookingGood.map((item) => item.destination)), new Set(supported), 'four automatic destinations remain primary candidates')
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'Yelp', 'Facebook', 'Instagram']), 'only assisted destinations remain neutral')
assert.equal(`${cockpit.lookingGood.length} primary candidates · ${cockpit.deeperReview.length} neutral destinations`, '4 primary candidates · 4 neutral destinations')
const review = buildCustomerVisibilityReviewExport(reloaded, [], [])
for (const destination of supported) {
  assert.equal(review.needsReview.includes(destination), false, `${destination}: excluded from needsReview`)
  assert(customerStrengthCandidates(reloaded, []).some((item) => item.id === `search:${destination}`), `${destination}: remains strength eligible`)
}
const customerJson = serializeCustomerVisibilityReview(review)
for (const internal of ['brandPresenceLastKnownVerified', 'retainedBrandVerification', 'evidenceFingerprint', 'run-n-google']) {
  assert.equal(customerJson.includes(internal), false, `${internal} remains outside customer JSON`)
}

// Fresh direct Maps > recent direct Maps > derived Search > neutral.
const directFreshMaps = projectSalesVisibility(fresh['Google Maps']!, { profile, profileState, now, googleSearchObservation: fresh['Google Search'] })
assert.equal(directFreshMaps.state, 'verified_correct')
assert.equal(directFreshMaps.derivedGoogleMapsVerification, undefined)
const recentDirectMapsWorkspace = structuredClone(loadedRunN)
recentDirectMapsWorkspace.searchDestinationObservations['search-brand-canonical']['Google Maps'] = observation('Google Maps', unavailableAssessment(), currentAt, 'maps-recent')
const recentDirectMapsState = recoverRetainedBrandPresenceFromWorkspace(recentDirectMapsWorkspace, now)
const recentDirectMaps = projectSalesVisibility(recentDirectMapsState.searchDestinationObservations['search-brand-canonical']['Google Maps']!, {
  profile, profileState, now, googleSearchObservation: recentDirectMapsState.searchDestinationObservations['search-brand-canonical']['Google Search'],
})
assert.equal(recentDirectMaps.state, 'verified_recent')
assert.equal(recentDirectMaps.derivedGoogleMapsVerification, undefined)
const neutralMaps = observation('Google Maps', unavailableAssessment(), currentAt, 'maps-neutral')
const derivedFresh = projectSalesVisibility(neutralMaps, { profile, profileState, now, googleSearchObservation: fresh['Google Search'] })
assert.equal(derivedFresh.state, 'verified_correct')
assert.equal(derivedFresh.derivedGoogleMapsVerification?.freshness, 'fresh')
const recentGoogleWorkspace = structuredClone(loadedRunN)
recentGoogleWorkspace.searchDestinationObservations['search-brand-canonical']['Google Search'] = observation('Google Search', unavailableAssessment(), currentAt, 'google-recent')
const recentGoogleState = recoverRetainedBrandPresenceFromWorkspace(recentGoogleWorkspace, now)
const derivedRecent = projectSalesVisibility(neutralMaps, {
  profile, profileState, now, googleSearchObservation: recentGoogleState.searchDestinationObservations['search-brand-canonical']['Google Search'],
})
assert.equal(derivedRecent.state, 'verified_recent')
assert.equal(derivedRecent.derivedGoogleMapsVerification?.freshness, 'recent')

const conflictAssessment = (destination: RetainedBrandPresenceDestination) => assessed(destination, [candidate(`conflict-${brandPresenceRetainedKey(destination)}`, {
  name: profile.businessName, website: profile.website, phone: '313-555-0100', placeIdentity: 'google-place-mary',
  publicProfileUrl: destination === 'Google Maps' ? 'https://www.google.com/maps/place/Montessori+Center+of+Downriver' : undefined,
})])
for (const destination of supported) {
  const conflicted = structuredClone(reloaded)
  conflicted.searchDestinationObservations['search-brand-canonical'][destination] = observation(destination, conflictAssessment(destination), currentAt, `conflict-${brandPresenceRetainedKey(destination)}`)
  const reconciled = recoverRetainedBrandPresenceFromWorkspace(conflicted, now)
  assert.equal(reconciled.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)], undefined, `${destination}: true material conflict clears retained verification`)
  assert.equal(projectSalesVisibility(reconciled.searchDestinationObservations['search-brand-canonical'][destination]!, {
    profile, profileState, now, googleSearchObservation: reconciled.searchDestinationObservations['search-brand-canonical']['Google Search'],
  }).state, 'conflicting_evidence', `${destination}: true conflict beats retained/derived state`)
}

for (const destination of supported) {
  const corrected = structuredClone(reloaded)
  corrected.searchDestinationObservations['search-brand-canonical'][destination]!.operatorVerification = {
    version: 1, destination, evidenceKey: 'explicit-correction', outcome: 'found_correction_needed', reviewedAt: currentAt,
    provenance: 'operator_verified', mismatches: ['phone'], note: 'Operator invalidated the automatic match.',
  }
  const reconciled = recoverRetainedBrandPresenceFromWorkspace(corrected, now)
  assert.equal(reconciled.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)], undefined, `${destination}: explicit operator correction invalidates retention`)
}

const nonMaterial = structuredClone(reloaded)
nonMaterial.profile.operatorNote = 'Updated internal note.'
nonMaterial.profile.primaryCategory = 'Montessori preschool and school'
const afterNonMaterial = recoverRetainedBrandPresenceFromWorkspace(nonMaterial, now)
for (const destination of supported) assert(afterNonMaterial.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)], `${destination}: non-material metadata does not invalidate`)

const materialChange = structuredClone(reloaded)
materialChange.profile.phone = '313-555-0100'
materialChange.businessProfile.values.phone = { value: '313-555-0100', source: 'operator_entered', status: 'operator_reviewed', confidence: 'high' }
const afterMaterialChange = recoverRetainedBrandPresenceFromWorkspace(materialChange, now)
for (const destination of supported) assert.equal(afterMaterialChange.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)], undefined, `${destination}: material identity change invalidates`)

const expiringWorkspace = structuredClone(loadedRunN)
for (const destination of supported) {
  expiringWorkspace.searchDestinationObservations['search-brand-canonical'][destination] = observation(
    destination, unavailableAssessment(), currentAt, `expired-${brandPresenceRetainedKey(destination)}`,
  )
}
const expired = recoverRetainedBrandPresenceFromWorkspace(expiringWorkspace, Date.parse(verifiedAt) + BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS + 1)
for (const destination of supported) {
  assert.equal(expired.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)], undefined, `${destination}: seven-day expiry is enforced`)
  assert.equal(projectSalesVisibility(expired.searchDestinationObservations['search-brand-canonical'][destination]!, {
    profile, profileState, now: Date.parse(verifiedAt) + BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS + 1,
    googleSearchObservation: expired.searchDestinationObservations['search-brand-canonical']['Google Search'],
  }).state, 'manual_verification_needed')
}

// Legacy Bing workspace field migrates into the shared bounded map.
const legacyBingWorkspace = structuredClone(reloaded)
const modernBing = afterRunN.brandPresenceLastKnownVerified!.bing_search!
const { verificationMethod: _method, evidenceFingerprint: _modernFingerprint, ...legacyBingMaterial } = modernBing
void _method
void _modernFingerprint
legacyBingWorkspace.brandPresenceLastKnownVerified = undefined
legacyBingWorkspace.bingLastKnownVerified = {
  ...legacyBingMaterial, evidenceFingerprint: evidenceFingerprint(legacyBingMaterial),
} as AuditState['bingLastKnownVerified']
const migratedBing = recoverRetainedBrandPresenceFromWorkspace(legacyBingWorkspace, now)
assert.equal(migratedBing.brandPresenceLastKnownVerified?.bing_search?.verificationMethod, 'direct_automatic')
assert.equal(migratedBing.bingLastKnownVerified, undefined)

// Legacy embedded Google verification migrates without preserving its captures.
const legacyGoogleWorkspace = structuredClone(reloaded)
const freshGoogle = fresh['Google Search']!
const legacyGoogle: RetainedBrandAutomaticVerification = {
  version: 1, provenance: 'retained_automatic_verification',
  businessIdentityKey: brandPresenceBusinessIdentityKey(profile, profileState), verifiedAt,
  sourceRunId: freshGoogle.automation!.runId, observedResultTypes: freshGoogle.observedResultTypes,
  evidenceNotes: freshGoogle.evidenceNotes, confidence: freshGoogle.confidence, evidenceKind: freshGoogle.evidenceKind,
  automation: structuredClone(freshGoogle.automation!),
}
legacyGoogleWorkspace.brandPresenceLastKnownVerified = undefined
legacyGoogleWorkspace.searchDestinationObservations['search-brand-canonical']['Google Search'] = observation(
  'Google Search', unavailableAssessment(), currentAt, 'legacy-google-current',
)
legacyGoogleWorkspace.searchDestinationObservations['search-brand-canonical']['Google Search']!.retainedGoogleVerification = legacyGoogle
legacyGoogleWorkspace.searchDestinationObservations['search-brand-canonical']['Google Search']!.retainedBrandVerification = undefined
const migratedGoogle = recoverRetainedBrandPresenceFromWorkspace(legacyGoogleWorkspace, now)
assert.equal(migratedGoogle.brandPresenceLastKnownVerified?.google_search?.sourceRunId, freshGoogle.automation?.runId)
assert.equal('automation' in migratedGoogle.brandPresenceLastKnownVerified!.google_search!, false)

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const loadSource = appSource.slice(appSource.indexOf('const loadState ='), appSource.indexOf('const savedScanFromWorkspace'))
assert.match(loadSource, /recoverRetainedBrandPresenceFromWorkspace/)
assert.doesNotMatch(loadSource, /runVisibilityScan|acquireGoogle|acquireBing|acquireDuck|fetch\(/, 'workspace load performs no external acquisition')
const saveSource = appSource.slice(appSource.indexOf('const savedScanFromWorkspace'), appSource.indexOf('const normalizeSavedScan'))
assert.match(saveSource, /recoverRetainedBrandPresenceFromWorkspace\([\s\S]*existing\?\.payload/, 'Save reconciles against the prior saved payload before overwriting it')

console.log('Shared Brand Presence retained lifecycle PASS: real Oct. 5/Oct. 11 two-save lifecycle, prior-payload preservation, latest Bing no-match and DuckDuckGo network failure, four neutral destinations, Maps precedence/derivation, expiry, identity/operator invalidation, migration, strengths, needsReview, and no load-time acquisition.')
