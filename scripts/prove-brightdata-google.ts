import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { acquireBrightDataSerp } from '../server/brightDataGoogle.ts'

const query = process.argv.slice(2).join(' ').trim()
if (!query || query.length > 300) throw new Error('Usage: npm run prove:brightdata-google -- "Business name or location query" (1–300 characters)')

const startedAt = new Date().toISOString()
const stamp = startedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const artifactDir = resolve('debug/brightdata-google', stamp)
const rawResponsePath = resolve(artifactDir, 'raw-response.json')
const normalizedCandidatesPath = resolve(artifactDir, 'normalized-candidates.json')
const diagnosticPath = resolve(artifactDir, 'diagnostic.json')
mkdirSync(artifactDir, { recursive: true })
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

const result = await acquireBrightDataSerp({
  query,
  token: process.env.BRIGHTDATA_API_TOKEN?.trim() || '',
  zone: process.env.BRIGHTDATA_SERP_ZONE?.trim() || '',
  country: process.env.BRIGHTDATA_SERP_COUNTRY?.trim() || 'us',
  language: process.env.BRIGHTDATA_SERP_LANGUAGE?.trim() || 'en',
  location: process.env.BRIGHTDATA_SERP_LOCATION?.trim() || '',
  rawProviderMetadataReference: rawResponsePath,
})

writeJson(rawResponsePath, result.rawResponse)
writeJson(normalizedCandidatesPath, {
  contractVersion: result.contractVersion,
  provider: result.provider,
  provenance: result.provenance,
  query: result.query,
  requestedUrl: result.requestedUrl,
  finalUrl: result.finalUrl || null,
  outcome: result.outcome,
  resultRegionInspected: result.resultRegionInspected,
  blocker: result.blocker,
  matcherInvoked: false,
  candidates: result.candidates,
})
writeJson(diagnosticPath, {
  status: 'UNREVIEWED_BRIGHT_DATA_GOOGLE_PROVING',
  ...result,
  rawResponse: undefined,
  matcherInvoked: false,
  productionAcquisitionModified: false,
  credentials: {
    tokenConfigured: Boolean(process.env.BRIGHTDATA_API_TOKEN?.trim()),
    zoneConfigured: Boolean(process.env.BRIGHTDATA_SERP_ZONE?.trim()),
    tokenPersisted: false,
  },
  startedAt,
  artifacts: { directory: artifactDir, rawResponse: rawResponsePath, normalizedCandidates: normalizedCandidatesPath, diagnostic: diagnosticPath },
})
console.log(JSON.stringify({ artifactDir, provider: result.provider, outcome: result.outcome, blocker: result.blocker, resultRegionInspected: result.resultRegionInspected, candidates: result.candidates.length, elapsedMs: result.elapsedMs }, null, 2))
if (result.blocker === 'configuration_missing') process.exitCode = 1
