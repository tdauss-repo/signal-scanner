import type { EntityMatch, EvidenceReference } from './entityMatch.js'
import type { WebsiteAcquisitionProvenance } from './websiteAudit.js'

/** Additive raw evidence from the same homepage response, plus an explicit bounded robots GET. */
export interface MachineReadabilityCapture {
  version: 1
  titles: string[]
  canonicals: string[]
  metaRobots: Array<{ agent: string; content: string }>
  xRobotsTag: string
  openGraph: Record<string, string[]>
  visibleText: string
  internalLinks: Array<{ url: string; text: string }>
  jsonLdParseErrors: number
  robots: { requestedUrl: string; finalUrl?: string; acquiredAt: string; status?: number; text?: string; truncated?: boolean; error?: string }
}
export interface MachineCheck {
  id: string
  group: 'Technical accessibility' | 'Page metadata' | 'Structured business information' | 'Semantic clarity' | 'Profile consistency'
  result: 'observed' | 'needs_review' | 'not_observed' | 'unavailable'
  conclusion: string
  evidence: string[]
}
export interface MachineReadabilityReport {
  version: 1
  profileKey: string
  profileReviewKey: string
  websiteEvidenceKey?: string
  analyzedAt: string
  sourceUrl: string
  acquisition?: WebsiteAcquisitionProvenance
  status: 'evidence_captured' | 'unavailable'
  checks: MachineCheck[]
  schemaTypes: string[]
  entities: Array<{ path: string; types: string[]; facts: Record<string, unknown> }>
  comparisons: EntityMatch[]
  evidenceReferences: EvidenceReference[]
  conditions: Array<{ id: 'missing_business_entity' | 'incomplete_business_identity' | 'business_profile_conflict' | 'location_not_represented'; evidence: string[] }>
  answerTesting: 'not_performed'
}
