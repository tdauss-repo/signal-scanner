import type { BrowserWebsiteEvidencePayload } from './websiteAudit.js'
import type { BusinessResultCandidate } from './entityMatch.js'

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
  finalUrl?: string
  provider: string
  method: AcquisitionMethod
  acquiredAt: string
  outcome: 'success' | 'partial' | 'blocked' | 'failed'
  statusCode?: number
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
  checkedDestination?: 'Google Search' | 'Google Maps'
  providerAttempts?: Array<{ provider: string; outcome: 'success' | 'unavailable'; blocker: string; elapsedMs: number }>
  notes: string[]
  confidence: 'captured' | 'operator_supplied' | 'unavailable'
  error?: string
}
export interface AcquisitionProvider {
  acquire(url: string): Promise<AcquisitionResult>
}
