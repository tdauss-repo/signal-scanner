import { acquireBrightDataSerp } from '../server/brightDataGoogle.ts'

const query = process.argv.slice(2).join(' ').trim()
if (!query || query.length > 300) throw new Error('Usage: npm run diagnose:google-acquisition -- "Business name and location" (1–300 characters)')

const token = process.env.BRIGHTDATA_API_TOKEN?.trim() || ''
const zone = process.env.BRIGHTDATA_SERP_ZONE?.trim() || ''
const result = await acquireBrightDataSerp({
  query,
  token,
  zone,
  country: process.env.BRIGHTDATA_SERP_COUNTRY?.trim() || 'us',
  language: process.env.BRIGHTDATA_SERP_LANGUAGE?.trim() || 'en',
  location: process.env.BRIGHTDATA_SERP_LOCATION?.trim() || '',
  rawProviderMetadataReference: 'diagnostic:not-persisted',
})

const sourceTypes = Object.fromEntries(['organic', 'knowledge_panel', 'local_place'].map((sourceType) => [
  sourceType,
  result.candidates.filter((candidate) => candidate.resultType === sourceType).length,
]))
const identityFields = [...new Set(result.candidates.flatMap((candidate) => [
  candidate.name || candidate.title ? 'name' : '',
  candidate.businessWebsite ? 'website' : '',
  candidate.address || candidate.streetAddress ? 'address' : '',
  candidate.phone ? 'phone' : '',
  candidate.locality ? 'city' : '',
  candidate.region ? 'state' : '',
  candidate.postalCode ? 'zip' : '',
  candidate.category ? 'category' : '',
  candidate.placeIdentity ? 'entity' : '',
]).filter(Boolean))].sort()

console.log(JSON.stringify({
  endpoint: '/api/acquire-google-search → Bright Data SERP API',
  configuration: { token: token ? 'present' : 'absent', zone: zone ? 'present' : 'absent' },
  request: result.diagnostic.requestSent ? 'sent' : 'not_sent',
  httpStatus: typeof result.diagnostic.httpStatus === 'number' ? result.diagnostic.httpStatus : null,
  outcome: result.outcome,
  blocker: result.blocker,
  resultRegionInspected: result.resultRegionInspected,
  normalizedEvidenceCount: result.candidates.length,
  sourceTypes,
  identityFields,
  elapsedMs: result.elapsedMs,
}, null, 2))

if (!result.usable) process.exitCode = 1
