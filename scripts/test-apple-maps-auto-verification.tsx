import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { acquireAppleMaps, appleMapsRequestHeaders } from '../server/appleMaps.ts'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfile, BusinessProfileField, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import type { BusinessResultCandidate, SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { projectSalesVisibility, salesCockpitVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, publicPresenceUrl, searchDestinations } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { runVisibilityScan } from '../src/utils/visibilityScan.ts'

Object.assign(globalThis, { React })

const observedAt = '2026-09-28T18:00:00.000Z'
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
const candidate = (id: string, fields: BusinessResultCandidate['fields']): BusinessResultCandidate => ({
  id, kind: 'structured_entity', sourceType: 'local_place', fields, evidence: [],
})
const assess = (candidates: BusinessResultCandidate[]) => assessBusinessCandidates(candidates, profile, profileState, 'brand', { automaticIdentityPolicy: 'apple_maps' })

const namePhone = assess([candidate('name-phone', { name: profile.businessName, phone: '(734) 282-6465' })])
assert.equal(namePhone.automaticObservation, true, '1/A: matching Apple name and phone verify')
const nameAddress = assess([candidate('name-address', { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195' })])
assert.equal(nameAddress.automaticObservation, true, 'A: matching Apple name and address verify')
const domainAddress = assess([candidate('domain-address', { website: profile.website, address: '15575 Northline Rd, Southgate, MI 48195' })])
assert.equal(domainAddress.automaticObservation, true, 'official domain plus address satisfies the same bounded two-signal contract')
const nameOnly = assess([candidate('name-only', { name: profile.businessName })])
assert.equal(nameOnly.automaticObservation, false, '2/C: name-only Apple evidence does not verify')
assert.equal(nameOnly.operatorReviewRequired, true)
const conflict = assess([candidate('conflict', { name: profile.businessName, phone: '313-555-0100', address: '900 Other Rd, Taylor, MI 48180' })])
assert.equal(conflict.automaticObservation, false, '3/D: material Apple identifier conflicts block verification')
assert.equal(conflict.blocker, 'identifier_conflict')

const query = 'Montessori Center of Downriver Southgate MI'
const appleUrl = publicPresenceUrl('Apple Maps', query)
assert.equal(appleUrl, `https://maps.apple.com/?q=${encodeURIComponent(query)}`, 'Apple uses the clean reviewed-identity query')
assert.equal(appleMapsRequestHeaders['accept-language'], 'en-US,en;q=0.9')
const html = readFileSync(new URL('./fixtures/apple-maps-montessori-place.html', import.meta.url), 'utf8')
const capture = await acquireAppleMaps(appleUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: html }),
})
assert.equal(capture.outcome, 'success')
assert.equal(capture.provider, 'apple-maps-native-fetch')
assert.equal(capture.method, 'server_fetch')
assert.equal(capture.resultRegionInspected, true)
assert(capture.normalizedSearchCandidates?.some((item) => item.sourceType === 'local_place'), '4/J: structured public place evidence is normalized')
assert(capture.normalizedSearchCandidates?.some((item) => item.fields.publicProfileUrl?.startsWith('https://maps.apple.com/place')))
const extracted = assessSearchCapture(capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(extracted.automaticObservation, true, 'Montessori structured place verifies automatically')
assert.equal(extracted.visibilityResult, 'found')
assert.equal(extracted.operatorReviewRequired, false)
const matchedFields = new Set(extracted.selected?.matchedFields.map((item) => item.field))
for (const field of ['name', 'address', 'phone', 'website'] as const) assert(matchedFields.has(field), `Montessori place matches ${field}`)

const restricted = await acquireAppleMaps(appleUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 403, finalUrl: url.href, body: '<title>Access denied</title>' }),
})
assert.equal(restricted.outcome, 'blocked')
assert.equal(restricted.blocker, 'access_blocked')
assert.equal(assessSearchCapture(restricted, profile, profileState, 'Apple Maps', 'brand').visibilityResult, 'unavailable', '4/E: access restriction stays neutral')

const noMatchHtml = '<main><script type="application/json">{"place":{"name":"Different Business","phone":"313-555-9999","placeUrl":"https://maps.apple.com/place?place-id=other"}}</script></main>'
const noMatchCapture = await acquireAppleMaps(appleUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: noMatchHtml }),
})
const noMatch = assessSearchCapture(noMatchCapture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(noMatch.visibilityResult, 'review_required', '5/F: usable Apple evidence with no identity match stays neutral')
assert.equal(noMatch.operatorReviewRequired, true)
assert.equal(noMatch.blocker, 'no_match')
assert.notEqual(noMatch.visibilityResult, 'not_found', 'only explicit operator review may establish absence')

const shell = await acquireAppleMaps(appleUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: '<html><main>Apple Maps</main></html>' }),
})
assert.equal(shell.outcome, 'unavailable')
assert.equal(shell.blocker, 'missing_result_region')

const observation = (assessment: SearchEntityAssessment, source = capture): SearchDestinationObservation => normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Apple Maps', query),
  overallResult: assessment.automaticObservation ? 'found_match' : 'manual_review_needed',
  provenance: 'automated_acquisition', observedAt, reviewed: false,
  confidence: assessment.automaticObservation ? 'scanner_detected_public_page' : 'manual_needs_confirmation',
  evidenceKind: assessment.matches.length ? 'external_observation' : 'acquisition_failure',
  observedResultUrl: assessment.selected?.candidate.resultUrl,
  canonicalProfileUrl: assessment.selected?.candidate.fields.publicProfileUrl,
  automation: {
    runId: 'apple-brand-run', state: assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured',
    queryMode: 'brand', inspectedUrl: appleUrl, captures: [source], evidence: 'Bounded public Apple Maps place evidence.',
    interpreted: assessment.automaticObservation, automaticObservation: assessment.automaticObservation, assessment,
  },
}, { profile, brandPresence: true })

const apple = observation(extracted, { ...capture, redirectUrl: 'https://maps.apple.com/place?place-id=internal-place-id&coordinate=42.1%2C-83.2', initialStatusCode: 301, redirectAccepted: true })
const projected = projectSalesVisibility(apple, { profile, profileState })
assert.equal(projected.headline, 'Verified automatically')
assert.equal(projected.operatorReviewRequired, false, '6: verified Apple hides required assisted controls')
assert.equal(projected.automationSummary, 'Verified from acquired Apple Maps evidence')
assert.equal(projected.identitySummary, 'Matches reviewed business details')
assert.match(projected.explanation, /Apple Maps shows a business listing that matches the reviewed business details/)
const evidenceDetail = brandPresenceEvidenceSummary(apple, projected)
assert.equal(evidenceDetail.decision, 'Verified automatically')
assert(evidenceDetail.identityEvidence?.some((item) => item.label === 'Phone' && item.result.includes('Matches')))

const conflictProjection = projectSalesVisibility(observation(conflict), { profile, profileState })
assert.equal(conflictProjection.state, 'conflicting_evidence')
assert.equal(conflictProjection.headline, 'Conflicting evidence — review needed')

const unresolved = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName), overallResult: 'manual_review_needed', reviewed: false,
})
const compatibleVerified = (destination: SearchDestination): SearchDestinationObservation => ({
  ...unresolved(destination), overallResult: 'found_match', reviewed: true,
})
const brandObservations = Object.fromEntries(searchDestinations.map((destination) => [destination,
  destination === 'Apple Maps' ? apple : ['Google Search', 'Google Maps', 'Bing Search'].includes(destination) ? compatibleVerified(destination) : unresolved(destination),
])) as Partial<Record<SearchDestination, SearchDestinationObservation>>
const records = searchDestinations.map((destination) => ({ queryId: 'search-brand-canonical', observation: brandObservations[destination]! }))
const cockpit = salesCockpitVisibility(records, { profile, profileState })
assert.equal(cockpit.deeperReview.length, 4, '8: verified Apple reduces Brand neutral destinations from five to four')
assert.deepEqual(new Set(cockpit.deeperReview.map((item) => item.destination)), new Set(['DuckDuckGo', 'Yelp', 'Facebook', 'Instagram']))

const state: AuditState = {
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': brandObservations },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const strengths = customerStrengthCandidates(state, [])
const appleStrength = strengths.find((item) => item.id === 'search:Apple Maps')
assert(appleStrength, '7: verified Apple Maps is independently strength-eligible')
assert.equal(appleStrength.defaultSummary, 'We verified that Montessori Center of Downriver has an Apple Maps listing matching the reviewed business information.')
const customer = buildCustomerVisibilityReviewExport(state, [], [])
assert.equal(customer.needsReview.includes('Apple Maps'), false, '9: Customer Review excludes verified Apple from Still being verified')
assert(customer.verifiedStrengths.some((item) => item.title === 'Apple Maps'))
const customerJson = serializeCustomerVisibilityReview(customer)
for (const internal of ['apple-maps-native-fetch', 'placeIdentity', 'matchedFields', 'missing_result_region', 'apple-brand-run', 'internal-place-id', 'coordinate=', 'redirectUrl']) {
  assert.equal(customerJson.includes(internal), false, `10: ${internal} stays outside customer JSON`)
}

const markup = renderToStaticMarkup(<SearchVisibilityPanel
  profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Apple Maps': apple } }} onChange={() => undefined} onAddToActionPlan={() => undefined}
/>)
const appleStart = markup.indexOf('<summary>Apple Maps — Verified automatically</summary>')
const duckStart = markup.indexOf('<summary>DuckDuckGo —', appleStart)
assert(appleStart >= 0)
const appleMarkup = markup.slice(appleStart, duckStart)
assert(appleMarkup.includes('Verified from acquired Apple Maps evidence'))
assert(appleMarkup.includes('No operator action required.'))
assert.equal(appleMarkup.includes('aria-label="Apple Maps assisted verification"'), false)
assert(appleMarkup.includes('Open known profile'))

const websiteAudit = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
let scanned = structuredClone({ ...state, searchDestinationObservations: {} })
let appleBrandCalls = 0
let genericAppleCalls = 0
const scanRun = await runVisibilityScan(scanned, {
  automationVersion: 2,
  website: async () => websiteAudit,
  acquireAppleMaps: async (url) => { appleBrandCalls += 1; return { ...capture, requestedUrl: url } },
  acquire: async (url, method) => {
    if (url.includes('maps.apple.com')) genericAppleCalls += 1
    return { version: 1, requestedUrl: url, acquiredAt: observedAt, provider: 'fixture-unavailable', method, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [], error: 'Fixture unavailable.' } as AcquisitionResult
  },
}, (update) => { scanned = update(scanned) })
const scannedApple = scanned.searchDestinationObservations['search-brand-canonical']?.['Apple Maps']
assert.equal(appleBrandCalls, 1, 'Apple Maps Brand uses one dedicated bounded native acquisition')
assert(genericAppleCalls > 0, 'non-Brand Apple checks retain their existing separate path')
assert.deepEqual(scanRun.checks.find((item) => item.destination === 'Apple Maps' && item.queryMode === 'brand')?.captures.map((item) => item.method), ['server_fetch'], 'Apple Maps Brand never invokes rendered-browser acquisition')
assert.equal(scannedApple?.automation?.assessment?.automaticObservation, true)
assert.equal(scannedApple?.overallResult, 'found_match')

let missing = structuredClone({ ...state, searchDestinationObservations: {} })
const missingRun = await runVisibilityScan(missing, {
  automationVersion: 2, website: async () => websiteAudit,
  acquire: async (url, method) => ({ version: 1, requestedUrl: url, acquiredAt: observedAt, provider: 'fixture-generic', method, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [] }),
}, (update) => { missing = update(missing) })
const missingApple = missingRun.checks.find((item) => item.destination === 'Apple Maps' && item.queryMode === 'brand')!
assert.deepEqual(missingApple.captures.map((item) => item.provider), ['apple-maps-native-request'], 'missing dedicated wiring fails closed instead of using generic acquisition')
assert.equal(missingApple.captures[0].blocker, 'apple_maps_acquisition_not_configured')

console.log('Apple Maps automatic verification PASS: bounded public place acquisition, structured normalization, matcher reuse, neutral failures/no-match, UI, four-destination neutral count, strength eligibility, and customer boundary.')
