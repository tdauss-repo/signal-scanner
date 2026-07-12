export type TrafficStatus = 'Green' | 'Yellow' | 'Red' | 'Gray'

export type CheckStatus = 'pass' | 'partial' | 'fail' | 'unknown'

export type AccessLevel = 'public' | 'owner-authorized'

export type EvidenceConfidence =
  | 'owner_confirmed'
  | 'public_page_observed'
  | 'scanner_detected_public_page'
  | 'operator_provided_page_text'
  | 'operator_observation'
  | 'public_search_observed'
  | 'ai_answer_response'
  | 'derived_readiness_signal'
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
  reportSummary: string
  selectedAIPlatform: AIAnswerPlatform
  aiAnswerTests: Record<AIAnswerPlatform, AIAnswerTestState>
  searchVisibilityTests: Record<string, SearchVisibilityTestState>
  voicePromptTests: Record<string, VoicePromptTestState>
  directories: DirectoryAuditState
  manualFixes: FixItem[]
}

export interface SavedScanRecord {
  id: string
  businessName: string
  website: string
  localMarket: string
  createdAt: string
  updatedAt: string
  scanDate: string
  notes: string
  payload: AuditState
}

export interface SavedScanFile {
  app: 'Found Local Business Scanner Tool'
  fileType: 'found-local-scan'
  version: 1
  exportedAt: string
  scan: SavedScanRecord
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

export type SearchVisibilityIntentType =
  | 'Brand search'
  | 'Core service discovery'
  | 'Service-area discovery'
  | 'Category discovery'
  | 'Competitor/comparison discovery'

export type SearchVisibilityResult =
  | 'not_checked'
  | 'found_prominently'
  | 'found_weak'
  | 'found_directory_only'
  | 'not_found'
  | 'manual_review_needed'

export type SearchVisibilityWhereFound =
  | 'Website'
  | 'Google Business Profile / map result'
  | 'Directory'
  | 'Social profile'
  | 'Competitor results only'
  | 'Not observed'

export interface SearchVisibilityQuery {
  id: string
  query: string
  intentType: SearchVisibilityIntentType
  priority: 'High' | 'Medium' | 'Low'
}

export type SearchVisibilityFindingPriority =
  | 'High'
  | 'Medium'
  | 'Low'
  | 'No action needed'

export interface SearchVisibilityTestState {
  visibilityResult: SearchVisibilityResult
  whereFound: SearchVisibilityWhereFound
  evidenceNotes: string
  competitorsObserved: string
  recommendedAction: string
  evidenceConfidence: EvidenceConfidence
  packageFit: AIAnswerPackageFit
}

export type VoicePromptTestStatus =
  | 'not_tested'
  | 'business_found_accurate'
  | 'business_found_incomplete'
  | 'wrong_outdated'
  | 'not_found'

export type VoicePlatformTested =
  | 'Google Assistant / Android'
  | 'Siri / Apple'
  | 'Alexa'
  | 'Other/manual'

export type VoiceTestDeviceContext =
  | "Operator's normal device/account"
  | 'Neutral/private device'
  | 'Different-account device'
  | 'Business owner/customer device'
  | 'Other/manual'

export type VoicePersonalizationRisk = 'Low' | 'Medium' | 'High'

export interface VoicePromptTestState {
  testStatus: VoicePromptTestStatus
  platformTested: VoicePlatformTested
  deviceContext: VoiceTestDeviceContext
  personalizationRisk: VoicePersonalizationRisk
  evidenceNotes: string
  evidenceConfidence: EvidenceConfidence
  packageFit: AIAnswerPackageFit
  recommendedAction: string
}

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

export type DirectoryUrlDiscoveryMethod =
  | 'Manual search required'
  | 'Candidate discovery available'
  | 'Known URL pattern'
  | 'Future API'

export type DirectoryPublicPageCheckEligibility =
  | 'Allowed after URL confirmed'
  | 'Not recommended / manual only'
  | 'Future API only'
  | 'Blocked/protected'

export interface DirectoryCapabilityEntry {
  name: string
  aliases: string[]
  businessCategoryFit: string[]
  directoryType: DirectoryType
  defaultRelevance: DirectoryAuthority
  defaultCheckMethod: DirectoryCheckMethod
  urlDiscoveryMethod?: DirectoryUrlDiscoveryMethod
  publicPageCheckEligibility?: DirectoryPublicPageCheckEligibility
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
  reviewsRatingsVisible?: DirectoryFoundSignal
  photosPortfolioVisible?: DirectoryFoundSignal
}

export interface DirectoryCandidateUrl {
  id: string
  title: string
  url: string
  displayDomain: string
  snippet?: string
  source: string
  confidence: 'High' | 'Medium' | 'Low'
  reason: string
  discoveredAt: string
}

export interface DirectoryAuditRow {
  id: string
  businessId: string
  directoryName: string
  directoryType: DirectoryType
  checkMethod: DirectoryCheckMethod
  urlDiscoveryMethod: DirectoryUrlDiscoveryMethod
  publicPageCheckEligibility: DirectoryPublicPageCheckEligibility
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
  candidateUrls: DirectoryCandidateUrl[]
  savedCandidateUrl?: DirectoryCandidateUrl
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
  pastedVisiblePageText: string
  observedLinksText: string
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
  urlDiscoveryMethod: DirectoryUrlDiscoveryMethod
  publicPageCheckEligibility: DirectoryPublicPageCheckEligibility
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
