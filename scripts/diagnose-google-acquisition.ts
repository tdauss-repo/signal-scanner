import { acquireGoogleWithBrightData } from '../server/brightDataGoogle.ts'
import {
  googleBrandBrowserNavigationTimeoutMs,
  googleBrandBrowserSettleTimeoutMs,
  googleBrandSerpAttemptTimeoutMs,
} from '../server/acquisitionRuntime.ts'

const query = process.argv.slice(2).join(' ').trim()
if (!query || query.length > 300) throw new Error('Usage: npm run diagnose:google-acquisition -- "Business name and location" (1–300 characters)')

const token = process.env.BRIGHTDATA_API_TOKEN?.trim() || ''
const zone = process.env.BRIGHTDATA_SERP_ZONE?.trim() || ''
const result = await acquireGoogleWithBrightData({
  query,
  token,
  zone,
  country: process.env.BRIGHTDATA_SERP_COUNTRY?.trim() || 'us',
  language: process.env.BRIGHTDATA_SERP_LANGUAGE?.trim() || 'en',
  location: process.env.BRIGHTDATA_SERP_LOCATION?.trim() || '',
  rawProviderMetadataReference: 'diagnostic:not-persisted',
  browserCdpUrl: process.env.BRIGHTDATA_BROWSER_CDP_URL?.trim() || '',
  browserMetadataReference: 'diagnostic:browser:not-persisted',
  playwrightModule: process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE,
  requestTimeoutMs: googleBrandSerpAttemptTimeoutMs,
  navigationTimeoutMs: googleBrandBrowserNavigationTimeoutMs,
  networkIdleTimeoutMs: googleBrandBrowserSettleTimeoutMs,
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

const attempt = (value: typeof result.serp | undefined, label: string) => value ? {
  label, provider: value.provider, outcome: value.outcome, blocker: value.blocker, elapsedMs: value.elapsedMs,
  httpStatus: typeof value.diagnostic.httpStatus === 'number' ? value.diagnostic.httpStatus : null,
} : null

console.log(JSON.stringify({
  endpoint: '/api/acquire-google-search → Bright Data Google acquisition ladder',
  configuration: { token: token ? 'present' : 'absent', zone: zone ? 'present' : 'absent' },
  attempts: {
    attempt1: attempt(result.serp, 'SERP'),
    retry: attempt(result.serpRetry, 'SERP retry'),
    fallback: attempt(result.browser, 'Browser fallback'),
  },
  outcome: result.outcome,
  blocker: result.blocker,
  resultRegionInspected: result.resultRegionInspected,
  normalizedEvidenceCount: result.candidates.length,
  sourceTypes,
  identityFields,
  elapsedMs: result.elapsedMs,
  effectiveResult: result.outcome === 'success' ? 'fresh_evidence_acquired' : 'unavailable',
}, null, 2))

if (result.outcome !== 'success') process.exitCode = 1
