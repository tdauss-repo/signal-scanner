import type { BusinessProfile } from '../types/audit'
import type {
  AutoAuditMapping,
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
