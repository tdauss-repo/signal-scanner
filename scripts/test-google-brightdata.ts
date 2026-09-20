import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  acquireBrightDataBrowser,
  acquireBrightDataMaps,
  acquireBrightDataMapsBrowser,
  acquireBrightDataSerp,
  acquireGoogleMapsWithBrightData,
  acquireGoogleWithBrightData,
  brightDataProductionCapture,
  classifySerpResponse,
  normalizeMapsPayload,
  normalizeSerpPayload,
  type BrowserObservedPage,
  type NormalizedGoogleAcquisition,
} from '../server/brightDataGoogle.ts'
import type { AuditState, BusinessProfile, BusinessProfileState } from '../src/types/audit.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { runVisibilityScan } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const query = 'Example Studio'
const serpConfig = { query, token: 'test-token', zone: 'test-zone', country: 'us', language: 'en', rawProviderMetadataReference: 'serp-response.json' }
const orchestratorConfig = { ...serpConfig, browserCdpUrl: 'wss://hidden@example.invalid:9222', browserMetadataReference: 'browser-diagnostic.json' }

const unavailable = (provider: NormalizedGoogleAcquisition['provider'], blocker: NormalizedGoogleAcquisition['blocker']): NormalizedGoogleAcquisition => ({
  contractVersion: 1, provider, provenance: provider, query, requestedUrl: 'https://www.google.com/search?q=Example+Studio', outcome: 'unavailable', usable: false,
  resultRegionInspected: false, candidates: [], blocker, challengeClassification: 'none', elapsedMs: 1, rawProviderMetadataReference: `${provider}.json`, diagnostic: {},
})
const success = (provider: NormalizedGoogleAcquisition['provider']): NormalizedGoogleAcquisition => ({
  contractVersion: 1, provider, provenance: provider, query, requestedUrl: 'https://www.google.com/search?q=Example+Studio', outcome: 'success', usable: true,
  resultRegionInspected: true, candidates: normalizeSerpPayload({ organic: [{ title: 'Example Studio', link: 'https://example.com/', rank: 1 }] }), blocker: 'none', challengeClassification: 'none', elapsedMs: 1, rawProviderMetadataReference: `${provider}.json`, diagnostic: {},
})

let browserCalls = 0
const serpStopsFallback = await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async () => ({ ...success('brightdata_serp_api'), rawResponse: { organic: [] } }),
  acquireBrowser: async () => { browserCalls += 1; return success('brightdata_browser_api') },
})
assert.equal(serpStopsFallback.selectedProvider, 'brightdata_serp_api')
assert.equal(serpStopsFallback.fallbackTriggered, false)
assert.equal(browserCalls, 0, '1: usable SERP evidence stops before Browser API')

const captchaSerp = await acquireBrightDataSerp(serpConfig, async () => ({ status: 502, headers: { 'x-brd-error-code': 'captcha_failed' }, bodyText: JSON.stringify({ error: 'captcha' }) }))
assert.equal(captchaSerp.outcome, 'unavailable')
assert.equal(captchaSerp.blocker, 'provider_captcha')
browserCalls = 0
const captchaFallback = await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async () => captchaSerp,
  acquireBrowser: async () => { browserCalls += 1; return success('brightdata_browser_api') },
})
assert.equal(browserCalls, 1)
assert.equal(captchaFallback.selectedProvider, 'brightdata_browser_api', '2: a SERP 502/captcha invokes Browser API once')

const malformed = await acquireBrightDataSerp(serpConfig, async () => ({ status: 200, bodyText: '<html>not JSON</html>' }))
assert.equal(malformed.blocker, 'malformed_response')
browserCalls = 0
await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async () => malformed,
  acquireBrowser: async () => { browserCalls += 1; return success('brightdata_browser_api') },
})
assert.equal(browserCalls, 1, '3: malformed SERP response invokes Browser API')
const wrappedMalformed = classifySerpResponse({ status: 200, parsed: { body: '<html>not structured JSON</html>' } })
assert.equal(wrappedMalformed.blocker, 'malformed_response')
browserCalls = 0
const missingPrimaryConfiguration = await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async () => ({ ...unavailable('brightdata_serp_api', 'configuration_missing'), rawResponse: { error: 'configuration_missing' } }),
  acquireBrowser: async () => { browserCalls += 1; return success('brightdata_browser_api') },
})
assert.equal(missingPrimaryConfiguration.fallbackTriggered, false)
assert.equal(browserCalls, 0, 'Browser fallback runs only for eligible SERP acquisition outcomes')

const normalObserved: BrowserObservedPage = {
  title: 'Example Studio - Google Search', visibleText: 'Example Studio example.com 1 Main St Example, MI 555-0100', resultRegionInspected: true,
  organic: [{ title: 'Example Studio', resultUrl: 'https://example.com/', displayedUrl: 'example.com', description: 'Official website', rank: 1 }],
  knowledge: { name: 'Example Studio', businessWebsite: 'https://example.com/', phone: '555-0100', address: '1 Main St, Example, MI 48111', category: 'Photography studio', placeIdentity: 'place-1' },
  local: [{ name: 'Example Studio', businessWebsite: 'https://example.com/', address: '1 Main St, Example, MI 48111', category: 'Photography studio', placeIdentity: 'place-1', rank: 1 }],
}
const browserNormal = await acquireBrightDataBrowser({ query, cdpUrl: 'wss://hidden@example.invalid:9222', rawProviderMetadataReference: 'browser.json' }, async (_config, requestedUrl) => ({ observed: normalObserved, finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }))
assert.equal(browserNormal.outcome, 'success')
assert.equal(browserNormal.resultRegionInspected, true)
assert(browserNormal.candidates.some((candidate) => candidate.resultType === 'organic'))
assert(browserNormal.candidates.some((candidate) => candidate.resultType === 'knowledge_panel'), '4: normal Browser API SERP returns normalized evidence')
assert(browserNormal.candidates.some((candidate) => candidate.resultType === 'local_place'))
const remoteConnection = await acquireBrightDataBrowser({ query, cdpUrl: 'wss://hidden@example.invalid:9222', playwrightModule: resolve('scripts/fixtures/mock-brightdata-browser.mjs'), rawProviderMetadataReference: 'browser.json' })
assert.equal(remoteConnection.outcome, 'success', 'Browser provider connects through Playwright CDP without launching local Chromium')

const browserChallenge = await acquireBrightDataBrowser({ query, cdpUrl: 'wss://hidden@example.invalid:9222', rawProviderMetadataReference: 'browser.json' }, async () => ({ observed: { ...normalObserved, visibleText: 'Our systems have detected unusual traffic', resultRegionInspected: false, organic: [], knowledge: undefined }, finalUrl: 'https://www.google.com/sorry/index', statusCode: 200, navigationFailed: false }))
assert.equal(browserChallenge.outcome, 'unavailable')
assert.equal(browserChallenge.blocker, 'google_sorry')
assert.equal(browserChallenge.resultRegionInspected, false)
assert(!('visibilityResult' in browserChallenge), '5: a Browser challenge is unavailable and never becomes not_found')

const bothFail = await acquireGoogleWithBrightData(orchestratorConfig, {
  acquireSerp: async () => ({ ...unavailable('brightdata_serp_api', 'provider_failure'), rawResponse: { error: 'provider failed' } }),
  acquireBrowser: async () => unavailable('brightdata_browser_api', 'access_failure'),
})
assert.equal(bothFail.outcome, 'unavailable')
assert.equal(bothFail.selectedProvider, null)
assert.equal(bothFail.resultRegionInspected, false, '6: failure by both providers remains unavailable')

const organic = normalizeSerpPayload({ organic: [{ source: 'Directory', title: 'Example Studio', link: 'https://directory.example/profile', rank: 1 }] })[0]
assert.equal(organic.resultUrl, 'https://directory.example/profile')
assert.equal(organic.resultDomain, 'directory.example')
assert.equal(organic.businessWebsite, undefined, '7: an organic destination is not a business website claim')

const knowledge = normalizeSerpPayload({ knowledge: { name: 'Example Studio', website: 'https://example.com/', address: '1 Main St, Example, MI 48111' } })[0]
assert.equal(knowledge.businessWebsite, 'https://example.com/')
assert.equal(knowledge.businessDomain, 'example.com', '8: an explicit knowledge-panel website is business website evidence')

const embeddedFailure = classifySerpResponse({ status: 200, parsed: { status_code: 503, organic: [] } })
assert.equal(embeddedFailure.blocker, 'embedded_5xx')
assert.equal(embeddedFailure.resultRegionInspected, false)
const emptyNormal = classifySerpResponse({ status: 200, parsed: { general: { search_engine: 'google' }, organic: [] } })
assert.equal(emptyNormal.usable, true)
assert.equal(emptyNormal.resultRegionInspected, true)
const missingRegion = classifySerpResponse({ status: 200, parsed: { general: { search_engine: 'google' } } })
assert.equal(missingRegion.usable, false)
assert.equal(missingRegion.resultRegionInspected, false)
assert(!('visibilityResult' in missingRegion), '9: acquisition without result-region inspection cannot assert not_found')

const mapsPayload = { results: [{ title: 'Example Studio', website: 'https://example.com/', link: 'https://www.google.com/maps/place/Example+Studio/data=!4m2!3m1!1splace-1', phone: '555-555-0100', address: { street_address: '1 Main Street', city: 'Example', state: 'MI', postal_code: '48111' }, category: 'Photography studio', place_id: 'place-1', rating: '4.8', reviews_count: '37', rank: 1 }] }
const structuredMaps = await acquireBrightDataMaps(serpConfig, async (_config, requestedUrl) => {
  assert(requestedUrl.includes('/maps/search/Example%20Studio/'))
  assert(requestedUrl.includes('brd_json=1'))
  return { status: 200, bodyText: JSON.stringify(mapsPayload) }
})
assert.equal(structuredMaps.usable, true)
assert.equal(structuredMaps.destination, 'google_maps')
assert.equal(structuredMaps.resultRegionInspected, true)
assert.equal(structuredMaps.candidates[0].rating, 4.8)
assert.equal(structuredMaps.candidates[0].reviewCount, 37)
assert.equal(structuredMaps.candidates[0].resultUrl?.includes('/maps/place/'), true)
assert.equal(structuredMaps.candidates[0].businessWebsite, 'https://example.com/')

let mapsBrowserCalls = 0
const mapsFallback = await acquireGoogleMapsWithBrightData(orchestratorConfig, {
  acquireSerp: async () => ({ ...unavailable('brightdata_serp_api', 'provider_failure'), destination: 'google_maps', rawResponse: { error: 'provider failed' } }),
  acquireBrowser: async () => { mapsBrowserCalls += 1; return { ...structuredMaps, provider: 'brightdata_browser_api', provenance: 'brightdata_browser_api', rawProviderMetadataReference: 'maps-browser.json' } },
})
assert.equal(mapsBrowserCalls, 1)
assert.equal(mapsFallback.selectedProvider, 'brightdata_browser_api', 'Maps structured acquisition failure invokes Browser API once')

const mapsObserved: BrowserObservedPage = { title: 'Example Studio - Google Maps', visibleText: 'Example Studio 1 Main Street Example MI 48111 555-555-0100', resultRegionInspected: true, organic: [], noResults: false,
  local: [{ name: 'Example Studio', businessWebsite: 'https://example.com/', resultUrl: 'https://www.google.com/maps/place/Example+Studio/data=!4m2!3m1!1splace-1', phone: '555-555-0100', address: '1 Main Street, Example, MI 48111', category: 'Photography studio', placeIdentity: 'place-1', rank: 1 }] }
const browserMaps = await acquireBrightDataMapsBrowser({ query, cdpUrl: 'wss://hidden@example.invalid:9222', rawProviderMetadataReference: 'maps-browser.json' }, async (_config, requestedUrl) => ({ observed: mapsObserved, finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }))
assert.equal(browserMaps.outcome, 'success')
assert.equal(browserMaps.resultRegionInspected, true)
assert.equal(browserMaps.candidates[0].provenance.destination, 'google_maps', 'Browser API normal Maps place returns a normalized local candidate')
const mapsChallenge = await acquireBrightDataMapsBrowser({ query, cdpUrl: 'wss://hidden@example.invalid:9222', rawProviderMetadataReference: 'maps-browser.json' }, async (_config, requestedUrl) => ({ observed: { ...mapsObserved, visibleText: 'Our systems have detected unusual traffic', resultRegionInspected: false, local: [] }, finalUrl: requestedUrl.replace('/maps/search/', '/sorry/'), statusCode: 200, navigationFailed: false }))
assert.equal(mapsChallenge.outcome, 'unavailable')
assert.equal(mapsChallenge.blocker, 'google_sorry', 'Browser API Maps challenge remains unavailable')
const browserMapsNoMatch = await acquireBrightDataMapsBrowser({ query, cdpUrl: 'wss://hidden@example.invalid:9222', rawProviderMetadataReference: 'maps-browser.json' }, async (_config, requestedUrl) => ({ observed: { title: 'Google Maps', visibleText: 'No results found', resultRegionInspected: true, organic: [], local: [], noResults: true }, finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }))
assert.equal(browserMapsNoMatch.outcome, 'success')
assert.equal(browserMapsNoMatch.resultRegionInspected, true)
assert.equal(browserMapsNoMatch.diagnostic.classification, 'no_matching_place')

const profile = normalizeWorkspaceProfile({ businessName: 'Example Studio', website: 'https://example.com/', streetAddress: '1 Main Street', city: 'Example', state: 'MI', zip: '48111', phone: '555-555-0100' })
const reviewed = (value: BusinessProfile): BusinessProfileState => ({ schemaVersion: 1, values: Object.fromEntries(Object.entries(value).map(([field, fieldValue]) => [field, { value: fieldValue, source: 'fixture review', status: 'operator_reviewed', confidence: 'high' }])) })
const runWith = (selected: NormalizedGoogleAcquisition) => ({
  primaryProvider: 'brightdata_serp_api' as const,
  selectedProvider: selected.provider,
  fallbackTriggered: selected.provider === 'brightdata_browser_api',
  fallbackReason: selected.provider === 'brightdata_browser_api' ? 'provider_failure' as const : null,
  serp: selected.provider === 'brightdata_serp_api' ? selected : unavailable('brightdata_serp_api', 'provider_failure'),
  ...(selected.provider === 'brightdata_browser_api' ? { browser: selected } : {}),
  selected,
  outcome: 'success' as const,
  blocker: 'none' as const,
  resultRegionInspected: true,
  candidates: selected.candidates,
  elapsedMs: selected.elapsedMs,
})

const mapsProductionCapture = brightDataProductionCapture(runWith(structuredMaps), structuredMaps.requestedUrl, 'Google Maps')
const mapsMatch = assessSearchCapture(mapsProductionCapture, profile, reviewed(profile), 'Google Maps', 'brand')
assert.equal(mapsMatch.confidence, 'high')
assert.equal(mapsMatch.automaticObservation, true)
assert.equal(mapsMatch.visibilityResult, 'found', '19: structured Google Maps identity evidence enters the existing matcher')
assert.equal(mapsProductionCapture.checkedDestination, 'Google Maps')
assert.equal(mapsProductionCapture.provider, 'brightdata_serp_api')

const mapsAssessmentFor = (payload: Record<string, unknown>) => {
  const acquisition = { ...structuredMaps, candidates: normalizeMapsPayload(payload) }
  return assessSearchCapture(brightDataProductionCapture(runWith(acquisition), acquisition.requestedUrl, 'Google Maps'), profile, reviewed(profile), 'Google Maps', 'brand')
}
const mapsPhoneConflict = mapsAssessmentFor({ results: [{ ...mapsPayload.results[0], phone: '313-555-9999' }] })
assert.equal(mapsPhoneConflict.visibilityResult, 'review_required')
assert(mapsPhoneConflict.selected?.conflictingFields.some((field) => field.field === 'phone'), '20: conflicting Maps phone remains review-required')
const mapsAddressConflict = mapsAssessmentFor({ results: [{ ...mapsPayload.results[0], address: { street_address: '999 Other Road', city: 'Detroit', state: 'MI', postal_code: '48201' } }] })
assert.equal(mapsAddressConflict.visibilityResult, 'review_required')
assert(mapsAddressConflict.selected?.conflictingFields.some((field) => ['streetAddress', 'locality', 'postalCode'].includes(field.field)), '21: conflicting Maps address remains review-required')

const mapsPlaceOnly = normalizeMapsPayload({ results: [{ title: 'Example Studio', link: 'https://www.google.com/maps/place/Example+Studio/data=!4m2!3m1!1splace-1', phone: profile.phone }] })[0]
assert.equal(mapsPlaceOnly.resultUrl?.includes('/maps/place/'), true)
assert.equal(mapsPlaceOnly.businessWebsite, undefined, '22: a Maps/place destination is not treated as the official business website')
const mapsExplicitWebsite = normalizeMapsPayload({ results: [{ title: 'Example Studio', link: 'https://www.google.com/maps/place/Example+Studio', website: profile.website }] })[0]
assert.equal(mapsExplicitWebsite.businessWebsite, profile.website, '23: an explicit Maps website action becomes businessWebsite evidence')

const unrelatedMaps = { ...structuredMaps, candidates: normalizeMapsPayload({ results: [{ title: 'Different Studio', link: 'https://www.google.com/maps/place/Different+Studio', phone: '313-555-1000', address: '99 Different Road, Detroit, MI 48201' }] }) }
const mapsNotFound = assessSearchCapture(brightDataProductionCapture(runWith(unrelatedMaps), unrelatedMaps.requestedUrl, 'Google Maps'), profile, reviewed(profile), 'Google Maps', 'brand')
assert.equal(mapsNotFound.visibilityResult, 'not_found')
assert.equal(mapsNotFound.operatorReviewRequired, false, '24: a successful inspected Maps region without a sufficient match can produce not_found')

const failedMapsRun = await acquireGoogleMapsWithBrightData(orchestratorConfig, {
  acquireSerp: async () => ({ ...unavailable('brightdata_serp_api', 'provider_failure'), destination: 'google_maps', rawResponse: { error: 'provider failed' } }),
  acquireBrowser: async () => ({ ...unavailable('brightdata_browser_api', 'access_failure'), destination: 'google_maps' }),
})
const failedMapsAssessment = assessSearchCapture(brightDataProductionCapture(failedMapsRun, 'https://www.google.com/maps/search/Example%20Studio', 'Google Maps'), profile, reviewed(profile), 'Google Maps', 'brand')
assert.equal(failedMapsAssessment.visibilityResult, 'unavailable')
assert.notEqual(failedMapsAssessment.visibilityResult, 'not_found', '25: failure by both Maps providers cannot become not_found')

const officialOrganic = {
  ...success('brightdata_serp_api'),
  candidates: normalizeSerpPayload({ organic: [{ source: 'Example publisher label', title: 'Example Studio — Official Site', link: 'https://example.com/', rank: 1 }] }),
}
const serpProductionCapture = brightDataProductionCapture(runWith(officialOrganic), officialOrganic.requestedUrl)
const serpMatch = assessSearchCapture(serpProductionCapture, profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(serpProductionCapture.provider, 'brightdata_serp_api')
assert.equal(serpMatch.automaticObservation, true)
assert.equal(serpMatch.visibilityResult, 'found', '10: production SERP candidates enter the existing matcher')
assert(serpMatch.selected?.matchedFields.some((field) => field.field === 'website'))
assert.equal(serpMatch.selected?.candidate.fields.name, 'Example Studio — Official Site', 'Organic titles supply bounded identity evidence instead of a publisher label')

const browserOfficial = { ...officialOrganic, provider: 'brightdata_browser_api' as const, provenance: 'brightdata_browser_api' as const,
  candidates: officialOrganic.candidates.map((candidate) => ({ ...candidate, id: candidate.id.replace('serp', 'browser'), provenance: { ...candidate.provenance, provider: 'brightdata_browser_api' as const } })) }
const browserProductionCapture = brightDataProductionCapture(runWith(browserOfficial), browserOfficial.requestedUrl)
const browserMatch = assessSearchCapture(browserProductionCapture, profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(browserProductionCapture.provider, 'brightdata_browser_api')
assert.equal(browserProductionCapture.method, 'rendered_browser')
assert.equal(browserMatch.automaticObservation, true)
assert.equal(browserMatch.visibilityResult, 'found', '11: Browser API fallback candidates enter the same matcher')

const conflicting = { ...success('brightdata_serp_api'), candidates: normalizeSerpPayload({ knowledge: { name: 'Example Studio', website: 'https://different.example/', phone: '313-555-0100' } }) }
const conflictAssessment = assessSearchCapture(brightDataProductionCapture(runWith(conflicting), conflicting.requestedUrl), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(conflictAssessment.visibilityResult, 'review_required')
assert.equal(conflictAssessment.blocker, 'identifier_conflict', '12: conflicting provider identity remains review-required')

const unrelated = { ...success('brightdata_serp_api'), candidates: normalizeSerpPayload({ organic: [{ title: 'Different Company', link: 'https://different.example/', rank: 1 }] }) }
const noMatch = assessSearchCapture(brightDataProductionCapture(runWith(unrelated), unrelated.requestedUrl), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(noMatch.visibilityResult, 'not_found')
assert.equal(noMatch.operatorReviewRequired, false, '13: only a successful inspected result region can produce not_found')
const emptyInspected = { ...success('brightdata_serp_api'), candidates: [] }
const emptyInspectedAssessment = assessSearchCapture(brightDataProductionCapture(runWith(emptyInspected), emptyInspected.requestedUrl), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(emptyInspectedAssessment.visibilityResult, 'not_found', 'An explicitly inspected normal zero-result region can produce not_found')

const failedProductionCapture = brightDataProductionCapture(bothFail, bothFail.serp.requestedUrl)
const failedAssessment = assessSearchCapture(failedProductionCapture, profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(failedAssessment.visibilityResult, 'unavailable')
assert.equal(failedAssessment.operatorReviewRequired, true)
assert.notEqual(failedAssessment.visibilityResult, 'not_found', '14: failure by both Bright Data providers cannot become not_found')

const exported = JSON.stringify({ serpProductionCapture, browserProductionCapture, failedProductionCapture, mapsProductionCapture })
assert.equal(exported.includes('test-token'), false)
assert.equal(exported.includes('hidden@example.invalid'), false)
assert.equal(exported.includes('wss://'), false, '15: persisted production captures omit tokens and Browser API connection values')

const historical = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
const state: AuditState = { profile, businessProfile: reviewed(profile), checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: { entityClarity: [], customerQuestions: [] } }
let current = state
let googleProviderCalls = 0
let googleMapsProviderCalls = 0
let genericGoogleCalls = 0
let genericGoogleMapsCalls = 0
let bingCalls = 0
await runVisibilityScan(state, {
  automationVersion: 2,
  async website() { return historical },
  async acquireGoogle(url) {
    googleProviderCalls += 1
    const selected = { ...officialOrganic, query: new URL(url).searchParams.get('q') || query, requestedUrl: url, finalUrl: url }
    return brightDataProductionCapture(runWith(selected), url)
  },
  async acquireGoogleMaps(url) {
    googleMapsProviderCalls += 1
    const selected = { ...structuredMaps, query: decodeURIComponent(new URL(url).pathname.split('/search/')[1] || query), requestedUrl: url, finalUrl: url }
    return brightDataProductionCapture(runWith(selected), url, 'Google Maps')
  },
  async acquire(url, method) {
    if (url.includes('google.com/search')) genericGoogleCalls += 1
    if (url.includes('google.com/maps/')) genericGoogleMapsCalls += 1
    if (url.includes('bing.com/search')) bingCalls += 1
    return { version: 1, requestedUrl: url, finalUrl: url, acquiredAt: new Date().toISOString(), provider: 'unchanged-direct-provider', method, outcome: 'failed', confidence: 'unavailable', notes: [], error: 'Fixture unavailable' }
  },
}, (update) => { current = update(current) })
assert.equal(googleProviderCalls, 2, '16: Brand and Location Google checks use the dedicated production provider')
assert.equal(googleMapsProviderCalls, 2, 'Brand and Location Google Maps checks use the dedicated production provider')
assert.equal(genericGoogleCalls, 0, 'Configured Bright Data Google checks do not also run the direct ladder')
assert.equal(genericGoogleMapsCalls, 0, 'Configured Bright Data Google Maps checks do not run local Playwright')
assert(bingCalls > 0, 'Bing remains on the existing direct acquisition path')
const persistedGoogleBrand = current.searchDestinationObservations['search-brand-canonical']['Google Search']!
assert.equal(persistedGoogleBrand.overallResult, 'found_match')
assert.equal(persistedGoogleBrand.automation?.automaticObservation, true)
assert.equal(persistedGoogleBrand.automation?.captures[0]?.provider, 'brightdata_serp_api', '17: selected production provenance is retained in scan evidence')
const persistedGoogleMapsBrand = current.searchDestinationObservations['search-brand-canonical']['Google Maps']!
assert.equal(persistedGoogleMapsBrand.overallResult, 'found_match')
assert.equal(persistedGoogleMapsBrand.automation?.captures[0]?.checkedDestination, 'Google Maps')

const failedMapsCapture = (url: string) => ({ ...brightDataProductionCapture(failedMapsRun, url, 'Google Maps'), requestedUrl: url, finalUrl: url })
const successfulMapsCapture = (url: string) => ({ ...mapsProductionCapture, requestedUrl: url, finalUrl: url })
let enrichedState = state
const enrichedQueries: string[] = []
const enrichedRun = await runVisibilityScan(state, {
  automationVersion: 2,
  async website() { return historical },
  async acquireGoogle(url) { return { ...serpProductionCapture, requestedUrl: url, finalUrl: url } },
  async acquireGoogleMaps(url) {
    const observedQuery = decodeURIComponent(new URL(url).pathname.split('/search/')[1] || '')
    enrichedQueries.push(observedQuery)
    return observedQuery === profile.businessName ? failedMapsCapture(url) : successfulMapsCapture(url)
  },
  async acquire(url, method) { return { version: 1, requestedUrl: url, finalUrl: url, acquiredAt: new Date().toISOString(), provider: 'unchanged-direct-provider', method, outcome: 'failed', confidence: 'unavailable', notes: [], error: 'Fixture unavailable' } },
}, (update) => { enrichedState = update(enrichedState) })
assert.deepEqual(enrichedQueries.slice(0, 2), [profile.businessName, `${profile.businessName} ${profile.city} ${profile.state}`], 'A failed plain Brand Maps query gets exactly one deterministic reviewed-location enrichment')
const enrichedBrandCheck = enrichedRun.checks.find((check) => check.queryMode === 'brand' && check.destination === 'Google Maps')!
assert.equal(enrichedBrandCheck.captures.length, 2)
assert.equal(enrichedBrandCheck.captures[0].outcome, 'failed')
assert.equal(enrichedBrandCheck.captures[1].outcome, 'success')
assert(enrichedBrandCheck.captures[1].notes.some((note) => note.includes('reviewed-location query enrichment')))
assert.equal(enrichedBrandCheck.assessment?.confidence, 'high')
assert.equal(enrichedBrandCheck.assessment?.visibilityResult, 'found')
assert.equal(enrichedBrandCheck.assessment?.automaticObservation, true, 'An enriched Maps place proceeds through the unchanged matcher')
assert.equal(enrichedState.searchDestinationObservations['search-brand-canonical']['Google Maps']?.overallResult, 'found_match')

const successfulQueries: string[] = []
const successfulRun = await runVisibilityScan(state, {
  automationVersion: 2,
  async website() { return historical },
  async acquireGoogle(url) { return { ...serpProductionCapture, requestedUrl: url, finalUrl: url } },
  async acquireGoogleMaps(url) { successfulQueries.push(decodeURIComponent(new URL(url).pathname.split('/search/')[1] || '')); return successfulMapsCapture(url) },
  async acquire(url, method) { return { version: 1, requestedUrl: url, finalUrl: url, acquiredAt: new Date().toISOString(), provider: 'unchanged-direct-provider', method, outcome: 'failed', confidence: 'unavailable', notes: [], error: 'Fixture unavailable' } },
})
assert.equal(successfulQueries.filter((value) => value === profile.businessName).length, 1)
assert.equal(successfulRun.checks.find((check) => check.queryMode === 'brand' && check.destination === 'Google Maps')?.captures.length, 1, 'A successful inspected plain Brand Maps result never triggers enrichment')

const failedQueries: string[] = []
const unavailableRun = await runVisibilityScan(state, {
  automationVersion: 2,
  async website() { return historical },
  async acquireGoogle(url) { return { ...serpProductionCapture, requestedUrl: url, finalUrl: url } },
  async acquireGoogleMaps(url) { failedQueries.push(decodeURIComponent(new URL(url).pathname.split('/search/')[1] || '')); return failedMapsCapture(url) },
  async acquire(url, method) { return { version: 1, requestedUrl: url, finalUrl: url, acquiredAt: new Date().toISOString(), provider: 'unchanged-direct-provider', method, outcome: 'failed', confidence: 'unavailable', notes: [], error: 'Fixture unavailable' } },
})
const unavailableBrand = unavailableRun.checks.find((check) => check.queryMode === 'brand' && check.destination === 'Google Maps')!
assert.deepEqual(failedQueries.slice(0, 2), [profile.businessName, `${profile.businessName} ${profile.city} ${profile.state}`])
assert.equal(unavailableBrand.captures.length, 2)
assert.equal(unavailableBrand.assessment?.visibilityResult, 'unavailable')
assert.equal(unavailableBrand.assessment?.operatorReviewRequired, true)
assert.notEqual(unavailableBrand.assessment?.visibilityResult, 'not_found', 'A failed enriched attempt remains unavailable')

let directGoogleCalls = 0
let directGoogleMapsCalls = 0
await runVisibilityScan(state, {
  automationVersion: 2,
  async website() { return historical },
  async acquireGoogle() { return undefined },
  async acquireGoogleMaps() { return undefined },
  async acquire(url, method) {
    if (url.includes('google.com/search')) {
      directGoogleCalls += 1
      if (method === 'server_fetch') return { ...serpProductionCapture, requestedUrl: url, finalUrl: url, provider: 'retained-direct-provider', method }
    }
    if (url.includes('google.com/maps/')) directGoogleMapsCalls += 1
    return { version: 1, requestedUrl: url, finalUrl: url, acquiredAt: new Date().toISOString(), provider: 'retained-direct-provider', method, outcome: 'failed', confidence: 'unavailable', notes: [], error: 'Fixture unavailable' }
  },
})
assert(directGoogleCalls >= 2, '18: an explicitly unconfigured dedicated provider yields to the retained direct Google ladder')
assert(directGoogleMapsCalls >= 2, 'An explicitly unconfigured Maps provider yields to the retained direct Google Maps ladder')

console.log('Bright Data Google acquisition PASS: Search and Maps provider ordering, bounded Browser fallbacks, production matcher handoff, conflict/absence semantics, URL separation, credential omission, and challenge safeguards.')
