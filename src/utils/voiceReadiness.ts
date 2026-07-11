import type {
  AuditItem,
  BusinessProfile,
  CheckStatus,
  VoicePersonalizationRisk,
  VoicePlatformTested,
  VoicePromptTestState,
  VoicePromptTestStatus,
  VoiceTestDeviceContext,
} from '../types/audit'

export interface VoiceReadinessCategory {
  id: string
  label: string
  description: string
  sourceSection: string
  weight: number
  suggestedStatus: CheckStatus
  suggestedReason: string
  recommendedAction: string
  packageFit: VoicePromptTestState['packageFit']
}

export type VoiceSourceReadinessGroup = VoiceReadinessCategory

export interface VoicePrompt {
  id: string
  prompt: string
  intent: string
  priority: 'High' | 'Medium' | 'Low'
  recommendedAction: string
  packageFit: VoicePromptTestState['packageFit']
}

const splitList = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

const firstService = (profile: BusinessProfile) =>
  splitList(profile.primaryServices)[0] ||
  splitList(profile.industryTags)[0] ||
  profile.primaryCategory ||
  'local service'

const secondService = (profile: BusinessProfile) =>
  splitList(profile.primaryServices)[1] || firstService(profile)

const city = (profile: BusinessProfile) =>
  profile.localMarket || profile.targetLocation || splitList(profile.serviceArea)[0] || ''

const hasContactClarity = (profile: BusinessProfile) =>
  Boolean(profile.phone.trim()) ||
  (profile.phoneNumbers ?? []).some(
    (record) => record.isValidPublicContact && record.number.trim(),
  )

const hasMultiContactContext = (profile: BusinessProfile) =>
  (profile.phoneNumbers ?? []).filter(
    (record) => record.isValidPublicContact && record.number.trim(),
  ).length <= 1 || Boolean(profile.contactStructureNote.trim())

const aggregateSourceStatus = (
  primaryStatus: CheckStatus | undefined,
  supportingStatuses: Array<CheckStatus | undefined>,
): CheckStatus => {
  if (!primaryStatus || primaryStatus === 'unknown') return 'unknown'
  const checkedSupportingStatuses = supportingStatuses.filter(
    (status): status is CheckStatus => Boolean(status) && status !== 'unknown',
  )
  if (
    primaryStatus === 'fail' ||
    checkedSupportingStatuses.some((status) => status === 'fail')
  ) {
    return 'fail'
  }
  if (
    primaryStatus === 'partial' ||
    checkedSupportingStatuses.some((status) => status === 'partial') ||
    checkedSupportingStatuses.length < Math.min(supportingStatuses.length, 2)
  ) {
    return 'partial'
  }
  return 'pass'
}

export const defaultVoicePromptTest = (
  prompt?: VoicePrompt,
): VoicePromptTestState => ({
  testStatus: 'not_tested',
  platformTested: 'Other/manual',
  deviceContext: "Operator's normal device/account",
  personalizationRisk: 'High',
  evidenceNotes: '',
  evidenceConfidence: 'manual_needs_confirmation',
  packageFit: prompt?.packageFit ?? 'Starter Visibility Cleanup',
  recommendedAction:
    prompt?.recommendedAction ??
    'Clarify public listing, website, service, location, contact, FAQ, and structured data signals so voice-style answers can resolve the business more accurately.',
})

export const buildVoiceSourceReadinessGroups = (
  profile: BusinessProfile,
  checks: Record<string, CheckStatus>,
): VoiceSourceReadinessGroup[] => {
  const categories = buildVoiceReadinessCategories(profile, checks)
  const categoryStatus = (id: string) =>
    checks[id] ?? categories.find((category) => category.id === id)?.suggestedStatus

  const googleStatus = aggregateSourceStatus(checks['listing-google'], [
    categoryStatus('voice-listings'),
    categoryStatus('voice-reviews'),
    checks['website-homepage-clarity'],
    checks['website-local-content'],
    categoryStatus('voice-structured-data'),
  ])
  const appleStatus = aggregateSourceStatus(checks['listing-apple'], [
    categoryStatus('voice-contact'),
    categoryStatus('voice-hours'),
    categoryStatus('voice-service-category'),
    categoryStatus('voice-location'),
  ])
  const yelpStatus = aggregateSourceStatus(checks['listing-yelp'], [
    categoryStatus('voice-reviews'),
    categoryStatus('voice-service-category'),
    checks['website-homepage-clarity'],
    categoryStatus('voice-listings'),
  ])

  return [
    {
      id: 'voice-source-google-assistant',
      label: 'Google/Assistant readiness',
      description:
        'Summarizes readiness signals commonly associated with Google Business Profile, Maps, reviews, website clarity, and structured data.',
      sourceSection: 'Listings / Website SEO / Search Visibility',
      weight: 14,
      suggestedStatus: googleStatus,
      suggestedReason:
        checks['listing-google'] && checks['listing-google'] !== 'unknown'
          ? 'Derived from Google Business Profile / Maps, listing consistency, reviews, website clarity, and schema signals.'
          : 'Needs review - complete Google Business Profile / Google Maps checks first.',
      recommendedAction:
        'Verify Google Business Profile and Maps details, improve review/listing completeness, strengthen service/location website signals, and add or improve LocalBusiness/ProfessionalService schema.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-source-apple-siri',
      label: 'Apple/Siri readiness',
      description:
        'Summarizes readiness signals tied to Apple Business / Apple Maps, contact clarity, hours, category, and service-area signals.',
      sourceSection: 'Listings / Business Settings',
      weight: 14,
      suggestedStatus: appleStatus,
      suggestedReason:
        checks['listing-apple'] && checks['listing-apple'] !== 'unknown'
          ? 'Derived from Apple Business / Apple Maps status, contact clarity, hours, category/service clarity, and location/service-area signals.'
          : 'Needs review - complete Apple Business / Apple Maps checks first.',
      recommendedAction:
        'Verify Apple Business / Apple Maps, clarify primary contact details, hours or appointment availability, service category, and location/service-area wording.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-source-alexa-yelp',
      label: 'Alexa/Yelp-style readiness',
      description:
        'Summarizes readiness for Yelp-style local source signals without claiming exact Alexa data sourcing.',
      sourceSection: 'Listings / Website SEO',
      weight: 12,
      suggestedStatus: yelpStatus,
      suggestedReason:
        checks['listing-yelp'] && checks['listing-yelp'] !== 'unknown'
          ? 'Derived from Yelp listing status, review/listing strength, category/service clarity, website clarity, and general listing consistency.'
          : 'Needs review - complete Yelp and review/listing checks first.',
      recommendedAction:
        'Verify the Yelp listing where relevant, improve review/listing completeness, align category/service details, and strengthen owned website clarity.',
      packageFit: 'Starter Visibility Cleanup',
    },
  ]
}

export const buildVoiceReadinessCategories = (
  profile: BusinessProfile,
  checks: Record<string, CheckStatus>,
): VoiceReadinessCategory[] => {
  const serviceAreaPresent = Boolean(
    profile.localMarket.trim() ||
      profile.targetLocation.trim() ||
      profile.serviceArea.trim(),
  )
  const servicePresent = Boolean(
    profile.primaryCategory.trim() ||
      profile.primaryServices.trim() ||
      profile.industryTags.trim(),
  )
  const listingStatuses = [
    checks['listing-google'],
    checks['listing-apple'],
    checks['listing-bing'],
    checks['listing-yelp'],
    checks['listing-facebook-instagram'],
  ]
  const knownListingCount = listingStatuses.filter(
    (status) => status && status !== 'unknown',
  ).length
  const weakListingCount = listingStatuses.filter(
    (status) => status === 'fail' || status === 'partial',
  ).length
  const failedListingCount = listingStatuses.filter(
    (status) => status === 'fail',
  ).length
  const searchVisibilityStatuses = [
    checks['search-core-service-city'],
    checks['search-service-nearby-city'],
    checks['search-service-area'],
    checks['search-category-city'],
  ]
  const checkedSearchVisibilityCount = searchVisibilityStatuses.filter(
    (status) => status && status !== 'unknown',
  ).length
  const weakSearchVisibilityCount = searchVisibilityStatuses.filter(
    (status) => status === 'partial' || status === 'fail',
  ).length

  const listingConsistencyStatus: CheckStatus =
    knownListingCount === 0
      ? 'unknown'
      : failedListingCount >= 2 || checks['listing-google'] === 'fail'
        ? 'fail'
        : weakListingCount > 0 || knownListingCount < 3
          ? 'partial'
          : 'pass'
  const reviewStrengthStatus: CheckStatus =
    knownListingCount === 0
      ? 'unknown'
      : checks['listing-google'] === 'pass' || checks['listing-yelp'] === 'pass'
        ? 'pass'
        : weakListingCount > 0
          ? 'partial'
          : 'unknown'
  const searchDiscoveryStatus: CheckStatus =
    checkedSearchVisibilityCount === 0
      ? 'unknown'
      : weakSearchVisibilityCount === 0
        ? 'pass'
        : searchVisibilityStatuses.some((status) => status === 'fail')
          ? 'fail'
          : 'partial'

  return [
    {
      id: 'voice-identity',
      label: 'Business identity clarity',
      description:
        'Can public sources clearly connect the business name, website, and local identity?',
      sourceSection: 'Business Settings',
      weight: 10,
      suggestedStatus:
        profile.businessName.trim() && profile.website.trim() ? 'pass' : 'partial',
      suggestedReason: 'Derived from business name and website fields.',
      recommendedAction:
        'Align the official business name across the website, major listings, social profiles, and directory citations.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-contact',
      label: 'Contact/phone clarity',
      description:
        'Are phone/contact paths clear enough for voice-style contact requests?',
      sourceSection: 'Business Settings',
      weight: 12,
      suggestedStatus:
        hasContactClarity(profile) && hasMultiContactContext(profile)
          ? 'pass'
          : hasContactClarity(profile)
            ? 'partial'
            : 'fail',
      suggestedReason:
        'Derived from phone fields and contact structure documentation.',
      recommendedAction:
        'Clarify phone/contact details on the website and listings. If multiple valid numbers exist, label each contact path and choose one preferred listing number where required.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-location',
      label: 'Location/service-area clarity',
      description:
        'Can voice-style local searches understand where the business is relevant?',
      sourceSection: 'Business Settings',
      weight: 12,
      suggestedStatus: serviceAreaPresent ? 'pass' : 'fail',
      suggestedReason:
        'Derived from local market, target location, and service-area fields.',
      recommendedAction:
        'Add clearer city, service-area, and nearby-market language to the website, listings, and supporting profiles.',
      packageFit: 'Website SEO Implementation',
    },
    {
      id: 'voice-hours',
      label: 'Hours/availability clarity',
      description:
        'Are hours, booking availability, or appointment expectations clear?',
      sourceSection: 'Business Settings / Website SEO',
      weight: 8,
      suggestedStatus: 'unknown',
      suggestedReason:
        'Hours are not automatically verified in v02. Review website and listings manually.',
      recommendedAction:
        'Clarify hours, booking availability, appointment expectations, or response times on the website and major listings.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-service-category',
      label: 'Service/category clarity',
      description:
        'Are core services and categories clear enough for conversational service questions?',
      sourceSection: 'Business Settings / Website SEO',
      weight: 12,
      suggestedStatus: servicePresent ? 'pass' : 'partial',
      suggestedReason:
        'Derived from primary category, primary services, and industry tags.',
      recommendedAction:
        'Strengthen service/category wording on the homepage, service pages, listings, and structured data.',
      packageFit: 'Website SEO Implementation',
    },
    {
      id: 'voice-listings',
      label: 'Listing consistency',
      description:
        'Are major listing signals likely consistent enough for voice assistants to trust?',
      sourceSection: 'Listings',
      weight: 12,
      suggestedStatus: listingConsistencyStatus,
      suggestedReason:
        knownListingCount === 0
          ? 'Needs review - complete Listings checks first.'
          : 'Derived from Listings section.',
      recommendedAction:
        'Clean up Google, Apple, Bing, and major public listing details for consistent name, contact, website, category, and service-area signals.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-search-discovery',
      label: 'Search-style voice discovery',
      description:
        'Do service and location search observations suggest the business can be discovered for voice-style local questions?',
      sourceSection: 'Search Visibility',
      weight: 10,
      suggestedStatus: searchDiscoveryStatus,
      suggestedReason:
        checkedSearchVisibilityCount === 0
          ? 'Needs review - complete Search Visibility checks first.'
          : 'Derived from Search Visibility service/location query observations.',
      recommendedAction:
        'Strengthen service/location pages, listing categories, reviews, citations, and local proof for weak service-area searches.',
      packageFit: 'Website SEO Implementation',
    },
    {
      id: 'voice-reviews',
      label: 'Review/listing strength',
      description:
        'Do reviews/listing profiles provide enough corroborating public proof?',
      sourceSection: 'Listings',
      weight: 8,
      suggestedStatus: reviewStrengthStatus,
      suggestedReason:
        knownListingCount === 0
          ? 'Needs review - review strength still requires manual listing review.'
          : 'Derived from Listings section review/profile checks where available.',
      recommendedAction:
        'Improve review profile completeness, photo proof, service descriptions, and review recency where appropriate.',
      packageFit: 'Monthly Visibility Monitoring',
    },
    {
      id: 'voice-faq-content',
      label: 'FAQ/conversational content',
      description:
        'Does the website answer natural questions customers might ask by voice?',
      sourceSection: 'Website SEO',
      weight: 10,
      suggestedStatus:
        checks['website-faq'] === 'pass'
          ? 'pass'
          : checks['website-faq'] === 'fail'
            ? 'partial'
            : 'unknown',
      suggestedReason: 'Derived from Website SEO FAQ/conversational content findings.',
      recommendedAction:
        'Add FAQ content that answers service, location, pricing, booking, availability, and contact questions in natural language.',
      packageFit: 'Website SEO Implementation',
    },
    {
      id: 'voice-structured-data',
      label: 'Structured data support',
      description:
        'Does structured data help systems understand the business, services, contact path, and local relevance?',
      sourceSection: 'Website SEO',
      weight: 10,
      suggestedStatus:
        checks['website-schema'] === 'pass'
          ? 'pass'
          : checks['website-schema'] === 'fail'
            ? 'partial'
            : 'unknown',
      suggestedReason:
        checks['website-schema']
          ? 'Derived from Website SEO schema findings.'
          : 'Needs review - run or review Website SEO schema findings first.',
      recommendedAction:
        'Add or improve LocalBusiness/ProfessionalService, FAQ, service, image, and contact structured data.',
      packageFit: 'Website SEO Implementation',
    },
  ]
}

export const buildVoicePromptTests = (profile: BusinessProfile): VoicePrompt[] => {
  const service = firstService(profile)
  const alternateService = secondService(profile)
  const place = city(profile)

  const prompts: VoicePrompt[] = [
    {
      id: 'voice-prompt-service-near-city',
      prompt: `Find a ${service} near ${place}.`,
      intent: 'Service discovery',
      priority: 'High',
      recommendedAction:
        'Strengthen service/location wording, listings, reviews, and local content so this service query can resolve the business more clearly.',
      packageFit: 'Website SEO Implementation',
    },
    {
      id: 'voice-prompt-service-area',
      prompt: `Who does ${alternateService} near ${place}?`,
      intent: 'Service-area discovery',
      priority: 'High',
      recommendedAction:
        'Improve service-area and service-specific signals across the website and listings.',
      packageFit: 'Website SEO Implementation',
    },
    {
      id: 'voice-prompt-brand-service',
      prompt: `Does ${profile.businessName} offer ${service}?`,
      intent: 'Brand service question',
      priority: 'Medium',
      recommendedAction:
        'Make service offerings easy to confirm on the website, listings, schema, and FAQ content.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-prompt-call-business',
      prompt: `Call ${profile.businessName}.`,
      intent: 'Contact action',
      priority: 'High',
      recommendedAction:
        'Clarify phone/contact paths in listings and website content so voice-style contact actions resolve correctly.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-prompt-location',
      prompt: `Where is ${profile.businessName} located?`,
      intent: 'Location question',
      priority: 'Medium',
      recommendedAction:
        'Clarify location, service area, appointment model, and local market language across public sources.',
      packageFit: 'Starter Visibility Cleanup',
    },
    {
      id: 'voice-prompt-hours',
      prompt: `What are the hours for ${profile.businessName}?`,
      intent: 'Availability question',
      priority: 'Low',
      recommendedAction:
        'Clarify hours, appointment availability, response time, or booking expectations on public sources.',
      packageFit: 'Starter Visibility Cleanup',
    },
  ]

  return prompts.filter((item) => item.prompt.replace(/[?.]/g, '').trim().length > 5)
}

export const voiceCategoryToAuditItem = (
  category: VoiceReadinessCategory,
): AuditItem => ({
  id: category.id,
  area: 'voice',
  label: category.label,
  description: category.description,
  weight: category.weight,
  access: 'public',
  evidenceLinks: [],
  fix: category.recommendedAction,
})

export const voicePromptToAuditItem = (prompt: VoicePrompt): AuditItem => ({
  id: prompt.id,
  area: 'voice',
  label: prompt.prompt,
  description:
    'Manual voice-style prompt test. Ask this prompt in a voice assistant or manual assistant context and record what was observed. Do not claim direct submission or exact ranking.',
  weight: prompt.priority === 'High' ? 8 : prompt.priority === 'Medium' ? 6 : 4,
  access: 'public',
  evidenceLinks: [],
  fix: prompt.recommendedAction,
})

export const voicePromptStatusToCheckStatus = (
  status: VoicePromptTestStatus,
): CheckStatus => {
  if (status === 'business_found_accurate') return 'pass'
  if (status === 'business_found_incomplete') return 'partial'
  if (status === 'wrong_outdated' || status === 'not_found') return 'fail'
  return 'unknown'
}

export const voicePromptStatusLabel = (status: VoicePromptTestStatus) => {
  if (status === 'business_found_accurate') return 'Business found / accurate'
  if (status === 'business_found_incomplete') return 'Business found / incomplete'
  if (status === 'wrong_outdated') return 'Wrong or outdated info'
  if (status === 'not_found') return 'Not found'
  return 'Not tested'
}

export const voicePlatforms: VoicePlatformTested[] = [
  'Siri / Apple',
  'Google Assistant / Android',
  'Alexa',
  'Other/manual',
]

export const voiceDeviceContexts: VoiceTestDeviceContext[] = [
  "Operator's normal device/account",
  'Neutral/private device',
  'Different-account device',
  'Business owner/customer device',
  'Other/manual',
]

export const voicePersonalizationRisks: VoicePersonalizationRisk[] = [
  'Low',
  'Medium',
  'High',
]

export const personalizationRiskForDeviceContext = (
  context: VoiceTestDeviceContext,
): VoicePersonalizationRisk => {
  if (context === 'Neutral/private device') return 'Low'
  if (
    context === 'Different-account device' ||
    context === 'Business owner/customer device'
  ) {
    return 'Medium'
  }
  return 'High'
}
