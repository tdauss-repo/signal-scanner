import type { BusinessResultCandidate, SearchEntityAssessment } from './entityMatch.js'

export interface OperatorAssistedBrowserEvidence {
  version: 1
  provenance: 'operator_assisted_browser'
  sourceUrl: string
  rawText: string
  parsedAt: string
  acceptedAt: string
  evidenceKey: string
  profileKey: string
  profileReviewKey: string
  candidates: BusinessResultCandidate[]
  assessment: SearchEntityAssessment
}
