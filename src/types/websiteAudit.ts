export type WebsiteAcquisitionMethod =
  | 'server_fetch'
  | 'operator_observation'
  | 'rendered_browser'

export type WebsiteAcquisitionOutcome =
  | 'success'
  | 'blocked'
  | 'unavailable'
  | 'observed'

export type WebsiteAcquisitionRecordOrigin =
  | 'captured'
  | 'legacy_reconstructed'

export interface WebsiteAttemptSummary {
  // Aggregate metadata for the full homepage acquisition run. Some fields
  // describe the selected/meaningful attempt while others summarize the run.
  attemptedCount?: number
  selectedUrl?: string
  selectedStrategy?: string
  selectedStatus?: number
  errorType?: string
  protocolFallbackTried?: boolean
  wwwFallbackTried?: boolean
}

export interface WebsiteAcquisitionProvenance {
  captureVersion: 1
  provider: string
  method: WebsiteAcquisitionMethod
  outcome: WebsiteAcquisitionOutcome
  requestedUrl?: string
  sourceUrl?: string
  occurredAt?: string
  attemptSummary?: WebsiteAttemptSummary
  recordOrigin: WebsiteAcquisitionRecordOrigin
}

export interface LinkEvidence {
  url: string
  anchorText: string
  sourceRegion: 'header' | 'navigation' | 'footer' | 'body'
  internal: boolean
  classification: 'contact' | 'rejected-contact-candidate' | 'other'
  reason: string
}

export interface WebsiteAuditResult {
  ok: true
  acquisition: WebsiteAcquisitionProvenance
  normalizedUrl: string
  fetchedUrl: string
  fetchStrategyUsed: string
  redirectCount: number
  title: string
  metaDescription: string
  canonicalUrl: string
  h1Text: string[]
  h2Text: string[]
  visibleTextSummary: string
  businessNameFound: boolean
  phoneNumberMatches: string[]
  servicePhraseMatches: string[]
  serviceAreaPhraseMatches: string[]
  serviceLinks: string[]
  jsonLdSchemaBlocks: unknown[]
  detectedSchemaTypes: string[]
  faqIndicators: string[]
  hasContactLink: boolean
  contactLinks: string[]
  contactLinkEvidence: LinkEvidence[]
  rejectedContactCandidates: LinkEvidence[]
  socialProfileLinks: string[]
  sitemapAvailable: boolean
  robotsAvailable: boolean
  homepageStatus: number
  contentLength: number
  httpsAvailable: boolean
  httpsStatus: number | null
  httpAvailable: boolean
  httpStatus: number | null
  httpRedirectsToHttps: boolean
  analyzedAt: string
}

export interface WebsiteAuditBlockedResult {
  ok: false
  acquisition: WebsiteAcquisitionProvenance
  status: number
  statusText?: string
  error: string
  errorType: string
  details: string
  recommendedNextStep: string
  requestedUrl: string
  normalizedUrl?: string
  redirectUrl: string
  finalUrl?: string
  redirectOccurred: boolean
  redirectCount: number
  blocked: boolean
  fetchStrategyUsed: string
  httpsFallbackTried: boolean
  protocolFallbackTried: boolean
  wwwFallbackTried: boolean
  timestamp: string
}

export type WebsiteAuditResponse = WebsiteAuditResult | WebsiteAuditBlockedResult

export interface ManualWebsiteObservation {
  sourceUrl: string
  recordedAt: string
  acquisition: WebsiteAcquisitionProvenance | null
  observedTitle: string
  observedMetaDescription: string
  visibleHomepageText: string
  observedLinks: string
  observedSchemaSnippet: string
  notes: string
  analyzedAt: string
}

export interface AutoAuditMapping {
  statuses: Record<string, 'pass' | 'partial' | 'fail'>
  notes: Record<string, string>
}
