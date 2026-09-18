import type { BrowserWebsiteEvidencePayload } from './websiteAudit.js'

export type AcquisitionMethod = 'server_fetch' | 'rendered_browser' | 'browser_assisted' | 'operator_observation'
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
  notes: string[]
  confidence: 'captured' | 'operator_supplied' | 'unavailable'
  error?: string
}
export interface AcquisitionProvider {
  acquire(url: string): Promise<AcquisitionResult>
}
