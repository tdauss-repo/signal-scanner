import { directoryCapabilityRegistry } from '../data/directoryCapabilityRegistry'
import type {
  BusinessProfile,
  DirectoryAuditRow,
  DirectoryCapabilityEntry,
  DirectorySuggestion,
} from '../types/audit'
import { googleSearch } from './links'

const profileText = (profile: BusinessProfile) =>
  [
    profile.primaryCategory,
    profile.secondaryCategories,
    profile.industryTags,
    profile.primaryServices,
    profile.keywords,
    profile.localMarket,
    profile.targetLocation,
    profile.serviceArea,
  ]
    .join(' ')
    .toLowerCase()

const includesAny = (value: string, terms: string[]) =>
  terms.some((term) => value.includes(term.toLowerCase()))

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export const businessDirectoryKey = (profile: BusinessProfile) =>
  slug(
    [
      profile.businessName,
      profile.website,
      profile.phone,
    ]
      .filter(Boolean)
      .join(' '),
  ) || 'current-business'

const market = (profile: BusinessProfile) =>
  profile.localMarket || profile.targetLocation || profile.serviceArea

const manualSearchUrl = (profile: BusinessProfile, directoryName: string) =>
  googleSearch(`${profile.businessName} ${market(profile)} ${directoryName}`)

const shouldSuggest = (
  profileSearchText: string,
  capability: DirectoryCapabilityEntry,
) => {
  if (capability.suggested === false || capability.coreListing) return false
  if (capability.defaultCheckMethod === 'Future API only') return false
  if (capability.alwaysSuggest) return true
  return includesAny(profileSearchText, capability.businessCategoryFit)
}

const capabilityToSuggestion = (
  profile: BusinessProfile,
  capability: DirectoryCapabilityEntry,
): DirectorySuggestion => ({
  id: `suggested-${slug(capability.name)}`,
  directoryName: capability.name,
  directoryType: capability.directoryType,
  authority: capability.defaultRelevance,
  checkMethod: capability.defaultCheckMethod,
  requiresOperatorUrl: capability.requiresOperatorUrl,
  allowPublicPageFetch: capability.allowPublicPageFetch,
  allowSearchResultScraping: capability.allowSearchResultScraping,
  ownerAdminAccessMethod: capability.ownerAdminAccessMethod,
  capabilityNotes: capability.notes,
  reason: capability.suggestedReason,
  manualSearchUrl: manualSearchUrl(profile, capability.name),
})

export const buildDirectorySuggestions = (
  profile: BusinessProfile,
): DirectorySuggestion[] => {
  const text = profileText(profile)
  const suggestions = new Map<string, DirectorySuggestion>()

  directoryCapabilityRegistry.forEach((capability) => {
    if (!shouldSuggest(text, capability)) return
    suggestions.set(capability.name, capabilityToSuggestion(profile, capability))
  })

  return Array.from(suggestions.values())
}

export const directorySuggestionToRow = (
  suggestionItem: DirectorySuggestion,
  businessId: string,
): DirectoryAuditRow => ({
  id: `${businessId}-${suggestionItem.id}`,
  businessId,
  directoryName: suggestionItem.directoryName,
  directoryType: suggestionItem.directoryType,
  checkMethod: suggestionItem.checkMethod,
  relevance: suggestionItem.authority,
  requiresOperatorUrl: suggestionItem.requiresOperatorUrl,
  allowPublicPageFetch: suggestionItem.allowPublicPageFetch,
  allowSearchResultScraping: suggestionItem.allowSearchResultScraping,
  ownerAdminAccessMethod: suggestionItem.ownerAdminAccessMethod,
  capabilityNotes: suggestionItem.capabilityNotes,
  listingUrl: '',
  manualSearchUrl: suggestionItem.manualSearchUrl,
  listingUrlStatus: suggestionItem.requiresOperatorUrl ? 'url_needed' : 'url_unavailable',
  listingResult: 'not_checked',
  lastCheckedAt: '',
  foundData: {},
  evidenceConfidence: 'manual_needs_confirmation',
  directoryStatus: 'not_checked',
  listingFound: 'unknown',
  nameMatches: 'unknown',
  addressMatches: 'unknown',
  phoneMatches: 'unknown',
  websiteMatches: 'unknown',
  categoryMatches: 'unknown',
  descriptionAccurate: 'unknown',
  reviewsVisible: 'unknown',
  photosPresent: 'unknown',
  duplicateFound: 'unknown',
  authority: suggestionItem.authority,
  publicEvidenceNotes: '',
  evidenceNotes: '',
  recommendedAction:
    'Verify the public listing, correct inaccurate details, and document whether owner/admin access needs to be requested during onboarding.',
  ownerAdminAccessStatus: 'Unverified - public listing only',
  ownerAccessStatus: 'Unverified - public listing only',
  packageFit: 'Starter Visibility Cleanup',
  priority: suggestionItem.authority === 'High' ? 'High' : 'Medium',
  source: 'suggested',
  active: true,
})

export const emptyDirectoryRow = (businessId = 'current-business'): DirectoryAuditRow => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `directory-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  businessId,
  directoryName: '',
  directoryType: 'Industry directory',
  checkMethod: 'Manual verification only',
  relevance: 'Medium',
  requiresOperatorUrl: false,
  allowPublicPageFetch: false,
  allowSearchResultScraping: false,
  ownerAdminAccessMethod: 'manual only',
  capabilityNotes:
    'Custom directory. Choose the most appropriate manual verification workflow.',
  listingUrl: '',
  manualSearchUrl: '',
  listingUrlStatus: 'url_unavailable',
  listingResult: 'not_checked',
  lastCheckedAt: '',
  foundData: {},
  evidenceConfidence: 'manual_needs_confirmation',
  directoryStatus: 'not_checked',
  listingFound: 'unknown',
  nameMatches: 'unknown',
  addressMatches: 'unknown',
  phoneMatches: 'unknown',
  websiteMatches: 'unknown',
  categoryMatches: 'unknown',
  descriptionAccurate: 'unknown',
  reviewsVisible: 'unknown',
  photosPresent: 'unknown',
  duplicateFound: 'unknown',
  authority: 'Medium',
  publicEvidenceNotes: '',
  evidenceNotes: '',
  recommendedAction: '',
  ownerAdminAccessStatus: 'Unverified - public listing only',
  ownerAccessStatus: 'Unverified - public listing only',
  packageFit: 'Starter Visibility Cleanup',
  priority: 'Medium',
  source: 'custom',
  active: true,
})
