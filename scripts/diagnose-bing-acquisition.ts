import { performance } from 'node:perf_hooks'
import { acquireBingSearchRuntime } from '../server/acquisitionRuntime.ts'
import { bingSearchMarketContext } from '../server/bingSearch.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import type { SearchEntityAssessment } from '../src/types/entityMatch.ts'
import { assessSearchCapture, searchResultExtractors } from '../src/utils/searchResultExtraction.ts'
import { bingSearch } from '../src/utils/links.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const args = process.argv.slice(2)
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}
const input = {
  businessName: option('business-name') || 'Montessori Center of Downriver',
  website: option('website') || 'https://montessoridownriver.com/',
  phone: option('phone') || '734-282-6465',
  streetAddress: option('address') || '15575 Northline Rd',
  city: option('city') || 'Southgate',
  state: option('state') || 'MI',
  zip: option('zip') || '48195',
  primaryCategory: option('category') || 'Preschool',
}
const query = args.find((value, index) => !value.startsWith('--') && (index === 0 || !args[index - 1]?.startsWith('--')))?.trim()
  || `${input.businessName} ${input.city} ${input.state}`
const started = performance.now()
const result = await acquireBingSearchRuntime(bingSearch(query), { reviewedIdentity: input })
const capture = 'capture' in result ? result.capture : undefined
const candidates = capture ? searchResultExtractors.flatMap((extractor) => extractor.extract(capture)) : []
let decision: string = 'not_evaluated_reviewed_profile_required'
let assessment: SearchEntityAssessment | undefined
if (capture) {
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
const selected = assessment?.selected?.candidate
const selectedDomain = (() => {
  try { return selected?.fields.website ? new URL(selected.fields.website).hostname.replace(/^www\./, '') : '' } catch { return '' }
})()
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
  finalUrl: capture?.finalUrl || '',
  blocker: capture?.blocker || 'runtime_unavailable',
  requestMarket: bingSearchMarketContext,
  acquisitionSteps: capture?.bingLocalResolution?.steps || [],
  localBusinessEntityDetected: localCandidates.length > 0,
  localEntityCandidateCount: localCandidates.length,
  organicCandidateCount: organicCandidates.length,
  normalizedCandidateCount: candidates.length,
  usefulIdentityFields: usefulFields,
  extractedBusinessName: selected?.fields.name || '',
  extractedOfficialDomain: selectedDomain,
  extractedAddress: selected?.fields.address || selected?.fields.streetAddress || '',
  extractedPhone: selected?.fields.phone || '',
  extractedCategory: selected?.fields.category || '',
  bingEntityIdentifier: selected?.fields.placeIdentity || '',
  matchedIdentityFields: matchedFields,
  effectiveVerificationDecision: decision,
}, null, 2))
