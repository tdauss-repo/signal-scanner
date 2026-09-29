import { performance } from 'node:perf_hooks'
import { acquireAppleMapsRuntime } from '../server/acquisitionRuntime.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { publicPresenceUrl } from '../src/utils/searchVisibility.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const args = process.argv.slice(2)
const query = args.find((value) => !value.startsWith('--'))?.trim() || ''
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}
if (!query) {
  console.error('Usage: npm run diagnose:apple-maps-acquisition -- "<query>" [--business-name "..."] [--website "..."] [--phone "..."] [--address "..."] [--city "..."] [--state "..."] [--zip "..."]')
  process.exitCode = 1
} else {
  const started = performance.now()
  const result = await acquireAppleMapsRuntime(publicPresenceUrl('Apple Maps', query))
  const capture = 'capture' in result ? result.capture : undefined
  const candidates = capture?.normalizedSearchCandidates || []
  const input = {
    businessName: option('business-name'), website: option('website'), phone: option('phone'), streetAddress: option('address'),
    city: option('city'), state: option('state'), zip: option('zip'), primaryCategory: option('category'),
  }
  let decision = 'not_evaluated_reviewed_profile_required'
  let matchedFields: string[] = []
  if (capture && input.businessName) {
    const profile = normalizeWorkspaceProfile(input)
    const fields: BusinessProfileField[] = ['businessName', 'website', 'phone', 'streetAddress', 'city', 'state', 'zip', 'primaryCategory']
    const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.filter((field) => profile[field]).map((field) => [field, {
      value: profile[field], source: 'diagnostic argument', confidence: 'high', status: 'operator_reviewed', recordedAt: new Date().toISOString(),
    }])) as BusinessProfileState['values'] }
    const assessment = assessSearchCapture(capture, profile, profileState, 'Apple Maps', 'brand')
    decision = assessment.automaticObservation ? 'verified' : assessment.visibilityResult
    matchedFields = [...new Set(assessment.selected?.matchedFields.map((field) => field.field) || [])]
  }
  const finalRequest = decision === 'verified' && capture?.finalRequestState === 'unavailable'
    ? 'not_needed_for_verification'
    : capture?.finalRequestState || 'not_requested'
  console.log(JSON.stringify({
    query,
    endpointPath: '/api/acquire-apple-maps', runtimePath: 'acquireAppleMapsRuntime', requestAttempted: true,
    provider: capture?.provider || 'apple-maps-native-request', method: capture?.method || 'server_fetch',
    resultState: capture?.outcome || 'unavailable', elapsedMs: Math.round(performance.now() - started), initialStatus: capture?.initialStatusCode ?? capture?.statusCode ?? 0,
    redirectAccepted: capture?.redirectAccepted || false,
    redirectHost: capture?.redirectUrl ? new URL(capture.redirectUrl).hostname : '',
    placeIdPresent: candidates.some((candidate) => Boolean(candidate.fields.placeIdentity)),
    namePresent: candidates.some((candidate) => Boolean(candidate.fields.name)),
    addressPresent: candidates.some((candidate) => Boolean(candidate.fields.address || candidate.fields.streetAddress)),
    finalRequest,
    status: capture?.statusCode ?? 0, blocker: capture?.blocker || 'runtime_unavailable',
    structuredPlaceDetected: candidates.some((candidate) => candidate.sourceType === 'local_place'),
    candidateCount: candidates.length, matchedIdentityFields: matchedFields, effectiveVerificationDecision: decision,
  }, null, 2))
}
