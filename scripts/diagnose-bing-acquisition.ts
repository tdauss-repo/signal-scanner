import { performance } from 'node:perf_hooks'
import { acquireBingSearchRuntime } from '../server/acquisitionRuntime.ts'
import { bingSearchMarketContext } from '../server/bingSearch.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import type { SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { assessSearchCapture, searchResultExtractors } from '../src/utils/searchResultExtraction.ts'
import { bingSearch } from '../src/utils/links.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const args = process.argv.slice(2)
const query = args.find((value) => !value.startsWith('--'))?.trim() || ''
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}
if (!query) {
  console.error('Usage: npm run diagnose:bing-acquisition -- "<query>" [--business-name "..."] [--website "..."] [--phone "..."] [--address "..."] [--city "..."] [--state "..."] [--zip "..."]')
  process.exitCode = 1
} else {
  const started = performance.now()
  const result = await acquireBingSearchRuntime(bingSearch(query))
  const capture = 'capture' in result ? result.capture : undefined
  const candidates = capture ? searchResultExtractors.flatMap((extractor) => extractor.extract(capture)) : []
  const input = {
    businessName: option('business-name'), website: option('website'), phone: option('phone'), streetAddress: option('address'),
    city: option('city'), state: option('state'), zip: option('zip'), primaryCategory: option('category'),
  }
  const profileProvided = Boolean(input.businessName)
  let decision: string = 'not_evaluated_reviewed_profile_required'
  let assessment: SearchEntityAssessment | undefined
  if (capture && profileProvided) {
    const profile = normalizeWorkspaceProfile(input)
    const fieldMap: Array<[BusinessProfileField, string]> = [
      ['businessName', profile.businessName], ['website', profile.website], ['phone', profile.phone], ['streetAddress', profile.streetAddress],
      ['city', profile.city], ['state', profile.state], ['zip', profile.zip], ['primaryCategory', profile.primaryCategory],
    ]
    const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fieldMap.filter(([, value]) => value).map(([field, value]) => [field, {
      value, source: 'diagnostic argument', confidence: 'high', status: 'operator_reviewed', recordedAt: new Date().toISOString(),
    }])) as BusinessProfileState['values'] }
    assessment = assessSearchCapture(capture, profile, profileState, 'Bing Search', 'brand')
    decision = assessment.bingIdentityDecision?.decision || assessment.visibilityResult
  }
  const usefulFields = [...new Set(candidates.flatMap((candidate) => Object.keys(candidate.fields)))]
  const localCandidates = candidates.filter((candidate) => candidate.sourceType === 'local_place')
  const organicCandidates = candidates.filter((candidate) => candidate.sourceType === 'organic')
  const matchedFields = [...new Set(assessment?.selected?.matchedFields.map((field) => field.field) || [])]
  console.log(JSON.stringify({
    endpointPath: '/api/acquire-bing-search',
    runtimePath: 'acquireBingSearchRuntime',
    requestAttempted: true,
    nativeRequestAttempted: capture?.provider === 'bing-native-fetch',
    provider: capture?.provider || 'bing-native-request',
    method: capture?.method || 'server_fetch',
    resultState: capture?.outcome || 'unavailable',
    elapsedMs: Math.round(performance.now() - started),
    status: capture?.statusCode || 0,
    blocker: capture?.blocker || 'runtime_unavailable',
    requestMarket: bingSearchMarketContext,
    localBusinessEntityDetected: localCandidates.length > 0,
    localEntityCandidateCount: localCandidates.length,
    organicCandidateCount: organicCandidates.length,
    normalizedCandidateCount: candidates.length,
    usefulIdentityFields: usefulFields,
    matchedIdentityFields: matchedFields,
    effectiveVerificationDecision: decision,
  }, null, 2))
}
