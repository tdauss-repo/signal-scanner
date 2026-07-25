export interface WebsiteAuditResult {
  ok: true
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
  socialProfileLinks: string[]
  sitemapAvailable: boolean
  robotsAvailable: boolean
  homepageStatus: number
  contentLength: number
  analyzedAt: string
}

export interface WebsiteAuditBlockedResult {
  ok: false
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
  timestamp: string
}

export type WebsiteAuditResponse = WebsiteAuditResult | WebsiteAuditBlockedResult

export interface ManualWebsiteObservation {
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
