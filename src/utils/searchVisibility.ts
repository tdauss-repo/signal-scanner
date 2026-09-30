import type {
  AuditItem,
  BusinessProfile,
  BusinessProfileState,
  BrandPresenceMismatch,
  BrandPresenceOperatorVerification,
  CheckStatus,
  SearchVisibilityFindingPriority,
  SearchDestination,
  SearchDestinationObservation,
  SearchVisibilityObservedResultType,
  SearchVisibilityQuery,
  SearchVisibilityResult,
  SearchVisibilityTestState,
} from '../types/audit'
import { bingSearch, duckDuckGoSearch, googleMapsSearch, googleSearch, yelpSearch } from './links'
import { normalizeEvidenceTimestamp } from './evidenceTime'

const splitList = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const reviewed = (state: BusinessProfileState, field: keyof BusinessProfile) =>
  ['operator_reviewed', 'owner_confirmed'].includes(state.values[field]?.status ?? '')
const unique = (queries: SearchVisibilityQuery[]) => {
  const seen = new Set<string>()
  return queries.filter((query) => {
    const key = normalized(query.query)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const defaultSearchVisibilityTest = (): SearchVisibilityTestState => ({
  visibilityResult: 'not_checked', whereFound: 'Not observed', observedResultTypes: [],
  observedAt: '', searchDestination: '', provenance: 'operator_observation',
  evidenceNotes: '', competitorsObserved: '',
  recommendedAction: 'Strengthen matching service/location content, listing categories, local citations, reviews, and internal links so the business has clearer public signals for this search.',
  evidenceConfidence: 'manual_needs_confirmation', packageFit: 'Starter Visibility Cleanup',
})

export const legacyWhereFoundToTypes = (whereFound: string | undefined): SearchVisibilityObservedResultType[] => {
  if (whereFound === 'Website') return ['official_website']
  if (whereFound === 'Google Business Profile / map result') return ['local_business_profile']
  if (whereFound === 'Directory') return ['directory_listing']
  if (whereFound === 'Social profile') return ['social_profile']
  if (whereFound === 'Not observed') return ['not_found']
  return whereFound ? ['third_party_mention'] : []
}

export const searchDestinations: SearchDestination[] = [
  'Google Search', 'Google Maps', 'Bing Search', 'Apple Maps', 'DuckDuckGo', 'Yelp', 'Facebook', 'Instagram',
]

export const primarySearchDestinations: SearchDestination[] = [
  'Google Search', 'Google Maps', 'Bing Search',
]

export const supportingSearchDestinations: SearchDestination[] = [
  'Apple Maps', 'DuckDuckGo', 'Yelp', 'Facebook', 'Instagram',
]

const legacyResultTypes: Record<string, SearchVisibilityObservedResultType> = {
  'Official website': 'official_website',
  'Google Business Profile / map result': 'local_business_profile',
  'Directory or listing': 'directory_listing',
  'Social profile': 'social_profile',
  'Third-party mention': 'third_party_mention',
  'Not found': 'not_found',
}

export const normalizeSearchResultTypes = (
  types: Array<SearchVisibilityObservedResultType | string>,
): SearchVisibilityObservedResultType[] => {
  const normalized = types.map((type) => legacyResultTypes[type] ?? type as SearchVisibilityObservedResultType)
  return Array.from(new Set(normalized))
}

const positiveResultTypes: SearchVisibilityObservedResultType[] = [
  'official_website', 'local_business_profile', 'directory_listing', 'social_profile', 'third_party_mention',
  'business_name_correct', 'address_correct', 'phone_correct', 'website_correct', 'category_correct',
]

const positiveOverallResults: SearchVisibilityResult[] = [
  'found_match', 'found_prominently', 'found_weak', 'found_directory_only', 'found_conflicting_information',
]

export const resultTypesForDestination = (destination: SearchDestination): SearchVisibilityObservedResultType[] => {
  const mapTypes: SearchVisibilityObservedResultType[] = ['local_business_profile', 'business_name_correct', 'address_correct', 'phone_correct', 'website_correct', 'category_correct', 'not_found']
  if (destination === 'Google Maps' || destination === 'Apple Maps') return mapTypes
  if (destination === 'Bing Search') return ['local_business_profile', 'official_website', 'directory_listing', 'social_profile', 'third_party_mention', ...mapTypes.slice(1)]
  if (destination === 'Yelp') return ['directory_listing', 'official_website', 'third_party_mention', 'not_found']
  if (destination === 'Facebook' || destination === 'Instagram') return ['social_profile', 'official_website', 'third_party_mention', 'not_found']
  return ['official_website', 'directory_listing', 'social_profile', 'third_party_mention', 'not_found']
}

export const searchResultTypeLabel = (destination: SearchDestination, type: SearchVisibilityObservedResultType) => {
  if (type === 'local_business_profile') {
    if (destination === 'Google Maps') return 'Google Business Profile / map result'
    if (destination === 'Apple Maps') return 'Apple Business Connect / Apple Maps listing'
    if (destination === 'Bing Search') return 'Bing Places / map result'
    return 'Local business profile / map result'
  }
  return ({ official_website: 'Official website', directory_listing: 'Directory or listing', social_profile: 'Social profile', third_party_mention: 'Third-party mention', business_name_correct: 'Correct business name', address_correct: 'Correct address/location', phone_correct: 'Correct phone', website_correct: 'Correct website', category_correct: 'Correct category', not_found: 'Not found' })[type]
}

const publicHttpUrl = (value: string | undefined) => {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

const verificationOutcomes = new Set(['found_correct', 'found_correction_needed', 'not_found', 'unable_to_determine'])
const verificationMismatches = new Set<BrandPresenceMismatch>(['business_name', 'address', 'phone', 'website', 'category', 'duplicate_conflicting_listing', 'other'])
const normalizeOperatorVerification = (
  destination: SearchDestination,
  value: SearchDestinationObservation['operatorVerification'],
): BrandPresenceOperatorVerification | undefined => {
  if (!value || value.destination !== destination || !verificationOutcomes.has(value.outcome) || !value.evidenceKey) return undefined
  const operatorObservedUrl = publicHttpUrl(value.operatorObservedUrl)
  const classifiedCanonicalProfileUrl = canonicalProfileUrlForDestination(destination, value.classifiedCanonicalProfileUrl)
    || canonicalProfileUrlForDestination(destination, operatorObservedUrl)
  return {
    version: 1,
    destination,
    evidenceKey: value.evidenceKey,
    outcome: value.outcome,
    reviewedAt: normalizeEvidenceTimestamp(value.reviewedAt),
    provenance: 'operator_verified',
    ...(operatorObservedUrl ? { operatorObservedUrl } : {}),
    ...(classifiedCanonicalProfileUrl ? { classifiedCanonicalProfileUrl } : {}),
    mismatches: Array.from(new Set((Array.isArray(value.mismatches) ? value.mismatches : []).filter((item): item is BrandPresenceMismatch => verificationMismatches.has(item)))),
    note: typeof value.note === 'string' ? value.note : '',
  }
}

export const canonicalProfileUrlForDestination = (destination: SearchDestination, value: string | undefined) => {
  const safe = publicHttpUrl(value)
  if (!safe || destination === 'DuckDuckGo') return undefined
  const url = new URL(safe)
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (destination === 'Google Search' || destination === 'Google Maps') return host === 'google.com' && /\/maps\/place(?:[/?#]|$)/i.test(url.pathname) ? safe : undefined
  if (destination === 'Bing Search') return host === 'bing.com' && /\/maps(?:[/?#]|$)/i.test(url.pathname) ? safe : undefined
  if (destination === 'Apple Maps') return host === 'maps.apple.com' && /\/place(?:[/?#]|$)/i.test(url.pathname) ? safe : undefined
  if (destination === 'Yelp') return host === 'yelp.com' && /\/biz(?:[/?#]|$)/i.test(url.pathname) ? safe : undefined
  if (destination === 'Facebook') return (host === 'facebook.com' || host.endsWith('.facebook.com')) && !/^\/(?:search|login|help|share)(?:[/?#]|$)/i.test(url.pathname) && url.pathname !== '/' ? safe : undefined
  return (host === 'instagram.com' || host.endsWith('.instagram.com')) && !/^\/(?:accounts|explore|reels?)(?:[/?#]|$)/i.test(url.pathname) && url.pathname !== '/' ? safe : undefined
}

export const brandVerificationQuery = (profile: BusinessProfile) => {
  const location = [profile.city, profile.state].map((value) => value.trim()).filter(Boolean).join(' ')
    || profile.targetLocation.trim()
    || profile.localMarket.trim()
  return [profile.businessName.trim(), location].filter(Boolean).join(' ')
}

export const yelpBrandLocation = (profile: BusinessProfile) => {
  const locality = [profile.city.trim(), profile.state.trim()].filter(Boolean).join(', ')
  return [locality, profile.zip.trim()].filter(Boolean).join(' ')
    || profile.targetLocation.trim()
    || profile.localMarket.trim()
}

export const yelpBrandSearchUrl = (profile: BusinessProfile) =>
  yelpSearch(profile.businessName, yelpBrandLocation(profile))

export const verificationUrlFor = (
  destination: SearchDestination,
  query: string,
  profile?: BusinessProfile,
  brandPresence = false,
) => destination === 'Yelp' && brandPresence && profile
  ? yelpBrandSearchUrl(profile)
  : publicPresenceUrl(destination, brandPresence && profile ? brandVerificationQuery(profile) || query : query)

interface ObservationNormalizationContext {
  profile?: BusinessProfile
  brandPresence?: boolean
}

/** Single result-state invariant for UI edits, saved scans, and legacy imports. */
export const normalizeSearchDestinationObservation = (
  observation: SearchDestinationObservation,
  context: ObservationNormalizationContext = {},
): SearchDestinationObservation => {
  const allowed = new Set(resultTypesForDestination(observation.destination))
  let observedResultTypes = normalizeSearchResultTypes(observation.observedResultTypes).filter((type) => allowed.has(type))
  const hasPositive = observedResultTypes.some((type) => positiveResultTypes.includes(type))
  if (observation.overallResult === 'not_found') observedResultTypes = ['not_found']
  else if (positiveOverallResults.includes(observation.overallResult)) observedResultTypes = observedResultTypes.filter((type) => type !== 'not_found')
  else if (observedResultTypes.includes('not_found') && !hasPositive) observedResultTypes = ['not_found']
  else observedResultTypes = observedResultTypes.filter((type) => type !== 'not_found')

  const resultingPositive = observedResultTypes.some((type) => positiveResultTypes.includes(type))
  const overallResult = observedResultTypes.includes('not_found') && !resultingPositive
    ? 'not_found'
    : observation.overallResult
  const matches = observation.automation?.assessment?.matches || []
  const selected = observation.automation?.assessment?.selected
  const observedResultUrl = publicHttpUrl(observation.observedResultUrl)
    || publicHttpUrl(selected?.candidate.resultUrl)
    || matches.map((match) => publicHttpUrl(match.candidate.resultUrl)).find(Boolean)
  const canonicalProfileUrl = canonicalProfileUrlForDestination(observation.destination, observation.canonicalProfileUrl)
    || canonicalProfileUrlForDestination(observation.destination, selected?.candidate.fields.publicProfileUrl)
    || matches.map((match) => canonicalProfileUrlForDestination(observation.destination, match.candidate.fields.publicProfileUrl)).find(Boolean)
  const verificationUrl = verificationUrlFor(
    observation.destination,
    observation.query,
    context.profile,
    context.brandPresence,
  )
  return {
    ...observation,
    overallResult,
    observedResultTypes,
    observedAt: normalizeEvidenceTimestamp(observation.observedAt),
    verificationUrl,
    ...(observedResultUrl ? { observedResultUrl } : { observedResultUrl: undefined }),
    ...(canonicalProfileUrl ? { canonicalProfileUrl } : { canonicalProfileUrl: undefined }),
    operatorVerification: normalizeOperatorVerification(observation.destination, observation.operatorVerification),
  }
}

export const defaultSearchDestinationObservation = (
  destination: SearchDestination,
  query: string,
): SearchDestinationObservation => ({
  destination, query, overallResult: 'not_checked', observedResultTypes: [],
  verificationUrl: verificationUrlFor(destination, query),
  observedAt: '', confidence: 'manual_needs_confirmation', evidenceNotes: '',
  competitorsObserved: '', recommendedAction: '', provenance: 'operator_observation',
  evidenceKind: 'unable_to_verify', reviewed: false,
})

export const migrateLegacySearchDestinationObservations = (
  tests: Record<string, SearchVisibilityTestState> | undefined,
): Record<string, Partial<Record<SearchDestination, SearchDestinationObservation>>> =>
  Object.fromEntries(
    Object.entries(tests ?? {}).map(([queryId, test]) => {
      const destination = (test.searchDestination || 'Google Search') as SearchDestination
      return [queryId, {
        [destination]: {
          ...defaultSearchDestinationObservation(destination, queryId),
          destination, overallResult: test.visibilityResult,
          observedResultTypes: normalizeSearchResultTypes(test.observedResultTypes?.length ? test.observedResultTypes : legacyWhereFoundToTypes(test.whereFound)),
          observedAt: test.observedAt, confidence: test.evidenceConfidence,
          evidenceNotes: test.evidenceNotes, competitorsObserved: test.competitorsObserved,
          recommendedAction: test.recommendedAction, provenance: 'legacy_imported', reviewed: false,
        },
      }]
    }),
  )


export const buildSearchVisibilityQueries = (
  profile: BusinessProfile,
  profileState?: BusinessProfileState,
  options?: { includeLocationDiagnostic?: boolean },
): SearchVisibilityQuery[] => {
  const brand = profile.businessName.trim()
  const market = profile.targetLocation || profile.localMarket || [profile.city, profile.state].filter(Boolean).join(' ')
  const category = !profileState || reviewed(profileState, 'primaryCategory') ? profile.primaryCategory.trim() : ''
  const services = !profileState || reviewed(profileState, 'primaryServices') ? splitList(profile.primaryServices) : []
  const secondary = !profileState || reviewed(profileState, 'industryTags') ? splitList(profile.industryTags) : []
  const queries: SearchVisibilityQuery[] = brand ? [{ id: 'search-brand-canonical', query: brand, role: 'Brand Presence', intentType: 'Brand search', priority: 'High' }] : []
  const diagnosticMarket = profile.zip.trim() && !normalized(market).split(' ').includes(normalized(profile.zip)) ? `${market} ${profile.zip.trim()}` : market
  if (brand && market && options?.includeLocationDiagnostic) queries.push({ id: 'search-brand-market', query: `${brand} ${diagnosticMarket}`, role: 'Brand Presence', intentType: 'Brand search', priority: 'Medium', isDiagnostic: true })
  if (category && market) queries.push({ id: 'search-core-category-market', query: `${category} ${market}`, role: 'Core Local Discovery', intentType: 'Category discovery', priority: 'High' })
  if (services[0] && market) queries.push({ id: 'search-core-service-market', query: `${services[0]} ${market}`, role: 'Core Local Discovery', intentType: 'Core service discovery', priority: 'High' })
  if (services[1] && market) queries.push({ id: 'search-supporting-service-market', query: `${services[1]} ${market}`, role: 'Supporting Discovery', intentType: 'Service-area discovery', priority: 'Medium' })
  if (secondary[0] && market) queries.push({ id: 'search-supporting-specialty-market', query: `${secondary[0]} ${market}`, role: 'Supporting Discovery', intentType: 'Service-area discovery', priority: 'Low' })
  return unique(queries).filter((query) => !(query.role === 'Brand Presence' && query.query !== brand && normalized(query.query).includes(normalized(brand)) && normalized(query.query) === `${normalized(brand)} ${normalized(category)}`))
}

export const searchVisibilityQueryToAuditItem = (query: SearchVisibilityQuery): AuditItem => ({
  id: query.id, area: 'keywords', label: query.query,
  description: 'Guided manual search visibility test. Record observed result types without claiming exact rankings.',
  weight: query.priority === 'High' ? 10 : query.priority === 'Medium' ? 7 : 4, access: 'public',
  evidenceLinks: [{ label: 'Google Search', url: googleSearch(query.query) }, { label: 'Google Maps', url: googleMapsSearch(query.query) }, { label: 'Bing Search', url: bingSearch(query.query) }],
  fix: 'Improve public search visibility signals through relevant service/location content, listing consistency, reviews, citations, internal links, and supporting pages.',
})

export const searchVisibilityResultToCheckStatus = (result: SearchVisibilityResult): CheckStatus => {
  if (result === 'found_match' || result === 'found_prominently') return 'pass'
  if (result === 'found_weak' || result === 'found_directory_only' || result === 'found_conflicting_information') return 'partial'
  if (result === 'not_found') return 'fail'
  return 'unknown'
}
export const searchVisibilityResultLabel = (result: SearchVisibilityResult) => ({
  found_match: 'Matching business observed', not_checked: 'Not checked', found_prominently: 'Found prominently', found_weak: 'Found, but weakly', found_directory_only: 'Found through a directory/listing', found_conflicting_information: 'Found with conflicting information', not_found: 'Not found', manual_review_needed: 'Manual review needed', unable_to_verify: 'Unable to verify',
}[result])
export const findingPriorityForSearchObservation = (query: SearchVisibilityQuery, result: SearchVisibilityResult): SearchVisibilityFindingPriority => {
  if (result === 'found_match' || result === 'found_prominently') return 'No action needed'
  if (result === 'not_checked' || result === 'manual_review_needed' || result === 'unable_to_verify') return 'Low'
  if (result === 'not_found') return query.priority === 'High' ? 'High' : 'Medium'
  return query.priority === 'High' ? 'High' : query.priority === 'Medium' ? 'Medium' : 'Low'
}
export const actionPlanPriorityForSearchObservation = (query: SearchVisibilityQuery, result: SearchVisibilityResult) => {
  const priority = findingPriorityForSearchObservation(query, result)
  return priority === 'No action needed' ? 'Low' : priority
}
export const recommendedActionForSearchObservation = (query: SearchVisibilityQuery, result: SearchVisibilityResult) => {
  if (result === 'found_match' || result === 'found_prominently') return 'Maintain the business’s supporting service, location, listing, and review signals.'
  if (result === 'found_conflicting_information') return 'Resolve the conflicting business information across the website, listings, and supporting public sources.'
  if (result === 'not_found') return `Improve public signals for this ${query.role.toLowerCase()} query through website content, category consistency, citations, reviews, and local proof.`
  return 'Document the observed result types and strengthen matching business, service, and location signals where needed.'
}
export { duckDuckGoSearch }

/** Shared destination links for manual and automated acquisition. */
export const publicPresenceUrl = (destination: SearchDestination, query: string) => destination === 'Google Search' ? googleSearch(query) : destination === 'Google Maps' ? googleMapsSearch(query) : destination === 'Bing Search' ? bingSearch(query) : destination === 'Apple Maps' ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : destination === 'Yelp' ? yelpSearch(query) : destination === 'Facebook' ? `https://www.facebook.com/search/top?q=${encodeURIComponent(query)}` : destination === 'Instagram' ? `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}` : duckDuckGoSearch(query)
