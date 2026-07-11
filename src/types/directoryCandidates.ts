import type { DirectoryCandidateUrl } from './audit'

export interface DirectoryCandidateResponse {
  ok: boolean
  candidateUrls: DirectoryCandidateUrl[]
  manualSearchLinks: DirectoryCandidateUrl[]
  searchedQueries: string[]
  message?: string
}
