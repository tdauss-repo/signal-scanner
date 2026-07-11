import type {
  AuditItem,
  BusinessProfile,
  CheckStatus,
  SearchVisibilityFindingPriority,
  SearchVisibilityQuery,
  SearchVisibilityResult,
  SearchVisibilityTestState,
} from '../types/audit'
import { bingSearch, duckDuckGoSearch, googleSearch } from './links'

const splitList = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

const uniqueByQuery = (queries: SearchVisibilityQuery[]) => {
  const seen = new Set<string>()
  return queries.filter((query) => {
    const key = query.query.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const defaultSearchVisibilityTest = (): SearchVisibilityTestState => ({
  visibilityResult: 'not_checked',
  whereFound: 'Not observed',
  evidenceNotes: '',
  competitorsObserved: '',
  recommendedAction:
    'Strengthen matching service/location content, listing categories, local citations, reviews, and internal links so the business has clearer public signals for this search.',
  evidenceConfidence: 'manual_needs_confirmation',
  packageFit: 'Starter Visibility Cleanup',
})

export const buildSearchVisibilityQueries = (
  profile: BusinessProfile,
): SearchVisibilityQuery[] => {
  const services = [
    ...splitList(profile.primaryServices),
    ...splitList(profile.industryTags),
    ...splitList(profile.keywords),
  ].filter(Boolean)
  const serviceAreas = [
    profile.localMarket,
    profile.targetLocation,
    ...splitList(profile.serviceArea),
  ].filter(Boolean)
  const primaryService = services[0] || profile.primaryCategory || 'local service'
  const city = profile.localMarket || profile.targetLocation || serviceAreas[0] || ''
  const cityWithState = /ohio|michigan|indiana|sylvania|toledo/i.test(city)
    ? city
    : `${city} Ohio`.trim()
  const primaryArea = serviceAreas[0] || cityWithState
  const secondaryArea = serviceAreas.find((area) => area !== primaryArea) || cityWithState
  const category = profile.primaryCategory || primaryService
  const brand = profile.businessName

  const querySet: SearchVisibilityQuery[] = [
    {
      id: 'search-core-service-city',
      query: `${primaryService} near ${cityWithState}`.trim(),
      intentType: 'Core service discovery',
      priority: 'High',
    },
    {
      id: 'search-service-nearby-city',
      query: `${services[1] || primaryService} ${secondaryArea}`.trim(),
      intentType: 'Service-area discovery',
      priority: 'High',
    },
    {
      id: 'search-category-city',
      query: `${category} ${cityWithState}`.trim(),
      intentType: 'Category discovery',
      priority: 'Medium',
    },
    {
      id: 'search-service-area',
      query: `${services[2] || primaryService} ${primaryArea}`.trim(),
      intentType: 'Service-area discovery',
      priority: 'Medium',
    },
    {
      id: 'search-brand-city',
      query: `${brand} ${city}`.trim(),
      intentType: 'Brand search',
      priority: 'High',
    },
    {
      id: 'search-brand-service',
      query: `${brand} ${primaryService}`.trim(),
      intentType: 'Brand search',
      priority: 'Medium',
    },
    {
      id: 'search-comparison-service-city',
      query: `best ${primaryService} ${cityWithState}`.trim(),
      intentType: 'Competitor/comparison discovery',
      priority: 'Low',
    },
  ]

  return uniqueByQuery(querySet.filter((item) => item.query.length > 3))
}

export const searchVisibilityQueryToAuditItem = (
  query: SearchVisibilityQuery,
): AuditItem => ({
  id: query.id,
  area: 'keywords',
  label: query.query,
  description:
    'Guided manual search visibility test. Open the manual search links, observe whether the business appears, and record evidence without claiming exact rankings.',
  weight: query.priority === 'High' ? 10 : query.priority === 'Medium' ? 7 : 4,
  access: 'public',
  evidenceLinks: [
    { label: 'Google search', url: googleSearch(query.query) },
    { label: 'Bing search', url: bingSearch(query.query) },
    { label: 'DuckDuckGo search', url: duckDuckGoSearch(query.query) },
  ],
  fix:
    'Improve public search visibility signals for this query through relevant service/location content, listing consistency, reviews, citations, internal links, and supporting pages.',
})

export const searchVisibilityResultToCheckStatus = (
  result: SearchVisibilityResult,
): CheckStatus => {
  if (result === 'found_prominently') return 'pass'
  if (result === 'found_weak' || result === 'found_directory_only') {
    return 'partial'
  }
  if (result === 'not_found') return 'fail'
  return 'unknown'
}

export const searchVisibilityResultLabel = (
  result: SearchVisibilityResult,
) => {
  if (result === 'found_prominently') return 'Found prominently'
  if (result === 'found_weak') return 'Found but weak'
  if (result === 'found_directory_only') return 'Found only through directory/listing'
  if (result === 'not_found') return 'Not found'
  if (result === 'manual_review_needed') return 'Manual review needed'
  return 'Not checked'
}

export const findingPriorityForSearchObservation = (
  query: SearchVisibilityQuery,
  result: SearchVisibilityResult,
): SearchVisibilityFindingPriority => {
  if (result === 'found_prominently') return 'No action needed'
  if (result === 'not_checked' || result === 'manual_review_needed') return 'Low'

  if (result === 'found_weak') {
    if (query.priority === 'High') return 'High'
    if (query.priority === 'Medium') return 'Medium'
    return 'Low'
  }

  if (result === 'found_directory_only') {
    if (query.priority === 'High') return 'Medium'
    if (query.priority === 'Medium') return 'Medium'
    return 'Low'
  }

  if (result === 'not_found') {
    if (query.priority === 'High') return 'High'
    return 'Medium'
  }

  return 'Low'
}

export const actionPlanPriorityForSearchObservation = (
  query: SearchVisibilityQuery,
  result: SearchVisibilityResult,
) => {
  const priority = findingPriorityForSearchObservation(query, result)
  return priority === 'No action needed' ? 'Low' : priority
}

export const recommendedActionForSearchObservation = (
  query: SearchVisibilityQuery,
  result: SearchVisibilityResult,
) => {
  if (result === 'found_prominently') {
    return 'The business was observed prominently for this query. No immediate cleanup is needed. Continue monitoring and maintain supporting service/location content.'
  }

  if (result === 'found_weak') {
    return 'The business appears for this query but visibility could be stronger. Improve service/location content, listing consistency, internal links, citations, reviews, and customer proof.'
  }

  if (result === 'found_directory_only') {
    return 'The business appears mainly through third-party listings. Strengthen the website and owned local signals so the business is easier to find directly.'
  }

  if (
    result === 'not_found' &&
    query.intentType === 'Competitor/comparison discovery'
  ) {
    return 'Document competitors and directories appearing for this query. Strengthen review signals, category relevance, service-page clarity, and local proof content.'
  }

  if (result === 'not_found') {
    return 'The business was not observed for this important search during manual review. Strengthen website content, service/location wording, listing categories, reviews, citations, and relevant directory presence.'
  }

  if (query.intentType === 'Brand search') {
    return 'Strengthen brand-result signals by aligning the website, listings, social profiles, directory citations, and review sources around the official business name and local market.'
  }

  if (
    query.intentType === 'Core service discovery' ||
    query.intentType === 'Service-area discovery'
  ) {
    return 'Improve the matching service/location signal with stronger website content, service-area wording, listing categories, internal links, citations, and customer proof.'
  }

  if (query.intentType === 'Competitor/comparison discovery') {
    return 'Document competitors that appear for this query and identify content, listing, review, or service-page gaps to prioritize for follow-up work.'
  }

  return 'Improve public signals for this category query with clearer service pages, listing categories, citations, and local proof.'
}
