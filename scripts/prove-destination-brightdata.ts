import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { acquireBrightDataDestinationBrowser, acquireBrightDataDuckDuckGo, type ProvingDestination } from '../server/brightDataDestinations.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import type { BusinessProfileState } from '../src/types/audit.ts'

const [destinationValue, query, profilePath, queryMode = 'brand', targetUrl] = process.argv.slice(2)
const destinations: ProvingDestination[] = ['Apple Maps', 'Yelp', 'Facebook', 'DuckDuckGo', 'Instagram']
if (!destinations.includes(destinationValue as ProvingDestination) || !query || !['brand', 'location'].includes(queryMode)) {
  console.error('Usage: npm run prove:destination-brightdata -- "<destination>" "<query>" [profile.json] [brand|location] [public-profile-url]')
  process.exit(1)
}
const destination = destinationValue as ProvingDestination
const started = performance.now()
const acquired = destination === 'DuckDuckGo'
  ? await acquireBrightDataDuckDuckGo({ query, token: process.env.BRIGHTDATA_API_TOKEN || '', zone: process.env.BRIGHTDATA_SERP_ZONE || '', countryLanguage: `${process.env.BRIGHTDATA_SERP_COUNTRY || 'us'}-${process.env.BRIGHTDATA_SERP_LANGUAGE || 'en'}` })
  : { capture: await acquireBrightDataDestinationBrowser({ destination, query, cdpUrl: process.env.BRIGHTDATA_BROWSER_CDP_URL || '', playwrightModule: process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE, targetUrl }), rawResponse: undefined }

let assessment
if (profilePath) {
  const input = JSON.parse(await readFile(resolve(profilePath), 'utf8')) as { profile?: Record<string, unknown>; businessProfile?: BusinessProfileState }
  const profile = normalizeWorkspaceProfile(input.profile || input)
  if (input.businessProfile) assessment = assessSearchCapture(acquired.capture, profile, input.businessProfile, destination, queryMode as 'brand' | 'location')
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const directory = resolve('debug/destination-brightdata', `${stamp}-${destination.toLowerCase().replace(/\s+/g, '-')}`)
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, 'acquisition-summary.json'), JSON.stringify({ destination, query, provider: acquired.capture.provider, outcome: acquired.capture.outcome, resultRegionInspected: acquired.capture.resultRegionInspected, candidateCount: acquired.capture.normalizedSearchCandidates?.length || 0, blocker: acquired.capture.blocker, elapsedMs: Math.round(performance.now() - started), assessment }, null, 2))
await writeFile(resolve(directory, 'normalized-candidates.json'), JSON.stringify(acquired.capture.normalizedSearchCandidates || [], null, 2))
if (acquired.rawResponse !== undefined) await writeFile(resolve(directory, 'raw-response.json'), JSON.stringify(acquired.rawResponse, null, 2))
await writeFile(resolve(directory, 'diagnostic.json'), JSON.stringify({ ...acquired.capture, normalizedSearchCandidates: undefined, html: acquired.capture.html ? '[bounded HTML retained only by the in-memory capture]' : undefined, visibleText: acquired.capture.visibleText?.slice(0, 20_000) }, null, 2))
console.log(JSON.stringify({ artifactDirectory: directory, destination, query, provider: acquired.capture.provider, outcome: acquired.capture.outcome, resultRegionInspected: acquired.capture.resultRegionInspected, candidateCount: acquired.capture.normalizedSearchCandidates?.length || 0, blocker: acquired.capture.blocker, assessment }, null, 2))
