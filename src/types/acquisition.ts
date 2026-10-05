import type { BrowserWebsiteEvidencePayload } from './websiteAudit.js'
import type { BusinessResultCandidate } from './entityMatch.js'
import type { SearchDestination } from './audit.js'

export type AcquisitionMethod = 'server_fetch' | 'rendered_browser' | 'browser_assisted' | 'operator_observation'
export interface RenderedResultCandidate {
  locator: string
  name: string
  links: Array<{ url: string; text: string }>
  /** URL/domain labels visibly associated with this bounded result region (for example, a semantic cite element). */
  displayedUrls?: string[]
  phones: string[]
  excerpt: string
}
export interface RenderedResultEvidence {
  sourceUrl: string
  capturedAt: string
  resultRegionInspected: boolean
  candidates: RenderedResultCandidate[]
}
export interface AcquisitionResult {
  version: 1
  requestedUrl: string
  /** False when a bounded discovery stage intentionally made no destination request. */
  requestAttempted?: boolean
  /** Approved public redirect target, retained separately from the requested and final URLs. */
  redirectUrl?: string
  finalUrl?: string
  provider: string
  method: AcquisitionMethod
  acquiredAt: string
  outcome: 'success' | 'partial' | 'blocked' | 'failed' | 'unavailable'
  statusCode?: number
  /** Initial response status when a bounded redirect was considered. */
  initialStatusCode?: number
  /** True only when the redirect passed the destination-specific public URL policy. */
  redirectAccepted?: boolean
  /** Sanitized state of the optional request made to the approved redirect target. */
  finalRequestState?: 'success' | 'shell' | 'restricted' | 'unavailable' | 'not_requested'
  html?: string
  visibleText?: string
  screenshotReference?: string
  /** Optional compatibility handoff to the existing browser-evidence importer. */
  browserEvidence?: BrowserWebsiteEvidencePayload
  /** Bounded semantic result regions captured from the rendered DOM. No coordinates or interaction. */
  renderedResultEvidence?: RenderedResultEvidence
  /** Provider-normalized search candidates ready for the existing entity matcher. */
  normalizedSearchCandidates?: BusinessResultCandidate[]
  /** True only when the provider inspected a usable search-result region. */
  resultRegionInspected?: boolean
  /** Safe acquisition classification. Provider credentials and raw connection data are never stored here. */
  blocker?: string
  /** Public destination represented by a provider-normalized capture. */
  checkedDestination?: SearchDestination
  providerAttempts?: Array<{ provider: string; stage?: 'serp_initial' | 'serp_retry' | 'browser_fallback'; outcome: 'success' | 'unavailable'; blocker: string; elapsedMs: number; statusCode?: number }>
  /** Sanitized record of a single destination-owned detail request surfaced by the primary response. */
  secondaryResolution?: {
    owner: 'bing'
    used: boolean
    requestedUrl?: string
    finalUrl?: string
    statusCode?: number
    outcome: 'not_used' | 'success' | 'restricted' | 'unavailable'
    blocker?: string
  }
  /** Sanitized record of Yelp's optional one-hop public business-profile enrichment. */
  profileFollow?: {
    used: boolean
    requestedUrl?: string
    finalUrl?: string
    statusCode?: number
    outcome: 'not_used' | 'success' | 'restricted' | 'unavailable'
    blocker?: string
  }
  /** Explicit public social-profile seed retained separately from page verification. */
  profileDiscovery?: {
    source: 'first_party_website' | 'search_evidence' | 'reviewed_business_profile'
    profileUrl: string
    sourceUrl?: string
    observedName?: string
    /** Present on newly discovered profiles; optional for saved-workspace compatibility. */
    evidenceKey?: string
  }
  /** Explicit Apple public place identity discovered in trustworthy automated evidence. */
  applePlaceDiscovery?: {
    source: 'first_party_website' | 'verified_search_evidence' | 'verified_public_evidence'
    canonicalUrl: string
    placeId: string
    name?: string
    address?: string
    coordinate?: string
    providerIdentifier?: string
    sourceUrl?: string
    sourceDestination?: string
    observedName?: string
    evidenceKey: string
  }
  /** Sanitized Apple acquisition diagnostics. Tokens and authorization data are excluded. */
  appleMapsResolution?: {
    publicPlaceResolutionAttempted: boolean
    serverApiConfigured: boolean
    serverApiAttempted: boolean
    anonymousSearchAttempted: boolean
    returnedCandidateCount: number
  }
  notes: string[]
  confidence: 'captured' | 'operator_supplied' | 'unavailable'
  error?: string
}
export interface AcquisitionProvider {
  acquire(url: string): Promise<AcquisitionResult>
}
