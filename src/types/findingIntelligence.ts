import type { WebsiteAcquisitionProvenance } from './websiteAudit.js'

export type FindingLifecycle = 'Detected' | 'Evidence captured' | 'Reviewed' | 'Action proposed' | 'Approved' | 'Implemented' | 'Re-scanned' | 'Verified'

export interface FindingIntelligence {
  ruleVersion: 1
  checkId: string
  condition: string
  evidence: { provenance: WebsiteAcquisitionProvenance; observations: string[]; confidence: 'supported' }
  customer: {
    title: string
    found: string
    why: string
    recommendation: string
    canRemediate: boolean
    confirmation: string
    evidenceSummary: string
    verificationSummary: string
  }
  delivery: {
    technicalChange: string
    steps: string[]
    access: string[]
    customerInput: string[]
    dependencies: string[]
    scope: 'starter' | 'later' | 'owner_action'
  }
  verification: { expectedState: string; method: string; criteria: string[] }
  // Packet D records detection, not approvals, implementation or verified outcomes.
  lifecycle: FindingLifecycle
}
