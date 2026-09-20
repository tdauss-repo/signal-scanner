import { summarizePublicPresence } from '../src/utils/publicPresence.ts'
import { normalizeBusinessProfileState } from '../src/utils/businessProfileState.ts'
import { workspaceFindings } from '../src/utils/workspaceFindings.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { auditWebsite } from '../server/websiteAudit.ts'
import { acquireGoogleMapsRuntime, acquireGoogleSearchRuntime, acquireRuntime } from '../server/acquisitionRuntime.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { runVisibilityScan } from '../src/utils/visibilityScan.ts'
import type { AuditState } from '../src/types/audit.ts'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: npm run prove:visibility-scan -- profile.json output.json')
// Explicit local input only. No default customer, credentials, saved workspace writes or approvals.
const inputRecord = JSON.parse(readFileSync(input, 'utf8'))
const payload = inputRecord.scan?.payload || inputRecord
const profile = normalizeWorkspaceProfile(payload.profile || payload)
let state: AuditState = {
  profile, businessProfile: normalizeBusinessProfileState(profile, payload.businessProfile, new Date().toISOString()), checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: { entityClarity: [], customerQuestions: [] },
}
const run = await runVisibilityScan(state, {
  automationVersion: 2,
  website: (profile) => auditWebsite({ machineReadability: true, website: profile.website, businessName: profile.businessName, phone: profile.phone, services: profile.primaryServices.split(',').filter(Boolean), serviceAreas: profile.serviceArea.split(',').filter(Boolean) }),
  acquire: async (url, method) => (await acquireRuntime(url, method)).capture,
  acquireGoogle: async (url) => (await acquireGoogleSearchRuntime(url)).capture,
  acquireGoogleMaps: async (url) => (await acquireGoogleMapsRuntime(url)).capture,
}, (update) => { state = update(state) })
writeFileSync(output, JSON.stringify({
  status: 'UNREVIEWED_PROVING_ATTEMPT', networkRestrictionReported: process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1',
  publicPresenceSummary: summarizePublicPresence(state), profile, profileReviewState: state.businessProfile, run, machineReadability: state.machineReadability, reviewableFindings: workspaceFindings(state).filter((fix) => fix.intelligence), websiteAudit: state.websiteAudit, observations: state.searchDestinationObservations,
  coverage: run.checks.filter((check) => check.url).map((check) => ({
    destination: check.destination || check.url, query: check.query, queryMode: check.queryMode, acquisitionTierReached: check.captures.some((capture) => capture.method === 'rendered_browser') ? 'tier_2_provider_entry' : check.captures.length ? 'tier_1_provider_entry' : 'not_acquired',
    selectedProvider: check.captures.at(-1)?.provider || 'none', providerAttempts: check.captures.flatMap((capture) => capture.providerAttempts || []), resultRegionInspected: check.captures.some((capture) => capture.resultRegionInspected),
    candidateFound: Boolean(check.assessment?.matches.length), matchedFields: check.assessment?.selected?.matchedFields || [], conflictingFields: check.assessment?.selected?.conflictingFields || [], confidence: check.assessment?.confidence || 'unavailable', automaticObservation: check.assessment?.automaticObservation || false, ambiguity: check.assessment?.ambiguityReasons || [check.error || 'No usable identity evidence.'], tier3Candidate: check.assessment?.tier3Candidate || false, tier1Attempted: check.captures.some((c) => c.method === 'server_fetch'), tier1Outcome: check.captures.find((c) => c.method === 'server_fetch')?.outcome || 'not_attempted',
    tier2Attempted: check.captures.some((c) => c.method === 'rendered_browser'), tier2Outcome: check.captures.find((c) => c.method === 'rendered_browser')?.outcome || 'not_attempted',
    usableEvidence: check.evidenceCaptured, automaticInterpretation: check.interpreted, operatorReviewRequired: !check.assessment?.automaticObservation, interactiveReviewRequired: check.state === 'interactive_review_required', elapsedMs: check.elapsedMs,
  })),
}, null, 2))
console.log(`Saved ${output}: ${JSON.stringify(run.summary)}`)
