import { performance } from 'node:perf_hooks'
import { acquireDuckDuckGoSearchRuntime } from '../server/acquisitionRuntime.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import type { SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { normalizedEntityField } from '../src/utils/entityMatcher.ts'
import { assessSearchCapture, searchResultExtractors } from '../src/utils/searchResultExtraction.ts'
import { publicPresenceUrl } from '../src/utils/searchVisibility.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const args = process.argv.slice(2)
const query = args.find((value) => !value.startsWith('--'))?.trim() || ''
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}
if (!query) {
  console.error('Usage: npm run diagnose:duckduckgo-acquisition -- "<query>" [--business-name "..."] [--website "..."] [--phone "..."] [--address "..."] [--city "..."] [--state "..."] [--zip "..."]')
  process.exitCode = 1
} else {
  const started = performance.now()
  const result = await acquireDuckDuckGoSearchRuntime(publicPresenceUrl('DuckDuckGo', query))
  const capture = 'capture' in result ? result.capture : undefined
  const candidates = capture ? searchResultExtractors.flatMap((extractor) => extractor.extract(capture)) : []
  const input = {
    businessName: option('business-name'), website: option('website'), phone: option('phone'), streetAddress: option('address'),
    city: option('city'), state: option('state'), zip: option('zip'), primaryCategory: option('category'),
  }
  let decision = 'not_evaluated_reviewed_profile_required'
  let assessment: SearchEntityAssessment | undefined
  if (capture && input.businessName) {
    const profile = normalizeWorkspaceProfile(input)
    const fields: BusinessProfileField[] = ['businessName', 'website', 'phone', 'streetAddress', 'city', 'state', 'zip', 'primaryCategory']
    const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.filter((field) => profile[field]).map((field) => [field, {
      value: profile[field], source: 'diagnostic argument', confidence: 'high', status: 'operator_reviewed', recordedAt: new Date().toISOString(),
    }])) as BusinessProfileState['values'] }
    assessment = assessSearchCapture(capture, profile, profileState, 'DuckDuckGo', 'brand')
    decision = assessment.duckDuckGoIdentityDecision?.decision || assessment.visibilityResult
  }
  const officialDomain = input.website ? normalizedEntityField('website', input.website) : ''
  console.log(JSON.stringify({
    query,
    endpointPath: '/api/acquire-duckduckgo-search', runtimePath: 'acquireDuckDuckGoSearchRuntime', requestAttempted: true,
    provider: capture?.provider || 'duckduckgo-native-request', method: capture?.method || 'server_fetch',
    resultState: capture?.outcome || 'unavailable', elapsedMs: Math.round(performance.now() - started),
    status: capture?.statusCode || 0, blocker: capture?.blocker || 'runtime_unavailable', candidateCount: candidates.length,
    officialDomainResultDetected: Boolean(officialDomain && candidates.some((candidate) => normalizedEntityField('website', candidate.resultUrl || candidate.fields.website || '') === officialDomain)),
    matchedIdentityFields: [...new Set(assessment?.selected?.matchedFields.map((field) => field.field) || [])],
    effectiveVerificationDecision: decision,
  }, null, 2))
}
