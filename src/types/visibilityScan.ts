import type { SearchEntityAssessment } from './entityMatch.js'
import type { MachineReadabilityReport } from './machineReadability.js'
import type { AcquisitionResult } from './acquisition.js'
import type { CorroborationRecord, SearchDestination } from './audit.js'

export type ScanState = 'queued' | 'scanning' | 'evidence_captured' | 'awaiting_review' | 'interactive_review_required' | 'checked_clear' | 'needs_attention' | 'failed' | 'not_checked'
export type VisibilityRunStatus = 'running' | 'completed' | 'completed_with_review' | 'failed'
export type ScanArea = 'WebsiteTechnical' | 'SearchMaps' | 'BusinessInformation' | 'AIDiscovery'
export interface PresenceAutomation {
  assessment?: SearchEntityAssessment
  automaticObservation?: boolean
  queryMode?: 'brand' | 'location' | 'discovery'
  runId: string
  state: ScanState
  inspectedUrl: string
  captures: AcquisitionResult[]
  evidence: string
  interpreted: boolean
}
export interface VisibilityCheck {
  assessment?: SearchEntityAssessment
  queryMode?: 'brand' | 'location' | 'discovery'
  id: string
  area: ScanArea
  state: ScanState
  destination?: SearchDestination
  queryId?: string
  query?: string
  url?: string
  startedAt?: string
  endedAt?: string
  elapsedMs?: number
  captures: AcquisitionResult[]
  evidenceCaptured: boolean
  interpreted: boolean
  error?: string
}
export interface VisibilityRun {
  version: 1 | 2
  profileReviewKey?: string
  machineReadability?: MachineReadabilityReport
  id: string
  profileKey: string
  startedAt: string
  endedAt?: string
  /** Optional for saved-scan compatibility; derived from timestamps when absent. */
  status?: VisibilityRunStatus
  failure?: string
  interrupted?: boolean
  checks: VisibilityCheck[]
  businessEvidence: CorroborationRecord[]
  summary?: {
    attempted: number
    successful: number
    evidenceCaptured: number
    operatorReview: number
    interactiveReview: number
    manualInterventionsRequired: number
    acquisitionFailures: number
    providerEscalations: number
    candidateFindings: number
    customerApprovedFindings: number
  }
}
