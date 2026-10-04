import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { acquireDuckDuckGoSearch, duckDuckGoRequestHeaders, normalizeDuckDuckGoHtmlCandidates } from '../server/duckDuckGoSearch.ts'
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
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, publicPresenceUrl, searchDestinations } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { createApplicationVisibilityScanDependencies, runVisibilityScan } from '../src/utils/visibilityScan.ts'

Object.assign(globalThis, { React })

const observedAt = '2026-09-28T21:00:00.000Z'
const query = 'Montessori Center of Downriver Southgate MI'
const verificationUrl = publicPresenceUrl('DuckDuckGo', query)
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
  id, kind: 'result_link', sourceType: 'organic', ...(resultUrl ? { resultUrl } : {}), fields, evidence: [],
})
const assess = (candidates: BusinessResultCandidate[]) => assessBusinessCandidates(candidates, profile, profileState, 'brand', { automaticIdentityPolicy: 'duckduckgo_search' })

const nameDomain = assess([candidate('official', { name: profile.businessName }, 'https://montessoridownriver.com/')])
assert.equal(nameDomain.duckDuckGoIdentityDecision?.decision, 'verified', 'name plus reviewed official domain verifies DuckDuckGo Brand identity')
assert.deepEqual(new Set(nameDomain.duckDuckGoIdentityDecision?.matchedSignals.map((signal) => signal.field)), new Set(['name', 'website']))
const nameAddress = assess([candidate('address', { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195' })])
assert.equal(nameAddress.duckDuckGoIdentityDecision?.decision, 'verified', 'name plus address verifies')
const namePhone = assess([candidate('phone', { name: profile.businessName, phone: '(734) 282-6465' })])
assert.equal(namePhone.duckDuckGoIdentityDecision?.decision, 'verified', 'name plus phone verifies')
const nameOnly = assess([candidate('name-only', { name: profile.businessName })])
assert.equal(nameOnly.duckDuckGoIdentityDecision?.decision, 'review_required')
const domainOnly = assess([candidate('domain-only', {}, 'https://montessoridownriver.com/')])
assert.equal(domainOnly.duckDuckGoIdentityDecision?.decision, 'review_required')
const conflict = assess([candidate('conflict', { name: profile.businessName, phone: '313-555-0100' }, 'https://montessoridownriver.com/')])
assert.equal(conflict.duckDuckGoIdentityDecision?.decision, 'review_required')
assert.equal(conflict.blocker, 'identifier_conflict')

const resultHref = `/l/?uddg=${encodeURIComponent('https://montessoridownriver.com/')}`
const html = `<html><body><div id="links" class="results--main"><div class="result result__body"><h2><a rel="nofollow" class="result__a" href="${resultHref}">Montessori Center of Downriver</a></h2><a class="result__snippet">Official preschool in Southgate, Michigan.</a></div></div></body></html>`
const parsed = normalizeDuckDuckGoHtmlCandidates(html, 'https://html.duckduckgo.com/html/?q=fixture', observedAt)
assert.equal(parsed.length, 1)
assert.equal(parsed[0].resultUrl, 'https://montessoridownriver.com/')
assert.deepEqual(parsed[0].fields, { name: profile.businessName }, 'snippet prose is not promoted into asserted identity fields')
let requestedNativeUrl = ''
const capture = await acquireDuckDuckGoSearch(verificationUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => {
    requestedNativeUrl = url.href
    return { status: 200, finalUrl: url.href, body: html }
  },
})
assert.equal(new URL(requestedNativeUrl).hostname, 'html.duckduckgo.com')
assert.equal(new URL(requestedNativeUrl).searchParams.get('q'), query)
assert.equal(new URL(requestedNativeUrl).searchParams.get('kl'), 'us-en')
assert.equal(duckDuckGoRequestHeaders['accept-language'], 'en-US,en;q=0.9')
assert.equal(capture.provider, 'duckduckgo-native-fetch')
assert.equal(capture.method, 'server_fetch')
assert.equal(capture.outcome, 'success')
assert.equal(capture.resultRegionInspected, true)
const extracted = assessSearchCapture(capture, profile, profileState, 'DuckDuckGo', 'brand')
assert.equal(extracted.duckDuckGoIdentityDecision?.decision, 'verified')
assert.equal(extracted.automaticObservation, true)

const noMatchCapture = await acquireDuckDuckGoSearch(verificationUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: html.replace('Montessori Center of Downriver', 'Generic Montessori Resources').replace(encodeURIComponent('https://montessoridownriver.com/'), encodeURIComponent('https://example.org/')) }),
})
const noMatch = assessSearchCapture(noMatchCapture, profile, profileState, 'DuckDuckGo', 'brand')
assert.equal(noMatch.visibilityResult, 'review_required', 'normal DDG results without a match remain neutral')
assert.equal(noMatch.operatorReviewRequired, true)
assert.equal(noMatch.blocker, 'no_match')
assert.notEqual(noMatch.visibilityResult, 'not_found')

const upstreamFailure = await acquireDuckDuckGoSearch(verificationUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 502, finalUrl: url.href, body: 'Upstream unavailable' }),
})
assert.equal(upstreamFailure.outcome, 'unavailable')
assert.equal(upstreamFailure.blocker, 'http_5xx')
assert.equal(assessSearchCapture(upstreamFailure, profile, profileState, 'DuckDuckGo', 'brand').visibilityResult, 'unavailable')

const observation = (assessment: SearchEntityAssessment, source = capture): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('DuckDuckGo', query), verificationUrl,
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed', provenance: 'automated_acquisition',
  observedAt, reviewed: false, confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceKind: assessment.matches.length ? 'external_observation' : source.outcome === 'success' ? 'unable_to_verify' : 'acquisition_failure',
  observedResultUrl: assessment.selected?.candidate.resultUrl,
  automation: {
    runId: 'duckduckgo-brand-run', state: assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured',
    queryMode: 'brand', inspectedUrl: verificationUrl, captures: [source], evidence: 'Bounded DuckDuckGo result evidence.',
    interpreted: assessment.automaticObservation, automaticObservation: assessment.automaticObservation, assessment,
  },
}, { profile, brandPresence: true })
const duck = observation(extracted)
const projected = projectSalesVisibility(duck, { profile, profileState })
assert.equal(projected.headline, 'Verified automatically')
assert.equal(projected.operatorReviewRequired, false)
assert.equal(projected.automationSummary, 'Verified from acquired DuckDuckGo evidence')
assert.equal(projected.identitySummary, 'Matches reviewed business details')
assert.match(projected.explanation, /DuckDuckGo shows business information that matches the reviewed business details/)
const detail = brandPresenceEvidenceSummary(duck, projected)
assert.equal(detail.decision, 'Verified automatically')
assert(detail.identityEvidence?.some((item) => item.label === 'Website'))
assert.equal(projectSalesVisibility(observation(conflict), { profile, profileState }).state, 'conflicting_evidence')
assert.equal(projectSalesVisibility(observation(noMatch, noMatchCapture), { profile, profileState }).state, 'manual_verification_needed')
assert.equal(projectSalesVisibility(observation(assessSearchCapture(upstreamFailure, profile, profileState, 'DuckDuckGo', 'brand'), upstreamFailure), { profile, profileState }).headline, 'Automated check unavailable — verification needed')

const explicitAbsenceBase = observation(noMatch, noMatchCapture)
const explicitAbsence = buildBrandPresenceVerification(explicitAbsenceBase, profile, profileState, { outcome: 'not_found', reviewedAt: observedAt })
assert.equal(explicitAbsence.ok, true)
assert.equal(projectSalesVisibility({ ...explicitAbsenceBase, operatorVerification: explicitAbsence.ok ? explicitAbsence.verification : undefined }, { profile, profileState }).state, 'operator_not_found', 'only explicit operator review establishes DuckDuckGo absence')

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const compatibleVerified = (destination: SearchDestination): SearchDestinationObservation => ({
  ...unresolved(destination), overallResult: 'found_match', reviewed: true,
})
const brandObservations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'DuckDuckGo' ? duck : ['Google Search', 'Google Maps', 'Bing Search'].includes(destination) ? compatibleVerified(destination) : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const records = searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: brandObservations[destination]! }))
const cockpit = salesCockpitVisibility(records, { profile, profileState })
assert.equal(cockpit.deeperReview.length, 4)
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['Apple Maps', 'Yelp', 'Facebook', 'Instagram']))

const state: AuditState = {
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': brandObservations },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const strength = customerStrengthCandidates(state, []).find((item) => item.id === 'search:DuckDuckGo')
assert(strength)
assert.equal(strength.defaultSummary, 'We verified that the business identity shown in DuckDuckGo matches the reviewed information for Montessori Center of Downriver.')
const customer = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(customer.needsReview.includes('DuckDuckGo'), false)
assert.equal(customer.needsReview.includes('Apple Maps'), true)
assert(customer.verifiedStrengths.some((item) => item.title === 'DuckDuckGo'))
const customerJson = serializeCustomerVisibilityReview(customer)
for (const internal of ['duckduckgo-native-fetch', 'duckDuckGoIdentityDecision', 'matchedSignals', 'candidateIds', 'http_5xx']) assert.equal(customerJson.includes(internal), false)

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { DuckDuckGo: duck } }} onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
const duckStart = markup.indexOf('<summary>DuckDuckGo — Verified automatically</summary>')
const yelpStart = markup.indexOf('<summary>Yelp —', duckStart)
assert(duckStart >= 0)
const duckMarkup = markup.slice(duckStart, yelpStart)
assert(duckMarkup.includes('Verified from acquired DuckDuckGo evidence'))
assert(duckMarkup.includes('No operator action required.'))
assert.equal(duckMarkup.includes('aria-label="DuckDuckGo assisted verification"'), false)

const websiteAudit = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
let scanned = structuredClone({ ...state, searchDestinationObservations: {} })
let duckBrandCalls = 0
let genericDuckCalls = 0
const scanRun = await runVisibilityScan(scanned, {
  automationVersion: 2, website: async () => websiteAudit,
  acquireDuckDuckGoSearch: async (url) => { duckBrandCalls += 1; return { ...capture, requestedUrl: url } },
  acquire: async (url, method) => {
    if (url.includes('duckduckgo.com')) genericDuckCalls += 1
    return { version: 1, requestedUrl: url, acquiredAt: observedAt, provider: 'fixture-unavailable', method, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [] } as AcquisitionResult
  },
}, (update) => { scanned = update(scanned) })
const duckCheck = scanRun.checks.find((item) => item.destination === 'DuckDuckGo' && item.queryMode === 'brand')!
assert.equal(scanRun.failure, undefined, scanRun.failure)
assert.equal(duckBrandCalls, 1)
assert.equal(genericDuckCalls > 0, true, 'non-Brand DuckDuckGo queries retain their separate acquisition path')
assert.deepEqual(duckCheck.captures.map((item) => [item.provider, item.method]), [['duckduckgo-native-fetch', 'server_fetch']])
assert.equal(scanned.searchDestinationObservations['search-brand-canonical']?.DuckDuckGo?.automation?.assessment?.duckDuckGoIdentityDecision?.decision, 'verified')

let missing = structuredClone({ ...state, searchDestinationObservations: {} })
const missingRun = await runVisibilityScan(missing, {
  automationVersion: 2, website: async () => websiteAudit,
  acquire: async (url, method) => ({ version: 1, requestedUrl: url, acquiredAt: observedAt, provider: 'fixture-generic', method, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [] }),
}, (update) => { missing = update(missing) })
const missingDuck = missingRun.checks.find((item) => item.destination === 'DuckDuckGo' && item.queryMode === 'brand')!
assert.deepEqual(missingDuck.captures.map((item) => item.provider), ['duckduckgo-native-request'])
assert.equal(missingDuck.captures[0].blocker, 'duckduckgo_acquisition_not_configured')

const originalFetch = globalThis.fetch
const requests: Array<{ endpoint: string; body: Record<string, unknown> }> = []
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const endpoint = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
  requests.push({ endpoint, body })
  return new Response(JSON.stringify({ capture: { ...capture, requestedUrl: String(body.url || '') } }), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch
try {
  const production = createApplicationVisibilityScanDependencies()
  assert.equal(typeof production.acquireDuckDuckGoSearch, 'function')
  await production.acquireDuckDuckGoSearch(verificationUrl)
  assert.equal(requests[0].endpoint, '/api/acquire-duckduckgo-search')
  assert.equal(requests[0].body.url, verificationUrl)
} finally { globalThis.fetch = originalFetch }

console.log('DuckDuckGo automatic verification PASS: dedicated bounded HTML acquisition, established identity rule, neutral no-match/failures, fail-closed routing, UI, four-destination neutral count, strength eligibility, and customer boundary.')
