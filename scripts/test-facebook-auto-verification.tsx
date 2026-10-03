import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { acquireFacebookPage, normalizeFacebookPageCandidates } from '../server/facebookPage.ts'
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
import { createApplicationVisibilityScanDependencies, destinationAcquisitionRoute, runVisibilityScan, type ScanDependencies } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })

const observedAt = '2026-09-30T18:00:00.000Z'
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
const facebookUrl = 'https://www.facebook.com/MontessoriCenterOfDownriver'
const profileHtml = readFileSync(new URL('./fixtures/facebook-profile-montessori.html', import.meta.url), 'utf8')
const websiteFixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response as WebsiteAuditResult
const website: WebsiteAuditResult = { ...websiteFixture, socialProfileLinks: [
  'https://www.instagram.com/montessoridownriver/',
  'https://www.facebook.com/MontessoriCenterOfDownriver/?utm_source=footer&fbclid=tracking',
] }
const candidate = (id: string, fields: BusinessResultCandidate['fields'], resultUrl = facebookUrl): BusinessResultCandidate => ({
  id, kind: 'structured_entity', sourceType: 'local_place', resultUrl, fields, evidence: [],
})
const assess = (candidates: BusinessResultCandidate[]) => assessBusinessCandidates(candidates, profile, profileState, 'brand', { automaticIdentityPolicy: 'facebook' })

assert.equal(canonicalMetaProfileUrl('Facebook', 'https://m.facebook.com/MontessoriCenterOfDownriver/?utm_source=x&fbclid=y'), facebookUrl)
assert.equal(canonicalMetaProfileUrl('Facebook', 'https://facebook.com/search/top?q=Montessori'), '')
assert.equal(canonicalMetaProfileUrl('Facebook', 'https://instagram.com/montessoridownriver'), '')
assert.equal(canonicalMetaProfileUrl('Instagram', 'https://instagram.com/montessoridownriver/?igsh=x'), 'https://www.instagram.com/montessoridownriver')
assert.equal(discoverSocialProfile('Facebook', profile.businessName, website, {})?.profileUrl, facebookUrl)
assert.equal(discoverSocialProfile('Facebook', profile.businessName, { ...website, socialProfileLinks: ['https://www.instagram.com/montessoridownriver/'] }, {}), undefined, 'non-Facebook social links are not Facebook discovery')
assert.equal(discoverSocialProfile('Facebook', profile.businessName, { ...website, socialProfileLinks: [] }, {}), undefined, 'icon-only/no-href evidence cannot discover a profile')
assert.equal(discoverSocialProfile('Facebook', profile.businessName, undefined, {}), undefined, 'business names never generate guessed Facebook slugs')

const nameDomain = assess([candidate('name-domain', { name: profile.businessName, website: 'https://montessoridownriver.com/', publicProfileUrl: facebookUrl })])
assert.equal(nameDomain.facebookIdentityDecision?.decision, 'verified')
assert.equal(nameDomain.automaticObservation, true)
assert.equal(assess([candidate('name-address', { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195', publicProfileUrl: facebookUrl })]).facebookIdentityDecision?.decision, 'verified')
assert.equal(assess([candidate('name-only', { name: profile.businessName, publicProfileUrl: facebookUrl })]).facebookIdentityDecision?.decision, 'review_required')
const conflict = assess([candidate('conflict', { name: profile.businessName, website: 'https://unrelated-school.example/', publicProfileUrl: facebookUrl })])
assert.equal(conflict.facebookIdentityDecision?.decision, 'review_required')
assert.equal(conflict.blocker, 'identifier_conflict')

const normalized = normalizeFacebookPageCandidates(profileHtml, facebookUrl, observedAt)
assert(normalized.some((item) => item.fields.name === profile.businessName && item.fields.website === 'http://www.montessoridownriver.com/'))
assert(normalized.every((item) => item.fields.publicProfileUrl === facebookUrl))
const publicCapture = await acquireFacebookPage(`${facebookUrl}/?utm_source=site`, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: profileHtml }),
})
assert.equal(publicCapture.provider, 'facebook-native-fetch')
assert.equal(publicCapture.method, 'server_fetch')
assert.equal(publicCapture.outcome, 'success')
const verified = assessSearchCapture(publicCapture, profile, profileState, 'Facebook', 'brand')
assert.equal(verified.facebookIdentityDecision?.decision, 'verified')
assert.equal(verified.operatorReviewRequired, false)

const loginCapture = await acquireFacebookPage(facebookUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: '<html><body>Log in to Facebook</body></html>' }),
})
assert.equal(loginCapture.outcome, 'blocked')
assert.equal(loginCapture.blocker, 'login_required')
assert.equal(assessSearchCapture(loginCapture, profile, profileState, 'Facebook', 'brand').visibilityResult, 'unavailable')
const deniedCapture = await acquireFacebookPage(facebookUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 403, finalUrl: url.href, body: 'Access denied' }),
})
assert.equal(deniedCapture.blocker, 'access_restricted')

const searchObservation: SearchDestinationObservation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName), overallResult: 'found_match', provenance: 'automated_acquisition',
  reviewed: false, observedAt, confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
  automation: { runId: 'search-discovery', state: 'evidence_captured', queryMode: 'brand', inspectedUrl: 'https://www.google.com/search?q=mary', captures: [], evidence: '', interpreted: true, automaticObservation: true,
    assessment: { ...nameDomain, selected: { ...nameDomain.selected!, candidate: candidate('facebook-search-link', { name: profile.businessName, publicProfileUrl: facebookUrl }, facebookUrl) },
      matches: [{ ...nameDomain.matches[0]!, candidate: candidate('facebook-search-link', { name: profile.businessName, publicProfileUrl: facebookUrl }, facebookUrl) }] } },
}, { profile, brandPresence: true })
assert.equal(discoverSocialProfile('Facebook', profile.businessName, undefined, { brand: { 'Google Search': searchObservation } })?.source, 'search_evidence')

const observation = (assessment: SearchEntityAssessment, capture: AcquisitionResult, discovery = true): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Facebook', profile.businessName), verificationUrl: 'https://www.facebook.com/search/top?q=Montessori',
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed', provenance: 'automated_acquisition', observedAt,
  reviewed: false, confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceKind: assessment.matches.length ? 'external_observation' : capture.outcome === 'success' ? 'unable_to_verify' : 'acquisition_failure',
  canonicalProfileUrl: discovery ? facebookUrl : undefined,
  automation: { runId: 'facebook-brand-run', state: assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured', queryMode: 'brand',
    inspectedUrl: facebookUrl, captures: [{ ...capture, ...(discovery ? { profileDiscovery: { source: 'first_party_website' as const, profileUrl: facebookUrl, sourceUrl: profile.website } } : {}) }],
    evidence: 'Bounded Facebook public evidence.', interpreted: assessment.automaticObservation, automaticObservation: assessment.automaticObservation, assessment },
}, { profile, brandPresence: true })
const facebook = observation(verified, publicCapture)
const projected = projectSalesVisibility(facebook, { profile, profileState })
assert.equal(projected.headline, 'Verified automatically')
assert.equal(projected.operatorReviewRequired, false)
assert.equal(projected.automationSummary, 'Verified from acquired Facebook evidence')
assert.equal(projected.identitySummary, 'Matches reviewed business details')
assert.equal(projected.knownProfileUrl, facebookUrl)
const detail = brandPresenceEvidenceSummary(facebook, projected)
assert.equal(detail.source, 'First-party business website')
assert.equal(detail.decision, 'Verified automatically')

const blocked = observation(assessSearchCapture(loginCapture, profile, profileState, 'Facebook', 'brand'), loginCapture)
const blockedProjection = projectSalesVisibility(blocked, { profile, profileState })
assert.equal(blockedProjection.headline, 'Profile discovered — verification needed')
assert.equal(blockedProjection.state, 'profile_discovered')
assert.equal(blockedProjection.operatorReviewRequired, true)
assert.equal(blockedProjection.evidenceSourceSummary, 'First-party business website link')
assert.match(blockedProjection.explanation, /page URL associated with the business was discovered/i)
assert.equal(projectSalesVisibility(observation(conflict, publicCapture), { profile, profileState }).state, 'conflicting_evidence')
const operatorFallback = buildBrandPresenceVerification(blocked, profile, profileState, { outcome: 'found_correct', reviewedAt: observedAt })
assert.equal(operatorFallback.ok, true)
assert.equal(projectSalesVisibility({ ...blocked, operatorVerification: operatorFallback.ok ? operatorFallback.verification : undefined }, { profile, profileState }).state, 'verified_by_operator')

assert.equal(destinationAcquisitionRoute('Facebook', 'brand'), 'facebook_native_page')
assert.equal(destinationAcquisitionRoute('Instagram', 'brand'), 'instagram_native_profile')
const requests: Array<{ endpoint: string; body: Record<string, unknown> }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const endpoint = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
  requests.push({ endpoint, body })
  const capture: AcquisitionResult = { version: 1, requestedUrl: String(body.url || ''), acquiredAt: observedAt, provider: 'fixture-unavailable', method: body.method === 'rendered_browser' ? 'rendered_browser' : 'server_fetch', outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [] }
  const payload = endpoint === '/api/audit-website' ? website
    : endpoint === '/api/acquire-facebook-page' ? { capture: publicCapture }
      : { capture }
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

const state = (): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {},
  voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
try {
  let current = state()
  const run = await runVisibilityScan(current, createApplicationVisibilityScanDependencies(), (update) => { current = update(current) })
  const brand = run.checks.find((check) => check.destination === 'Facebook' && check.queryMode === 'brand')!
  assert.equal(requests.filter((request) => request.endpoint === '/api/acquire-facebook-page').length, 1)
  assert.equal(requests.find((request) => request.endpoint === '/api/acquire-facebook-page')?.body.url, facebookUrl)
  assert.deepEqual(brand.captures.map((item) => [item.provider, item.method]), [['facebook-native-fetch', 'server_fetch']])
  assert.equal(requests.some((request) => request.endpoint === '/api/acquire-public-presence' && request.body.url === brand.url), false)
  assert.equal(brand.assessment?.facebookIdentityDecision?.decision, 'verified')
  assert.equal(current.searchDestinationObservations['search-brand-canonical']?.Facebook?.overallResult, 'found_match')

  const missing: ScanDependencies = { ...createApplicationVisibilityScanDependencies() }
  delete missing.acquireFacebookPage
  let missingState = state()
  const missingRun = await runVisibilityScan(missingState, missing, (update) => { missingState = update(missingState) })
  const missingBrand = missingRun.checks.find((check) => check.destination === 'Facebook' && check.queryMode === 'brand')!
  assert.deepEqual(missingBrand.captures.map((item) => [item.provider, item.blocker]), [['facebook-native-request', 'facebook_acquisition_not_configured']])
  assert.equal(requests.some((request) => request.endpoint === '/api/acquire-public-presence' && request.body.url === facebookUrl), false)
} finally { globalThis.fetch = originalFetch }

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const compatibleVerified = (destination: SearchDestination): SearchDestinationObservation => ({ ...unresolved(destination), overallResult: 'found_match', reviewed: true })
const destinations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Facebook' ? facebook : ['Google Search', 'Google Maps', 'Bing Search', 'DuckDuckGo'].includes(destination) ? compatibleVerified(destination) : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const cockpit = salesCockpitVisibility(searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: destinations[destination]! })), { profile, profileState })
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'Yelp', 'Instagram']))
assert.equal(cockpit.deeperReview.length, 3)
const auditState: AuditState = { ...state(), searchDestinationObservations: { 'search-brand-canonical': destinations } }
const strength = customerStrengthCandidates(auditState, []).find((item) => item.id === 'search:Facebook')
assert.equal(strength?.defaultSummary, 'We verified that Montessori Center of Downriver has a Facebook business presence matching the reviewed business information.')
const customer = buildCustomerVisibilityReviewExport(auditState, [], [])
assert.equal(customer.needsReview.includes('Facebook'), false)
assert(customer.verifiedStrengths.some((item) => item.title === 'Facebook'))
const customerJson = serializeCustomerVisibilityReview(customer)
for (const internal of ['facebook-native-fetch', 'facebookIdentityDecision', 'profileDiscovery', 'matchedSignals', 'login_required', facebookUrl]) assert.equal(customerJson.includes(internal), false)

const markup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { Facebook: facebook } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
const start = markup.indexOf('<summary>Facebook — Verified automatically</summary>')
const end = markup.indexOf('<summary>Instagram —', start)
assert(start >= 0)
const facebookMarkup = markup.slice(start, end)
assert(facebookMarkup.includes('Verified from acquired Facebook evidence'))
assert(facebookMarkup.includes('No operator action required.'))
assert(facebookMarkup.includes('Open Facebook profile'))
assert.equal(facebookMarkup.includes('aria-label="Facebook assisted verification"'), false)

console.log('Facebook automatic verification PASS: explicit profile discovery, bounded native metadata, access neutrality, profile-discovered state, UI, strength, neutral count, and customer boundary.')
