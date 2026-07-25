import type { BusinessProfile } from '../types/audit'
import type {
  AutoAuditMapping,
  ManualWebsiteObservation,
  WebsiteAuditResponse,
  WebsiteAuditResult,
} from '../types/websiteAudit'

const splitCsv = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const isWebsiteAuditResult = (value: unknown): value is WebsiteAuditResult => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.fetchedUrl === 'string' &&
    typeof record.homepageStatus === 'number' &&
    typeof record.analyzedAt === 'string'
  )
}

const note = (label: string, value: string | string[] | boolean | number) => {
  const rendered = Array.isArray(value)
    ? value.length > 0
      ? value.join('; ')
      : 'None found'
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : String(value || 'None found')

  return `${label}: ${rendered}`
}

const validProfilePhoneNumbers = (profile: BusinessProfile) =>
  (profile.phoneNumbers ?? []).filter(
    (record) => record.isValidPublicContact && record.number.trim(),
  )

const hasDocumentedMultiContactSetup = (profile: BusinessProfile) =>
  validProfilePhoneNumbers(profile).length > 1 ||
  Boolean(profile.contactStructureNote?.trim())

const contactStructureEvidence = (
  result: WebsiteAuditResult,
  profile: BusinessProfile,
) => {
  if (!hasDocumentedMultiContactSetup(profile)) {
    return note('Phone/contact interpretation', result.phoneNumberMatches)
  }

  return [
    'Phone/contact interpretation: Multiple valid contact numbers - verify clarity.',
    'Multiple phone numbers are listed. Based on the business profile, these appear to be valid owner/contact numbers rather than conflicting NAP data. The recommended cleanup is to make the contact structure clear for customers, search engines, maps, and AI tools.',
    note('Contact structure note', profile.contactStructureNote),
    note(
      'Valid public contact numbers',
      validProfilePhoneNumbers(profile).map((record) =>
        `${record.label || 'Contact'}: ${record.number} (${record.role || 'valid public contact'})`,
      ),
    ),
    note('Phone matches found on homepage', result.phoneNumberMatches),
  ].join('\n')
}

const titleStatus = (result: WebsiteAuditResult, profile: BusinessProfile) => {
  const title = result.title.toLowerCase()
  const hasBusiness = title.includes(profile.businessName.toLowerCase())
  const hasArea = splitCsv(profile.serviceArea).some((area) =>
    title.includes(area.toLowerCase()),
  )
  const hasService = splitCsv(profile.primaryServices).some((service) =>
    title.includes(service.toLowerCase()),
  )

  if (hasBusiness && (hasArea || hasService)) return 'pass'
  if (result.title) return 'partial'
  return 'fail'
}

const schemaStatus = (result: WebsiteAuditResult) => {
  const localTypes = result.detectedSchemaTypes.filter((type) =>
    /LocalBusiness|ProfessionalService|Organization|Place/i.test(type),
  )
  if (localTypes.length > 0) return 'pass'
  if (result.detectedSchemaTypes.length > 0) return 'partial'
  return 'fail'
}

const hasLocalSchema = (result: WebsiteAuditResult) =>
  result.detectedSchemaTypes.some((type) =>
    /LocalBusiness|ProfessionalService|Organization|Place/i.test(type),
  )

const homepageClarityStatus = (
  result: WebsiteAuditResult,
  profile: BusinessProfile,
) => {
  const title = result.title.toLowerCase()
  const meta = result.metaDescription.toLowerCase()
  const services = splitCsv(profile.primaryServices)
  const areas = splitCsv(profile.serviceArea)
  const hasServiceInTitleOrMeta = services.some(
    (service) =>
      title.includes(service.toLowerCase()) ||
      meta.includes(service.toLowerCase()),
  )
  const hasAreaInTitleOrMeta = areas.some(
    (area) =>
      title.includes(area.toLowerCase()) || meta.includes(area.toLowerCase()),
  )

  const signalCount = [
    titleStatus(result, profile) !== 'fail',
    result.metaDescription.length >= 70,
    result.businessNameFound,
    result.phoneNumberMatches.length > 0,
    result.servicePhraseMatches.length > 0,
    result.serviceAreaPhraseMatches.length > 0,
    result.hasContactLink,
    result.serviceLinks.length > 0,
    hasLocalSchema(result),
    result.faqIndicators.length > 0,
    hasServiceInTitleOrMeta,
    hasAreaInTitleOrMeta,
  ].filter(Boolean).length

  const hasCoreContext =
    result.businessNameFound &&
    result.servicePhraseMatches.length > 0 &&
    result.serviceAreaPhraseMatches.length > 0 &&
    (result.phoneNumberMatches.length > 0 || result.hasContactLink)

  if (signalCount >= 7 && hasCoreContext) return 'pass'
  if (signalCount >= 4 || result.servicePhraseMatches.length > 0) {
    return 'partial'
  }
  return 'fail'
}

export const mapAutoAuditToWebsiteChecks = (
  result: WebsiteAuditResult,
  profile: BusinessProfile,
): AutoAuditMapping => {
  const serviceCount = splitCsv(profile.primaryServices).length
  const areaCount = splitCsv(profile.serviceArea).length
  const serviceMatches = result.servicePhraseMatches.length
  const areaMatches = result.serviceAreaPhraseMatches.length
  const hasMeta = result.metaDescription.length >= 70
  const hasFaq = result.faqIndicators.length > 0
  const statuses: AutoAuditMapping['statuses'] = {
    'website-title': titleStatus(result, profile),
    'website-meta-description': hasMeta
      ? 'pass'
      : result.metaDescription
        ? 'partial'
        : 'fail',
    'website-homepage-clarity': homepageClarityStatus(result, profile),
    'website-service-pages':
      serviceMatches >= Math.min(3, serviceCount)
        ? 'pass'
        : serviceMatches > 0
          ? 'partial'
          : 'fail',
    'website-local-content':
      areaMatches >= Math.min(2, areaCount)
        ? 'pass'
        : areaMatches > 0
          ? 'partial'
          : 'fail',
    'website-schema': schemaStatus(result),
    'website-faq': hasFaq ? 'pass' : 'fail',
    'website-mobile-conversion':
      result.phoneNumberMatches.length > 0 && result.hasContactLink
        ? 'pass'
        : result.phoneNumberMatches.length > 0 || result.hasContactLink
          ? 'partial'
          : 'fail',
    'website-social-links':
      result.socialProfileLinks.length >= 2
        ? 'pass'
        : result.socialProfileLinks.length === 1
          ? 'partial'
          : 'fail',
    'website-sitemap-robots': result.sitemapAvailable && result.robotsAvailable
      ? 'pass'
      : result.sitemapAvailable || result.robotsAvailable
        ? 'partial'
        : 'fail',
  }

  const notes: AutoAuditMapping['notes'] = {
    'website-title': [
      note('Title', result.title),
      note('Canonical', result.canonicalUrl),
    ].join('\n'),
    'website-meta-description': note(
      'Meta description',
      result.metaDescription,
    ),
    'website-homepage-clarity': [
      note('Page title found', result.title),
      note('Meta description found', result.metaDescription),
      note('Business name found', result.businessNameFound),
      contactStructureEvidence(result, profile),
      note('Service terms found', result.servicePhraseMatches),
      note('Location/service-area terms found', result.serviceAreaPhraseMatches),
      note('Dedicated service navigation/links found', result.serviceLinks),
      note('Schema types found', result.detectedSchemaTypes),
      note('FAQ indicators found', result.faqIndicators),
      note('H1 headings found (supporting evidence only)', result.h1Text),
      note('H2 headings found (supporting evidence only)', result.h2Text.slice(0, 8)),
    ].join('\n'),
    'website-service-pages': note(
      'Service phrases found on homepage',
      result.servicePhraseMatches,
    ),
    'website-local-content': note(
      'Service-area phrases found on homepage',
      result.serviceAreaPhraseMatches,
    ),
    'website-schema': [
      note('Detected schema types', result.detectedSchemaTypes),
      note('JSON-LD block count', result.jsonLdSchemaBlocks.length),
    ].join('\n'),
    'website-faq': note('FAQ indicators', result.faqIndicators),
    'website-mobile-conversion': [
      contactStructureEvidence(result, profile),
      note('Contact or booking links', result.contactLinks),
    ].join('\n'),
    'website-social-links': note(
      'Social profile links',
      result.socialProfileLinks,
    ),
    'website-sitemap-robots': [
      note('Sitemap available', result.sitemapAvailable),
      note('Robots.txt available', result.robotsAvailable),
    ].join('\n'),
  }

  if (hasFaq) {
    statuses['website-schema'] =
      statuses['website-schema'] === 'fail' ? 'partial' : statuses['website-schema']
    notes['website-schema'] += `\n${note('FAQ indicators', result.faqIndicators)}`
  }

  return { statuses, notes }
}

const normalizeDigits = (value: string) => value.replace(/\D/g, '')

const containsAny = (haystack: string, needles: string[]) =>
  needles.some((needle) => needle && haystack.includes(needle.toLowerCase()))

const manualNote = (label: string, value: string | string[] | boolean) =>
  note(
    label,
    Array.isArray(value)
      ? value
      : typeof value === 'boolean'
        ? value
        : value || 'Not observed',
  )

export const analyzeManualWebsiteObservation = (
  observation: ManualWebsiteObservation,
  profile: BusinessProfile,
): AutoAuditMapping => {
  const services = [
    ...splitCsv(profile.primaryServices),
    ...splitCsv(profile.industryTags),
    profile.primaryCategory,
  ].filter(Boolean)
  const areas = [
    ...splitCsv(profile.serviceArea),
    profile.localMarket,
    profile.targetLocation,
  ].filter(Boolean)
  const phoneNumbers = [
    profile.phone,
    ...validProfilePhoneNumbers(profile).map((record) => record.number),
  ].filter(Boolean)
  const links = observation.observedLinks
    .split(/\n|,/)
    .map((link) => link.trim())
    .filter(Boolean)
  const combined = [
    observation.observedTitle,
    observation.observedMetaDescription,
    observation.visibleHomepageText,
    observation.observedLinks,
    observation.observedSchemaSnippet,
    observation.notes,
  ]
    .join(' ')
    .toLowerCase()
  const visibleCombined = [
    observation.observedTitle,
    observation.observedMetaDescription,
    observation.visibleHomepageText,
    observation.observedLinks,
    observation.notes,
  ]
    .join(' ')
    .toLowerCase()
  const schemaText = observation.observedSchemaSnippet.toLowerCase()
  const phoneFound = phoneNumbers.some((phone) => {
    const digits = normalizeDigits(phone)
    return digits.length >= 7 && normalizeDigits(combined).includes(digits)
  })
  const serviceMatches = services.filter((service) =>
    visibleCombined.includes(service.toLowerCase()),
  )
  const areaMatches = areas.filter((area) =>
    visibleCombined.includes(area.toLowerCase()),
  )
  const businessNameFound =
    profile.businessName &&
    visibleCombined.includes(profile.businessName.toLowerCase())
  const websiteDomain = (() => {
    try {
      return new URL(profile.website).hostname.replace(/^www\./, '')
    } catch {
      return profile.website.replace(/^https?:\/\//, '').replace(/^www\./, '')
    }
  })().toLowerCase()
  const websiteDomainFound =
    Boolean(websiteDomain) && visibleCombined.includes(websiteDomain)
  const contactLinkFound = links.some((link) =>
    /contact|booking|inquire|call|tel:/i.test(link),
  )
  const serviceLinkMatches = links.filter((link) =>
    services.some((service) => {
      const normalizedService = service.toLowerCase().replace(/\s+/g, '-')
      return link.toLowerCase().includes(normalizedService)
    }),
  )
  const faqFound = /\bfaq\b|frequently asked questions|\?/.test(visibleCombined)
  const localSchemaFound =
    /localbusiness|professionalservice|organization|@type|application\/ld\+json/.test(
      schemaText,
    )
  const socialLinks = links.filter((link) =>
    /facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com|x\.com|twitter\.com/i.test(
      link,
    ),
  )
  const titleLower = observation.observedTitle.toLowerCase()
  const metaLower = observation.observedMetaDescription.toLowerCase()
  const titleHasContext =
    Boolean(observation.observedTitle) &&
    (businessNameFound ||
      containsAny(titleLower, services) ||
      containsAny(titleLower, areas))
  const metaHasContext =
    observation.observedMetaDescription.length >= 70 &&
    (containsAny(metaLower, services) || containsAny(metaLower, areas))
  const claritySignals = [
    titleHasContext,
    metaHasContext,
    businessNameFound,
    websiteDomainFound,
    phoneFound || contactLinkFound,
    serviceMatches.length > 0,
    areaMatches.length > 0,
    serviceLinkMatches.length > 0,
    faqFound,
    localSchemaFound,
  ].filter(Boolean).length

  const sourcePrefix = 'Based on operator-provided website observation.'
  const statuses: AutoAuditMapping['statuses'] = {
    'website-title': titleHasContext
      ? 'pass'
      : observation.observedTitle
        ? 'partial'
        : 'fail',
    'website-meta-description': metaHasContext
      ? 'pass'
      : observation.observedMetaDescription
        ? 'partial'
        : 'fail',
    'website-homepage-clarity':
      claritySignals >= 7
        ? 'pass'
        : claritySignals >= 4
          ? 'partial'
          : 'fail',
    'website-service-pages':
      serviceMatches.length >= Math.min(3, services.length)
        ? 'pass'
        : serviceMatches.length > 0 || serviceLinkMatches.length > 0
          ? 'partial'
          : 'fail',
    'website-local-content':
      areaMatches.length >= Math.min(2, areas.length)
        ? 'pass'
        : areaMatches.length > 0
          ? 'partial'
          : 'fail',
    'website-schema': localSchemaFound
      ? 'partial'
      : observation.observedSchemaSnippet
        ? 'fail'
        : 'partial',
    'website-faq': faqFound ? 'pass' : 'fail',
    'website-mobile-conversion':
      phoneFound && contactLinkFound
        ? 'pass'
        : phoneFound || contactLinkFound
          ? 'partial'
          : 'fail',
    'website-social-links':
      socialLinks.length >= 2 ? 'pass' : socialLinks.length === 1 ? 'partial' : 'fail',
    'website-sitemap-robots': 'partial',
  }

  const notes: AutoAuditMapping['notes'] = {
    'website-title': [
      sourcePrefix,
      manualNote('Observed page title', observation.observedTitle),
    ].join('\n'),
    'website-meta-description': [
      sourcePrefix,
      manualNote(
        'Observed meta description',
        observation.observedMetaDescription,
      ),
    ].join('\n'),
    'website-homepage-clarity': [
      sourcePrefix,
      manualNote('Business name observed', Boolean(businessNameFound)),
      manualNote('Website/domain observed', Boolean(websiteDomainFound)),
      manualNote('Phone/contact observed', Boolean(phoneFound)),
      manualNote('Service terms observed', serviceMatches),
      manualNote('Location/service-area terms observed', areaMatches),
      manualNote('Contact links observed', Boolean(contactLinkFound)),
      manualNote('Service links observed', serviceLinkMatches),
      manualNote('FAQ indicators observed', Boolean(faqFound)),
      manualNote('Schema/source snippet provided', Boolean(observation.observedSchemaSnippet)),
      observation.notes ? `Operator notes: ${observation.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    'website-service-pages': [
      sourcePrefix,
      manualNote('Service terms observed', serviceMatches),
      manualNote('Observed service/internal links', serviceLinkMatches),
    ].join('\n'),
    'website-local-content': [
      sourcePrefix,
      manualNote('Location/service-area terms observed', areaMatches),
    ].join('\n'),
    'website-schema': [
      sourcePrefix,
      observation.observedSchemaSnippet
        ? 'Schema/source snippet was provided for manual review.'
        : 'No schema/source snippet was provided, so schema is not verified by this manual observation.',
    ].join('\n'),
    'website-faq': [
      sourcePrefix,
      manualNote('FAQ indicators observed', Boolean(faqFound)),
    ].join('\n'),
    'website-mobile-conversion': [
      sourcePrefix,
      manualNote('Phone/contact observed', Boolean(phoneFound)),
      manualNote('Contact links observed', Boolean(contactLinkFound)),
      hasDocumentedMultiContactSetup(profile)
        ? contactStructureEvidence(
            {
              phoneNumberMatches: phoneFound ? phoneNumbers : [],
            } as WebsiteAuditResult,
            profile,
          )
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    'website-social-links': [
      sourcePrefix,
      manualNote('Social profile links observed', socialLinks),
    ].join('\n'),
    'website-sitemap-robots': [
      sourcePrefix,
      'Sitemap and robots.txt were not automatically checked from manual observation.',
    ].join('\n'),
  }

  return { statuses, notes }
}

export const runWebsiteAutoAudit = async (profile: BusinessProfile) => {
  const response = await fetch('/api/audit-website', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      website: profile.website,
      businessName: profile.businessName,
      phone: profile.phone,
      phoneNumbers: validProfilePhoneNumbers(profile).map((record) => record.number),
      contactStructureNote: profile.contactStructureNote,
      services: splitCsv(profile.primaryServices),
      serviceAreas: splitCsv(profile.serviceArea),
    }),
  })

  const payload = (await response.json()) as WebsiteAuditResponse | { error: string }
  if (!response.ok) {
    throw new Error('error' in payload ? payload.error : 'Website audit failed.')
  }

  if (isWebsiteAuditResult(payload)) {
    return { ...payload, ok: true } satisfies WebsiteAuditResult
  }

  return payload as WebsiteAuditResponse
}
