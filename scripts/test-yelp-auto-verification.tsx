import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { acquireYelpSearch, canonicalYelpBusinessUrl, normalizeYelpHtmlCandidates, yelpRequestHeaders } from '../server/yelpSearch.ts'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfile, BusinessProfileField, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import type { BusinessResultCandidate, SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildBrandPresenceVerification } from '../src/utils/brandPresenceVerification.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, searchDestinations, yelpBrandSearchUrl } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })

const observedAt = '2026-09-29T18:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool', secondaryCategories: 'Montessori School, Kindergarten',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195',
  phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const reviewed = (value: BusinessProfile): BusinessProfileState => {
  const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'secondaryCategories', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
  return { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
    value: value[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: observedAt,
  }])) as BusinessProfileState['values'] }
}
const profileState = reviewed(profile)
const verificationUrl = yelpBrandSearchUrl(profile)
const searchHtml = readFileSync(new URL('./fixtures/yelp-search-montessori.html', import.meta.url), 'utf8')
const profileHtml = readFileSync(new URL('./fixtures/yelp-profile-montessori.html', import.meta.url), 'utf8')
const candidate = (id: string, fields: BusinessResultCandidate['fields'], resultUrl?: string): BusinessResultCandidate => ({
  id, kind: 'structured_entity', sourceType: 'local_place', ...(resultUrl ? { resultUrl } : {}), fields, evidence: [],
})
const assess = (candidates: BusinessResultCandidate[]) => assessBusinessCandidates(candidates, profile, profileState, 'brand', { automaticIdentityPolicy: 'yelp' })

assert.equal(new URL(verificationUrl).searchParams.get('find_desc'), profile.businessName)
assert.equal(new URL(verificationUrl).searchParams.get('find_loc'), 'Southgate, MI 48195')
assert.equal(yelpRequestHeaders['accept-language'], 'en-US,en;q=0.9')
assert.equal(canonicalYelpBusinessUrl('https://www.yelp.com/biz/montessori-center-of-downriver-southgate?utm_source=x'), 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate')
assert.equal(canonicalYelpBusinessUrl('https://example.com/biz/montessori'), '')

assert.equal(assess([candidate('name-address', { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195' })]).yelpIdentityDecision?.decision, 'verified')
assert.equal(assess([candidate('name-phone', { name: profile.businessName, phone: '(734) 282-6465' })]).yelpIdentityDecision?.decision, 'verified')
assert.equal(assess([candidate('name-site', { name: profile.businessName, website: 'https://montessoridownriver.com/' })]).yelpIdentityDecision?.decision, 'verified')
assert.equal(assess([candidate('name-only', { name: profile.businessName, publicProfileUrl: 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate' })]).yelpIdentityDecision?.decision, 'review_required')
const conflicting = assess([candidate('conflict', { name: profile.businessName, phone: '313-555-0100', address: '15575 Northline Rd, Southgate, MI 48195' })])
assert.equal(conflicting.yelpIdentityDecision?.decision, 'review_required')
assert.equal(conflicting.blocker, 'identifier_conflict')

const requests: string[] = []
const capture = await acquireYelpSearch(verificationUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => {
    requests.push(url.href)
    return url.pathname === '/search'
      ? { status: 200, finalUrl: url.href, body: searchHtml }
      : { status: 200, finalUrl: url.href, body: profileHtml }
  },
})
assert.deepEqual(requests.map((value) => new URL(value).pathname), ['/search', '/biz/montessori-center-of-downriver-southgate'], 'search follows exactly one approved Yelp business profile')
assert.equal(capture.provider, 'yelp-native-fetch')
assert.equal(capture.method, 'server_fetch')
assert.equal(capture.outcome, 'success')
assert.equal(capture.profileFollow?.used, true)
assert.equal(capture.profileFollow?.outcome, 'success')
assert.equal(capture.normalizedSearchCandidates?.some((item) => item.fields.publicProfileUrl === 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate'), true)
const verified = assessSearchCapture(capture, profile, profileState, 'Yelp', 'brand')
assert.equal(verified.yelpIdentityDecision?.decision, 'verified')
assert.equal(verified.automaticObservation, true)
assert.equal(verified.operatorReviewRequired, false)

const searchOnlyHtml = `<html><body><main data-testid="search-results"><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'School', name: profile.businessName,
  address: { '@type': 'PostalAddress', streetAddress: '15575 Northline Rd', addressLocality: 'Southgate', addressRegion: 'MI', postalCode: '48195' },
})}</script></main></body></html>`
let searchOnlyRequests = 0
const searchOnlyCapture = await acquireYelpSearch(verificationUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => { searchOnlyRequests += 1; return { status: 200, finalUrl: url.href, body: searchOnlyHtml } },
})
assert.equal(searchOnlyRequests, 1, 'strong search-page structured identity does not require profile enrichment')
assert.equal(assessSearchCapture(searchOnlyCapture, profile, profileState, 'Yelp', 'brand').yelpIdentityDecision?.decision, 'verified')

const parsedProfile = normalizeYelpHtmlCandidates(profileHtml, 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate', observedAt, 'profile')
assert(parsedProfile.some((item) => item.fields.phone === '+1 734-282-6465'))
assert(parsedProfile.some((item) => item.fields.website === 'https://montessoridownriver.com/'))
assert.equal(parsedProfile.some((item) => /5\.0|review/i.test(JSON.stringify(item.fields))), false, 'rating and review text are not identity fields')

const noMatchHtml = '<html><body><main data-testid="search-results"><h2><a href="/biz/generic-montessori-detroit">Generic Montessori Resources</a></h2></main></body></html>'
const noMatchCapture = await acquireYelpSearch(verificationUrl, { verifyDns: async () => undefined, transport: async (url) => ({ status: 200, finalUrl: url.href, body: noMatchHtml }) })
const noMatch = assessSearchCapture(noMatchCapture, profile, profileState, 'Yelp', 'brand')
assert.equal(noMatch.visibilityResult, 'review_required')
assert.equal(noMatch.operatorReviewRequired, true)
assert.equal(noMatch.blocker, 'no_match')
assert.notEqual(noMatch.visibilityResult, 'not_found')

const restrictedCapture = await acquireYelpSearch(verificationUrl, { verifyDns: async () => undefined, transport: async (url) => ({ status: 403, finalUrl: url.href, body: 'Access denied' }) })
assert.equal(restrictedCapture.outcome, 'blocked')
assert.equal(restrictedCapture.blocker, 'access_restricted')
assert.equal(assessSearchCapture(restrictedCapture, profile, profileState, 'Yelp', 'brand').visibilityResult, 'unavailable')

const observation = (assessment: SearchEntityAssessment, source: AcquisitionResult = capture): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Yelp', profile.businessName), verificationUrl,
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed', provenance: 'automated_acquisition', observedAt,
  reviewed: false, confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceKind: assessment.matches.length ? 'external_observation' : source.outcome === 'success' ? 'unable_to_verify' : 'acquisition_failure',
  observedResultUrl: assessment.selected?.candidate.resultUrl,
  canonicalProfileUrl: assessment.selected?.candidate.fields.publicProfileUrl,
  automation: { runId: 'yelp-brand-run', state: assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured', queryMode: 'brand',
    inspectedUrl: verificationUrl, captures: [source], evidence: 'Bounded Yelp public evidence.', interpreted: assessment.automaticObservation,
    automaticObservation: assessment.automaticObservation, assessment },
}, { profile, brandPresence: true })
const yelp = observation(verified)
const projected = projectSalesVisibility(yelp, { profile, profileState })
assert.equal(projected.headline, 'Verified automatically')
assert.equal(projected.operatorReviewRequired, false)
assert.equal(projected.automationSummary, 'Verified from acquired Yelp evidence')
assert.equal(projected.identitySummary, 'Matches reviewed business details')
assert.equal(projected.canonicalProfileUrl, 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate')
const detail = brandPresenceEvidenceSummary(yelp, projected)
assert.equal(detail.decision, 'Verified automatically')
assert(detail.identityEvidence?.some((item) => item.label === 'Phone'))
assert.equal(projectSalesVisibility(observation(conflicting), { profile, profileState }).state, 'conflicting_evidence')
assert.equal(projectSalesVisibility(observation(noMatch, noMatchCapture), { profile, profileState }).state, 'manual_verification_needed')
assert.equal(projectSalesVisibility(observation(assessSearchCapture(restrictedCapture, profile, profileState, 'Yelp', 'brand'), restrictedCapture), { profile, profileState }).headline, 'Automated check unavailable — verification needed')

const explicitAbsenceBase = observation(noMatch, noMatchCapture)
const explicitAbsence = buildBrandPresenceVerification(explicitAbsenceBase, profile, profileState, { outcome: 'not_found', reviewedAt: observedAt })
assert.equal(explicitAbsence.ok, true)
assert.equal(projectSalesVisibility({ ...explicitAbsenceBase, operatorVerification: explicitAbsence.ok ? explicitAbsence.verification : undefined }, { profile, profileState }).state, 'operator_not_found')

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const compatibleVerified = (destination: SearchDestination): SearchDestinationObservation => ({ ...unresolved(destination), overallResult: 'found_match', reviewed: true })
const destinations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Yelp' ? yelp : ['Google Search', 'Google Maps', 'Bing Search', 'DuckDuckGo'].includes(destination) ? compatibleVerified(destination) : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const cockpit = salesCockpitVisibility(searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: destinations[destination]! })), { profile, profileState })
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'Facebook', 'Instagram']))
assert.equal(cockpit.deeperReview.length, 3)

const state: AuditState = {
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': destinations },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const strength = customerStrengthCandidates(state, []).find((item) => item.id === 'search:Yelp')
assert(strength)
assert.equal(strength.defaultSummary, 'We verified that Montessori Center of Downriver has a Yelp listing matching the reviewed business information.')
const customer = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(customer.needsReview.includes('Yelp'), false)
assert.equal(customer.needsReview.includes('Apple Maps'), true)
assert(customer.verifiedStrengths.some((item) => item.title === 'Yelp'))
const customerJson = serializeCustomerVisibilityReview(customer)
for (const internal of ['yelp-native-fetch', 'yelpIdentityDecision', 'matchedSignals', 'profileFollow', '/biz/', 'access_restricted']) assert.equal(customerJson.includes(internal), false)

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { Yelp: yelp } }} onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
const start = markup.indexOf('<summary>Yelp — Verified automatically</summary>')
const end = markup.indexOf('<summary>Facebook —', start)
assert(start >= 0)
const yelpMarkup = markup.slice(start, end)
assert(yelpMarkup.includes('Verified from acquired Yelp evidence'))
assert(yelpMarkup.includes('No operator action required.'))
assert(yelpMarkup.includes('Open known profile'))
assert.equal(yelpMarkup.includes('aria-label="Yelp assisted verification"'), false)

console.log('Yelp automatic verification PASS: bounded search/profile acquisition, structured identity, conflict/restriction/no-match neutrality, UI, three-destination neutral count, strength eligibility, and customer boundary.')
