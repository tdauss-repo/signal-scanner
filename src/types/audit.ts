export type TrafficStatus = 'Green' | 'Yellow' | 'Red' | 'Gray'

export type CheckStatus = 'pass' | 'partial' | 'fail' | 'unknown'

export type AccessLevel = 'public' | 'owner-authorized'

export type EvidenceConfidence =
  | 'owner_confirmed'
  | 'public_page_observed'
  | 'scanner_detected_public_page'
  | 'ai_answer_response'
  | 'manual_needs_confirmation'

export interface BusinessProfile {
  businessName: string
  website: string
  phone: string
  phoneNumbers: PhoneContactRecord[]
  contactStructureNote: string
  primaryCategory: string
  secondaryCategories: string
  industryTags: string
  localMarket: string
  existingDirectoryUrls: string
  serviceArea: string
  primaryServices: string
  targetLocation: string
  keywords: string
}

export interface PhoneContactRecord {
  id: string
  number: string
  label: string
  role: string
  publicUse: string
  notes: string
  isPrimaryForListings?: boolean
  isValidPublicContact: boolean
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
  evidenceConfidence: Record<string, EvidenceConfidence>
  profile: BusinessProfile
  lastUpdated: string
  selectedAIPlatform: AIAnswerPlatform
  aiAnswerTests: Record<AIAnswerPlatform, AIAnswerTestState>
  directories: DirectoryAuditState
  manualFixes: FixItem[]
}

export interface ScoreResult {
  score: number | null
  status: TrafficStatus
  earned: number
  possible: number
  checked: number
  unchecked?: number
  statusLabel?: string
}

export interface FixItem {
  id: string
  priority: 'High' | 'Medium' | 'Low'
  area: string
  issue: string
  fix: string
  status: CheckStatus
  evidenceNote?: string
  sources?: string
  packageFit?: string
  platform?: string
  effort?: string
  whyItMatters?: string
  evidenceConfidence?: EvidenceConfidence
}

export interface AIAnswerTestState {
  resultStatus: AIAnswerResultStatus
  evidenceConfidence: EvidenceConfidence
  rawResponse: string
  evidenceNotes: string
  sourcesMentioned: string
  gapTitle: string
  suggestedFix: string
  priority: 'High' | 'Medium' | 'Low'
  packageFit: AIAnswerPackageFit
}

export type AIAnswerResultStatus = CheckStatus | 'signin_required'

export type AIAnswerPlatform =
  | 'ChatGPT'
  | 'Gemini'
  | 'Perplexity'
  | 'Copilot'
  | 'Claude'
  | 'Grok'

export type AIAnswerPackageFit =
  | 'Starter Visibility Cleanup'
  | 'Monthly Visibility Monitoring'
  | 'Website SEO Implementation'

export type DirectoryType =
  | 'Industry directory'
  | 'Local directory'
  | 'Chamber / association'
  | 'Marketplace'
  | 'Review site'
  | 'Social/profile site'
  | 'Other'

export type DirectoryAuthority = 'High' | 'Medium' | 'Low'

export type DirectoryCheckMethod =
  | 'Manual verification only'
  | 'Public search assist only'
  | 'Public page check available'
  | 'Future API only'

export interface DirectoryCapabilityEntry {
  name: string
  aliases: string[]
  businessCategoryFit: string[]
  directoryType: DirectoryType
  defaultRelevance: DirectoryAuthority
  defaultCheckMethod: DirectoryCheckMethod
  requiresOperatorUrl: boolean
  allowPublicPageFetch: boolean
  allowSearchResultScraping: false
  ownerAdminAccessMethod: 'manual only'
  notes: string
  suggestedReason: string
  suggested?: boolean
  alwaysSuggest?: boolean
  coreListing?: boolean
}

export type OwnerAccessStatus =
  | 'Not checked'
  | 'Unverified - public listing only'
  | 'Confirmed with owner'
  | 'Owner access missing'
  | 'Access request needed'

export type DirectoryListingStatus =
  | 'not_checked'
  | 'found_accurate'
  | 'found_incomplete'
  | 'found_inaccurate'
  | 'not_found'
  | 'duplicate_outdated'
  | 'manual_review_needed'

export type DirectoryListingUrlStatus =
  | 'url_needed'
  | 'url_saved'
  | 'url_needs_review'
  | 'url_unavailable'

export type DirectoryFoundSignal = 'Yes' | 'No' | 'Partial'

export interface DirectoryFoundData {
  businessNameFound?: DirectoryFoundSignal
  phoneFound?: DirectoryFoundSignal
  websiteFound?: DirectoryFoundSignal
  addressOrServiceAreaFound?: DirectoryFoundSignal
  categoryServicesFound?: DirectoryFoundSignal
  descriptionFound?: DirectoryFoundSignal
}

export interface DirectoryAuditRow {
  id: string
  businessId: string
  directoryName: string
  directoryType: DirectoryType
  checkMethod: DirectoryCheckMethod
  relevance: DirectoryAuthority
  requiresOperatorUrl: boolean
  allowPublicPageFetch: boolean
  allowSearchResultScraping: false
  ownerAdminAccessMethod: 'manual only'
  capabilityNotes: string
  listingUrl: string
  manualSearchUrl: string
  listingUrlStatus: DirectoryListingUrlStatus
  listingResult: DirectoryListingStatus
  lastCheckedAt: string
  foundData?: DirectoryFoundData
  evidenceConfidence: EvidenceConfidence
  directoryStatus: DirectoryListingStatus
  listingFound: CheckStatus
  nameMatches: CheckStatus
  addressMatches: CheckStatus
  phoneMatches: CheckStatus
  websiteMatches: CheckStatus
  categoryMatches: CheckStatus
  descriptionAccurate: CheckStatus
  reviewsVisible: CheckStatus
  photosPresent: CheckStatus
  duplicateFound: CheckStatus
  authority: DirectoryAuthority
  publicEvidenceNotes: string
  evidenceNotes: string
  recommendedAction: string
  ownerAdminAccessStatus: OwnerAccessStatus
  ownerAccessStatus: OwnerAccessStatus
  packageFit: AIAnswerPackageFit
  priority: 'High' | 'Medium' | 'Low'
  source: 'suggested' | 'custom'
  active: boolean
}

export interface DirectorySuggestion {
  id: string
  directoryName: string
  directoryType: DirectoryType
  authority: DirectoryAuthority
  checkMethod: DirectoryCheckMethod
  requiresOperatorUrl: boolean
  allowPublicPageFetch: boolean
  allowSearchResultScraping: false
  ownerAdminAccessMethod: 'manual only'
  capabilityNotes: string
  manualSearchUrl: string
  reason: string
}

export interface DirectoryAuditState {
  activeRows: DirectoryAuditRow[]
  ignoredSuggestionIds: string[]
}
