import assert from 'node:assert/strict'
import type {
  AuditState,
  BusinessProfile,
  BusinessProfileField,
  BusinessProfileState,
  SearchDestination,
  SearchDestinationObservation,
} from '../src/types/audit.ts'
import type { BusinessResultCandidate } from '../src/types/entityMatch.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { evidenceFingerprint } from '../src/utils/evidenceFingerprint.ts'
import { assessBusinessCandidates, matchBusinessCandidate, normalizedEntityField } from '../src/utils/entityMatcher.ts'
import { googleBrandBusinessIdentityKey } from '../src/utils/googleAcquisitionResilience.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, searchDestinations } from '../src/utils/searchVisibility.ts'
import { scanProfileKey } from '../src/utils/visibilityScanState.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const observedAt = new Date().toISOString()
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool',
  secondaryCategories: 'Montessori School, Kindergarten', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465',
  website: 'http://www.montessoridownriver.com/',
})
const reviewedState = (value: BusinessProfile): BusinessProfileState => {
  const fields: BusinessProfileField[] = [
    'businessName', 'primaryCategory', 'secondaryCategories', 'streetAddress',
    'city', 'state', 'zip', 'phone', 'website',
  ]
  return {
    schemaVersion: 1,
    values: Object.fromEntries(fields.map((field) => [field, {
      value: value[field], source: 'fixture review', confidence: 'high',
      status: 'operator_reviewed', recordedAt: observedAt,
    }])) as BusinessProfileState['values'],
  }
}
const profileState = reviewedState(profile)

const suffixes = [
  ['Road', 'Rd'], ['Street', 'St'], ['Avenue', 'Ave'], ['Boulevard', 'Blvd'],
  ['Drive', 'Dr'], ['Lane', 'Ln'], ['Court', 'Ct'], ['Circle', 'Cir'],
  ['Parkway', 'Pkwy'], ['Highway', 'Hwy'], ['Trail', 'Trl'], ['Terrace', 'Ter'], ['Place', 'Pl'],
] as const
for (const [long, short] of suffixes) {
  assert.equal(
    normalizedEntityField('streetAddress', `15575 Northline ${long}`),
    normalizedEntityField('streetAddress', `15575 Northline ${short}.`),
    `${long} and ${short} are equivalent only after bounded suffix normalization`,
  )
}
assert.equal(
  normalizedEntityField('address', '15575 Northline Road, Southgate, MI, 48195'),
  normalizedEntityField('address', '15575 Northline Rd, Southgate, MI 48195, United States'),
  'optional United States and comma formatting do not change identity',
)
assert.equal(
  normalizedEntityField('address', '15575 Northline Road Southgate Michigan 48195'),
  normalizedEntityField('address', '15575 Northline Rd, Southgate, MI 48195 USA'),
  'a state name and abbreviation normalize at the address tail',
)
assert.equal(
  normalizedEntityField('address', '15575 Northline Rd, Southgate, MI 48195-1234, US'),
  normalizedEntityField('address', '15575 Northline Road, Southgate, MI 48195'),
  'ZIP+4 formatting retains the same five-digit business location identity',
)

const candidateForAddress = (address: string): BusinessResultCandidate => ({
  id: `address-${address}`, kind: 'semantic_card', sourceType: 'knowledge_panel',
  fields: { name: profile.businessName, address }, evidence: [],
})
const addressResult = (address: string) => matchBusinessCandidate(candidateForAddress(address), profile, profileState, 'brand')
const isAddressMatch = (address: string) => addressResult(address).matchedFields.some((field) => field.field === 'address')
const isAddressConflict = (address: string) => addressResult(address).conflictingFields.some((field) => field.field === 'address')

assert.equal(isAddressMatch('15575 Northline Rd, Southgate, MI 48195, United States'), true, '12: the live Montessori address matches')
assert.equal(isAddressConflict('15585 Northline Rd, Southgate, MI 48195'), true, '8: a different house number conflicts')
assert.equal(isAddressConflict('15575 Northline Ave, Southgate, MI 48195'), true, '9: a materially different street suffix conflicts')
assert.equal(isAddressConflict('15575 Northline Rd, Taylor, MI 48195'), true, '10: a different city conflicts')
assert.equal(isAddressConflict('15575 Northline Rd, Southgate, OH 48195'), true, 'a different state conflicts')
assert.equal(isAddressConflict('15575 Northline Rd, Southgate, MI 48180'), true, '11: a different ZIP conflicts')

const mapsUrl = 'https://www.google.com/maps/place/Montessori+Center+of+Downriver/data=!4m2!3m1!1s0x883b37b6f519905b:0x4e6922460f4e86cc'
const knowledgePanel: BusinessResultCandidate = {
  id: 'mary-live-knowledge-panel', kind: 'semantic_card', sourceType: 'knowledge_panel', resultUrl: mapsUrl,
  fields: {
    name: profile.businessName,
    phone: '+1 734-282-6465',
    address: '15575 Northline Rd, Southgate, MI 48195, United States',
    category: 'Preschool in Southgate, Michigan',
    placeIdentity: '0x883b37b6f519905b:0x4e6922460f4e86cc',
    publicProfileUrl: mapsUrl,
  },
  evidence: [],
}
const assessment = assessBusinessCandidates([knowledgePanel], profile, profileState, 'brand', {
  automaticIdentityPolicy: 'google_search',
})
assert.equal(assessment.selected?.matchedFields.some((field) => field.field === 'address'), true)
assert.equal(assessment.selected?.conflictingFields.some((field) => field.field === 'address'), false)
assert.deepEqual(new Set(assessment.googleIdentityDecision?.matchedSignals.map((field) => field.field)), new Set(['name', 'phone', 'address']))
assert.deepEqual(assessment.googleIdentityDecision?.conflictingSignals, [])
assert.equal(assessment.googleIdentityDecision?.decision, 'verified')
assert.equal(assessment.visibilityResult, 'found')
assert.equal(assessment.operatorReviewRequired, false)
assert.equal(assessment.blocker, 'none')

const google = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  overallResult: 'found_match', provenance: 'automated_acquisition', observedAt,
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation', reviewed: false,
  observedResultUrl: mapsUrl, evidenceNotes: 'Live-shaped Google knowledge-panel evidence.',
  automation: {
    runId: 'address-normalization-run', state: 'evidence_captured', queryMode: 'brand',
    businessIdentityKey: googleBrandBusinessIdentityKey(profile, profileState),
    inspectedUrl: 'https://www.google.com/search?q=Montessori+Center+of+Downriver+Southgate+MI',
    captures: [{ version: 1, provider: 'fixture-provider', method: 'server_fetch', requestedUrl: 'https://www.google.com/search?q=fixture', finalUrl: 'https://www.google.com/search?q=fixture', acquiredAt: observedAt, outcome: 'success', confidence: 'captured', notes: [] }],
    evidence: 'Normalized knowledge-panel evidence.', interpreted: true, automaticObservation: true, assessment,
  },
}, { profile, brandPresence: true })
const maps = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Maps', profile.businessName),
  overallResult: 'manual_review_needed', provenance: 'automated_acquisition', observedAt,
  confidence: 'manual_needs_confirmation', evidenceKind: 'acquisition_failure', reviewed: false,
  automation: {
    runId: 'address-normalization-run', state: 'interactive_review_required', queryMode: 'brand',
    inspectedUrl: 'https://www.google.com/maps/search/Montessori+Center+of+Downriver',
    captures: [{ version: 1, provider: 'fixture-maps-provider', method: 'server_fetch', requestedUrl: 'https://www.google.com/maps/search/fixture', finalUrl: 'https://www.google.com/maps/search/fixture', acquiredAt: observedAt, outcome: 'failed', confidence: 'unavailable', blocker: 'provider_timeout', notes: [] }],
    evidence: '', interpreted: false, automaticObservation: false,
    assessment: {
      matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable',
      operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: ['Provider timeout.'],
      blocker: 'runtime_unavailable', tier3Candidate: false,
    },
  },
}, { profile, brandPresence: true })

const googleSales = projectSalesVisibility(google, { profile, profileState })
assert.equal(googleSales.state, 'verified_correct', '13: Google Search becomes verified')
assert.equal(googleSales.operatorReviewRequired, false)
const googleDetail = brandPresenceEvidenceSummary(google, googleSales)
assert.equal(googleDetail.identityEvidence?.some((item) => item.label === 'Address' && item.result.startsWith('Matches')), true)
assert.equal(googleDetail.identityEvidence?.some((item) => item.label === 'Address' && item.result.startsWith('Conflicts')), false)

const mapsSales = projectSalesVisibility(maps, { profile, profileState, googleSearchObservation: google })
assert.equal(mapsSales.state, 'verified_correct', '14: the matching knowledge-panel Maps entity derives verification')
assert.equal(mapsSales.derivedGoogleMapsVerification?.provenance, 'derived_from_google_search')
assert.equal(mapsSales.operatorReviewRequired, false)
assert.equal(maps.automation?.assessment?.visibilityResult, 'unavailable', 'the direct Maps timeout remains recorded separately')
const mapsDetail = brandPresenceEvidenceSummary(maps, mapsSales)
assert.equal(mapsDetail.identityEvidence?.some((item) => item.label === 'Address' && item.result.startsWith('Matches')), true)

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName),
  overallResult: 'manual_review_needed', provenance: 'operator_observation', reviewed: false,
})
const observations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Google Search' ? google : destination === 'Google Maps' ? maps : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const cockpit = salesCockpitVisibility(searchDestinations.map((destination) => ({
  queryId: 'search-brand-canonical', observation: observations[destination]!,
})), { profile, profileState })
assert.equal(cockpit.deeperReview.length, 6)

const state: AuditState = {
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: { 'search-brand-canonical': observations }, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
  visibilityRuns: [{
    version: 2, id: 'address-normalization-run', profileKey: scanProfileKey(profile), profileReviewKey: evidenceFingerprint(profileState),
    startedAt: observedAt, endedAt: observedAt, status: 'completed_with_review', checks: [], businessEvidence: [],
  }],
}
const strengths = customerStrengthCandidates(state, [])
assert.deepEqual(strengths.map((strength) => strength.id), ['search:Google Search', 'search:Google Maps'])
const review = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(review.needsReview.includes('Google Search'), false)
assert.equal(review.needsReview.includes('Google Maps'), false)
assert(review.verifiedStrengths.some((strength) => strength.title === 'Google Search'))
assert(review.verifiedStrengths.some((strength) => strength.title === 'Google Maps'))
const customerJson = serializeCustomerVisibilityReview(review)
for (const internal of ['normalizedEntityField', 'derived_from_google_search', 'placeIdentity', 'fixture-provider', 'conflictingSignals']) {
  assert.equal(customerJson.includes(internal), false, `${internal} stays outside customer JSON`)
}

console.log('Address identity normalization PASS: bounded suffix/country/state/ZIP equivalence, strict material conflicts, Montessori Search and derived Maps verification, strengths, and customer boundary.')
