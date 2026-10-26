import assert from 'node:assert/strict'
import type { AuditState, BusinessProfileState, FixItem, SearchDestinationObservation } from '../src/types/audit.ts'
import { buildBrandPresenceVerification } from '../src/utils/brandPresenceVerification.ts'
import { customerReviewKey } from '../src/utils/customerScan.ts'
import {
  buildCustomerLocalPresencePublication,
  customerLocalPresenceCandidate,
  normalizeCustomerLocalPresencePublication,
  projectCustomerLocalPresence,
} from '../src/utils/customerLocalPresence.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { buildWorkspaceFile, parseWorkspaceFile, serializeWorkspaceFile, workspaceRecordFromState } from '../src/utils/workspaceFile.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const reviewedAt = '2026-10-11T16:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver',
  primaryCategory: 'Montessori school',
  website: 'http://www.montessoridownriver.com/',
  streetAddress: '15575 Northline Road',
  city: 'Southgate',
  state: 'MI',
  zip: '48195',
})
const reviewed = (value: string) => ({
  value,
  source: 'operator_entered',
  recordedAt: reviewedAt,
  confidence: 'high' as const,
  status: 'operator_reviewed' as const,
})
const businessProfile: BusinessProfileState = {
  schemaVersion: 1,
  values: {
    businessName: reviewed(profile.businessName),
    primaryCategory: reviewed(profile.primaryCategory),
    website: reviewed(profile.website),
    streetAddress: reviewed(profile.streetAddress),
    city: reviewed(profile.city),
    state: reviewed(profile.state),
    zip: reviewed(profile.zip),
  },
}

const makeState = (): AuditState => ({
  profile: structuredClone(profile),
  businessProfile: structuredClone(businessProfile),
  checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: reviewedAt, reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})

const finding = (id: string, issue: string): FixItem => ({
  id,
  priority: 'Medium',
  area: 'Website',
  sourceArea: id === 'website-schema' ? 'ai_geo_readiness' : 'website',
  issue,
  fix: `Correct ${issue}.`,
  status: 'fail',
  evidenceSummary: `Approved evidence for ${issue}.`,
  whyItMatters: `${issue} matters locally.`,
  verificationMethod: `Verify ${issue}.`,
  salesPackageFit: 'starter',
  reviewed: true,
})
const fixes = [
  finding('website-local-content', 'Make your location clearer on the homepage'),
  finding('website-schema', 'Help search and AI understand your school'),
]

const googleMapsObservation = (state: AuditState, url: string): SearchDestinationObservation => {
  const base: SearchDestinationObservation = {
    ...defaultSearchDestinationObservation('Google Maps', state.profile.businessName),
    overallResult: 'found_match',
    observedResultTypes: ['knowledge_panel'],
    observedAt: reviewedAt,
    canonicalProfileUrl: url,
    evidenceNotes: 'The Maps listing matched the reviewed business identity.',
    reviewed: true,
  }
  const decision = buildBrandPresenceVerification(base, state.profile, state.businessProfile, {
    outcome: 'found_correct',
    operatorObservedUrl: url,
    reviewedAt,
  })
  assert(decision.ok)
  return { ...base, operatorVerification: decision.verification }
}

const state = makeState()
state.searchDestinationObservations = {
  'search-brand-canonical': {
    'Google Maps': googleMapsObservation(state, 'https://www.google.com/maps/place/Montessori+Center+of+Downriver/'),
  },
}
for (const fix of fixes) state.customerFindingReviews = {
  ...state.customerFindingReviews,
  [fix.id]: customerReviewKey(state, fix),
}

const historicalReview = buildCustomerVisibilityReviewExport(state, [], fixes)
assert.equal(historicalReview.localPresence, undefined, 'verified evidence never publishes without a separate operator decision')
assert.equal(historicalReview.reviewVersion, '1.0')
assert.deepEqual(Object.keys(historicalReview), [
  'reviewVersion', 'business', 'overall', 'scanAreas', 'verifiedStrengths', 'confirmedIssues', 'needsReview',
  'recommendedPackage', 'additionalRecommendedWork',
], 'the existing v1.0 structure is unchanged when local presence is unapproved')

const candidate = customerLocalPresenceCandidate(state)
assert(candidate)
assert.equal(candidate.address.display, '15575 Northline Road, Southgate, MI, 48195')
assert.equal(candidate.listings.length, 1)
assert.equal(candidate.listings[0].platform, 'Google Maps')

state.customerLocalPresencePublication = buildCustomerLocalPresencePublication(state, {
  includeAddress: false,
  listings: { 'Google Maps': { include: true, includeProfileUrl: false } },
  relatedFindingIds: [],
}, reviewedAt)
const projected = projectCustomerLocalPresence(state, fixes.map((fix) => fix.id))
assert(projected)
assert.equal(projected.locations[0].address, undefined, 'an unapproved address stays private')
assert.equal(projected.locations[0].listings?.[0].platform, 'Google Maps')
assert.equal(projected.locations[0].listings?.[0].profileUrl, undefined, 'verified presence does not implicitly approve its URL')

state.customerLocalPresencePublication = buildCustomerLocalPresencePublication(state, {
  includeAddress: true,
  listings: { 'Google Maps': { include: true, includeProfileUrl: true } },
  relatedFindingIds: fixes.map((fix) => fix.id),
}, reviewedAt)
const approvedReview = buildCustomerVisibilityReviewExport(state, [], fixes)
assert(approvedReview.localPresence)
const location = approvedReview.localPresence.locations[0]
assert.equal(location.id, 'primary')
assert.equal(location.label, profile.businessName)
assert.equal(location.address?.streetAddress, profile.streetAddress)
assert.equal(location.address?.verification.source, 'Operator-reviewed business profile')
assert.equal(location.listings?.[0].profileUrl, 'https://www.google.com/maps/place/Montessori+Center+of+Downriver/')
assert.deepEqual(location.relatedFindingIds, ['website-local-content', 'website-schema'])
assert.equal('coordinates' in location, false, 'coordinates are never inferred or generated')

const serialized = serializeCustomerVisibilityReview(approvedReview)
for (const forbidden of ['evidenceKey', 'locationEvidenceKey', 'provider', 'fingerprint', 'operator_entered', 'operatorVerification', 'captures']) {
  assert.equal(serialized.includes(forbidden), false, `customer output must omit internal ${forbidden}`)
}

const record = workspaceRecordFromState(state, { id: 'workspace-local-presence', now: reviewedAt })
const workspaceJson = serializeWorkspaceFile(record, reviewedAt)
const opened = parseWorkspaceFile(workspaceJson)
assert(opened.ok)
assert.deepEqual(opened.scan.payload?.customerLocalPresencePublication, state.customerLocalPresencePublication, 'workspace Save/Open retains publication decisions')
assert.deepEqual(normalizeCustomerLocalPresencePublication(opened.scan.payload?.customerLocalPresencePublication), state.customerLocalPresencePublication, 'application normalization retains a valid publication decision')
assert.equal(parseWorkspaceFile(JSON.stringify({ ...buildWorkspaceFile(record, reviewedAt), scan: { ...record, payload: { ...record.payload, customerLocalPresencePublication: undefined } } })).ok, true, 'historical workspaces without publication state remain compatible')

const changed = structuredClone(state)
changed.profile.streetAddress = '200 Changed Address'
changed.businessProfile.values.streetAddress = reviewed('200 Changed Address')
assert.equal(projectCustomerLocalPresence(changed, fixes.map((fix) => fix.id)), undefined, 'materially changed location evidence cannot inherit publication approval')
assert(changed.customerLocalPresencePublication, 'the prior decision remains preserved for operator reconciliation')

const changedListing = structuredClone(state)
const changedObservation = changedListing.searchDestinationObservations['search-brand-canonical']?.['Google Maps']
assert(changedObservation)
changedObservation.canonicalProfileUrl = 'https://www.google.com/maps/place/Changed+Listing/'
const listingReconciliation = projectCustomerLocalPresence(changedListing, fixes.map((fix) => fix.id))
assert(listingReconciliation)
assert(listingReconciliation.locations[0].address, 'unchanged approved address remains publishable')
assert.equal(listingReconciliation.locations[0].listings, undefined, 'materially changed listing evidence cannot inherit URL or presence approval')
assert(changedListing.customerLocalPresencePublication?.listings['Google Maps'], 'the prior listing decision remains stored for reconciliation')

console.log('Customer Local Presence PASS: explicit publication, address and URL separation, approved finding links, stale-evidence invalidation, workspace compatibility, no coordinates, and no internal evidence leakage.')
