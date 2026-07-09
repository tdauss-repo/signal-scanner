export type TrafficStatus = 'Green' | 'Yellow' | 'Red' | 'Gray'

export type CheckStatus = 'pass' | 'partial' | 'fail' | 'unknown'

export type AccessLevel = 'public' | 'owner-authorized'

export interface BusinessProfile {
  businessName: string
  website: string
  phone: string
  serviceArea: string
  primaryServices: string
  targetLocation: string
  keywords: string
}

export interface EvidenceLink {
  label: string
  url: string
}

export interface AuditItem {
  id: string
  area:
    | 'listings'
    | 'website'
    | 'keywords'
    | 'ai'
    | 'voice'
  label: string
  description: string
  weight: number
  access: AccessLevel
  evidenceLinks: EvidenceLink[]
  fix: string
}

export interface AuditState {
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
  profile: BusinessProfile
  lastUpdated: string
}

export interface ScoreResult {
  score: number | null
  status: TrafficStatus
  earned: number
  possible: number
  checked: number
}

export interface FixItem {
  id: string
  priority: 'High' | 'Medium' | 'Watch'
  area: string
  issue: string
  fix: string
  status: CheckStatus
}
