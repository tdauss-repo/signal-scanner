import type { MachineReadabilityReport } from './machineReadability.js'
import type { PresenceAutomation, VisibilityRun } from './visibilityScan.js'
import type {
  BrowserWebsiteObservation,
  ManualWebsiteObservation,
  WebsiteAuditResponse,
  WebsiteAuditResult,
} from './websiteAudit.js'

import type { FindingIntelligence } from './findingIntelligence.js'
import type { OperatorAssistedBrowserEvidence } from './operatorAssistedSearch.js'

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
  streetAddress: string
  city: string
  state: string
  zip: string
  phone: string
  knownListingUrl: string
  operatorNote: string
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

export type BusinessProfileValueStatus =
  | 'observed'
  | 'inferred'
  | 'operator_reviewed'
  | 'owner_confirmed'
  | 'legacy_imported'

export type BusinessProfileValueConfidence = 'low' | 'medium' | 'high'

/**
 * A reviewed profile fact is intentionally kept separate from the flat
 * BusinessProfile inputs used by the existing audit and reporting workflow.
 * The flat profile remains the compatibility projection for those consumers.
 */
export interface BusinessProfileValue<T = unknown> {
  value: T
  source: string
  observedAt?: string
  recordedAt?: string
  confidence: BusinessProfileValueConfidence
  status: BusinessProfileValueStatus
}

export type BusinessProfileField = keyof BusinessProfile

export interface BusinessProfileState {
  schemaVersion: 1
  values: Partial<Record<BusinessProfileField, BusinessProfileValue>>
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
  machineReadability?: MachineReadabilityReport
  visibilityRuns?: VisibilityRun[]
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
  evidenceConfidence: Record<string, EvidenceConfidence>
  profile: BusinessProfile
  businessProfile: BusinessProfileState
  lastUpdated: string
  reportSummary: string
  websiteAudit: WebsiteAuditWorkspaceState
  selectedAIPlatform: AIAnswerPlatform
  aiAnswerTests: Record<AIAnswerPlatform, AIAnswerTestState>
  searchVisibilityTests: Record<string, SearchVisibilityTestState>
  searchDestinationObservations: Record<
    string,
    Partial<Record<SearchDestination, SearchDestinationObservation>>
  >
  voicePromptTests: Record<string, VoicePromptTestState>
  voiceAssistantObservations: VoiceAssistantObservation[]
  directories: DirectoryAuditState
  manualFixes: FixItem[]
  salesReadiness: SalesReadinessState
  /** Explicit customer-presentation approvals, bound to the reviewed workspace evidence. */
  customerFindingReviews?: Record<string, string>
  /** Explicit operator decisions not to promote a finding, bound to the same evidence as approvals. */
  customerFindingDismissals?: Record<string, string>
}

export interface WebsiteAuditWorkspaceState {
  lastSuccessful: WebsiteAuditResult | null
  latestAttempt: WebsiteAuditResponse | null
  manualObservation: ManualWebsiteObservation
  browserObservation: BrowserWebsiteObservation | null
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
  intelligence?: FindingIntelligence
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
  evidenceSummary?: string
  evidenceSources?: string[]
  salesConfidence?: 'confirmed' | 'supported' | 'uncertain' | 'unable_to_verify'
  impact?: 'high' | 'medium' | 'low'
  salesEffort?: 'small' | 'medium' | 'large'
  salesPackageFit?: 'starter' | 'later' | 'owner_action' | 'excluded'
  dependencies?: string[]
  verificationMethod?: string
  sourceArea?: 'website' | 'public_presence' | 'profile_management' | 'ai_geo_readiness' | 'entity_clarity' | 'customer_question'
  reviewed?: boolean
}

export type EntityClarityResult = 'Clear' | 'Partial' | 'Conflicting' | 'Not found' | 'Owner confirmation needed' | 'Unable to verify'
export interface EntityClarityFinding {
  id: string
  dimension: 'Business name' | 'Primary offering' | 'Location/service area' | 'Primary contact/enrollment action'
  observedValue: string
  expectedValue: string
  sourceEvidence: string
  sourceUrl: string
  recordedAt: string
  confidence: EvidenceConfidence
  result: EntityClarityResult
  operatorNotes: string
  reviewed: boolean
}

export type CustomerQuestionStatus = 'Answered' | 'Partially answered' | 'Not found' | 'Owner confirmation needed' | 'Unable to verify'
export interface CustomerQuestion {
  id: string
  question: string
  category: string
  status: CustomerQuestionStatus
  supportingEvidence: string
  sourceUrl: string
  recordedAt: string
  confidence: EvidenceConfidence
  operatorNotes: string
  reviewed: boolean
  packageFit: 'starter' | 'later' | 'owner_action' | 'excluded'
  recommendedAction: string
  verificationMethod: string
}

export type CorroborationResult = 'Match' | 'Partial match' | 'Conflict' | 'Not found' | 'Acquisition unavailable' | 'Owner confirmation needed' | 'Unable to verify'
export interface CorroborationRecord {
  id: string
  destination: string
  field: 'Business name' | 'Primary category' | 'Phone' | 'Website URL' | 'Address/service area' | 'Hours'
  expectedValue: string
  observedValue: string
  sourceUrl: string
  sourceEvidence: string
  recordedAt: string
  confidence: EvidenceConfidence
  result: CorroborationResult
  provenance: 'operator_observation' | 'legacy_imported' | 'automated_acquisition'
  notes: string
  reviewed: boolean
}

export interface SalesReadinessState {
  consistencyObservations?: CorroborationRecord[]
  entityClarity: EntityClarityFinding[]
  customerQuestions: CustomerQuestion[]
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
  observations: AIAnswerObservation[]
}

export type AIEvidenceMode = 'consumer_observation' | 'controlled_scan'
export type AIObservationMentioned = 'yes' | 'no' | 'unclear'
export type AIObservationPosition = 'early' | 'middle' | 'late' | 'not_applicable'
export type AIRecommendationStrength =
  | 'directly_recommended'
  | 'included_among_options'
  | 'merely_referenced'
  | 'not_mentioned'
export type AIFactualAccuracy =
  | 'accurate'
  | 'partially_accurate'
  | 'inaccurate'
  | 'unable_to_verify'

export interface AIAnswerObservation {
  id: string
  evidenceMode: AIEvidenceMode
  promptType: 'non_branded_discovery' | 'branded_factual_accuracy' | 'comparative_consideration'
  promptUsed: string
  platform: AIAnswerPlatform
  model: string
  observedAt: string
  loginState: 'logged_in' | 'logged_out' | 'unknown'
  locationContext: string
  personalizationContext: string
  mentioned: AIObservationMentioned
  mentionPosition: AIObservationPosition
  recommendationStrength: AIRecommendationStrength
  officialWebsiteCited: AIObservationMentioned
  factualAccuracy: AIFactualAccuracy
  unsupportedClaims: string
  competitorsMentioned: string
  rawResponse: string
  sourceLinks: string
  evidenceNotes: string
  recommendedAction: string
  operatorReviewed: boolean
  provenance: 'operator_observation' | 'legacy_imported'
}

export type EvidenceKind =
  | 'owner_confirmed_truth'
  | 'external_observation'
  | 'derived_interpretation'
  | 'acquisition_failure'
  | 'absence'
  | 'unable_to_verify'

export interface DestinationEvidence {
  destination: string
  observedAt: string
  confidence: EvidenceConfidence
  provenance: 'operator_observation' | 'operator_assisted_browser' | 'legacy_imported' | 'automated_acquisition'
  evidenceKind: EvidenceKind
  reviewed: boolean
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

export type SearchVisibilityRole =
  | 'Brand Presence'
  | 'Core Local Discovery'
  | 'Supporting Discovery'

export type SearchVisibilityResult =
  | 'not_checked'
  | 'found_match'
  | 'found_prominently'
  | 'found_weak'
  | 'found_directory_only'
  | 'found_conflicting_information'
  | 'not_found'
  | 'manual_review_needed'
  | 'unable_to_verify'

export type SearchVisibilityWhereFound =
  | 'Website'
  | 'Google Business Profile / map result'
  | 'Directory'
  | 'Social profile'
  | 'Competitor results only'
  | 'Not observed'

export type SearchVisibilityObservedResultType =
  | 'official_website'
  | 'local_business_profile'
  | 'directory_listing'
  | 'social_profile'
  | 'third_party_mention'
  | 'business_name_correct'
  | 'address_correct'
  | 'phone_correct'
  | 'website_correct'
  | 'category_correct'
  | 'not_found'

export type SearchDestination =
  | 'Google Search'
  | 'Google Maps'
  | 'Bing Search'
  | 'Apple Maps'
  | 'DuckDuckGo'
  | 'Yelp'
  | 'Facebook'
  | 'Instagram'

export interface SearchDestinationObservation extends DestinationEvidence {
  automation?: PresenceAutomation
  operatorAssisted?: OperatorAssistedBrowserEvidence
  destination: SearchDestination
  query: string
  overallResult: SearchVisibilityResult
  observedResultTypes: SearchVisibilityObservedResultType[]
  evidenceNotes: string
  competitorsObserved: string
  recommendedAction: string
}

export interface SearchVisibilityQuery {
  id: string
  query: string
  intentType: SearchVisibilityIntentType
  priority: 'High' | 'Medium' | 'Low'
  role: SearchVisibilityRole
  isDiagnostic?: boolean
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
  observedResultTypes: SearchVisibilityObservedResultType[]
  observedAt: string
  searchDestination: string
  provenance: 'operator_observation' | 'legacy_imported'
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

export type VoiceAssistantObservationResult =
  | 'directly_identified'
  | 'included_among_options'
  | 'correct_business_action_available'
  | 'found_with_inaccurate_facts'
  | 'wrong_business_selected'
  | 'not_found'
  | 'unable_to_verify'

export interface VoiceAssistantObservation {
  id: string
  assistant: VoicePlatformTested
  deviceOrInterface: string
  exactUtterance: string
  locationContext: string
  loginState: 'logged_in' | 'logged_out' | 'unknown'
  observedAt: string
  result: VoiceAssistantObservationResult
  responseTranscript: string
  visibleSource: string
  evidenceNotes: string
  evidenceConfidence: EvidenceConfidence
  provenance: 'operator_observation' | 'legacy_imported'
  operatorReviewed: boolean
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
