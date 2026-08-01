import assert from 'node:assert/strict'
import type { AuditItem, BusinessProfile, CheckStatus, EvidenceConfidence, WebsiteAuditWorkspaceState } from '../src/types/audit.ts'
import type {
  BrowserObservedLink,
  BrowserWebsiteEvidencePayload,
  WebsiteAuditResult,
} from '../src/types/websiteAudit.ts'
import { defaultProfile } from '../src/data/demoProfile.ts'
import { scoreItems, weightedAverage } from '../src/utils/scoring.ts'
import { analyzeBrowserWebsiteObservation, mapAutoAuditToWebsiteChecks, mergeBrowserMappingWithServerPrecedence } from '../src/utils/websiteAutoAudit.ts'
import {
  browserWebsiteObservationFromPayload,
  captureBrowserWebsiteObservationProvenance,
  parseBrowserWebsiteEvidencePayload,
  updateBrowserWebsiteObservationDraft,
} from '../src/utils/browserWebsiteObservation.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'

const profile: BusinessProfile = {
  ...defaultProfile,
  businessName: 'Example Business',
  website: 'https://example.test',
  phone: '419-555-1212',
  primaryServices: 'preschool',
  serviceArea: 'Southgate',
}

const links: BrowserObservedLink[] = [
  {
    url: 'https://example.test/contact',
    anchorText: 'Contact Us',
    sourceRegion: 'navigation',
    internal: true,
  },
  {
    url: 'https://example.test/preschool',
    anchorText: 'Preschool program',
    sourceRegion: 'body',
    internal: true,
  },
  {
    url: 'https://facebook.com/example',
    anchorText: 'Facebook',
    sourceRegion: 'footer',
    internal: false,
  },
  {
    url: 'https://instagram.com/example',
    anchorText: 'Instagram',
    sourceRegion: 'footer',
    internal: false,
  },
]

const validPayload: BrowserWebsiteEvidencePayload = {
  schema: 'found-local-browser-website-evidence',
  captureVersion: 1,
  capturedAt: '2026-07-31T12:00:00.000Z',
  sourceUrl: 'https://example.test/',
  title: 'Example Business Preschool Southgate',
  metaDescription:
    'Example Business provides preschool programs for Southgate families with a clear contact path and local service information.',
  h1Text: ['Example Business Preschool'],
  h2Text: ['Preschool questions?'],
  visibleText:
    'Example Business preschool Southgate 419-555-1212 Frequently Asked Questions',
  links,
  jsonLdTextBlocks: [
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Example Business',
    }),
  ],
}

const parsed = parseBrowserWebsiteEvidencePayload(JSON.stringify(validPayload))
assert.equal(parsed.ok, true)
if (!parsed.ok) throw new Error(parsed.error)

const observation = browserWebsiteObservationFromPayload(
  parsed.payload,
  '2026-07-31T12:05:00.000Z',
)
assert.equal(observation.sourceUrl, 'https://example.test/')
assert.equal(observation.capturedAt, '2026-07-31T12:00:00.000Z')
assert.equal(observation.recordedAt, '2026-07-31T12:05:00.000Z')
assert.equal(observation.analyzedAt, '2026-07-31T12:05:00.000Z')
assert.equal(observation.acquisition?.provider, 'found-local-browser-helper')
assert.equal(observation.acquisition?.method, 'browser_assisted_observation')
assert.equal(observation.acquisition?.outcome, 'observed')
assert.equal(observation.acquisition?.recordOrigin, 'captured')
assert.equal(observation.acquisition?.sourceUrl, 'https://example.test/')
assert.equal(observation.acquisition?.occurredAt, '2026-07-31T12:05:00.000Z')
assert.equal(observation.acquisition?.attemptSummary, undefined)
assert.equal('homepageStatus' in observation, false)
assert.equal('httpsAvailable' in observation, false)
assert.equal('robotsAvailable' in observation, false)
assert.equal('sitemapAvailable' in observation, false)
assert.equal('fetchStrategyUsed' in observation, false)
assert.deepEqual(observation.detectedSchemaTypes, ['LocalBusiness'])
assert(observation.faqIndicators.length > 0)
assert(observation.contactLinks.includes('https://example.test/contact'))
assert.equal(observation.socialProfileLinks.length, 2)

const malformed = parseBrowserWebsiteEvidencePayload('{bad json')
assert.equal(malformed.ok, false)

const wrongSchema = parseBrowserWebsiteEvidencePayload(
  JSON.stringify({ ...validPayload, schema: 'wrong' }),
)
assert.equal(wrongSchema.ok, false)

const wrongVersion = parseBrowserWebsiteEvidencePayload(
  JSON.stringify({ ...validPayload, captureVersion: 2 }),
)
assert.equal(wrongVersion.ok, false)

const oversized = parseBrowserWebsiteEvidencePayload(
  JSON.stringify({
    ...validPayload,
    visibleText: 'x'.repeat(12_001),
  }),
)
assert.equal(oversized.ok, false)

const tooManyLinks = parseBrowserWebsiteEvidencePayload(
  JSON.stringify({
    ...validPayload,
    links: Array.from({ length: 151 }, () => links[0]),
  }),
)
assert.equal(tooManyLinks.ok, false)

const tooManySchemaBlocks = parseBrowserWebsiteEvidencePayload(
  JSON.stringify({
    ...validPayload,
    jsonLdTextBlocks: Array.from({ length: 11 }, () => '{}'),
  }),
)
assert.equal(tooManySchemaBlocks.ok, false)

const unsupportedSourceUrl = parseBrowserWebsiteEvidencePayload(
  JSON.stringify({
    ...validPayload,
    sourceUrl: 'file:///C:/secret.html',
  }),
)
assert.equal(unsupportedSourceUrl.ok, false)

const mapping = analyzeBrowserWebsiteObservation(observation, profile)
assert.equal(mapping.statuses['website-title'], 'pass')
assert.equal(mapping.statuses['website-meta-description'], 'pass')
assert.equal(mapping.statuses['website-homepage-clarity'], 'pass')
assert.equal(mapping.statuses['website-service-pages'], 'partial')
assert.equal(mapping.statuses['website-local-content'], 'partial')
assert.equal(mapping.statuses['website-schema'], 'partial')
assert.equal(mapping.statuses['website-faq'], 'pass')
assert.equal(mapping.statuses['website-mobile-conversion'], 'pass')
assert.equal(mapping.statuses['website-social-links'], 'pass')
assert.equal(mapping.statuses['website-sitemap-robots'], 'unknown')
assert.match(mapping.notes['website-sitemap-robots'], /not checked/i)

const editedObservation = updateBrowserWebsiteObservationDraft(observation, {
  title: 'Edited Example Business Title',
})
assert.equal(editedObservation.title, 'Edited Example Business Title')
assert.equal(editedObservation.acquisition, null)
assert.equal(editedObservation.recordedAt, '')
assert.equal(editedObservation.analyzedAt, '')

const reanalyzedObservation = captureBrowserWebsiteObservationProvenance(
  editedObservation,
  '2026-07-31T12:10:00.000Z',
)
assert.equal(reanalyzedObservation.recordedAt, '2026-07-31T12:10:00.000Z')
assert.equal(reanalyzedObservation.analyzedAt, '2026-07-31T12:10:00.000Z')
assert.equal(reanalyzedObservation.acquisition?.method, 'browser_assisted_observation')

const legacyWorkspace = normalizeWebsiteAuditWorkspaceState({
  manualObservation: {
    observedTitle: 'Legacy manual title',
  },
} as unknown as Partial<WebsiteAuditWorkspaceState>)
assert.equal(legacyWorkspace.browserObservation, null)
assert.equal(legacyWorkspace.manualObservation.observedTitle, 'Legacy manual title')

const latestBlockedAttempt = {
  ok: false,
  acquisition: {
    captureVersion: 1,
    provider: 'found-local-server',
    method: 'server_fetch',
    outcome: 'blocked',
    requestedUrl: 'https://blocked.example',
    occurredAt: '2026-07-31T12:15:00.000Z',
    recordOrigin: 'captured',
  },
  status: 403,
  error: 'Automated homepage access blocked',
  errorType: 'http_forbidden',
  details: 'HTTP 403 Forbidden.',
  recommendedNextStep: 'Use Browser Observation Review for this site.',
  requestedUrl: 'https://blocked.example',
  redirectUrl: 'https://blocked.example/',
  redirectOccurred: false,
  redirectCount: 0,
  blocked: true,
  fetchStrategyUsed: 'normal fetch (https://blocked.example/)',
  httpsFallbackTried: true,
  protocolFallbackTried: true,
  wwwFallbackTried: true,
  timestamp: '2026-07-31T12:15:00.000Z',
}

const lastSuccessful: WebsiteAuditResult = {
  ok: true,
  acquisition: {
    captureVersion: 1,
    provider: 'found-local-server',
    method: 'server_fetch',
    outcome: 'success',
    sourceUrl: 'https://server-success.example/',
    occurredAt: '2026-07-30T12:00:00.000Z',
    recordOrigin: 'captured',
  },
  normalizedUrl: 'https://server-success.example/',
  fetchedUrl: 'https://server-success.example/',
  fetchStrategyUsed: 'normal fetch (https://server-success.example/)',
  redirectCount: 0,
  title: 'Server Success',
  metaDescription: 'Server success page for Example Business preschool Southgate local search testing.',
  canonicalUrl: 'https://server-success.example/',
  h1Text: ['Server Success'],
  h2Text: [],
  visibleTextSummary: 'Example Business preschool Southgate 419-555-1212',
  businessNameFound: true,
  phoneNumberMatches: ['4195551212'],
  servicePhraseMatches: ['preschool'],
  serviceAreaPhraseMatches: ['Southgate'],
  serviceLinks: ['https://server-success.example/preschool'],
  jsonLdSchemaBlocks: [],
  detectedSchemaTypes: [],
  faqIndicators: [],
  hasContactLink: true,
  contactLinks: ['https://server-success.example/contact'],
  contactLinkEvidence: [],
  rejectedContactCandidates: [],
  socialProfileLinks: [],
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

const preservedWorkspace = normalizeWebsiteAuditWorkspaceState({
  lastSuccessful,
  latestAttempt: latestBlockedAttempt,
  browserObservation: observation,
} as unknown as Partial<WebsiteAuditWorkspaceState>)
assert.equal(preservedWorkspace.lastSuccessful?.fetchedUrl, 'https://server-success.example/')
assert.equal(preservedWorkspace.latestAttempt?.ok, false)
assert.equal(preservedWorkspace.browserObservation?.sourceUrl, 'https://example.test/')
assert.deepEqual(preservedWorkspace.browserObservation, observation)

const lastSuccessfulSnapshot = structuredClone(lastSuccessful)
const latestAttemptSnapshot = structuredClone(latestBlockedAttempt)

const serverMapping = mapAutoAuditToWebsiteChecks(lastSuccessful, profile)
const serverChecks = serverMapping.statuses as Record<string, CheckStatus>
const serverNotes = serverMapping.notes
const serverConfidence = Object.keys(serverMapping.statuses).reduce(
  (confidence, id) => ({
    ...confidence,
    [id]: 'scanner_detected_public_page',
  }),
  {} as Record<string, EvidenceConfidence>,
)
const websiteScoreItems: AuditItem[] = [
  { id: 'website-title', area: 'website', label: 'Title', description: '', weight: 10, access: 'public', evidenceLinks: [], fix: '' },
  { id: 'website-homepage-clarity', area: 'website', label: 'Clarity', description: '', weight: 16, access: 'public', evidenceLinks: [], fix: '' },
  { id: 'website-sitemap-robots', area: 'website', label: 'Sitemap', description: '', weight: 4, access: 'public', evidenceLinks: [], fix: '' },
]
const serverScoreBeforeBrowser = scoreItems(websiteScoreItems, serverChecks)
const overallBeforeBrowser = weightedAverage([
  { score: serverScoreBeforeBrowser.score, weight: 24 },
  { score: 50, weight: 24 },
])
const conflictingBrowserMapping = {
  statuses: {
    ...mapping.statuses,
    'website-title': 'fail',
    'website-sitemap-robots': 'unknown',
  },
  notes: {
    ...mapping.notes,
    'website-title': 'Browser title note must not replace server note.',
    'website-sitemap-robots': 'Browser cannot check sitemap or robots.',
  },
}
const mergedWithServerPrecedence = mergeBrowserMappingWithServerPrecedence(
  {
    checks: serverChecks,
    notes: serverNotes,
    evidenceConfidence: serverConfidence,
    websiteAudit: {
      ...preservedWorkspace,
      browserObservation: null,
    },
  },
  profile,
  conflictingBrowserMapping,
)
assert.equal(
  mergedWithServerPrecedence.checks['website-title'],
  serverChecks['website-title'],
)
assert.equal(
  mergedWithServerPrecedence.notes['website-title'],
  serverNotes['website-title'],
)
assert.equal(
  mergedWithServerPrecedence.evidenceConfidence['website-title'],
  'scanner_detected_public_page',
)
assert.equal(
  mergedWithServerPrecedence.checks['website-sitemap-robots'],
  serverChecks['website-sitemap-robots'],
)
assert.equal(
  scoreItems(websiteScoreItems, mergedWithServerPrecedence.checks).score,
  serverScoreBeforeBrowser.score,
)
assert.equal(
  weightedAverage([
    { score: scoreItems(websiteScoreItems, mergedWithServerPrecedence.checks).score, weight: 24 },
    { score: 50, weight: 24 },
  ]),
  overallBeforeBrowser,
)
assert.notEqual(overallBeforeBrowser, null)
assert.deepEqual(lastSuccessful, lastSuccessfulSnapshot)
assert.deepEqual(latestBlockedAttempt, latestAttemptSnapshot)

const dnsUnavailableWorkspace = normalizeWebsiteAuditWorkspaceState({
  latestAttempt: {
    ...latestBlockedAttempt,
    status: 0,
    error: 'Website hostname could not be resolved',
    errorType: 'dns_resolution',
    blocked: false,
    requestedUrl: 'missing.example',
    redirectUrl: 'https://missing.example/',
  },
  browserObservation: observation,
} as unknown as Partial<WebsiteAuditWorkspaceState>)
assert.equal(dnsUnavailableWorkspace.latestAttempt?.ok, false)
assert.equal(dnsUnavailableWorkspace.browserObservation?.acquisition?.method, 'browser_assisted_observation')

const attemptedRejectedImportWorkspace = normalizeWebsiteAuditWorkspaceState({
  browserObservation: observation,
} as unknown as Partial<WebsiteAuditWorkspaceState>)
const rejectedImport = parseBrowserWebsiteEvidencePayload('{bad json')
assert.equal(rejectedImport.ok, false)
assert.equal(attemptedRejectedImportWorkspace.browserObservation?.sourceUrl, observation.sourceUrl)

const browserScoreItems: AuditItem[] = [
  { id: 'website-title', area: 'website', label: 'Title', description: '', weight: 10, access: 'public', evidenceLinks: [], fix: '' },
  { id: 'website-homepage-clarity', area: 'website', label: 'Clarity', description: '', weight: 16, access: 'public', evidenceLinks: [], fix: '' },
  { id: 'website-sitemap-robots', area: 'website', label: 'Sitemap', description: '', weight: 4, access: 'public', evidenceLinks: [], fix: '' },
]
const browserChecks = mapping.statuses as Record<string, CheckStatus>
const browserScore = scoreItems(browserScoreItems, browserChecks)
assert.equal(browserScore.score, 100)
assert.equal(browserScore.checked, 2)
assert.equal(
  weightedAverage([
    { score: browserScore.score, weight: 24 },
    { score: 50, weight: 24 },
  ]),
  75,
)
assert.equal(serverMapping.statuses['website-https'], 'pass')
assert.equal(serverMapping.statuses['website-sitemap-robots'], 'pass')

const browserOnlyMerge = mergeBrowserMappingWithServerPrecedence(
  {
    checks: {},
    notes: {},
    evidenceConfidence: {},
    websiteAudit: {
      lastSuccessful: null,
      latestAttempt: null,
      manualObservation: legacyWorkspace.manualObservation,
      browserObservation: null,
    },
  },
  profile,
  mapping,
)
assert.equal(browserOnlyMerge.checks['website-title'], 'pass')
assert.equal(browserOnlyMerge.checks['website-sitemap-robots'], 'unknown')
assert.equal(browserOnlyMerge.evidenceConfidence['website-title'], 'operator_observation')

console.log('Browser-assisted website observation tests passed.')
