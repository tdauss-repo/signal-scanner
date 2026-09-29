import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { acquireBingSearch } from '../server/bingSearch.ts'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { AuditState, BusinessProfile, BusinessProfileField, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import type { BusinessResultCandidate, SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, searchDestinations } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { runVisibilityScan } from '../src/utils/visibilityScan.ts'

Object.assign(globalThis, { React })

const observedAt = '2026-09-28T16:00:00.000Z'
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
const candidate = (id: string, fields: BusinessResultCandidate['fields'], resultUrl?: string): BusinessResultCandidate => ({
  id, kind: 'semantic_card', sourceType: 'organic', ...(resultUrl ? { resultUrl } : {}), fields, evidence: [],
})
const assess = (candidates: BusinessResultCandidate[]) => assessBusinessCandidates(candidates, profile, profileState, 'brand', { automaticIdentityPolicy: 'bing_search' })

const official = assess([candidate('official', {
  name: profile.businessName, website: 'https://montessoridownriver.com/', locality: 'Southgate', region: 'MI',
}, 'https://montessoridownriver.com/')])
assert.equal(official.bingIdentityDecision?.decision, 'verified', '1/2: reviewed name plus official domain verifies Bing Brand identity')
assert.deepEqual(new Set(official.bingIdentityDecision?.matchedSignals.map((signal) => signal.field)), new Set(['name', 'website']))
assert.equal(official.automaticObservation, true)

const namePhone = assess([candidate('name-phone', { name: profile.businessName, phone: '(734) 282-6465' })])
assert.equal(namePhone.bingIdentityDecision?.decision, 'verified', '3: name plus phone verifies')

const nameAddress = assess([candidate('name-address', { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195' })])
assert.equal(nameAddress.bingIdentityDecision?.decision, 'verified', 'name plus address verifies')

const domainAddress = assess([candidate('domain-address', {
  website: 'https://www.montessoridownriver.com/', address: '15575 Northline Rd, Southgate, MI 48195', locality: 'Southgate', region: 'MI',
})])
assert.equal(domainAddress.bingIdentityDecision?.decision, 'verified', 'official domain plus address verifies without borrowing a result title')

const nameOnly = assess([candidate('name-only', { name: profile.businessName })])
assert.equal(nameOnly.bingIdentityDecision?.decision, 'review_required', '4: a title/name alone remains insufficient')
assert.equal(nameOnly.operatorReviewRequired, true)

const conflict = assess([candidate('phone-conflict', {
  name: profile.businessName, website: profile.website, phone: '313-555-0100',
}, profile.website)])
assert.equal(conflict.bingIdentityDecision?.decision, 'review_required', '5: a material identifier conflict blocks verification')
assert.equal(conflict.blocker, 'identifier_conflict')
assert(conflict.bingIdentityDecision?.conflictingSignals.some((signal) => signal.field === 'phone'))

const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent('Montessori Center of Downriver Southgate MI')}`
const bingHtml = `<html><body><main><ol id="b_results"><li class="b_algo"><h2><a href="https://montessoridownriver.com/">${profile.businessName}</a></h2><cite>montessoridownriver.com</cite><p>Preschool in Southgate, MI</p></li></ol></main></body></html>`
const capture = await acquireBingSearch(bingUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: bingHtml }),
})
assert.equal(capture.outcome, 'success', 'bounded native Bing acquisition recognizes a normal result region')
assert.equal(capture.provider, 'bing-native-fetch')
assert.equal(capture.method, 'server_fetch')
assert.equal(capture.resultRegionInspected, true)
const extracted = assessSearchCapture(capture, profile, profileState, 'Bing Search', 'brand')
assert.equal(extracted.bingIdentityDecision?.decision, 'verified', 'native HTML candidates reach the explicit Bing matcher')
assert.equal(extracted.selected?.candidate.sourceType, 'organic')

const blockedCapture = await acquireBingSearch(bingUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 403, finalUrl: url.href, body: '<title>Access denied</title>' }),
})
assert.equal(blockedCapture.outcome, 'blocked')
assert.equal(assessSearchCapture(blockedCapture, profile, profileState, 'Bing Search', 'brand').visibilityResult, 'unavailable', '6: provider failure stays neutral')

const observation = (assessment: SearchEntityAssessment): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Bing Search', 'Montessori Center of Downriver Southgate MI'),
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed',
  provenance: 'automated_acquisition', observedAt, reviewed: false,
  confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceKind: assessment.matches.length ? 'external_observation' : 'acquisition_failure',
  observedResultUrl: assessment.selected?.candidate.resultUrl,
  automation: {
    runId: 'bing-brand-run', state: assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured',
    queryMode: 'brand', inspectedUrl: bingUrl, captures: [capture], evidence: 'Bounded normalized Bing evidence.',
    interpreted: assessment.automaticObservation, automaticObservation: assessment.automaticObservation, assessment,
  },
}, { profile, brandPresence: true })

const bing = observation(official)
const projected = projectSalesVisibility(bing, { profile, profileState })
assert.equal(projected.headline, 'Verified automatically')
assert.equal(projected.operatorReviewRequired, false, '7: verified Bing does not require assisted controls')
assert.equal(projected.automationSummary, 'Verified from acquired Bing evidence')
assert.equal(projected.identitySummary, 'Matches reviewed business details')
assert.match(projected.explanation, /Bing Search shows business information that matches the reviewed business details/)
const evidenceDetail = brandPresenceEvidenceSummary(bing, projected)
assert.equal(evidenceDetail.decision, 'Verified automatically')
assert(evidenceDetail.identityEvidence?.some((item) => item.label === 'Website'))

const conflictProjection = projectSalesVisibility(observation(conflict), { profile, profileState })
assert.equal(conflictProjection.state, 'conflicting_evidence')
assert.equal(conflictProjection.headline, 'Conflicting evidence — review needed')

const unavailableAssessment = assessSearchCapture({
  version: 1, requestedUrl: bingUrl, acquiredAt: observedAt, provider: 'bing-native-fetch', method: 'server_fetch',
  outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [], error: 'Network unavailable.',
}, profile, profileState, 'Bing Search', 'brand')
const unavailable = observation(unavailableAssessment)
assert.equal(projectSalesVisibility(unavailable, { profile, profileState }).headline, 'Automated check unavailable — verification needed')

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const automatic = (destination: SearchDestination): SearchDestinationObservation => ({
  ...unresolved(destination), overallResult: 'found_match', provenance: 'automated_acquisition',
  automation: { runId: `${destination}-run`, state: 'evidence_captured', queryMode: 'brand', inspectedUrl: '', captures: [], evidence: '', interpreted: true, automaticObservation: true,
    assessment: { matches: [], confidence: 'high', automaticObservation: true, visibilityResult: 'found', operatorReviewRequired: false, resultRegionInspected: true, ambiguityReasons: [], blocker: 'none', tier3Candidate: false } },
})
const brandObservations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Bing Search' ? bing : ['Google Search', 'Google Maps'].includes(destination) ? automatic(destination) : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const records = searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: brandObservations[destination]! }))
records.push({ queryId: 'search-brand-market', observation: { ...unresolved('Bing Search'), automation: { ...unavailable.automation!, queryMode: 'location' } } })
const cockpit = salesCockpitVisibility(records, { profile, profileState })
assert.equal(cockpit.deeperReview.length, 5, '9/11: Brand neutral count excludes verified Bing and separate discovery-query modes')
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'DuckDuckGo', 'Yelp', 'Facebook', 'Instagram']))

const state: AuditState = {
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': brandObservations },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const strengths = customerStrengthCandidates(state, [])
const bingStrength = strengths.find((item) => item.id === 'search:Bing Search')
assert(bingStrength, '8: verified Bing is independently eligible as a strength')
assert.equal(bingStrength.defaultSummary, 'We verified that the business identity shown in Bing Search matches the reviewed information for Montessori Center of Downriver.')
const customer = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(customer.needsReview.includes('Bing Search'), false, '10: Customer Review excludes verified Bing from Still being verified')
assert(customer.verifiedStrengths.some((item) => item.title === 'Bing Search'))
const customerJson = serializeCustomerVisibilityReview(customer)
for (const internal of ['bingIdentityDecision', 'matchedSignals', 'bing-native-fetch', 'candidateIds', 'network_failure']) {
  assert.equal(customerJson.includes(internal), false, `12: ${internal} stays outside customer JSON`)
}

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Bing Search': bing } }} onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
const bingStart = markup.indexOf('<summary>Bing Search — Verified automatically</summary>')
const appleStart = markup.indexOf('<summary>Apple Maps —', bingStart)
assert(bingStart >= 0)
const bingMarkup = markup.slice(bingStart, appleStart)
assert(bingMarkup.includes('Verified from acquired Bing evidence'))
assert(bingMarkup.includes('No operator action required.'))
assert.equal(bingMarkup.includes('aria-label="Bing Search assisted verification"'), false)

const websiteAudit = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
let scanned = structuredClone({ ...state, searchDestinationObservations: {} })
let bingBrandCalls = 0
let genericBingCalls = 0
await runVisibilityScan(scanned, {
  automationVersion: 2,
  website: async () => websiteAudit,
  acquireBingSearch: async (url) => { bingBrandCalls += 1; return { ...capture, requestedUrl: url, finalUrl: url } },
  acquire: async (url, method) => {
    if (url.includes('bing.com/search')) genericBingCalls += 1
    return { version: 1, requestedUrl: url, acquiredAt: observedAt, provider: 'fixture-unavailable', method, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [], error: 'Fixture unavailable.' }
  },
}, (update) => { scanned = update(scanned) })
const scannedBing = scanned.searchDestinationObservations['search-brand-canonical']?.['Bing Search']
assert.equal(bingBrandCalls, 1, 'Brand Presence uses the dedicated bounded Bing acquisition exactly once')
assert(genericBingCalls > 0, 'Location Diagnostic keeps its separate existing acquisition path')
assert.equal(scannedBing?.automation?.assessment?.bingIdentityDecision?.decision, 'verified')
assert.equal(scannedBing?.overallResult, 'found_match', 'the scan persists the normalized automatic Bing result')

console.log('Bing Search automatic verification PASS: bounded native acquisition, existing matcher reuse, explainable decisions, conflicts, UI, Brand-only neutral count, strength eligibility, and customer boundary.')
