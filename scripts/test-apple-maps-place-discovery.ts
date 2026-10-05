import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acquireAppleMaps } from '../server/appleMaps.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { discoverAppleMapsPlace } from '../src/utils/appleMapsPlaceDiscovery.ts'
import { parseApplePlaceUrl } from '../src/utils/appleMapsPlace.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, searchDestinations } from '../src/utils/searchVisibility.ts'
import { runVisibilityScan } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const observedAt = '2026-10-05T16:00:00.000Z'
const realPlaceUrl = 'https://maps.apple.com/place?place-id=I5420B8793429BEE8&address=15575+Northline+Rd%2C+Southgate%2C+MI++48195%2C+United+States&coordinate=42.212820%2C-83.211933&name=Montessori+Center+Of+Downriver&_provider=9902'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', website: 'https://montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: observedAt,
}])) as BusinessProfileState['values'] }
const parsed = parseApplePlaceUrl(realPlaceUrl)!
assert.equal(parsed.placeId, 'I5420B8793429BEE8')
assert.equal(parsed.name, 'Montessori Center Of Downriver')
assert.equal(parsed.address, '15575 Northline Rd, Southgate, MI 48195, United States')
assert.equal(parsed.coordinate, '42.212820,-83.211933')
assert.equal(parsed.providerIdentifier, '9902')
assert.equal(parsed.canonicalUrl.includes('coordinate='), false, 'presentation coordinates do not enter canonical identity')
assert.equal(parsed.canonicalUrl.includes('_provider='), false, 'provider presentation data does not enter canonical identity')
assert.equal(parseApplePlaceUrl('https://maps.apple.com/place'), undefined, 'a route without an asserted Place ID is not discoverable identity')
assert.equal(parseApplePlaceUrl('https://apple.com/place?place-id=I-BAD'), undefined)
assert.equal(parseApplePlaceUrl('http://maps.apple.com/place?place-id=I-BAD'), undefined)

const placeHtml = readFileSync(new URL('./fixtures/apple-maps-montessori-place.html', import.meta.url), 'utf8')
let publicPlaceCalls = 0
const direct = await acquireAppleMaps(parsed.canonicalUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => { publicPlaceCalls += 1; return { status: 200, finalUrl: url.href, body: placeHtml } },
})
assert.equal(publicPlaceCalls, 1, 'an explicit public Apple Place URL gets at most one bounded place request')
assert.equal(direct.appleMapsResolution?.publicPlaceResolutionAttempted, true)
assert.equal(direct.appleMapsResolution?.serverApiAttempted, false)
const directAssessment = assessSearchCapture(direct, profile, profileState, 'Apple Maps', 'brand')
assert.equal(directAssessment.automaticObservation, true, 'real Montessori structured Place identity verifies automatically')
assert.deepEqual(new Set(directAssessment.selected?.matchedFields.map((item) => item.field)), new Set(['name', 'address', 'phone', 'website']))
assert.equal(directAssessment.selected?.candidate.fields.placeIdentity, 'I5420B8793429BEE8')

const idOnlyUrl = 'https://maps.apple.com/place?place-id=I5420B8793429BEE8'
const idOnly = await acquireAppleMaps(idOnlyUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: '<html><main>Apple Maps</main></html>' }),
})
assert.equal(assessSearchCapture(idOnly, profile, profileState, 'Apple Maps', 'brand').automaticObservation, false, 'Place ID without structured business identity is insufficient')

const googleAssessment = assessBusinessCandidates([{
  id: 'verified-google-apple-link', kind: 'structured_entity', sourceType: 'knowledge_panel', resultUrl: profile.website,
  fields: { name: profile.businessName, website: profile.website, publicProfileUrl: realPlaceUrl },
  evidence: [{ sourceUrl: 'https://www.google.com/search?q=montessori', acquiredAt: observedAt, provider: 'fixture-google', method: 'server_fetch', locator: 'knowledge-panel', excerpt: 'Verified business with explicit Apple Maps link.' }],
}], profile, profileState, 'brand', { automaticIdentityPolicy: 'google_search' })
assert.equal(googleAssessment.automaticObservation, true)
const trustworthyGoogle: SearchDestinationObservation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  overallResult: 'found_match', provenance: 'automated_acquisition', reviewed: false, observedAt,
  observedResultUrl: profile.website, canonicalProfileUrl: realPlaceUrl,
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
  automation: {
    runId: 'trusted-google-run', state: 'evidence_captured', queryMode: 'brand', inspectedUrl: 'https://www.google.com/search?q=montessori',
    captures: [{ version: 1, requestedUrl: 'https://www.google.com/search?q=montessori', acquiredAt: observedAt, provider: 'fixture-google', method: 'server_fetch', outcome: 'success', confidence: 'captured', resultRegionInspected: true, notes: [] }],
    evidence: 'Verified Google evidence.', interpreted: true, automaticObservation: true, assessment: googleAssessment,
  },
}, { profile, brandPresence: true })
const discovery = discoverAppleMapsPlace(profile, profileState, undefined, { 'trusted-automatic-evidence': { 'Google Search': trustworthyGoogle } }, Date.parse(observedAt))!
assert.equal(discovery.source, 'verified_search_evidence')
assert.equal(discovery.sourceDestination, 'Google Search')
assert.equal(discovery.canonicalUrl, parsed.canonicalUrl)
assert.equal(discovery.placeId, parsed.placeId)
assert(discovery.evidenceKey)

const automaticObservation = (
  destination: 'Google Search' | 'Google Maps' | 'Bing Search' | 'DuckDuckGo',
): SearchDestinationObservation => {
  const policy = destination === 'Google Search' ? 'google_search' as const
    : destination === 'Bing Search' ? 'bing_search' as const
      : destination === 'DuckDuckGo' ? 'duckduckgo_search' as const : undefined
  const assessment = assessBusinessCandidates([{
    id: `mary-${destination}`, kind: 'structured_entity', sourceType: destination === 'Google Maps' ? 'local_place' : 'knowledge_panel',
    fields: { name: profile.businessName, website: profile.website, address: '15575 Northline Rd, Southgate, MI 48195' }, evidence: [],
  }], profile, profileState, 'brand', { automaticIdentityPolicy: policy })
  assert.equal(assessment.automaticObservation, true, `${destination} remains automatically verifiable`)
  return normalizeSearchDestinationObservation({
    ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'found_match', provenance: 'automated_acquisition',
    reviewed: false, observedAt, confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
    automation: {
      runId: `mary-${destination}`, state: 'evidence_captured', queryMode: 'brand', inspectedUrl: 'https://example.test/evidence',
      captures: [{ version: 1, requestedUrl: 'https://example.test/evidence', acquiredAt: observedAt, provider: 'fixture', method: 'server_fetch', outcome: 'success', confidence: 'captured', resultRegionInspected: true, notes: [] }],
      evidence: '', interpreted: true, automaticObservation: true, assessment,
    },
  }, { profile, brandPresence: true })
}
const maryBeforeApple = Object.fromEntries(searchDestinations.map((destination) => [destination,
  ['Google Search', 'Google Maps', 'Bing Search', 'DuckDuckGo'].includes(destination)
    ? automaticObservation(destination as 'Google Search' | 'Google Maps' | 'Bing Search' | 'DuckDuckGo')
    : { ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed' as const },
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const maryCockpit = salesCockpitVisibility(searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: maryBeforeApple[destination]! })), { profile, profileState })
assert.equal(maryCockpit.lookingGood.length, 4, 'Mary-shaped state retains four working automatic destinations before Apple is enabled')
assert.deepEqual(new Set(maryCockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'Yelp', 'Facebook', 'Instagram']))

const firstPartyWebsite = {
  ...JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response,
  socialProfileLinks: [realPlaceUrl],
}
assert.equal(discoverAppleMapsPlace(profile, profileState, firstPartyWebsite, {})?.source, 'first_party_website')

const baseState: AuditState = {
  profile, businessProfile: profileState, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: observedAt, reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: { 'trusted-automatic-evidence': { 'Google Search': trustworthyGoogle } },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const unavailable = (url: string, method: AcquisitionResult['method'] = 'server_fetch'): AcquisitionResult => ({
  version: 1, requestedUrl: url, acquiredAt: observedAt, provider: 'fixture-unavailable', method, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [],
})
let scanned = structuredClone(baseState)
const appleRequests: string[] = []
const run = await runVisibilityScan(scanned, {
  automationVersion: 2,
  website: async () => firstPartyWebsite,
  acquireAppleMaps: async (url) => { appleRequests.push(url); return { ...direct, requestedUrl: url } },
  acquire: async (url, method) => unavailable(url, method),
}, (update) => { scanned = update(scanned) })
assert.deepEqual(appleRequests, [parsed.canonicalUrl], 'scan priority resolves discovered explicit Place URL before API/search fallback')
const appleCheck = run.checks.find((item) => item.destination === 'Apple Maps' && item.queryMode === 'brand')!
assert.equal(appleCheck.captures[0].applePlaceDiscovery?.source, 'first_party_website')
assert.equal(appleCheck.captures[0].applePlaceDiscovery?.placeId, 'I5420B8793429BEE8')
assert.equal(appleCheck.assessment?.automaticObservation, true)

let fallbackState = structuredClone(baseState)
const fallbackRequests: string[] = []
const shellCapture: AcquisitionResult = { ...idOnly, requestedUrl: parsed.canonicalUrl }
const fallbackRun = await runVisibilityScan(fallbackState, {
  automationVersion: 2,
  website: async () => ({ ...firstPartyWebsite, socialProfileLinks: [] }),
  acquireAppleMaps: async (url) => {
    fallbackRequests.push(url)
    return fallbackRequests.length === 1 ? shellCapture : { ...direct, requestedUrl: url, provider: 'apple-maps-server-api' }
  },
  acquire: async (url, method) => unavailable(url, method),
}, (update) => { fallbackState = update(fallbackState) })
assert.equal(fallbackRequests.length, 2, 'an insufficient explicit Place response gets one Server API/public-search fallback')
assert.equal(fallbackRequests[0], parsed.canonicalUrl)
assert.match(fallbackRequests[1], /^https:\/\/maps\.apple\.com\/\?q=/)
assert.equal(fallbackRun.checks.find((item) => item.destination === 'Apple Maps' && item.queryMode === 'brand')?.assessment?.automaticObservation, true)

console.log('Apple Maps place discovery PASS: canonical Place identity, provenance, one bounded public resolution, unchanged strong matching, deterministic fallback order, and Place-ID-only neutrality.')
