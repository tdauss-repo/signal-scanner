import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import {
  createApplicationVisibilityScanDependencies,
  runVisibilityScan,
  type ScanDependencies,
} from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const acquiredAt = '2026-09-28T18:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver',
  primaryCategory: 'Preschool',
  streetAddress: '15575 Northline Road',
  city: 'Southgate',
  state: 'MI',
  zip: '48195',
  phone: '734-282-6465',
  website: 'http://www.montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const businessProfile: BusinessProfileState = {
  schemaVersion: 1,
  values: Object.fromEntries(fields.map((field) => [field, {
    value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: acquiredAt,
  }])) as BusinessProfileState['values'],
}
const state = (): AuditState => ({
  profile: structuredClone(profile),
  businessProfile: structuredClone(businessProfile),
  checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: acquiredAt, reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {},
  voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const websiteAudit = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
const success = (url: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, finalUrl: url, provider: 'bing-native-fetch', checkedDestination: 'Bing Search',
  method: 'server_fetch', acquiredAt, outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [],
  normalizedSearchCandidates: [{
    id: 'bing-mary-official', kind: 'semantic_card', sourceType: 'organic', resultUrl: 'https://montessoridownriver.com/',
    fields: { name: profile.businessName, website: 'https://montessoridownriver.com/', locality: 'Southgate', region: 'MI' }, evidence: [],
  }],
})
const appleSuccess = (url: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, finalUrl: 'https://maps.apple.com/place?place-id=fixture-apple-place', provider: 'apple-maps-native-fetch', checkedDestination: 'Apple Maps',
  method: 'server_fetch', acquiredAt, outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [],
  normalizedSearchCandidates: [{
    id: 'apple-mary-place', kind: 'structured_entity', sourceType: 'local_place', resultUrl: 'https://maps.apple.com/place?place-id=fixture-apple-place',
    fields: { name: profile.businessName, phone: profile.phone, publicProfileUrl: 'https://maps.apple.com/place?place-id=fixture-apple-place', placeIdentity: 'fixture-apple-place' }, evidence: [],
  }],
})
const duckSuccess = (url: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, finalUrl: 'https://html.duckduckgo.com/html/?q=fixture', provider: 'duckduckgo-native-fetch', checkedDestination: 'DuckDuckGo',
  method: 'server_fetch', acquiredAt, outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [],
  normalizedSearchCandidates: [{
    id: 'duck-mary-official', kind: 'result_link', sourceType: 'organic', resultUrl: 'https://montessoridownriver.com/',
    fields: { name: profile.businessName }, evidence: [],
  }],
})
const yelpSuccess = (url: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, finalUrl: url, provider: 'yelp-native-fetch', checkedDestination: 'Yelp',
  method: 'server_fetch', acquiredAt, outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [],
  normalizedSearchCandidates: [{
    id: 'yelp-mary', kind: 'structured_entity', sourceType: 'local_place', resultUrl: 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate',
    fields: { name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195', publicProfileUrl: 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate' }, evidence: [],
  }],
})
const unavailable = (url: string, method: AcquisitionResult['method'] = 'server_fetch'): AcquisitionResult => ({
  version: 1, requestedUrl: url, provider: 'fixture-unavailable', method, acquiredAt, outcome: 'failed', confidence: 'unavailable',
  blocker: 'network_failure', notes: [], error: 'Fixture network unavailable.',
})

type RecordedRequest = { endpoint: string; body: Record<string, unknown> }
const requests: RecordedRequest[] = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const endpoint = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
  requests.push({ endpoint, body })
  const payload = endpoint === '/api/audit-website'
    ? websiteAudit
    : endpoint === '/api/acquire-bing-search'
      ? { capture: success(String(body.url || '')) }
      : endpoint === '/api/acquire-apple-maps'
        ? { capture: appleSuccess(String(body.url || '')) }
        : endpoint === '/api/acquire-duckduckgo-search'
          ? { capture: duckSuccess(String(body.url || '')) }
        : endpoint === '/api/acquire-yelp-search'
          ? { capture: yelpSuccess(String(body.url || '')) }
      : { capture: unavailable(String(body.url || ''), body.method === 'rendered_browser' ? 'rendered_browser' : 'server_fetch') }
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

try {
  const productionDependencies = createApplicationVisibilityScanDependencies()
  assert.equal(typeof productionDependencies.acquireBingSearch, 'function', '1: the production App dependency factory requires Bing acquisition')
  assert.equal(typeof productionDependencies.acquireAppleMaps, 'function', 'the production App dependency factory requires Apple Maps acquisition')
  assert.equal(typeof productionDependencies.acquireDuckDuckGoSearch, 'function', 'the production App dependency factory requires DuckDuckGo acquisition')
  assert.equal(typeof productionDependencies.acquireYelpSearch, 'function', 'the production App dependency factory requires Yelp acquisition')

  let current = state()
  const run = await runVisibilityScan(current, productionDependencies, (update) => { current = update(current) })
  const bingBrand = run.checks.find((check) => check.destination === 'Bing Search' && check.queryMode === 'brand')!
  const bingApiRequests = requests.filter((request) => request.endpoint === '/api/acquire-bing-search')
  const appleApiRequests = requests.filter((request) => request.endpoint === '/api/acquire-apple-maps')
  const duckApiRequests = requests.filter((request) => request.endpoint === '/api/acquire-duckduckgo-search')
  const yelpApiRequests = requests.filter((request) => request.endpoint === '/api/acquire-yelp-search')
  const genericRequests = requests.filter((request) => request.endpoint === '/api/acquire-public-presence')

  assert.equal(bingApiRequests.length, 1, '2: the real production factory invokes the dedicated Bing API once')
  assert.equal(appleApiRequests.length, 1, 'the real production factory invokes the dedicated Apple Maps API once')
  assert.equal(duckApiRequests.length, 1, 'the real production factory invokes the dedicated DuckDuckGo API once')
  assert.equal(yelpApiRequests.length, 1, 'the real production factory invokes the dedicated Yelp API once')
  assert.equal(bingApiRequests[0].body.url, bingBrand.url)
  assert.equal(new URL(String(bingApiRequests[0].body.url)).searchParams.get('q'), 'Montessori Center of Downriver Southgate MI', '5: production uses the reviewed identity plus locality')
  assert.equal(genericRequests.some((request) => request.body.url === bingBrand.url), false, '3: the Bing Brand URL never reaches generic acquisition')
  assert.equal(genericRequests.some((request) => request.body.url === bingBrand.url && request.body.method === 'rendered_browser'), false, '4: Bing Brand never invokes rendered-browser acquisition')
  assert.deepEqual(bingBrand.captures.map((capture) => [capture.provider, capture.method]), [['bing-native-fetch', 'server_fetch']])
  const appleBrand = run.checks.find((check) => check.destination === 'Apple Maps' && check.queryMode === 'brand')!
  assert.deepEqual(appleBrand.captures.map((capture) => [capture.provider, capture.method]), [['apple-maps-native-fetch', 'server_fetch']])
  assert.equal(genericRequests.some((request) => request.body.url === appleBrand.url), false, 'Apple Maps Brand never reaches generic acquisition')
  const duckBrand = run.checks.find((check) => check.destination === 'DuckDuckGo' && check.queryMode === 'brand')!
  assert.deepEqual(duckBrand.captures.map((capture) => [capture.provider, capture.method]), [['duckduckgo-native-fetch', 'server_fetch']])
  assert.equal(new URL(String(duckApiRequests[0].body.url)).searchParams.get('q'), 'Montessori Center of Downriver Southgate MI')
  assert.equal(genericRequests.some((request) => request.body.url === duckBrand.url), false, 'DuckDuckGo Brand never reaches generic acquisition')
  const yelpBrand = run.checks.find((check) => check.destination === 'Yelp' && check.queryMode === 'brand')!
  assert.deepEqual(yelpBrand.captures.map((capture) => [capture.provider, capture.method]), [['yelp-native-fetch', 'server_fetch']])
  assert.equal(new URL(String(yelpApiRequests[0].body.url)).searchParams.get('find_desc'), profile.businessName)
  assert.equal(new URL(String(yelpApiRequests[0].body.url)).searchParams.get('find_loc'), 'Southgate, MI 48195')
  assert.equal(genericRequests.some((request) => request.body.url === yelpBrand.url), false, 'Yelp Brand never reaches generic acquisition')
  assert.equal(bingBrand.assessment?.bingIdentityDecision?.decision, 'verified', 'the production response reaches the existing Bing matcher')
  assert(requests.some((request) => request.endpoint === '/api/acquire-google-search'), '7: Google Search production wiring remains present')
  assert(requests.some((request) => request.endpoint === '/api/acquire-google-maps'), '7: Google Maps production wiring remains present')

  const withoutBing: ScanDependencies = { ...createApplicationVisibilityScanDependencies() }
  delete withoutBing.acquireBingSearch
  let missingState = state()
  const missingRun = await runVisibilityScan(missingState, withoutBing, (update) => { missingState = update(missingState) })
  const missingBrand = missingRun.checks.find((check) => check.destination === 'Bing Search' && check.queryMode === 'brand')!
  assert.equal(missingBrand.captures.length, 1, '6: missing production wiring produces one fail-closed capture')
  assert.equal(missingBrand.captures[0].provider, 'bing-native-request')
  assert.equal(missingBrand.captures[0].blocker, 'bing_acquisition_not_configured')
  assert.equal(missingBrand.captures[0].error, 'Dedicated Bing acquisition is not configured.')
  assert.equal(requests.filter((request) => request.endpoint === '/api/acquire-public-presence' && request.body.url === missingBrand.url).length, 0, '6: missing wiring cannot silently use generic acquisition')
} finally {
  globalThis.fetch = originalFetch
}

console.log('Application scan acquisition wiring PASS: App factory provides dedicated Bing, Apple Maps, DuckDuckGo, and Yelp endpoints, locality queries, fail-closed semantics, and unchanged Google wiring.')
