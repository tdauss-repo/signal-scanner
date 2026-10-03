import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acquireInstagramProfile } from '../server/instagramProfile.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import type { WebsiteAuditResult } from '../src/types/websiteAudit.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { createApplicationVisibilityScanDependencies, destinationAcquisitionRoute, runVisibilityScan, type ScanDependencies } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const observedAt = '2026-09-30T18:00:00.000Z'
const instagramUrl = 'https://www.instagram.com/montessoridownriver'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195',
  phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: observedAt,
}])) as BusinessProfileState['values'] }
const websiteFixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response as WebsiteAuditResult
const website: WebsiteAuditResult = { ...websiteFixture, socialProfileLinks: [`${instagramUrl}/?igsh=tracking`] }
const instagramHtml = readFileSync(new URL('./fixtures/instagram-profile-montessori.html', import.meta.url), 'utf8')
const instagramCapture = await acquireInstagramProfile(instagramUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => ({ status: 200, finalUrl: url.href, body: instagramHtml }),
})
const unavailable = (url: string, method: AcquisitionResult['method'] = 'server_fetch'): AcquisitionResult => ({
  version: 1, requestedUrl: url, acquiredAt: observedAt, provider: 'fixture-unavailable', method,
  outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [],
})
const state = (): AuditState => ({
  profile: structuredClone(profile), businessProfile: structuredClone(profileState), checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: observedAt, reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {},
  voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})

assert.equal(destinationAcquisitionRoute('Instagram', 'brand'), 'instagram_native_profile')
assert.equal(destinationAcquisitionRoute('Instagram', 'location'), 'instagram_native_profile')
const dependencies = createApplicationVisibilityScanDependencies()
assert.equal(typeof dependencies.acquireInstagramProfile, 'function', 'real App composition contains the Instagram dependency')

const requests: Array<{ endpoint: string; body: Record<string, unknown> }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const endpoint = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
  requests.push({ endpoint, body })
  const payload = endpoint === '/api/audit-website' ? website
    : endpoint === '/api/acquire-instagram-profile' ? { capture: instagramCapture }
      : { capture: unavailable(String(body.url || ''), body.method === 'rendered_browser' ? 'rendered_browser' : 'server_fetch') }
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

try {
  let current = state()
  const run = await runVisibilityScan(current, dependencies, (update) => { current = update(current) })
  const brand = run.checks.find((check) => check.destination === 'Instagram' && check.queryMode === 'brand')!
  const instagramRequests = requests.filter((request) => request.endpoint === '/api/acquire-instagram-profile')
  assert(instagramRequests.length >= 1)
  assert(instagramRequests.every((request) => request.body.url === instagramUrl), 'only the canonical explicit profile URL is passed')
  assert.deepEqual(brand.captures.map((capture) => [capture.provider, capture.method]), [['instagram-native-fetch', 'server_fetch']])
  assert.equal(brand.assessment?.instagramIdentityDecision?.decision, 'verified')
  assert.equal(current.searchDestinationObservations['search-brand-canonical']?.Instagram?.overallResult, 'found_match')
  const genericInstagram = requests.filter((request) => request.endpoint === '/api/acquire-public-presence' && /instagram\.com/i.test(String(request.body.url || '')))
  assert.equal(genericInstagram.length, 0, `generic acquisition is never invoked for Instagram: ${JSON.stringify(genericInstagram)}`)
  assert.equal(requests.some((request) => request.body.method === 'rendered_browser' && /instagram\.com/i.test(String(request.body.url || ''))), false, 'rendered-browser acquisition is never invoked for Instagram')

  const missing: ScanDependencies = { ...createApplicationVisibilityScanDependencies() }
  delete missing.acquireInstagramProfile
  requests.length = 0
  let missingState = state()
  const missingRun = await runVisibilityScan(missingState, missing, (update) => { missingState = update(missingState) })
  const missingBrand = missingRun.checks.find((check) => check.destination === 'Instagram' && check.queryMode === 'brand')!
  assert.deepEqual(missingBrand.captures.map((capture) => [capture.provider, capture.blocker, capture.requestAttempted]), [
    ['instagram-native-request', 'instagram_acquisition_not_configured', false],
  ])
  assert.equal(requests.some((request) => request.endpoint === '/api/acquire-instagram-profile'), false)
  assert.equal(requests.some((request) => request.endpoint === '/api/acquire-public-presence' && /instagram\.com/i.test(String(request.body.url || ''))), false)
} finally {
  globalThis.fetch = originalFetch
}

console.log('Instagram production wiring PASS: real App dependency, canonical profile handoff, dedicated endpoint, no generic/rendered fallback, and fail-closed missing composition.')
