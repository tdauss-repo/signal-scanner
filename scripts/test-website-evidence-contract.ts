import assert from 'node:assert/strict'
import type { AuditItem, BusinessProfile, CheckStatus, WebsiteAuditWorkspaceState } from '../src/types/audit.ts'
import type { WebsiteAuditResult } from '../src/types/websiteAudit.ts'
import { defaultProfile } from '../src/data/demoProfile.ts'
import { scoreItems, weightedAverage } from '../src/utils/scoring.ts'
import { mapAutoAuditToWebsiteChecks } from '../src/utils/websiteAutoAudit.ts'
import {
  captureManualObservationProvenance,
  defaultManualWebsiteObservation,
  normalizeWebsiteAuditWorkspaceState,
  updateManualWebsiteObservationDraft,
} from '../src/utils/websiteAuditState.ts'

const profile: BusinessProfile = {
  ...defaultProfile,
  businessName: 'Example Business',
  website: 'https://example.test',
  phone: '419-555-1212',
  primaryServices: 'preschool',
  serviceArea: 'Southgate',
}

const currentResult: WebsiteAuditResult = {
  ok: true,
  acquisition: {
    captureVersion: 1,
    provider: 'found-local-server',
    method: 'server_fetch',
    outcome: 'success',
    requestedUrl: 'example.test',
    sourceUrl: 'https://example.test/',
    occurredAt: '2026-07-30T12:00:00.000Z',
    attemptSummary: {
      attemptedCount: 1,
      selectedUrl: 'https://example.test/',
      selectedStrategy: 'normal fetch (https://example.test/)',
      selectedStatus: 200,
      protocolFallbackTried: false,
      wwwFallbackTried: false,
    },
    recordOrigin: 'captured',
  },
  normalizedUrl: 'https://example.test/',
  fetchedUrl: 'https://example.test/',
  fetchStrategyUsed: 'normal fetch (https://example.test/)',
  redirectCount: 0,
  title: 'Example Business Preschool Southgate',
  metaDescription:
    'Example Business provides preschool programs for Southgate families with a clear contact path and local service information.',
  canonicalUrl: 'https://example.test/',
  h1Text: ['Example Business Preschool'],
  h2Text: ['Preschool questions?'],
  visibleTextSummary: 'Example Business preschool Southgate 419-555-1212',
  businessNameFound: true,
  phoneNumberMatches: ['4195551212'],
  servicePhraseMatches: ['preschool'],
  serviceAreaPhraseMatches: ['Southgate'],
  serviceLinks: ['https://example.test/preschool'],
  jsonLdSchemaBlocks: [{ '@type': 'Organization' }],
  detectedSchemaTypes: ['Organization'],
  faqIndicators: ['FAQ'],
  hasContactLink: true,
  contactLinks: ['https://example.test/contact'],
  contactLinkEvidence: [],
  rejectedContactCandidates: [],
  socialProfileLinks: ['https://facebook.com/example'],
  sitemapAvailable: true,
  robotsAvailable: true,
  homepageStatus: 200,
  contentLength: 900,
  httpsAvailable: true,
  httpsStatus: 200,
  httpAvailable: true,
  httpStatus: 200,
  httpRedirectsToHttps: true,
  analyzedAt: '2026-07-30T12:00:00.000Z',
}

const { acquisition: _currentAcquisition, ...legacySuccessfulResult } = currentResult
void _currentAcquisition
const legacyFailedResult = {
  ok: false,
  status: 403,
  error: 'Automated homepage access blocked',
  errorType: 'http_forbidden',
  details: 'HTTP 403 Forbidden.',
  recommendedNextStep: 'Use Browser Observation Review for this site.',
  requestedUrl: 'https://blocked.example',
  normalizedUrl: 'https://blocked.example/',
  redirectUrl: 'https://blocked.example/',
  finalUrl: 'https://blocked.example/',
  redirectOccurred: false,
  redirectCount: 0,
  blocked: true,
  fetchStrategyUsed: 'normal fetch (https://blocked.example/)',
  httpsFallbackTried: true,
  protocolFallbackTried: true,
  wwwFallbackTried: true,
  timestamp: '2026-07-30T12:05:00.000Z',
}

const legacyWorkspace = {
  lastSuccessful: legacySuccessfulResult,
  latestAttempt: legacyFailedResult,
  manualObservation: {
    observedTitle: 'Observed manually',
    visibleHomepageText: 'Example Business preschool Southgate',
  },
} as unknown as Partial<WebsiteAuditWorkspaceState>

const normalizedLegacy = normalizeWebsiteAuditWorkspaceState(legacyWorkspace)
assert.equal(normalizedLegacy.lastSuccessful?.title, currentResult.title)
assert.equal(normalizedLegacy.lastSuccessful?.acquisition.recordOrigin, 'legacy_reconstructed')
assert.equal(normalizedLegacy.lastSuccessful?.acquisition.requestedUrl, undefined)
assert.equal(normalizedLegacy.lastSuccessful?.acquisition.sourceUrl, currentResult.fetchedUrl)
assert.equal(normalizedLegacy.lastSuccessful?.acquisition.attemptSummary?.attemptedCount, undefined)
assert.equal(normalizedLegacy.latestAttempt?.ok, false)
if (normalizedLegacy.latestAttempt?.ok === false) {
  assert.equal(normalizedLegacy.latestAttempt.acquisition.recordOrigin, 'legacy_reconstructed')
  assert.equal(normalizedLegacy.latestAttempt.acquisition.requestedUrl, 'https://blocked.example')
  assert.equal(normalizedLegacy.latestAttempt.acquisition.sourceUrl, undefined)
  assert.equal(normalizedLegacy.latestAttempt.acquisition.attemptSummary?.attemptedCount, undefined)
}
assert.equal(normalizedLegacy.manualObservation.observedTitle, 'Observed manually')
assert.equal(normalizedLegacy.manualObservation.sourceUrl, '')
assert.equal(normalizedLegacy.manualObservation.recordedAt, '')
assert.equal(normalizedLegacy.manualObservation.acquisition, null)

const manualObservation = captureManualObservationProvenance(
  {
    ...defaultManualWebsiteObservation(),
    sourceUrl: ' https://browser-visible.example/ ',
    observedTitle: 'Observed manually',
  },
  '2026-07-30T12:10:00.000Z',
)
assert.equal(manualObservation.sourceUrl, 'https://browser-visible.example/')
assert.equal(manualObservation.recordedAt, '2026-07-30T12:10:00.000Z')
assert.equal(manualObservation.analyzedAt, '2026-07-30T12:10:00.000Z')
assert.equal(manualObservation.acquisition?.provider, 'operator')
assert.equal(manualObservation.acquisition?.method, 'operator_observation')
assert.equal(manualObservation.acquisition?.outcome, 'observed')
assert.equal(manualObservation.acquisition?.recordOrigin, 'captured')
assert.equal(manualObservation.acquisition?.sourceUrl, 'https://browser-visible.example/')
assert.equal(manualObservation.acquisition?.attemptSummary, undefined)

const editedManualObservation = updateManualWebsiteObservationDraft(
  manualObservation,
  {
    visibleHomepageText: 'Updated visible text after reviewing the browser again',
  },
)
assert.equal(
  editedManualObservation.visibleHomepageText,
  'Updated visible text after reviewing the browser again',
)
assert.equal(editedManualObservation.acquisition, null)
assert.equal(editedManualObservation.recordedAt, '')
assert.equal(editedManualObservation.analyzedAt, '')

const reanalyzedManualObservation = captureManualObservationProvenance(
  editedManualObservation,
  '2026-07-30T12:12:00.000Z',
)
assert.equal(reanalyzedManualObservation.recordedAt, '2026-07-30T12:12:00.000Z')
assert.equal(reanalyzedManualObservation.analyzedAt, '2026-07-30T12:12:00.000Z')
assert.equal(reanalyzedManualObservation.acquisition?.occurredAt, '2026-07-30T12:12:00.000Z')
assert.equal(reanalyzedManualObservation.acquisition?.recordOrigin, 'captured')

const malformedWorkspace = {
  lastSuccessful: { ok: true, fetchedUrl: 'https://broken.example/' },
  latestAttempt: { ok: false, error: 'missing required fields' },
  manualObservation: {
    observedTitle: 'Keep manual evidence',
    visibleHomepageText: 'Manual text survives malformed automation state',
    observedAt: '2026-07-30T12:14:00.000Z',
    notes: 'Preserve unrelated manual state.',
  },
} as unknown as Partial<WebsiteAuditWorkspaceState>

const normalizedMalformed = normalizeWebsiteAuditWorkspaceState(malformedWorkspace)
assert.equal(normalizedMalformed.lastSuccessful, null)
assert.equal(normalizedMalformed.latestAttempt, null)
assert.equal(normalizedMalformed.manualObservation.observedTitle, 'Keep manual evidence')
assert.equal(
  normalizedMalformed.manualObservation.visibleHomepageText,
  'Manual text survives malformed automation state',
)
assert.equal(normalizedMalformed.manualObservation.notes, 'Preserve unrelated manual state.')
assert.equal(normalizedMalformed.manualObservation.recordedAt, '2026-07-30T12:14:00.000Z')
assert.equal(normalizedMalformed.manualObservation.acquisition, null)

const legacyMapping = mapAutoAuditToWebsiteChecks(
  legacySuccessfulResult as WebsiteAuditResult,
  profile,
)
const currentMapping = mapAutoAuditToWebsiteChecks(currentResult, profile)
assert.deepEqual(currentMapping, legacyMapping)
assert.equal(currentMapping.statuses['website-title'], 'pass')
assert.equal(currentMapping.statuses['website-homepage-clarity'], 'pass')

const scoredItems: AuditItem[] = [
  { id: 'website-title', area: 'website', label: 'Title', description: '', weight: 10, access: 'public', evidenceLinks: [], fix: '' },
  { id: 'website-homepage-clarity', area: 'website', label: 'Clarity', description: '', weight: 16, access: 'public', evidenceLinks: [], fix: '' },
]
const legacyChecks = legacyMapping.statuses as Record<string, CheckStatus>
const currentChecks = currentMapping.statuses as Record<string, CheckStatus>
const legacyScore = scoreItems(scoredItems, legacyChecks)
const currentScore = scoreItems(scoredItems, currentChecks)
assert.deepEqual(currentScore, legacyScore)
assert.equal(currentScore.score, 100)
assert.equal(
  weightedAverage([
    { score: legacyScore.score, weight: 24 },
    { score: 50, weight: 24 },
  ]),
  weightedAverage([
    { score: currentScore.score, weight: 24 },
    { score: 50, weight: 24 },
  ]),
)

console.log('Website evidence provenance contract tests passed.')
