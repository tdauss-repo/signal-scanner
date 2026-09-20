import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { acquireGoogleWithBrightData } from '../server/brightDataGoogle.ts'

const query = process.argv.slice(2).join(' ').trim()
if (!query || query.length > 300) throw new Error('Usage: npm run prove:google-brightdata -- "Business name or location query" (1–300 characters)')

const startedAt = new Date().toISOString()
const stamp = startedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const artifactDir = resolve('debug/google-brightdata', stamp)
const serpResponsePath = resolve(artifactDir, 'serp-response.json')
const browserDiagnosticPath = resolve(artifactDir, 'browser-diagnostic.json')
const normalizedCandidatesPath = resolve(artifactDir, 'normalized-candidates.json')
const acquisitionSummaryPath = resolve(artifactDir, 'acquisition-summary.json')
mkdirSync(artifactDir, { recursive: true })
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

const run = await acquireGoogleWithBrightData({
  query,
  token: process.env.BRIGHTDATA_API_TOKEN?.trim() || '',
  zone: process.env.BRIGHTDATA_SERP_ZONE?.trim() || '',
  browserCdpUrl: process.env.BRIGHTDATA_BROWSER_CDP_URL?.trim() || '',
  playwrightModule: process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE?.trim() || undefined,
  country: process.env.BRIGHTDATA_SERP_COUNTRY?.trim() || 'us',
  language: process.env.BRIGHTDATA_SERP_LANGUAGE?.trim() || 'en',
  location: process.env.BRIGHTDATA_SERP_LOCATION?.trim() || '',
  rawProviderMetadataReference: serpResponsePath,
  browserMetadataReference: browserDiagnosticPath,
})

writeJson(serpResponsePath, { provider: run.serp.provider, outcome: run.serp.outcome, blocker: run.serp.blocker, diagnostic: run.serp.diagnostic, response: run.serp.rawResponse })
if (run.fallbackTriggered) writeJson(browserDiagnosticPath, { provider: run.browser?.provider || 'brightdata_browser_api', outcome: run.browser?.outcome || 'unavailable', blocker: run.browser?.blocker || 'access_failure', resultRegionInspected: run.browser?.resultRegionInspected || false, diagnostic: run.browser?.diagnostic || { error: 'Browser fallback did not return a diagnostic.' } })
writeJson(normalizedCandidatesPath, {
  contractVersion: 1,
  query,
  selectedProvider: run.selectedProvider,
  matcherInvoked: false,
  semantics: { organicResultUrl: 'result_destination_only', explicitKnowledgeOrLocalWebsite: 'businessWebsite' },
  candidates: run.candidates,
})
writeJson(acquisitionSummaryPath, {
  query,
  primaryProvider: run.primaryProvider,
  selectedProvider: run.selectedProvider,
  fallbackTriggered: run.fallbackTriggered,
  fallbackReason: run.fallbackReason,
  resultRegionInspected: run.resultRegionInspected,
  candidateCount: run.candidates.length,
  blocker: run.blocker,
  elapsedMs: run.elapsedMs,
  finalAcquisitionOutcome: run.outcome,
  attempts: {
    serp: { provider: run.serp.provider, outcome: run.serp.outcome, blocker: run.serp.blocker, elapsedMs: run.serp.elapsedMs },
    browser: run.browser ? { provider: run.browser.provider, outcome: run.browser.outcome, blocker: run.browser.blocker, elapsedMs: run.browser.elapsedMs } : null,
  },
  safeguards: { retries: 0, operatorInteraction: false, challengeSolving: false, localChromium: false, personalProfile: false, credentialsPersisted: false },
  productionIntegration: false,
  startedAt,
  endedAt: new Date().toISOString(),
  artifacts: { directory: artifactDir, serpResponse: serpResponsePath, browserDiagnostic: run.fallbackTriggered ? browserDiagnosticPath : null, normalizedCandidates: normalizedCandidatesPath, acquisitionSummary: acquisitionSummaryPath },
})

console.log(JSON.stringify({ artifactDir, selectedProvider: run.selectedProvider, fallbackTriggered: run.fallbackTriggered, fallbackReason: run.fallbackReason, resultRegionInspected: run.resultRegionInspected, candidateCount: run.candidates.length, blocker: run.blocker, outcome: run.outcome, elapsedMs: run.elapsedMs }, null, 2))
if (run.serp.blocker === 'configuration_missing' && run.browser?.blocker === 'configuration_missing') process.exitCode = 1
