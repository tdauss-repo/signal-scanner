import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { googleSearchRuntimeConfigurationStatus } from '../server/acquisitionRuntime.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { runVisibilityScan, defaultGoogleBrandOperationTimeoutMs } from '../src/utils/visibilityScan.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195',
  phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const reviewedFields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(reviewedFields.map((field) => [field, {
  value: profile[field], source: 'operator_entered', confidence: 'high', status: 'operator_reviewed', recordedAt: '2026-09-27T12:00:00Z',
}])) as BusinessProfileState['values'] }
const state: AuditState = {
  profile, businessProfile: profileState, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const historical = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
const googleCapture = (url: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, finalUrl: url, acquiredAt: '2026-09-27T12:00:00Z', provider: 'brightdata_serp_api', method: 'server_fetch',
  outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [], statusCode: 200,
  normalizedSearchCandidates: [{ id: 'mary-panel', kind: 'semantic_card', sourceType: 'knowledge_panel', fields: {
    name: profile.businessName, website: 'https://montessoridownriver.com/', address: '15575 Northline Rd, Southgate, MI 48195', phone: '(734) 282-6465',
  }, evidence: [] }],
})

assert(defaultGoogleBrandOperationTimeoutMs > 60_000 && defaultGoogleBrandOperationTimeoutMs < 90_000, 'Google Brand timeout fits between the provider and client API bounds')
let googleCalls = 0
let finalState = structuredClone(state)
const run = await runVisibilityScan(state, {
  automationVersion: 2,
  website: async () => historical,
  acquireGoogle: async (url) => { googleCalls += 1; await new Promise((resolve) => setTimeout(resolve, 15)); return googleCapture(url) },
  acquire: async () => undefined,
  operationTimeoutMs: 5,
  googleBrandOperationTimeoutMs: 30,
  overallTimeoutMs: 500,
}, (update) => { finalState = update(finalState) })
const google = finalState.searchDestinationObservations['search-brand-canonical']?.['Google Search']
assert(googleCalls >= 1)
assert.equal(google?.automation?.assessment?.automaticObservation, true, 'a valid in-window Google response reaches the automatic matcher')
assert.equal(google?.automation?.assessment?.googleIdentityDecision?.decision, 'verified')
assert.equal(google?.overallResult, 'found_match')
const boundedDiagnostic = run.checks.find((check) => check.destination === 'Google Search' && check.queryMode === 'location')
assert.equal(boundedDiagnostic?.captures.at(-1)?.blocker, 'provider_timeout', 'scan timeout retains its bounded diagnostic class')

const saved = Object.fromEntries(['BRIGHTDATA_API_TOKEN', 'BRIGHTDATA_SERP_ZONE', 'BRIGHTDATA_BROWSER_CDP_URL'].map((key) => [key, process.env[key]]))
try {
  process.env.BRIGHTDATA_API_TOKEN = 'configured'
  process.env.BRIGHTDATA_SERP_ZONE = 'configured'
  delete process.env.BRIGHTDATA_BROWSER_CDP_URL
  assert.equal(googleSearchRuntimeConfigurationStatus(), 'configured')
  delete process.env.BRIGHTDATA_SERP_ZONE
  assert.equal(googleSearchRuntimeConfigurationStatus(), 'partial')
  delete process.env.BRIGHTDATA_API_TOKEN
  assert.equal(googleSearchRuntimeConfigurationStatus(), 'unconfigured')
} finally {
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value
}

console.log('Google acquisition runtime PASS: configured status, provider-aware timeout, in-window capture retention, matcher delivery, and automatic verification.')
