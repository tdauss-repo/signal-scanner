import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { acquireInstagramProfile, instagramRequestHeaders, normalizeInstagramProfileCandidates } from '../server/instagramProfile.ts'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfile, BusinessProfileField, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import type { BusinessResultCandidate, SearchEntityAssessment } from '../src/types/entityMatch.ts'
import type { WebsiteAuditResult } from '../src/types/websiteAudit.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildBrandPresenceVerification } from '../src/utils/brandPresenceVerification.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { canonicalMetaProfileUrl } from '../src/utils/metaPublicEvidence.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, searchDestinations } from '../src/utils/searchVisibility.ts'
import { discoverSocialProfile } from '../src/utils/socialProfileDiscovery.ts'
import { destinationAcquisitionRoute } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })

const observedAt = '2026-09-30T18:00:00.000Z'
const instagramUrl = 'https://www.instagram.com/montessoridownriver'
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
const websiteFixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response as WebsiteAuditResult
const website: WebsiteAuditResult = { ...websiteFixture, socialProfileLinks: [
  'https://www.facebook.com/MontessoriCenterOfDownriver/',
  'https://www.instagram.com/montessoridownriver/?igsh=tracking#footer',
] }
const profileHtml = readFileSync(new URL('./fixtures/instagram-profile-montessori.html', import.meta.url), 'utf8')
assert.match(instagramRequestHeaders['user-agent'], /Mozilla\/5\.0/)
assert.match(instagramRequestHeaders.accept, /text\/html/)
assert.match(instagramRequestHeaders['accept-language'], /en-US/)
assert.equal('cookie' in instagramRequestHeaders, false)
const candidate = (id: string, fields: BusinessResultCandidate['fields'], resultUrl = instagramUrl): BusinessResultCandidate => ({
  id, kind: 'structured_entity', sourceType: 'local_place', resultUrl, fields, evidence: [],
})
const assess = (candidates: BusinessResultCandidate[]) => assessBusinessCandidates(candidates, profile, profileState, 'brand', { automaticIdentityPolicy: 'instagram' })

assert.equal(canonicalMetaProfileUrl('Instagram', 'https://instagram.com/montessoridownriver/?igsh=x#noise'), instagramUrl)
for (const route of ['explore', 'accounts', 'reel', 'p', 'stories', 'direct']) {
  assert.equal(canonicalMetaProfileUrl('Instagram', `https://www.instagram.com/${route}/anything`), '', `${route} is not a profile route`)
}
const websiteDiscovery = discoverSocialProfile('Instagram', profile.businessName, website, {})
assert.equal(websiteDiscovery?.profileUrl, instagramUrl)
assert.equal(websiteDiscovery?.source, 'first_party_website')
assert.match(websiteDiscovery?.evidenceKey || '', /found-local-social-profile-discovery-v1/)
assert.equal(discoverSocialProfile('Instagram', profile.businessName, { ...website, socialProfileLinks: ['https://www.instagram.com/explore/'] }, {}), undefined)
assert.equal(discoverSocialProfile('Instagram', profile.businessName, { ...website, socialProfileLinks: [] }, {}), undefined, 'icon-only/no-href evidence cannot discover a profile')
assert.equal(discoverSocialProfile('Instagram', profile.businessName, undefined, {}), undefined, 'business names never generate guessed Instagram handles')
assert.equal(discoverSocialProfile('Instagram', profile.businessName, undefined, {}, [instagramUrl])?.source, 'reviewed_business_profile')

const nameDomain = assess([candidate('name-domain', { name: profile.businessName, website: 'https://montessoridownriver.com/', publicProfileUrl: instagramUrl })])
assert.equal(nameDomain.instagramIdentityDecision?.decision, 'verified')
assert.equal(nameDomain.automaticObservation, true)
assert.equal(assess([candidate('name-address', { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195', publicProfileUrl: instagramUrl })]).instagramIdentityDecision?.decision, 'verified')
assert.equal(assess([candidate('name-only', { name: profile.businessName, publicProfileUrl: instagramUrl })]).instagramIdentityDecision?.decision, 'review_required')
const conflict = assess([candidate('conflict', { name: profile.businessName, website: 'https://unrelated-school.example/', publicProfileUrl: instagramUrl })])
assert.equal(conflict.instagramIdentityDecision?.decision, 'review_required')
assert.equal(conflict.blocker, 'identifier_conflict')

const normalized = normalizeInstagramProfileCandidates(profileHtml, instagramUrl, observedAt)
assert(normalized.some((item) => item.fields.name === profile.businessName && item.fields.website === 'http://www.montessoridownriver.com/'))
assert(normalized.every((item) => item.fields.publicProfileUrl === instagramUrl))
assert(normalized.every((item) => !Object.keys(item.fields).some((field) => /follower|like|post/i.test(field))), 'engagement counts are never normalized into identity fields')
const publicCapture = await acquireInstagramProfile(`${instagramUrl}/?igsh=tracking`, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: profileHtml }),
})
assert.equal(publicCapture.provider, 'instagram-native-fetch')
assert.equal(publicCapture.method, 'server_fetch')
assert.equal(publicCapture.outcome, 'success')
const verified = assessSearchCapture(publicCapture, profile, profileState, 'Instagram', 'brand')
assert.equal(verified.instagramIdentityDecision?.decision, 'verified')
assert.equal(verified.operatorReviewRequired, false)

const loginCapture = await acquireInstagramProfile(instagramUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: '<html><body>Log in to Instagram</body></html>' }),
})
assert.equal(loginCapture.outcome, 'blocked')
assert.equal(loginCapture.blocker, 'login_required')
const deniedCapture = await acquireInstagramProfile(instagramUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 403, finalUrl: url.href, body: 'Access denied' }),
})
assert.equal(deniedCapture.outcome, 'blocked')
assert.equal(deniedCapture.blocker, 'access_restricted')
const loginRedirect = await acquireInstagramProfile(instagramUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 302, finalUrl: url.href, location: 'https://www.instagram.com/accounts/login/', body: '' }),
})
assert.equal(loginRedirect.blocker, 'login_required')
const consentCapture = await acquireInstagramProfile(instagramUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: '<html><body>Consent required before you continue</body></html>' }),
})
assert.equal(consentCapture.blocker, 'access_restricted')

const searchAssessment = assessBusinessCandidates([candidate('instagram-search-link', {
  name: profile.businessName, website: profile.website, publicProfileUrl: instagramUrl,
})], profile, profileState, 'brand', { automaticIdentityPolicy: 'google_search' })
const searchObservation: SearchDestinationObservation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName), overallResult: 'found_match', provenance: 'automated_acquisition',
  reviewed: false, observedAt, confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
  automation: { runId: 'search-discovery', state: 'evidence_captured', queryMode: 'brand', inspectedUrl: 'https://www.google.com/search?q=montessori', captures: [], evidence: '', interpreted: true, automaticObservation: true, assessment: searchAssessment },
}, { profile, brandPresence: true })
assert.equal(discoverSocialProfile('Instagram', profile.businessName, undefined, { brand: { 'Google Search': searchObservation } })?.source, 'search_evidence')

const observation = (assessment: SearchEntityAssessment, capture: AcquisitionResult, discovery = true): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Instagram', profile.businessName),
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed', provenance: 'automated_acquisition', observedAt,
  reviewed: false, confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceKind: assessment.matches.length ? 'external_observation' : capture.outcome === 'success' || capture.outcome === 'partial' ? 'unable_to_verify' : 'acquisition_failure',
  canonicalProfileUrl: discovery ? instagramUrl : undefined,
  automation: { runId: 'instagram-brand-run', state: assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured', queryMode: 'brand',
    inspectedUrl: discovery ? instagramUrl : capture.requestedUrl, captures: [{ ...capture, ...(discovery && websiteDiscovery ? { profileDiscovery: websiteDiscovery } : {}) }],
    evidence: 'Bounded Instagram public evidence.', interpreted: assessment.automaticObservation, automaticObservation: assessment.automaticObservation, assessment },
}, { profile, brandPresence: true })

const instagram = observation(verified, publicCapture)
const projected = projectSalesVisibility(instagram, { profile, profileState })
assert.equal(projected.headline, 'Verified automatically')
assert.equal(projected.operatorReviewRequired, false)
assert.equal(projected.automationSummary, 'Verified from acquired Instagram evidence')
assert.equal(projected.knownProfileUrl, instagramUrl)
assert.equal(brandPresenceEvidenceSummary(instagram, projected).source, 'First-party business website')

for (const capture of [loginCapture, deniedCapture]) {
  const blocked = observation(assessSearchCapture(capture, profile, profileState, 'Instagram', 'brand'), capture)
  const blockedProjection = projectSalesVisibility(blocked, { profile, profileState })
  assert.equal(blockedProjection.headline, 'Profile discovered — verification needed')
  assert.equal(blockedProjection.state, 'profile_discovered')
  assert.match(blockedProjection.explanation, /could not verify enough public profile details/i)
}
assert.equal(projectSalesVisibility(observation(conflict, publicCapture), { profile, profileState }).state, 'conflicting_evidence')

const noDiscoveryCapture: AcquisitionResult = { version: 1, requestedUrl: profile.website, acquiredAt: observedAt, provider: 'instagram-profile-discovery', method: 'server_fetch', requestAttempted: false,
  outcome: 'partial', confidence: 'unavailable', resultRegionInspected: true, blocker: 'no_match', notes: ['No explicit profile URL discovered.'] }
const noDiscoveryAssessment = assessSearchCapture(noDiscoveryCapture, profile, profileState, 'Instagram', 'brand')
assert.equal(assessSearchCapture(noDiscoveryCapture, profile, profileState, 'Instagram', 'location').visibilityResult, 'review_required', 'Instagram no-match is never automatic absence')
const noDiscovery = observation(noDiscoveryAssessment, noDiscoveryCapture, false)
assert.equal(projectSalesVisibility(noDiscovery, { profile, profileState }).headline, 'Verification needed')
assert.equal(projectSalesVisibility(noDiscovery, { profile, profileState }).knownProfileUrl, undefined)

const blocked = observation(assessSearchCapture(loginCapture, profile, profileState, 'Instagram', 'brand'), loginCapture)
const operatorFallback = buildBrandPresenceVerification(blocked, profile, profileState, { outcome: 'found_correct', reviewedAt: observedAt })
assert.equal(operatorFallback.ok, true)
assert.equal(projectSalesVisibility({ ...blocked, operatorVerification: operatorFallback.ok ? operatorFallback.verification : undefined }, { profile, profileState }).state, 'verified_by_operator')

assert.equal(destinationAcquisitionRoute('Instagram', 'brand'), 'instagram_native_profile')
assert.equal(destinationAcquisitionRoute('Facebook', 'brand'), 'facebook_native_page', 'Facebook route remains unchanged')
const facebookDecision = assessBusinessCandidates([candidate('facebook', { name: profile.businessName, website: profile.website, publicProfileUrl: 'https://www.facebook.com/MontessoriCenterOfDownriver' }, 'https://www.facebook.com/MontessoriCenterOfDownriver')], profile, profileState, 'brand', { automaticIdentityPolicy: 'facebook' })
assert.equal(facebookDecision.facebookIdentityDecision?.decision, 'verified', 'Facebook matcher behavior remains unchanged')

const state = (): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {},
  voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const compatibleVerified = (destination: SearchDestination): SearchDestinationObservation => ({ ...unresolved(destination), overallResult: 'found_match', reviewed: true })
const destinations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Instagram' ? instagram : ['Google Search', 'Google Maps', 'Bing Search', 'DuckDuckGo'].includes(destination) ? compatibleVerified(destination) : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const cockpit = salesCockpitVisibility(searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: destinations[destination]! })), { profile, profileState })
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'Yelp', 'Facebook']))
assert.equal(cockpit.deeperReview.length, 3, 'verified Instagram reduces the neutral count by one')

const auditState: AuditState = { ...state(), searchDestinationObservations: { 'search-brand-canonical': destinations } }
const strength = customerStrengthCandidates(auditState, []).find((item) => item.id === 'search:Instagram')
assert.equal(strength?.defaultSummary, 'We verified that Montessori Center of Downriver has an Instagram business presence matching the reviewed business information.')
const blockedState: AuditState = { ...state(), searchDestinationObservations: { 'search-brand-canonical': { Instagram: blocked } } }
assert.equal(customerStrengthCandidates(blockedState, []).some((item) => item.id === 'search:Instagram'), false, 'profile-discovered evidence is not strength eligible')
const customer = buildCustomerVisibilityReviewExport(auditState, [], [])
assert.equal(customer.needsReview.includes('Instagram'), false)
assert.deepEqual(new Set(customer.needsReview), new Set(['Apple Maps', 'Yelp', 'Facebook']))
assert(customer.verifiedStrengths.some((item) => item.title === 'Instagram'))
const customerJson = serializeCustomerVisibilityReview(customer)
for (const internal of ['instagram-native-fetch', 'instagramIdentityDecision', 'profileDiscovery', 'matchedSignals', 'login_required', instagramUrl, 'acquisition_not_configured']) assert.equal(customerJson.includes(internal), false)

const markup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { Instagram: instagram } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
const start = markup.indexOf('<summary>Instagram — Verified automatically</summary>')
assert(start >= 0)
const instagramMarkup = markup.slice(start)
assert(instagramMarkup.includes('Verified from acquired Instagram evidence'))
assert(instagramMarkup.includes('No operator action required.'))
assert(instagramMarkup.includes('Open Instagram profile'))
assert(instagramMarkup.includes('View evidence'))
assert.equal(instagramMarkup.includes('aria-label="Instagram assisted verification"'), false)

console.log('Instagram automatic verification PASS: explicit website/search discovery, no guessed handle, bounded public metadata, strong identity threshold, conflict/access neutrality, profile-discovered fallback, operator fallback, strength/count/customer boundary, and unchanged Facebook behavior.')
