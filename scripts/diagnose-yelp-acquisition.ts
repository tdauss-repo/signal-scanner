import { performance } from 'node:perf_hooks'
import { acquireYelpSearchRuntime } from '../server/acquisitionRuntime.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import type { SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { yelpSearch } from '../src/utils/links.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const args = process.argv.slice(2)
const positional = args.filter((value, index) => !value.startsWith('--') && (index === 0 || !args[index - 1]?.startsWith('--')))
const businessName = positional[0]?.trim() || ''
const location = positional[1]?.trim() || ''
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}

if (!businessName || !location) {
  console.error('Usage: npm run diagnose:yelp-acquisition -- "<business>" "<city, state zip>" [--website "..."] [--phone "..."] [--address "..."]')
  process.exitCode = 1
} else {
  const requestUrl = yelpSearch(businessName, location)
  const started = performance.now()
  const result = await acquireYelpSearchRuntime(requestUrl)
  const capture = 'capture' in result ? result.capture : undefined
  const candidates = capture?.normalizedSearchCandidates || []
  const cityStateZip = location.match(/^\s*([^,]+),\s*([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$/)
  const input = {
    businessName, website: option('website'), phone: option('phone'), streetAddress: option('address'),
    city: cityStateZip?.[1] || '', state: cityStateZip?.[2] || '', zip: cityStateZip?.[3] || '',
  }
  let assessment: SearchEntityAssessment | undefined
  if (capture) {
    const profile = normalizeWorkspaceProfile(input)
    const fields: BusinessProfileField[] = ['businessName', 'website', 'phone', 'streetAddress', 'city', 'state', 'zip']
    const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.filter((field) => profile[field]).map((field) => [field, {
      value: profile[field], source: 'diagnostic argument', confidence: 'high', status: 'operator_reviewed', recordedAt: new Date().toISOString(),
    }])) as BusinessProfileState['values'] }
    assessment = assessSearchCapture(capture, profile, profileState, 'Yelp', 'brand')
  }
  const fieldsPresent = [...new Set(candidates.flatMap((candidate) => Object.keys(candidate.fields)))]
  console.log(JSON.stringify({
    endpointPath: '/api/acquire-yelp-search', runtimePath: 'acquireYelpSearchRuntime', searchRequestAttempted: true,
    provider: capture?.provider || 'yelp-native-request', searchHttpStatus: capture?.statusCode || 0,
    blocker: capture?.blocker || 'runtime_unavailable', elapsedMs: Math.round(performance.now() - started),
    searchCandidateCount: candidates.length, matchingYelpBusinessCandidate: Boolean(assessment?.selected),
    profileFollow: capture?.profileFollow?.used ? 'used' : 'not used', profileHttpStatus: capture?.profileFollow?.statusCode || 0,
    structuredBusinessFields: Object.fromEntries(['name', 'address', 'phone', 'website'].map((field) => [field, fieldsPresent.includes(field)])),
    matchedFields: [...new Set(assessment?.selected?.matchedFields.map((field) => field.field) || [])],
    effectiveDecision: assessment?.yelpIdentityDecision?.decision || assessment?.visibilityResult || 'unavailable',
  }, null, 2))
}
