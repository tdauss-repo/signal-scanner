import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { createApplicationVisibilityScanDependencies, destinationAcquisitionRoute, runVisibilityScan, type ScanDependencies } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const acquiredAt = '2026-09-29T18:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const businessProfile: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: acquiredAt,
}])) as BusinessProfileState['values'] }
const state = (): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(businessProfile), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: acquiredAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {},
  voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const websiteAudit = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
const unavailable = (url: string, method: AcquisitionResult['method'] = 'server_fetch'): AcquisitionResult => ({
  version: 1, requestedUrl: url, provider: 'fixture-unavailable', method, acquiredAt, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [],
})
const yelpSuccess = (url: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, finalUrl: url, provider: 'yelp-native-fetch', checkedDestination: 'Yelp', method: 'server_fetch',
  acquiredAt, outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [],
  normalizedSearchCandidates: [{ id: 'yelp-mary', kind: 'structured_entity', sourceType: 'local_place',
    resultUrl: 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate', fields: {
      name: profile.businessName, address: '15575 Northline Rd, Southgate, MI 48195',
      publicProfileUrl: 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate',
    }, evidence: [] }],
})

assert.equal(destinationAcquisitionRoute('Yelp', 'brand'), 'yelp_native_search')
assert.equal(destinationAcquisitionRoute('Yelp', 'location'), 'generic')

const requests: Array<{ endpoint: string; body: Record<string, unknown> }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const endpoint = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
  requests.push({ endpoint, body })
  const payload = endpoint === '/api/audit-website' ? websiteAudit
    : endpoint === '/api/acquire-yelp-search' ? { capture: yelpSuccess(String(body.url || '')) }
      : { capture: unavailable(String(body.url || ''), body.method === 'rendered_browser' ? 'rendered_browser' : 'server_fetch') }
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

try {
  const production = createApplicationVisibilityScanDependencies()
  assert.equal(typeof production.acquireYelpSearch, 'function')
  let current = state()
  const run = await runVisibilityScan(current, production, (update) => { current = update(current) })
  const brand = run.checks.find((check) => check.destination === 'Yelp' && check.queryMode === 'brand')!
  const dedicated = requests.filter((request) => request.endpoint === '/api/acquire-yelp-search')
  assert.equal(dedicated.length, 1)
  assert.equal(dedicated[0].body.url, brand.url)
  const requested = new URL(String(dedicated[0].body.url))
  assert.equal(requested.searchParams.get('find_desc'), profile.businessName)
  assert.equal(requested.searchParams.get('find_loc'), 'Southgate, MI 48195')
  assert.deepEqual(brand.captures.map((item) => [item.provider, item.method]), [['yelp-native-fetch', 'server_fetch']])
  assert.equal(requests.some((request) => request.endpoint === '/api/acquire-public-presence' && request.body.url === brand.url), false)
  assert.equal(requests.some((request) => request.endpoint === '/api/acquire-public-presence' && request.body.url === brand.url && request.body.method === 'rendered_browser'), false)
  assert.equal(brand.assessment?.yelpIdentityDecision?.decision, 'verified')
  assert.equal(current.searchDestinationObservations['search-brand-canonical']?.Yelp?.overallResult, 'found_match')

  const missing: ScanDependencies = { ...production }
  delete missing.acquireYelpSearch
  let missingState = state()
  const missingRun = await runVisibilityScan(missingState, missing, (update) => { missingState = update(missingState) })
  const missingBrand = missingRun.checks.find((check) => check.destination === 'Yelp' && check.queryMode === 'brand')!
  assert.deepEqual(missingBrand.captures.map((item) => [item.provider, item.blocker]), [['yelp-native-request', 'yelp_acquisition_not_configured']])
  assert.equal(requests.some((request) => request.endpoint === '/api/acquire-public-presence' && request.body.url === missingBrand.url), false)
} finally { globalThis.fetch = originalFetch }

console.log('Yelp production wiring PASS: the App dependency factory uses locality-aware /api/acquire-yelp-search, never generic/rendered acquisition, and fails closed when missing.')
