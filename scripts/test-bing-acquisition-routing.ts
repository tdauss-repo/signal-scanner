import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInAcquisitionLane } from '../server/acquisitionRuntime.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import {
  applicationScanDependencies,
  destinationAcquisitionRoute,
  runVisibilityScan,
} from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const acquiredAt = '2026-09-28T18:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195',
  phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const businessProfile: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: acquiredAt,
}])) as BusinessProfileState['values'] }
const state = (): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(businessProfile), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: acquiredAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {},
  voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const websiteAudit = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
const bingSuccess = (url: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, finalUrl: url, provider: 'bing-native-fetch', checkedDestination: 'Bing Search',
  method: 'server_fetch', acquiredAt, outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [],
  normalizedSearchCandidates: [{
    id: 'bing-mary-official', kind: 'semantic_card', sourceType: 'organic', resultUrl: 'https://montessoridownriver.com/',
    fields: { name: profile.businessName, website: 'https://montessoridownriver.com/', locality: 'Southgate', region: 'MI' }, evidence: [],
  }],
})
const failed = (url: string, method: AcquisitionResult['method'] = 'server_fetch'): AcquisitionResult => ({
  version: 1, requestedUrl: url, provider: 'fixture-generic', method, acquiredAt, outcome: 'failed', confidence: 'unavailable',
  blocker: 'network_failure', notes: [], error: 'Fixture network unavailable.',
})

assert.equal(destinationAcquisitionRoute('Google Search', 'brand'), 'google_search')
assert.equal(destinationAcquisitionRoute('Google Maps', 'brand'), 'google_maps')
assert.equal(destinationAcquisitionRoute('Bing Search', 'brand'), 'bing_native_search', '1: Bing Brand has an explicit dedicated route')
assert.equal(destinationAcquisitionRoute('Bing Search', 'location'), 'generic', 'Location Diagnostic retains its existing route')
assert.equal(destinationAcquisitionRoute('Yelp', 'brand'), 'generic', '9: other destinations retain the generic route')

const originalFetch = globalThis.fetch
let endpoint = ''
let endpointMethod = ''
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  endpoint = String(input)
  endpointMethod = String(init?.method || '')
  return new Response(JSON.stringify({ capture: bingSuccess('https://www.bing.com/search?q=fixture') }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}) as typeof fetch
try {
  await applicationScanDependencies.acquireBingSearch('https://www.bing.com/search?q=fixture')
} finally { globalThis.fetch = originalFetch }
assert.equal(endpoint, '/api/acquire-bing-search', 'the application adapter calls the dedicated backend endpoint')
assert.equal(endpointMethod, 'POST')

let releaseGeneric: (() => void) | undefined
const genericHeld = runInAcquisitionLane('shared', () => new Promise<void>((resolve) => { releaseGeneric = resolve }))
await Promise.resolve()
assert.equal(await runInAcquisitionLane('bing_native', async () => 'bing-ran'), 'bing-ran', '4: unrelated generic work cannot block native Bing')
await assert.rejects(() => runInAcquisitionLane('shared', async () => undefined), /Public acquisition busy/)
releaseGeneric?.()
await genericHeld

let current = state()
const dedicatedUrls: string[] = []
const genericCalls: Array<{ url: string; method: string }> = []
const googleCalls: string[] = []
const mapsCalls: string[] = []
const run = await runVisibilityScan(current, {
  automationVersion: 2,
  website: async () => websiteAudit,
  acquireGoogle: async (url) => { googleCalls.push(url); return failed(url) },
  acquireGoogleMaps: async (url) => { mapsCalls.push(url); return failed(url) },
  acquireBingSearch: async (url) => { dedicatedUrls.push(url); return bingSuccess(url) },
  acquire: async (url, method) => { genericCalls.push({ url, method }); throw new Error('Public acquisition busy. Retry this check later.') },
}, (update) => { current = update(current) })

assert.equal(dedicatedUrls.length, 1, '1: Bing Brand dispatches exactly once to its dedicated provider')
const bingUrl = new URL(dedicatedUrls[0])
assert.equal(bingUrl.hostname, 'www.bing.com')
assert.equal(bingUrl.pathname, '/search')
assert.equal(bingUrl.searchParams.get('q'), 'Montessori Center of Downriver Southgate MI', '5: clean Brand query includes reviewed locality')
assert.equal(genericCalls.some((call) => call.url === dedicatedUrls[0]), false, '2: the Bing Brand URL never reaches generic acquisition-request')
const brandCheck = run.checks.find((check) => check.destination === 'Bing Search' && check.queryMode === 'brand')!
assert.deepEqual(brandCheck.captures.map((item) => item.method), ['server_fetch'], '3: Bing Brand has no rendered-browser fallback')
assert.equal(brandCheck.captures[0].provider, 'bing-native-fetch')
assert.equal(brandCheck.assessment?.bingIdentityDecision?.decision, 'verified', '6: successful dedicated evidence reaches the existing matcher')
assert.equal(current.searchDestinationObservations['search-brand-canonical']?.['Bing Search']?.overallResult, 'found_match')
assert(googleCalls.length > 0 && mapsCalls.length > 0, '8: Google routes remain dedicated')
assert(genericCalls.some((call) => call.url.includes('yelp.com')), '9: other destinations retain generic routing')

let unavailableState = state()
const unavailableGeneric: Array<{ url: string; method: string }> = []
const unavailableRun = await runVisibilityScan(unavailableState, {
  automationVersion: 2, website: async () => websiteAudit,
  acquireBingSearch: async (url) => ({ ...failed(url), provider: 'bing-native-fetch', checkedDestination: 'Bing Search' }),
  acquire: async (url, method) => { unavailableGeneric.push({ url, method }); return failed(url, method) },
}, (update) => { unavailableState = update(unavailableState) })
const unavailableBrand = unavailableRun.checks.find((check) => check.destination === 'Bing Search' && check.queryMode === 'brand')!
assert.equal(unavailableBrand.captures.length, 1)
assert.equal(unavailableBrand.captures[0].provider, 'bing-native-fetch')
assert.equal(unavailableBrand.captures[0].blocker, 'network_failure')
assert.equal(unavailableGeneric.some((call) => call.url === unavailableBrand.url), false, 'a failed dedicated request never falls through to generic/browser acquisition')
assert.equal(unavailableState.searchDestinationObservations['search-brand-canonical']?.['Bing Search']?.automation?.assessment?.visibilityResult, 'unavailable', '7: failed Bing remains neutral')

let missingProviderState = state()
const missingProviderGeneric: Array<{ url: string; method: string }> = []
const missingProviderRun = await runVisibilityScan(missingProviderState, {
  automationVersion: 2, website: async () => websiteAudit,
  acquire: async (url, method) => { missingProviderGeneric.push({ url, method }); return failed(url, method) },
}, (update) => { missingProviderState = update(missingProviderState) })
const missingProviderBrand = missingProviderRun.checks.find((check) => check.destination === 'Bing Search' && check.queryMode === 'brand')!
assert.equal(missingProviderBrand.captures.length, 1)
assert.equal(missingProviderBrand.captures[0].provider, 'bing-native-request')
assert.equal(missingProviderBrand.captures[0].blocker, 'bing_acquisition_not_configured')
assert.equal(missingProviderBrand.captures[0].error, 'Dedicated Bing acquisition is not configured.')
assert.equal(missingProviderGeneric.some((call) => call.url === missingProviderBrand.url), false, 'missing dedicated wiring fails closed instead of entering generic acquisition')

console.log('Bing acquisition routing PASS: explicit endpoint dispatch, independent native lane, locality query, no generic/browser fallback, matcher handoff, neutral failure, and unchanged destination routing.')
