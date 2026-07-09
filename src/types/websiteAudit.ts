export interface WebsiteAuditResult {
  ok: true
  normalizedUrl: string
  fetchedUrl: string
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
  status: 403
  error: string
  details: string
  recommendedNextStep: string
  requestedUrl: string
  redirectUrl: string
  timestamp: string
}

export type WebsiteAuditResponse = WebsiteAuditResult | WebsiteAuditBlockedResult

export interface AutoAuditMapping {
  statuses: Record<string, 'pass' | 'partial' | 'fail'>
  notes: Record<string, string>
}
