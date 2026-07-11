import { useState } from 'react'
import type {
  BusinessProfile,
  CheckStatus,
  DirectoryAuditRow,
  DirectoryAuditState,
  DirectoryAuthority,
  DirectoryCandidateUrl,
  DirectoryCheckMethod,
  DirectoryFoundData,
  DirectoryFoundSignal,
  DirectoryListingStatus,
  DirectorySuggestion,
  DirectoryType,
  EvidenceConfidence,
  OwnerAccessStatus,
} from '../types/audit'
import type { PublicPageCheckResponse } from '../types/publicPageCheck'
import { evidenceConfidenceOptions } from '../utils/evidenceConfidence'
import { runPublicPageCheck } from '../utils/publicPageCheck'
import { googleSearch } from '../utils/links'
import { discoverDirectoryCandidateUrls } from '../utils/directoryCandidateDiscovery'
import {
  businessDirectoryKey,
  buildDirectorySuggestions,
  directorySuggestionToRow,
  emptyDirectoryRow,
  publicPageCheckEligibilityFor,
  urlDiscoveryMethodFor,
} from '../utils/directorySuggestions'
import { StatusBadge } from './StatusBadge'

interface DirectoryAuditPanelProps {
  profile: BusinessProfile
  state: DirectoryAuditState
  onChange: (state: DirectoryAuditState) => void
  onAddToActionPlan: (row: DirectoryAuditRow) => void
}

const checkFields: Array<{
  key: keyof Pick<
    DirectoryAuditRow,
    | 'listingFound'
    | 'nameMatches'
    | 'addressMatches'
    | 'phoneMatches'
    | 'websiteMatches'
    | 'categoryMatches'
    | 'descriptionAccurate'
    | 'reviewsVisible'
    | 'photosPresent'
    | 'duplicateFound'
  >
  label: string
}> = [
  { key: 'listingFound', label: 'Listing found' },
  { key: 'nameMatches', label: 'Name matches' },
  { key: 'addressMatches', label: 'Address/service area matches' },
  { key: 'phoneMatches', label: 'Phone/contact matches' },
  { key: 'websiteMatches', label: 'Website matches' },
  { key: 'categoryMatches', label: 'Category/services match' },
  { key: 'descriptionAccurate', label: 'Description accurate' },
  { key: 'reviewsVisible', label: 'Reviews/ratings visible' },
  { key: 'photosPresent', label: 'Photos/portfolio present' },
  { key: 'duplicateFound', label: 'Duplicate/outdated listing found' },
]

type DirectoryCheckFieldKey = (typeof checkFields)[number]['key']

const statusOptions: Array<{ value: CheckStatus; label: string }> = [
  { value: 'unknown', label: 'Not checked' },
  { value: 'pass', label: 'Pass' },
  { value: 'partial', label: 'Partial' },
  { value: 'fail', label: 'Fail' },
]

const foundSignalOptions: Array<{ value: DirectoryFoundSignal; label: string }> = [
  { value: 'Yes', label: 'Yes' },
  { value: 'Partial', label: 'Partial' },
  { value: 'No', label: 'No' },
]

const directoryTypes: DirectoryType[] = [
  'Industry directory',
  'Local directory',
  'Chamber / association',
  'Marketplace',
  'Review site',
  'Social/profile site',
  'Other',
]

const checkMethods: DirectoryCheckMethod[] = [
  'Manual verification only',
  'Public search assist only',
  'Public page check available',
  'Future API only',
]

const authorityOptions: DirectoryAuthority[] = ['High', 'Medium', 'Low']

const ownerAccessOptions: OwnerAccessStatus[] = [
  'Not checked',
  'Unverified - public listing only',
  'Confirmed with owner',
  'Owner access missing',
  'Access request needed',
]

const directoryStatusOptions: Array<{
  value: DirectoryListingStatus
  label: string
}> = [
  { value: 'not_checked', label: 'Not checked' },
  { value: 'found_accurate', label: 'Found and accurate' },
  { value: 'found_incomplete', label: 'Found but incomplete' },
  { value: 'found_inaccurate', label: 'Found but inaccurate' },
  { value: 'not_found', label: 'Not found' },
  { value: 'duplicate_outdated', label: 'Duplicate/outdated listing found' },
  { value: 'manual_review_needed', label: 'Manual review needed' },
]

const rowStatus = (row: DirectoryAuditRow): CheckStatus => {
  const listingResult = row.listingResult ?? row.directoryStatus

  if (
    row.listingUrlStatus === 'url_needed' ||
    row.listingUrlStatus === 'url_needs_review' ||
    !listingResult ||
    listingResult === 'not_checked' ||
    listingResult === 'manual_review_needed'
  ) {
    return 'unknown'
  }
  if (listingResult === 'found_accurate') return 'pass'
  if (listingResult === 'found_incomplete') return 'partial'
  if (
    listingResult === 'found_inaccurate' ||
    listingResult === 'duplicate_outdated'
  ) {
    return 'fail'
  }
  if (listingResult === 'not_found') {
    return row.authority === 'Low' ? 'partial' : 'fail'
  }

  const values = checkFields.map((field) => row[field.key])
  if (values.every((value) => value === 'unknown')) return 'unknown'
  if (
    row.duplicateFound === 'fail' ||
    row.listingFound === 'fail' ||
    values.some((value) => value === 'fail')
  ) {
    return 'fail'
  }
  if (values.some((value) => value === 'partial' || value === 'unknown')) {
    return 'partial'
  }
  return 'pass'
}

export function directoryRowToAuditItem(row: DirectoryAuditRow) {
  const weight = row.authority === 'High' ? 10 : row.authority === 'Medium' ? 7 : 4

  return {
    id: `directory-${row.id}`,
    area: 'listings' as const,
    label: `${row.directoryName || 'Directory'} listing`,
    description:
      'Activated optional directory check. Owner/admin access is not assumed from public evidence.',
    weight,
    access: 'public' as const,
    evidenceLinks: row.manualSearchUrl
      ? [{ label: 'Manual search', url: row.manualSearchUrl }]
      : [],
    fix:
      row.recommendedAction ||
      'Correct public listing details, categories, website links, photos, descriptions, and owner access notes where applicable.',
  }
}

export function directoryRowToStatus(row: DirectoryAuditRow): CheckStatus {
  return rowStatus(row)
}

const directoryStatusLabel = (status: DirectoryListingStatus | undefined) =>
  directoryStatusOptions.find((option) => option.value === status)?.label ??
  'Not checked'

const listingUrlStatusLabel = (row: DirectoryAuditRow) => {
  if (
    row.checkMethod === 'Public page check available' &&
    row.listingUrlStatus === 'url_saved'
  ) {
    return 'URL saved'
  }
  if (row.listingUrlStatus === 'url_saved') return 'URL saved'
  if (row.listingUrlStatus === 'url_needs_review') return 'URL needs review'
  if (row.listingUrlStatus === 'url_unavailable') return 'URL unavailable'
  return 'URL needed'
}

const checkMethodDisplay = (
  method: DirectoryCheckMethod,
  listingUrlStatus?: DirectoryAuditRow['listingUrlStatus'],
  publicPageCheckEligibility?: DirectoryAuditRow['publicPageCheckEligibility'],
) => {
  if (
    listingUrlStatus === 'url_saved' &&
    publicPageCheckEligibility === 'Allowed after URL confirmed'
  ) {
    return 'Public page check ready'
  }
  if (method === 'Public search assist only') return 'Manual search required'
  if (method === 'Public page check available') {
    return listingUrlStatus === 'url_saved'
      ? 'Public page check ready'
      : 'Public page check available — URL needed'
  }
  return method
}

const checkMethodGuidance = (
  method: DirectoryCheckMethod,
  listingUrlStatus?: DirectoryAuditRow['listingUrlStatus'],
  publicPageCheckEligibility?: DirectoryAuditRow['publicPageCheckEligibility'],
) => {
  if (
    listingUrlStatus === 'url_saved' &&
    publicPageCheckEligibility === 'Allowed after URL confirmed'
  ) {
    return 'A public listing URL is saved and can be checked by the scanner. Review scanner-detected data before using it in the customer report or Action Plan.'
  }
  if (
    listingUrlStatus === 'url_saved' &&
    publicPageCheckEligibility === 'Blocked/protected'
  ) {
    return 'URL saved, but this platform should remain manual-only or protected for now.'
  }
  if (method === 'Public page check available') {
    if (listingUrlStatus === 'url_saved') {
      return 'A public listing URL is saved and can be checked by the scanner.'
    }
    return 'Add the public listing URL, then this directory can be checked by the scanner in a future scan.'
  }
  if (method === 'Public search assist only') {
    return 'Use the search link to manually confirm whether this listing exists.'
  }
  if (method === 'Manual verification only') return 'Manual verification only.'
  return 'Future API / manual-only for now.'
}

const protectedDirectoryPattern =
  /google business|google places|apple maps|apple business|bing places|bing maps|facebook|instagram|yelp|chatgpt|gemini|claude|copilot|perplexity|grok/i

const effectivePublicPageCheckEligibility = (row: DirectoryAuditRow) =>
  publicPageCheckEligibilityFor(
    row.directoryName,
    row.checkMethod,
    row.allowPublicPageFetch,
    row.publicPageCheckEligibility === 'Allowed after URL confirmed'
      ? row.publicPageCheckEligibility
      : undefined,
  )

const effectiveUrlDiscoveryMethod = (row: DirectoryAuditRow) =>
  row.urlDiscoveryMethod ?? urlDiscoveryMethodFor(row.checkMethod)

const canRunPublicPageCheck = (row: DirectoryAuditRow) =>
  effectivePublicPageCheckEligibility(row) === 'Allowed after URL confirmed' &&
  row.listingUrlStatus === 'url_saved' &&
  Boolean(row.listingUrl.trim()) &&
  !protectedDirectoryPattern.test(row.directoryName)

const canShowDiscoveryAssist = (
  method: DirectoryCheckMethod,
  listingUrlStatus?: DirectoryAuditRow['listingUrlStatus'],
) =>
  method === 'Public search assist only' ||
  (method === 'Public page check available' && listingUrlStatus !== 'url_saved')

const websiteDomain = (website: string) => {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
      .hostname.replace(/^www\./i, '')
  } catch {
    return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
  }
}

const displayUrlHost = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const firstListItem = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)[0] ?? ''

const directoryDomain = (directoryName: string) => {
  const name = directoryName.toLowerCase()
  if (name.includes('weddingwire')) return 'weddingwire.com'
  if (name.includes('the knot')) return 'theknot.com'
  if (name.includes('zola')) return 'zola.com'
  if (name.includes('greatschools')) return 'greatschools.org'
  if (name.includes('niche')) return 'niche.com'
  if (name.includes('private school review')) return 'privateschoolreview.com'
  if (name.includes('booksy')) return 'booksy.com'
  if (name.includes('vagaro')) return 'vagaro.com'
  if (name.includes('fresha')) return 'fresha.com'
  if (name.includes('styleseat')) return 'styleseat.com'
  if (name.includes('angi')) return 'angi.com'
  if (name.includes('homeadvisor')) return 'homeadvisor.com'
  if (name.includes('thumbtack')) return 'thumbtack.com'
  if (name.includes('houzz')) return 'houzz.com'
  if (name.includes('bbb')) return 'bbb.org'
  return ''
}

const buildCandidateSearchLinks = (
  profile: BusinessProfile,
  directoryName: string,
): DirectoryCandidateUrl[] => {
  const city = profile.localMarket || profile.targetLocation || profile.serviceArea
  const domain = websiteDomain(profile.website)
  const service = firstListItem(profile.primaryServices || profile.industryTags)
  const category = profile.primaryCategory || firstListItem(profile.secondaryCategories)
  const expectedDomain = directoryDomain(directoryName)
  const queries = [
    {
      label: 'Search by business + directory',
      query: `${profile.businessName} ${city} ${directoryName}`,
      reason: 'Searches for the business, local market, and directory name.',
    },
    {
      label: 'Search by website + directory',
      query: `${profile.businessName} ${domain} ${directoryName}`,
      reason: 'Searches for the business website domain near the directory name.',
    },
    {
      label: 'Search by city + directory',
      query: `${profile.businessName} ${city} ${directoryName}`,
      reason: 'Searches for a local listing match by city or service area.',
    },
    {
      label: 'Search by service + directory',
      query: `${profile.businessName} ${service || category} ${directoryName}`,
      reason: 'Searches for a listing match by service/category and directory.',
    },
    expectedDomain
      ? {
          label: 'Search within directory domain',
          query: `site:${expectedDomain} ${profile.businessName} ${city}`,
          reason:
            'Limits the manual search to the expected directory domain when known.',
        }
      : null,
    expectedDomain && domain
      ? {
          label: 'Search by website within directory domain',
          query: `site:${expectedDomain} ${profile.businessName} ${domain}`,
          reason:
            'Looks for a directory-domain page that references the business website.',
        }
      : null,
  ]

  return queries
    .filter(Boolean)
    .map((item) => item as { label: string; query: string; reason: string })
    .filter((item) => item.query.replace(profile.businessName, '').trim())
    .map((item, index) => ({
      id: `${directoryName.toLowerCase().replace(/\W+/g, '-')}-candidate-search-${index}`,
      title: item.label,
      url: googleSearch(item.query),
      displayDomain: 'google.com',
      snippet:
        'Manual search fallback. Open results, confirm the correct public listing URL, then save it in the scanner.',
      source: 'Generated manual search link',
      confidence: expectedDomain && item.query.includes(`site:${expectedDomain}`)
        ? 'Medium'
        : 'Low',
      reason: `${item.reason} Candidate URLs are suggestions only; open the search result and save only the confirmed public listing URL.`,
      discoveredAt: new Date().toISOString(),
    }))
}

const foundDataRows: Array<{
  key: keyof NonNullable<DirectoryAuditRow['foundData']>
  label: string
}> = [
  { key: 'businessNameFound', label: 'Name' },
  { key: 'phoneFound', label: 'Phone/contact' },
  { key: 'websiteFound', label: 'Website' },
  { key: 'addressOrServiceAreaFound', label: 'Address/service area' },
  { key: 'categoryServicesFound', label: 'Category/services' },
  { key: 'descriptionFound', label: 'Description' },
  { key: 'reviewsRatingsVisible', label: 'Reviews/ratings' },
  { key: 'photosPortfolioVisible', label: 'Photos/portfolio' },
]

const foundSignalToCheckStatus = (
  signal: DirectoryFoundSignal | undefined,
): CheckStatus => {
  if (signal === 'Yes') return 'pass'
  if (signal === 'Partial') return 'partial'
  if (signal === 'No') return 'fail'
  return 'unknown'
}

const foundDataToCheckUpdates = (
  foundData: DirectoryFoundData,
): Pick<DirectoryAuditRow, DirectoryCheckFieldKey> => ({
  listingFound: foundData.businessNameFound === 'Yes' ? 'pass' : 'partial',
  nameMatches: foundSignalToCheckStatus(foundData.businessNameFound),
  phoneMatches: foundSignalToCheckStatus(foundData.phoneFound),
  websiteMatches: foundSignalToCheckStatus(foundData.websiteFound),
  addressMatches: foundSignalToCheckStatus(foundData.addressOrServiceAreaFound),
  categoryMatches: foundSignalToCheckStatus(foundData.categoryServicesFound),
  descriptionAccurate: foundSignalToCheckStatus(foundData.descriptionFound),
  reviewsVisible: foundSignalToCheckStatus(foundData.reviewsRatingsVisible),
  photosPresent: foundSignalToCheckStatus(foundData.photosPortfolioVisible),
  duplicateFound: 'pass',
})

const cleanComparableText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim()

const splitProfileList = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

const normalizeDigits = (value: string) => value.replace(/\D/g, '')

const phraseSignalFromText = (
  text: string,
  phrases: string[],
): DirectoryFoundSignal => {
  const comparable = cleanComparableText(text)
  const filtered = phrases.filter((phrase) => phrase.trim().length > 1)
  if (filtered.length === 0) return 'No'
  const matches = filtered.filter((phrase) =>
    comparable.includes(cleanComparableText(phrase)),
  ).length
  if (matches === 0) return 'No'
  if (matches === filtered.length || matches >= 2) return 'Yes'
  return 'Partial'
}

const phoneSignalFromText = (
  text: string,
  phones: string[],
): DirectoryFoundSignal => {
  const pageDigits = normalizeDigits(text)
  const expected = phones.map(normalizeDigits).filter(Boolean)
  if (expected.length === 0) return 'No'
  if (expected.some((phone) => pageDigits.includes(phone))) return 'Yes'
  return /\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}/.test(text) ? 'Partial' : 'No'
}

const websiteSignalFromText = (
  text: string,
  website: string,
): DirectoryFoundSignal => {
  if (!website.trim()) return 'No'
  const domain = websiteDomain(website).toLowerCase()
  return cleanComparableText(text).includes(domain) ? 'Yes' : 'No'
}

const visibilitySignalFromText = (
  text: string,
  terms: string[],
): DirectoryFoundSignal =>
  terms.some((term) => cleanComparableText(text).includes(term)) ? 'Yes' : 'No'

const descriptionSignalFromText = (
  text: string,
  profile: BusinessProfile,
): DirectoryFoundSignal => {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const contextSignal = phraseSignalFromText(text, [
    profile.primaryCategory,
    ...splitProfileList(profile.secondaryCategories),
    ...splitProfileList(profile.industryTags),
    ...splitProfileList(profile.primaryServices),
    profile.localMarket,
    ...splitProfileList(profile.serviceArea),
  ])
  if (wordCount > 120 && contextSignal !== 'No') return 'Yes'
  if (wordCount > 60 || contextSignal !== 'No') return 'Partial'
  return 'No'
}

const analyzeVisiblePageText = (
  profile: BusinessProfile,
  pastedText: string,
): DirectoryFoundData => {
  const validContactNumbers = (profile.phoneNumbers ?? [])
    .filter((record) => record.isValidPublicContact && record.number.trim())
    .map((record) => record.number)

  return {
    businessNameFound: phraseSignalFromText(pastedText, [profile.businessName]),
    phoneFound: phoneSignalFromText(pastedText, [
      profile.phone,
      ...validContactNumbers,
    ]),
    websiteFound: websiteSignalFromText(pastedText, profile.website),
    addressOrServiceAreaFound: phraseSignalFromText(pastedText, [
      profile.localMarket,
      profile.targetLocation,
      ...splitProfileList(profile.serviceArea),
    ]),
    categoryServicesFound: phraseSignalFromText(pastedText, [
      profile.primaryCategory,
      ...splitProfileList(profile.secondaryCategories),
      ...splitProfileList(profile.industryTags),
      ...splitProfileList(profile.primaryServices),
    ]),
    descriptionFound: descriptionSignalFromText(pastedText, profile),
    reviewsRatingsVisible: visibilitySignalFromText(pastedText, [
      'review',
      'reviews',
      'rating',
      'ratings',
      'stars',
      'testimonial',
      'testimonials',
    ]),
    photosPortfolioVisible: visibilitySignalFromText(pastedText, [
      'photo',
      'photos',
      'gallery',
      'portfolio',
      'images',
      'package',
      'packages',
    ]),
  }
}

const listingResultFromFoundData = (
  foundData: DirectoryFoundData,
): DirectoryListingStatus => {
  if (foundData.businessNameFound === 'No') return 'manual_review_needed'
  const positiveSignals = [
    foundData.phoneFound,
    foundData.websiteFound,
    foundData.addressOrServiceAreaFound,
    foundData.categoryServicesFound,
    foundData.descriptionFound,
  ].filter((signal) => signal === 'Yes' || signal === 'Partial').length
  if (positiveSignals >= 4) return 'found_accurate'
  if (positiveSignals >= 2) return 'found_incomplete'
  return 'manual_review_needed'
}

const evidenceNoteFromFoundData = (
  foundData: DirectoryFoundData,
  sourceLabel: string,
) => {
  const found: string[] = []
  const missing: string[] = []
  const partial: string[] = []
  const labels: Array<[keyof DirectoryFoundData, string]> = [
    ['businessNameFound', 'business name'],
    ['phoneFound', 'phone/contact'],
    ['websiteFound', 'website'],
    ['addressOrServiceAreaFound', 'address/service area'],
    ['categoryServicesFound', 'category/services'],
    ['descriptionFound', 'description/context'],
    ['reviewsRatingsVisible', 'reviews/ratings'],
    ['photosPortfolioVisible', 'photos/portfolio'],
  ]

  labels.forEach(([key, label]) => {
    if (foundData[key] === 'Yes') found.push(label)
    if (foundData[key] === 'No') missing.push(label)
    if (foundData[key] === 'Partial') partial.push(label)
  })

  return [
    `${sourceLabel} confirms the listing was reviewed from visible public content.`,
    found.length ? `Found: ${found.join(', ')}.` : '',
    partial.length ? `Partially found or needs operator review: ${partial.join(', ')}.` : '',
    missing.length ? `Not found in the reviewed text: ${missing.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function DirectoryAuditPanel({
  profile,
  state,
  onChange,
  onAddToActionPlan,
}: DirectoryAuditPanelProps) {
  const [checkingRowId, setCheckingRowId] = useState<string | null>(null)
  const [checkMessages, setCheckMessages] = useState<Record<string, string>>({})
  const [openDiscoveryIds, setOpenDiscoveryIds] = useState<Record<string, boolean>>({})
  const [candidateLoadingId, setCandidateLoadingId] = useState<string | null>(null)
  const [candidateMessages, setCandidateMessages] = useState<Record<string, string>>({})
  const [suggestionCandidates, setSuggestionCandidates] = useState<
    Record<string, DirectoryCandidateUrl[]>
  >({})
  const [manualFallbackCandidates, setManualFallbackCandidates] = useState<
    Record<string, DirectoryCandidateUrl[]>
  >({})
  const businessId = businessDirectoryKey(profile)
  const currentRows = state.activeRows.filter(
    (row) => !row.businessId || row.businessId === businessId,
  )
  const suggestions = buildDirectorySuggestions(profile).filter(
    (suggestion) =>
      !state.ignoredSuggestionIds.includes(suggestion.id) &&
      !currentRows.some(
        (row) => row.directoryName === suggestion.directoryName,
      ),
  )

  const updateRow = (id: string, nextRow: DirectoryAuditRow) => {
    onChange({
      ...state,
      activeRows: state.activeRows.map((row) => (row.id === id ? nextRow : row)),
    })
  }

  const updateListingUrl = (row: DirectoryAuditRow, listingUrl: string) => {
    const trimmedUrl = listingUrl.trim()
    const nextEligibility = publicPageCheckEligibilityFor(
      row.directoryName,
      row.checkMethod,
      row.allowPublicPageFetch,
      row.publicPageCheckEligibility === 'Allowed after URL confirmed'
        ? row.publicPageCheckEligibility
        : undefined,
    )
    updateRow(row.id, {
      ...row,
      listingUrl,
      urlDiscoveryMethod: effectiveUrlDiscoveryMethod(row),
      publicPageCheckEligibility: nextEligibility,
      listingUrlStatus: trimmedUrl
        ? 'url_saved'
        : row.requiresOperatorUrl
          ? 'url_needed'
          : 'url_unavailable',
    })
  }

  const runCandidateDiscoveryForSuggestion = async (
    suggestion: DirectorySuggestion,
  ) => {
    setOpenDiscoveryIds((current) => ({ ...current, [suggestion.id]: true }))
    setCandidateLoadingId(suggestion.id)
    try {
      const result = await discoverDirectoryCandidateUrls(profile, suggestion)
      setSuggestionCandidates((current) => ({
        ...current,
        [suggestion.id]: result.candidateUrls,
      }))
      setManualFallbackCandidates((current) => ({
        ...current,
        [suggestion.id]:
          result.manualSearchLinks.length > 0
            ? result.manualSearchLinks
            : buildCandidateSearchLinks(profile, suggestion.directoryName),
      }))
      setCandidateMessages((current) => ({
        ...current,
        [suggestion.id]: result.message ?? '',
      }))
    } catch {
      setSuggestionCandidates((current) => ({ ...current, [suggestion.id]: [] }))
      setManualFallbackCandidates((current) => ({
        ...current,
        [suggestion.id]: buildCandidateSearchLinks(profile, suggestion.directoryName),
      }))
      setCandidateMessages((current) => ({
        ...current,
        [suggestion.id]: 'No candidate URLs found automatically. Use manual search.',
      }))
    } finally {
      setCandidateLoadingId(null)
    }
  }

  const runCandidateDiscoveryForRow = async (row: DirectoryAuditRow) => {
    setOpenDiscoveryIds((current) => ({ ...current, [row.id]: true }))
    setCandidateLoadingId(row.id)
    try {
      const result = await discoverDirectoryCandidateUrls(profile, row)
      updateRow(row.id, {
        ...row,
        candidateUrls: result.candidateUrls,
      })
      setManualFallbackCandidates((current) => ({
        ...current,
        [row.id]:
          result.manualSearchLinks.length > 0
            ? result.manualSearchLinks
            : buildCandidateSearchLinks(profile, row.directoryName),
      }))
      setCandidateMessages((current) => ({
        ...current,
        [row.id]: result.message ?? '',
      }))
    } catch {
      updateRow(row.id, {
        ...row,
        candidateUrls: row.candidateUrls ?? [],
      })
      setManualFallbackCandidates((current) => ({
        ...current,
        [row.id]: buildCandidateSearchLinks(profile, row.directoryName),
      }))
      setCandidateMessages((current) => ({
        ...current,
        [row.id]: 'No candidate URLs found automatically. Use manual search.',
      }))
    } finally {
      setCandidateLoadingId(null)
    }
  }

  const saveCandidateUrl = (
    row: DirectoryAuditRow,
    candidate: DirectoryCandidateUrl,
  ) => {
    updateRow(row.id, {
      ...row,
      listingUrl: candidate.url,
      listingUrlStatus: 'url_saved',
      savedCandidateUrl: candidate,
      urlDiscoveryMethod: effectiveUrlDiscoveryMethod(row),
      publicPageCheckEligibility: effectivePublicPageCheckEligibility(row),
      publicEvidenceNotes:
        row.publicEvidenceNotes ||
        `Candidate URL saved by operator from ${candidate.source}: ${candidate.title}.`,
      evidenceNotes:
        row.evidenceNotes ||
        `Candidate URL saved by operator from ${candidate.source}: ${candidate.title}.`,
    })
  }

  const dismissCandidateUrl = (
    row: DirectoryAuditRow,
    candidate: DirectoryCandidateUrl,
  ) => {
    updateRow(row.id, {
      ...row,
      candidateUrls: (row.candidateUrls ?? []).filter(
        (item) => item.id !== candidate.id,
      ),
    })
  }

  const markUrlUnavailable = (row: DirectoryAuditRow) => {
    updateRow(row.id, {
      ...row,
      listingUrlStatus: 'url_unavailable',
      listingResult:
        row.listingResult === 'not_found' ? 'not_found' : 'manual_review_needed',
      directoryStatus:
        row.listingResult === 'not_found' ? 'not_found' : 'manual_review_needed',
      evidenceConfidence: 'manual_needs_confirmation',
      publicEvidenceNotes:
        row.publicEvidenceNotes ||
        'Public listing URL is unavailable or could not be confirmed. Use manual verification.',
      evidenceNotes:
        row.evidenceNotes ||
        'Public listing URL is unavailable or could not be confirmed. Use manual verification.',
    })
  }

  const clearListingUrl = (row: DirectoryAuditRow) => {
    updateRow(row.id, {
      ...row,
      listingUrl: '',
      listingUrlStatus: row.requiresOperatorUrl ? 'url_needed' : 'url_unavailable',
    })
  }

  const activateSuggestion = (suggestion: DirectorySuggestion) => {
    const existingRow = state.activeRows.find(
      (row) =>
        row.businessId === businessId &&
        row.directoryName === suggestion.directoryName,
    )
    if (existingRow) return

    onChange({
      ...state,
      activeRows: [
        ...state.activeRows,
        directorySuggestionToRow(suggestion, businessId),
      ],
    })
  }

  const applyPublicPageCheck = (
    row: DirectoryAuditRow,
    result: PublicPageCheckResponse,
  ) => {
    updateRow(row.id, {
      ...row,
      foundData: result.foundData,
      ...(result.ok ? foundDataToCheckUpdates(result.foundData) : {}),
      duplicateFound:
        result.ok && row.duplicateFound === 'unknown' ? 'pass' : row.duplicateFound,
      listingResult: result.listingResult,
      directoryStatus: result.listingResult,
      lastCheckedAt: result.lastCheckedAt,
      publicEvidenceNotes: result.publicEvidenceNotes,
      evidenceNotes: result.publicEvidenceNotes,
      recommendedAction: result.recommendedAction,
      evidenceConfidence: result.evidenceConfidence,
      listingUrlStatus:
        result.listingResult === 'manual_review_needed'
          ? row.listingUrlStatus
          : 'url_saved',
    })
    setCheckMessages((messages) => ({
      ...messages,
      [row.id]: result.ok
        ? 'Public Page Check completed. Review before using in a customer report or Action Plan.'
        : result.error ??
          'Public page fetch was unavailable or blocked. Open the saved URL manually, mark it observed, or paste visible page text for assisted analysis.',
    }))
  }

  const runRowPublicPageCheck = async (row: DirectoryAuditRow) => {
    setCheckingRowId(row.id)
    setCheckMessages((messages) => ({ ...messages, [row.id]: '' }))
    try {
      const result = await runPublicPageCheck(profile, row)
      applyPublicPageCheck(row, result)
    } catch {
      const lastCheckedAt = new Date().toISOString()
      updateRow(row.id, {
        ...row,
        listingResult: 'manual_review_needed',
        directoryStatus: 'manual_review_needed',
        lastCheckedAt,
        publicEvidenceNotes:
          'Public page fetch was unavailable or blocked. The operator can still review the page manually and mark the evidence as public page observed.',
        evidenceNotes:
          'Public page fetch was unavailable or blocked. The operator can still review the page manually and mark the evidence as public page observed.',
        recommendedAction:
          'Manually review the directory listing and document whether the public information matches the business profile.',
        evidenceConfidence: 'manual_needs_confirmation',
      })
      setCheckMessages((messages) => ({
        ...messages,
        [row.id]:
          'Public page fetch was unavailable or blocked. Open the saved URL manually, mark it observed, or paste visible page text for assisted analysis.',
      }))
    } finally {
      setCheckingRowId(null)
    }
  }

  const markPublicPageObserved = (row: DirectoryAuditRow) => {
    const lastCheckedAt = new Date().toISOString()
    updateRow(row.id, {
      ...row,
      listingResult:
        row.listingResult === 'not_checked' ? 'manual_review_needed' : row.listingResult,
      directoryStatus:
        row.directoryStatus === 'not_checked'
          ? 'manual_review_needed'
          : row.directoryStatus,
      lastCheckedAt,
      evidenceConfidence: 'public_page_observed',
      publicEvidenceNotes:
        row.publicEvidenceNotes ||
        'The saved public listing URL opened in the browser and was observed manually by the operator. Review and complete the evidence fields before using this in the customer report or Action Plan.',
      evidenceNotes:
        row.evidenceNotes ||
        'The saved public listing URL opened in the browser and was observed manually by the operator. Review and complete the evidence fields before using this in the customer report or Action Plan.',
    })
    setCheckMessages((messages) => ({
      ...messages,
      [row.id]:
        'Marked as Public Page Observed. This is operator-observed evidence, not a backend scanner fetch.',
    }))
  }

  const analyzePastedTextForRow = (row: DirectoryAuditRow) => {
    const pastedText = row.pastedVisiblePageText.trim()
    if (!pastedText) {
      setCheckMessages((messages) => ({
        ...messages,
        [row.id]: 'Paste visible page text before running assisted analysis.',
      }))
      return
    }

    const foundData = analyzeVisiblePageText(profile, pastedText)
    const listingResult = listingResultFromFoundData(foundData)
    const evidenceNote = evidenceNoteFromFoundData(
      foundData,
      'Operator-provided public page text',
    )
    updateRow(row.id, {
      ...row,
      foundData,
      ...foundDataToCheckUpdates(foundData),
      listingResult,
      directoryStatus: listingResult,
      lastCheckedAt: new Date().toISOString(),
      evidenceConfidence: 'operator_provided_page_text',
      publicEvidenceNotes: evidenceNote,
      evidenceNotes: evidenceNote,
      recommendedAction:
        listingResult === 'found_accurate'
          ? 'Review the observed public listing details and keep this directory record as supporting evidence.'
          : 'Review the observed public listing and update missing or unclear contact, service, category, website, or service-area details where the directory allows edits.',
      listingUrlStatus: 'url_saved',
    })
    setCheckMessages((messages) => ({
      ...messages,
      [row.id]:
        'Pasted page text analyzed. Review and correct the detected fields before using this in the report or Action Plan.',
    }))
  }

  const summary = currentRows.reduce(
    (totals, row) => {
      const listingResult = row.listingResult ?? row.directoryStatus
      if (listingResult === 'found_accurate') totals.found += 1
      if (
        listingResult === 'found_incomplete' ||
        listingResult === 'found_inaccurate' ||
        listingResult === 'duplicate_outdated'
      ) {
        totals.cleanup += 1
      }
      if (listingResult === 'not_found') totals.missing += 1
      if (
        row.ownerAccessStatus === 'Owner access missing' ||
        row.ownerAccessStatus === 'Access request needed'
      ) {
        totals.access += 1
      }
      return totals
    },
    { found: 0, cleanup: 0, missing: 0, access: 0 },
  )

  return (
    <section className="panel directory-panel">
      <div className="panel-header">
        <p className="eyebrow">Industry & Local Directory Opportunities</p>
        <h2>Suggested opportunities and activated checks</h2>
        <p>
          Suggestions are based on Business Settings. They are optional and do
          not affect Listings score until activated.
        </p>
      </div>

      <div className="directory-summary-grid">
        <div>
          <strong>{summary.found}</strong>
          <span>Found and accurate</span>
        </div>
        <div>
          <strong>{summary.cleanup}</strong>
          <span>Needs cleanup</span>
        </div>
        <div>
          <strong>{summary.missing}</strong>
          <span>Missing opportunities</span>
        </div>
        <div>
          <strong>{summary.access}</strong>
          <span>Access/onboarding items</span>
        </div>
      </div>

      <div className="directory-suggestions">
        {suggestions.map((suggestion) => (
          <article className="directory-suggestion" key={suggestion.id}>
            <div>
              <div className="directory-suggestion-heading">
                <strong>{suggestion.directoryName}</strong>
                <span className="method-pill">
                  {checkMethodDisplay(
                    suggestion.checkMethod,
                    suggestion.requiresOperatorUrl ? 'url_needed' : 'url_unavailable',
                    suggestion.publicPageCheckEligibility,
                  )}
                </span>
                <span className="method-pill method-pill-muted">
                  {suggestion.requiresOperatorUrl ? 'URL needed' : 'URL unavailable'}
                </span>
              </div>
              <p>
                {suggestion.authority} relevance | {suggestion.reason}
              </p>
              <p className="method-guidance">
                {checkMethodGuidance(
                  suggestion.checkMethod,
                  suggestion.requiresOperatorUrl ? 'url_needed' : 'url_unavailable',
                  suggestion.publicPageCheckEligibility,
                )}
              </p>
              <a href={suggestion.manualSearchUrl} target="_blank" rel="noreferrer">
                Manual search
              </a>
            </div>
            <div className="directory-actions">
              {canShowDiscoveryAssist(
                suggestion.checkMethod,
                suggestion.requiresOperatorUrl ? 'url_needed' : 'url_unavailable',
              ) ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void runCandidateDiscoveryForSuggestion(suggestion)}
                  disabled={candidateLoadingId === suggestion.id}
                >
                  {candidateLoadingId === suggestion.id
                    ? 'Finding Candidates...'
                    : 'Find Candidate Listing URLs'}
                </button>
              ) : null}
              <button type="button" onClick={() => activateSuggestion(suggestion)}>
                Activate
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  onChange({
                    ...state,
                    ignoredSuggestionIds: [
                      ...state.ignoredSuggestionIds,
                      suggestion.id,
                    ],
                  })
                }
              >
                Ignore
              </button>
            </div>
            {openDiscoveryIds[suggestion.id] ? (
              <div className="directory-discovery-panel">
                <p>
                  Candidate URLs are suggestions. Operator confirmation is
                  required before saving. Activate this suggestion before saving
                  a confirmed URL.
                </p>
                <p className="method-guidance">
                  {candidateMessages[suggestion.id] ??
                    'Candidate lookup has not returned results yet.'}
                </p>
                {(suggestionCandidates[suggestion.id] ?? []).length > 0 ? (
                  <strong className="candidate-section-label">
                    Candidate URLs found
                  </strong>
                ) : null}
                <div className="candidate-url-list">
                  {(suggestionCandidates[suggestion.id] ?? []).map(
                    (candidate) => (
                      <article className="candidate-url-card" key={candidate.id}>
                        <div>
                          <strong>{candidate.title}</strong>
                          <span>{candidate.displayDomain || displayUrlHost(candidate.url)}</span>
                        </div>
                        {candidate.snippet ? <p>{candidate.snippet}</p> : null}
                        <p>{candidate.reason}</p>
                        <div className="candidate-meta">
                          <span>Confidence: {candidate.confidence}</span>
                          <span>{candidate.source}</span>
                        </div>
                        <a href={candidate.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </article>
                    ),
                  )}
                </div>
                {(suggestionCandidates[suggestion.id] ?? []).length === 0 ? (
                  <p className="empty-state">
                    No candidate URLs found automatically. Use manual search.
                  </p>
                ) : null}
                <details className="manual-search-fallback">
                  <summary>Manual search fallback</summary>
                  <div className="directory-discovery-links">
                    {(manualFallbackCandidates[suggestion.id] ??
                      buildCandidateSearchLinks(profile, suggestion.directoryName)
                    ).map((candidate) => (
                      <a
                        href={candidate.url}
                        key={`${suggestion.id}-${candidate.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {candidate.title.replace(/^Manual search: /, '')}
                      </a>
                    ))}
                  </div>
                </details>
              </div>
            ) : null}
          </article>
        ))}
        {suggestions.length === 0 ? (
          <p className="empty-state">No unused suggestions for this profile.</p>
        ) : null}
      </div>

      <div className="directory-active-header">
        <div>
          <p className="eyebrow">Activated Directory Checks</p>
          <h3>Active directory cards</h3>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...state,
              activeRows: [...state.activeRows, emptyDirectoryRow(businessId)],
            })
          }
        >
          Add custom directory
        </button>
      </div>

      <div className="directory-active-list">
        {currentRows.map((row) => (
          <article className="directory-row" key={row.id}>
            <div className="audit-title-row">
              <div>
                <p className="fix-area">{row.source === 'suggested' ? 'Activated suggestion' : 'Custom directory'}</p>
                <h3>{row.directoryName || 'Untitled directory'}</h3>
              </div>
              <StatusBadge status={rowStatus(row)} />
            </div>

            <div className="directory-compact-grid">
              <label>
                Directory name
                <input
                  value={row.directoryName}
                  onChange={(event) =>
                    updateRow(row.id, { ...row, directoryName: event.target.value })
                  }
                />
              </label>
              <label>
                Listing result
                <select
                  value={row.listingResult ?? row.directoryStatus ?? 'not_checked'}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      listingResult: event.target.value as DirectoryListingStatus,
                      directoryStatus: event.target.value as DirectoryListingStatus,
                      lastCheckedAt:
                        event.target.value === 'not_checked'
                          ? row.lastCheckedAt
                          : new Date().toISOString(),
                    })
                  }
                >
                  {directoryStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                URL status
                <input value={listingUrlStatusLabel(row)} readOnly />
              </label>
              <label>
                Check method
                <select
                  value={row.checkMethod}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      checkMethod: event.target.value as DirectoryCheckMethod,
                    })
                  }
                >
                  {checkMethods.map((method) => (
                    <option key={method} value={method}>
                      {checkMethodDisplay(method, row.listingUrlStatus)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Relevance
                <select
                  value={row.relevance ?? row.authority}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      authority: event.target.value as DirectoryAuthority,
                      relevance: event.target.value as DirectoryAuthority,
                    })
                  }
                >
                  {authorityOptions.map((authority) => (
                    <option key={authority} value={authority}>
                      {authority}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Listing/profile URL
                <input
                  value={row.listingUrl}
                  onChange={(event) =>
                    updateListingUrl(row, event.target.value)
                  }
                />
              </label>
              <label>
                Owner/admin access
                <select
                  value={row.ownerAdminAccessStatus ?? row.ownerAccessStatus}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      ownerAccessStatus: event.target.value as OwnerAccessStatus,
                      ownerAdminAccessStatus: event.target.value as OwnerAccessStatus,
                    })
                  }
                >
                  {ownerAccessOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="directory-method-note">
              <strong>
                {checkMethodDisplay(
                  row.checkMethod,
                  row.listingUrlStatus,
                  effectivePublicPageCheckEligibility(row),
                )}
              </strong>
              <span>
                URL status: {listingUrlStatusLabel(row)}
                {row.lastCheckedAt
                  ? ` | Last checked ${new Date(row.lastCheckedAt).toLocaleString()}`
                  : ''}
              </span>
              <span>
                {checkMethodGuidance(
                  row.checkMethod,
                  row.listingUrlStatus,
                  effectivePublicPageCheckEligibility(row),
                )}
              </span>
              <span>URL discovery: {effectiveUrlDiscoveryMethod(row)}</span>
              <span>
                Public Page Check:{' '}
                {canRunPublicPageCheck(row) ? 'Ready' : effectivePublicPageCheckEligibility(row)}
              </span>
              <span>{row.capabilityNotes}</span>
              {canRunPublicPageCheck(row) ? (
                <span>
                  Public Page Check is a scanner-detected result from the saved
                  public URL. Review before using in the customer report or
                  Action Plan.
                </span>
              ) : null}
              {checkMessages[row.id] ? (
                <span className="method-guidance">{checkMessages[row.id]}</span>
              ) : null}
              {row.listingUrlStatus === 'url_saved' ? (
                <span>
                  Some public pages are visible in a browser but unavailable to
                  scanner fetch. If that happens, open the saved URL manually,
                  mark the page as Public Page Observed, or paste visible page
                  text for assisted analysis.
                </span>
              ) : null}
            </div>

            {openDiscoveryIds[row.id] ? (
              <div className="directory-discovery-panel">
                <p>
                  Candidate URLs are suggestions. Operator confirmation is
                  required before saving. Saved URLs can be used for Public Page
                  Check where eligible.
                </p>
                <p className="method-guidance">
                  {candidateMessages[row.id] ??
                    'Candidate lookup has not returned results yet.'}
                </p>
                {(row.candidateUrls ?? []).length > 0 ? (
                  <strong className="candidate-section-label">
                    Candidate URLs found
                  </strong>
                ) : null}
                <div className="candidate-url-list">
                  {(row.candidateUrls ?? []).map((candidate) => (
                    <article className="candidate-url-card" key={candidate.id}>
                      <div>
                        <strong>{candidate.title}</strong>
                        <span>{candidate.displayDomain || displayUrlHost(candidate.url)}</span>
                      </div>
                      {candidate.snippet ? <p>{candidate.snippet}</p> : null}
                      <p>{candidate.reason}</p>
                      <div className="candidate-meta">
                        <span>Confidence: {candidate.confidence}</span>
                        <span>{candidate.source}</span>
                      </div>
                      <div className="directory-actions">
                        <a href={candidate.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                        {candidate.source !== 'Generated manual search link' &&
                        candidate.source !== 'Manual search fallback' ? (
                          <button
                            type="button"
                            onClick={() => saveCandidateUrl(row, candidate)}
                          >
                            Save this URL
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => dismissCandidateUrl(row, candidate)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {(row.candidateUrls ?? []).length === 0 ? (
                  <p className="empty-state">
                    No candidate URLs found automatically. Use manual search.
                  </p>
                ) : null}
                <details className="manual-search-fallback">
                  <summary>Manual search fallback</summary>
                  <div className="directory-discovery-links">
                    {(manualFallbackCandidates[row.id] ??
                      buildCandidateSearchLinks(profile, row.directoryName)
                    ).map((candidate) => (
                      <a
                        href={candidate.url}
                        key={`${row.id}-${candidate.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {candidate.title.replace(/^Manual search: /, '')}
                      </a>
                    ))}
                  </div>
                </details>
                <div className="directory-url-capture">
                  <label>
                    Confirmed public listing URL
                    <input
                      value={row.listingUrl}
                      onChange={(event) =>
                        updateListingUrl(row, event.target.value)
                      }
                      placeholder="Paste the exact public listing/profile URL."
                    />
                  </label>
                  <div className="directory-actions">
                    <button
                      type="button"
                      onClick={() => updateListingUrl(row, row.listingUrl)}
                    >
                      Save URL
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => markUrlUnavailable(row)}
                    >
                      Mark URL unavailable
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="found-data-summary">
              {foundDataRows.map((item) => (
                <div key={`${row.id}-${item.key}`}>
                  <span>{item.label}</span>
                  <strong>{row.foundData?.[item.key] ?? 'Not checked'}</strong>
                </div>
              ))}
            </div>

            <div className="directory-row-grid">
              <label>
                Public evidence notes
                <textarea
                  value={row.publicEvidenceNotes ?? row.evidenceNotes}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      publicEvidenceNotes: event.target.value,
                      evidenceNotes: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Evidence Confidence
                <select
                  value={row.evidenceConfidence ?? 'manual_needs_confirmation'}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      evidenceConfidence: event.target.value as EvidenceConfidence,
                    })
                  }
                >
                  {evidenceConfidenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="helper-text">
                  Public listing details can be observed manually, but owner/admin
                  access should only be marked confirmed after the business owner
                  verifies it.
                </span>
              </label>
              <label>
                Recommended action
                <textarea
                  value={row.recommendedAction}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      recommendedAction: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            {row.listingUrlStatus === 'url_saved' ? (
              <div className="operator-observed-panel">
                <div>
                  <strong>Operator-observed fallback</strong>
                  <p>
                    If the page is visible in your browser but blocked from
                    scanner fetch, mark it observed or paste visible text from
                    the listing page for assisted analysis.
                  </p>
                </div>
                <div className="directory-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => markPublicPageObserved(row)}
                  >
                    Mark as Public Page Observed
                  </button>
                  <button
                    type="button"
                    onClick={() => analyzePastedTextForRow(row)}
                    disabled={!row.pastedVisiblePageText.trim()}
                  >
                    Analyze Pasted Page Text
                  </button>
                </div>
                <label>
                  Pasted visible page text
                  <textarea
                    className="large-textarea"
                    value={row.pastedVisiblePageText}
                    onChange={(event) =>
                      updateRow(row.id, {
                        ...row,
                        pastedVisiblePageText: event.target.value,
                      })
                    }
                    placeholder="Paste visible business name, services, packages, location, contact, reviews, or profile text from the public listing page."
                  />
                  <span className="helper-text">
                    If the page is visible in your browser but blocked from
                    scanner fetch, copy relevant visible text from the listing
                    page and paste it here. The scanner can compare this pasted
                    text against the business profile.
                  </span>
                </label>
              </div>
            ) : null}

            <details className="directory-details">
              <summary>Detailed public check fields</summary>
              <div className="directory-row-grid">
                <label>
                  Directory type
                  <select
                    value={row.directoryType}
                    onChange={(event) =>
                      updateRow(row.id, {
                        ...row,
                        directoryType: event.target.value as DirectoryType,
                      })
                    }
                  >
                    {directoryTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Current status
                  <input
                    value={directoryStatusLabel(
                      row.listingResult ?? row.directoryStatus,
                    )}
                    readOnly
                  />
                </label>
                <label>
                  Public page fetch allowed
                  <input
                    value={effectivePublicPageCheckEligibility(row)}
                    readOnly
                  />
                </label>
                <label>
                  URL discovery method
                  <input value={effectiveUrlDiscoveryMethod(row)} readOnly />
                </label>
                <label>
                  Search result scraping
                  <input value="Disabled" readOnly />
                </label>
                <label>
                  Owner/admin access method
                  <input value={row.ownerAdminAccessMethod} readOnly />
                </label>
              </div>

              <div className="directory-check-grid">
                {foundDataRows.map((field) => (
                  <label key={`${row.id}-found-${field.key}`}>
                    Scanner-detected: {field.label}
                    <select
                      value={row.foundData?.[field.key] ?? 'No'}
                      onChange={(event) =>
                        updateRow(row.id, {
                          ...row,
                          foundData: {
                            ...(row.foundData ?? {}),
                            [field.key]: event.target.value as DirectoryFoundSignal,
                          },
                        })
                      }
                    >
                      {foundSignalOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {checkFields.map((field) => (
                  <label key={`${row.id}-${field.key}`}>
                    {field.label}
                    <select
                      value={row[field.key]}
                      onChange={(event) =>
                        updateRow(row.id, {
                          ...row,
                          [field.key]: event.target.value as CheckStatus,
                        })
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="directory-row-grid">
                <label>
                  Business record key
                  <input value={row.businessId || businessId} readOnly />
                </label>
                <label>
                  Package fit
                  <input value={row.packageFit} readOnly />
                </label>
                <label>
                  Priority
                  <input value={row.priority} readOnly />
                </label>
              </div>
            </details>

            <div className="directory-actions">
              {row.manualSearchUrl ? (
                <a href={row.manualSearchUrl} target="_blank" rel="noreferrer">
                  Manual search
                </a>
              ) : null}
              {canShowDiscoveryAssist(row.checkMethod, row.listingUrlStatus) ||
              row.listingUrlStatus === 'url_saved' ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void runCandidateDiscoveryForRow(row)}
                  disabled={candidateLoadingId === row.id}
                >
                  {candidateLoadingId === row.id
                    ? 'Finding Candidates...'
                    : row.listingUrlStatus === 'url_saved'
                      ? 'Edit URL'
                      : 'Find Candidate Listing URLs'}
                </button>
              ) : null}
              {row.listingUrlStatus === 'url_saved' && row.listingUrl ? (
                <>
                  <a href={row.listingUrl} target="_blank" rel="noreferrer">
                    Open saved URL
                  </a>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => markPublicPageObserved(row)}
                  >
                    Mark as Public Page Observed
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => clearListingUrl(row)}
                  >
                    Clear URL
                  </button>
                </>
              ) : null}
              {canRunPublicPageCheck(row) ? (
                <button
                  type="button"
                  onClick={() => void runRowPublicPageCheck(row)}
                  disabled={checkingRowId === row.id}
                >
                  {checkingRowId === row.id
                    ? 'Running Public Page Check...'
                    : 'Run Public Page Check'}
                </button>
              ) : null}
              <button type="button" onClick={() => onAddToActionPlan(row)}>
                Add to Action Plan
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  onChange({
                    ...state,
                    activeRows: state.activeRows.filter(
                      (activeRow) => activeRow.id !== row.id,
                    ),
                  })
                }
              >
                Remove active row
              </button>
            </div>
          </article>
        ))}
        {currentRows.length === 0 ? (
          <p className="empty-state">
            Activate a suggested directory or add a custom directory to begin
            scoring optional directory checks.
          </p>
        ) : null}
      </div>
    </section>
  )
}
