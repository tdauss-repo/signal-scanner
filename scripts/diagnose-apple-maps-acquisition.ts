import { performance } from 'node:perf_hooks'
import { acquireAppleMapsRuntime } from '../server/acquisitionRuntime.ts'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { publicPresenceUrl } from '../src/utils/searchVisibility.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { parseApplePlaceUrl } from '../src/utils/appleMapsPlace.ts'

const args = process.argv.slice(2)
const query = args.find((value) => !value.startsWith('--'))?.trim() || ''
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}
if (!query) {
  console.error('Usage: npm run diagnose:apple-maps-acquisition -- "<query>" [--place-url "https://maps.apple.com/place?place-id=..."] [--business-name "..."] [--website "..."] [--phone "..."] [--address "..."] [--city "..."] [--state "..."] [--zip "..."]')
  process.exitCode = 1
} else {
  const started = performance.now()
  const initialRequest = publicPresenceUrl('Apple Maps', query)
  const explicitPlace = parseApplePlaceUrl(option('place-url'))
  const input = {
    businessName: option('business-name'), website: option('website'), phone: option('phone'), streetAddress: option('address'),
    city: option('city'), state: option('state'), zip: option('zip'), primaryCategory: option('category'),
  }
  const profile = normalizeWorkspaceProfile(input)
  const fields: BusinessProfileField[] = ['businessName', 'website', 'phone', 'streetAddress', 'city', 'state', 'zip', 'primaryCategory']
  const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.filter((field) => profile[field]).map((field) => [field, {
    value: profile[field], source: 'diagnostic argument', confidence: 'high', status: 'operator_reviewed', recordedAt: new Date().toISOString(),
  }])) as BusinessProfileState['values'] }
  const captures: AcquisitionResult[] = []
  if (explicitPlace) {
    const result = await acquireAppleMapsRuntime(explicitPlace.canonicalUrl)
    if ('capture' in result) captures.push(result.capture)
  }
  let capture = captures.at(-1)
  let decision = 'not_evaluated_reviewed_profile_required'
  let matchedFields: string[] = []
  let explicitConflict = false
  if (capture && input.businessName) {
    const assessment = assessSearchCapture(capture, profile, profileState, 'Apple Maps', 'brand')
    decision = assessment.automaticObservation ? 'verified' : assessment.visibilityResult
    matchedFields = [...new Set(assessment.selected?.matchedFields.map((field) => field.field) || [])]
    explicitConflict = assessment.blocker === 'identifier_conflict'
  }
  if (!explicitPlace || (decision !== 'verified' && !explicitConflict)) {
    const result = await acquireAppleMapsRuntime(initialRequest)
    if ('capture' in result) captures.push(result.capture)
    capture = captures.at(-1)
    if (capture && input.businessName) {
      const assessment = assessSearchCapture(capture, profile, profileState, 'Apple Maps', 'brand')
      decision = assessment.automaticObservation ? 'verified' : assessment.visibilityResult
      matchedFields = [...new Set(assessment.selected?.matchedFields.map((field) => field.field) || [])]
    }
  }
  const candidates = captures.flatMap((item) => item.normalizedSearchCandidates || [])
  const finalRequest = decision === 'verified' && capture?.finalRequestState === 'unavailable'
    ? 'not_needed_for_verification'
    : capture?.finalRequestState || 'not_requested'
  const redirectRoute = (() => {
    try { return capture?.redirectUrl ? new URL(capture.redirectUrl).pathname : '' } catch { return '' }
  })()
  const canonicalPlaceDetected = candidates.some((candidate) => {
    const value = candidate.fields.publicProfileUrl || candidate.resultUrl || ''
    try { return new URL(value).hostname === 'maps.apple.com' && new URL(value).pathname === '/place' } catch { return false }
  })
  console.log(JSON.stringify({
    query,
    initialRequest,
    discoverySource: explicitPlace ? 'diagnostic_explicit_place_url' : 'none',
    explicitApplePlaceUrlFound: Boolean(explicitPlace),
    endpointPath: '/api/acquire-apple-maps', runtimePath: 'acquireAppleMapsRuntime', requestAttempted: true,
    provider: capture?.provider || 'apple-maps-native-request', method: capture?.method || 'server_fetch',
    resultState: capture?.outcome || 'unavailable', elapsedMs: Math.round(performance.now() - started), initialStatus: capture?.initialStatusCode ?? capture?.statusCode ?? 0,
    redirectRoute,
    redirectAccepted: capture?.redirectAccepted || false,
    redirectHost: capture?.redirectUrl ? new URL(capture.redirectUrl).hostname : '',
    placeId: explicitPlace || candidates.some((candidate) => Boolean(candidate.fields.placeIdentity)) ? 'present' : 'absent',
    name: candidates.some((candidate) => Boolean(candidate.fields.name)) ? 'present' : 'absent',
    address: candidates.some((candidate) => Boolean(candidate.fields.address || candidate.fields.streetAddress)) ? 'present' : 'absent',
    finalRequest,
    finalStatus: capture?.statusCode ?? 0, blocker: capture?.blocker || 'runtime_unavailable',
    structuredPlaceDetected: candidates.some((candidate) => candidate.sourceType === 'local_place'),
    canonicalPlaceDetected,
    publicPlaceResolutionAttempted: captures.some((item) => item.appleMapsResolution?.publicPlaceResolutionAttempted),
    serverApiConfigured: Boolean(process.env.APPLE_MAPS_SERVER_TOKEN?.trim() || process.env.APPLE_MAPS_SERVER_ACCESS_TOKEN?.trim()),
    serverApiAttempted: captures.some((item) => item.appleMapsResolution?.serverApiAttempted),
    candidateCount: candidates.length, matchedIdentityFields: matchedFields, effectiveVerificationDecision: decision,
  }, null, 2))
}
