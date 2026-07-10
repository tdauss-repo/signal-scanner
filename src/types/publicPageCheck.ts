import type {
  DirectoryFoundData,
  DirectoryListingStatus,
  EvidenceConfidence,
} from './audit'

export interface PublicPageCheckResponse {
  ok: boolean
  requestedUrl: string
  fetchedUrl: string
  status?: number
  listingResult: DirectoryListingStatus
  foundData: DirectoryFoundData
  publicEvidenceNotes: string
  recommendedAction: string
  evidenceConfidence: EvidenceConfidence
  lastCheckedAt: string
  error?: string
}
