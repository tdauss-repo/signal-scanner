import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { brandVerificationQuery, verificationUrlFor } from '../src/utils/searchVisibility.ts'
import { createApplicationVisibilityScanDependencies, runVisibilityScan } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const observedAt = '2026-09-28T20:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const businessProfile: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: observedAt,
}])) as BusinessProfileState['values'] }
const state: AuditState = {
  profile, businessProfile, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: observedAt, reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const websiteAudit = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
const unavailable = (url: string, method: AcquisitionResult['method'] = 'server_fetch'): AcquisitionResult => ({
  version: 1, requestedUrl: url, provider: 'fixture-unavailable', method, acquiredAt: observedAt, outcome: 'failed', confidence: 'unavailable', blocker: 'network_failure', notes: [],
})
const requests: Array<{ endpoint: string; body: Record<string, unknown> }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const endpoint = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
  requests.push({ endpoint, body })
  const payload = endpoint === '/api/audit-website' ? websiteAudit : { capture: unavailable(String(body.url || ''), body.method === 'rendered_browser' ? 'rendered_browser' : 'server_fetch') }
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

try {
  let current = structuredClone(state)
  const run = await runVisibilityScan(current, createApplicationVisibilityScanDependencies(), (update) => { current = update(current) })
  const apple = run.checks.find((item) => item.destination === 'Apple Maps' && item.queryMode === 'brand')!
  const query = brandVerificationQuery(profile)
  const verificationUrl = verificationUrlFor('Apple Maps', profile.businessName, profile, true)
  const appleRequests = requests.filter((item) => item.endpoint === '/api/acquire-apple-maps')
  const genericRequests = requests.filter((item) => item.endpoint === '/api/acquire-public-presence')

  assert.equal(query, 'Montessori Center of Downriver Southgate MI', 'one authoritative Brand query includes reviewed name, city, and state')
  assert.equal(apple.url, verificationUrl, 'acquisition URL and operator verification URL share the same builder')
  assert.equal(new URL(apple.url!).searchParams.get('q'), query)
  assert.equal(appleRequests.length, 1, 'production App composition invokes the dedicated Apple endpoint once')
  assert.equal(appleRequests[0].body.url, verificationUrl)
  assert.equal(genericRequests.some((item) => item.body.url === verificationUrl), false, 'Apple Brand never reaches generic acquisition')
  assert.equal(genericRequests.some((item) => item.body.url === verificationUrl && item.body.method === 'rendered_browser'), false, 'Apple Brand never invokes rendered-browser acquisition')
  assert.deepEqual(apple.captures.map((capture) => capture.method), ['server_fetch'])
} finally {
  globalThis.fetch = originalFetch
}

console.log('Apple Maps production wiring PASS: App uses the dedicated endpoint with the same locality-aware Brand query as operator verification and no generic/browser fallback.')
