import type { BusinessResultCandidate, EntityField, EvidenceReference } from '../src/types/entityMatch.ts'
import { canonicalMetaProfileUrl, extractMetaPublicMetadata, type MetaPlatform } from '../src/utils/metaPublicEvidence.ts'
import { isBusinessEntityType, parseJsonLdBlocks, structuredEntityAddress, textValue, walkStructuredData } from '../src/utils/structuredEntities.ts'

export interface MetaProfileCandidateOptions {
  platform: MetaPlatform
  provider: string
  candidatePrefix: string
}

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const host = (value: string) => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const safePublicUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(clean(value, 3000), base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const publicProfileName = (platform: MetaPlatform, value: string | undefined) => {
  const title = clean(value)
  if (platform !== 'Instagram') return title
  return title
    .replace(/\s*\(@[A-Za-z0-9._]+\)\s*[•|—-]\s*Instagram(?: photos and videos)?\s*$/i, '')
    .replace(/\s*[•|—-]\s*Instagram(?: photos and videos)?\s*$/i, '')
    .trim()
}

const reference = (sourceUrl: string, acquiredAt: string, provider: string, locator: string, excerpt: string): EvidenceReference => ({
  sourceUrl, acquiredAt, provider, method: 'server_fetch', locator, excerpt: excerpt.slice(0, 2500),
})

const structuredCandidates = (
  html: string,
  sourceUrl: string,
  profileUrl: string,
  acquiredAt: string,
  options: MetaProfileCandidateOptions,
): BusinessResultCandidate[] => {
  const nodes = walkStructuredData(parseJsonLdBlocks(html).blocks)
  return nodes.filter((entry) => entry.types.some(isBusinessEntityType)).slice(0, 30).flatMap(({ node, types, path }, index) => {
    const name = textValue(node.name)
    if (!name || /^(?:facebook|instagram|meta|meta platforms)(?: inc\.?|,? inc\.?)?$/i.test(name)) return []
    const assertedUrl = safePublicUrl(textValue(node.url) || textValue(node['@id']), sourceUrl)
    const assertedProfile = canonicalMetaProfileUrl(options.platform, assertedUrl, sourceUrl)
    if (assertedProfile && assertedProfile !== profileUrl) return []
    const address = structuredEntityAddress(node, nodes)
    const fields: BusinessResultCandidate['fields'] = { name, publicProfileUrl: profileUrl }
    const mapping: Array<[EntityField, unknown]> = [
      ['phone', node.telephone], ['category', node.category], ['streetAddress', address.streetAddress],
      ['locality', address.addressLocality], ['region', address.addressRegion], ['postalCode', address.postalCode],
    ]
    for (const [field, value] of mapping) if (textValue(value)) fields[field] = textValue(value)
    const fullAddress = typeof node.address === 'string' ? clean(node.address) : [fields.streetAddress, fields.locality, fields.region, fields.postalCode].filter(Boolean).join(', ')
    if (fullAddress) fields.address = fullAddress
    const website = assertedUrl && !assertedProfile && !['facebook.com', 'instagram.com'].includes(host(assertedUrl)) ? assertedUrl : ''
    if (website) fields.website = website
    return [{
      id: `${options.candidatePrefix}-structured-${index + 1}`, kind: 'structured_entity' as const, sourceType: 'local_place' as const,
      resultUrl: profileUrl, fields, schemaTypes: types,
      evidence: [reference(sourceUrl, acquiredAt, options.provider, path, JSON.stringify(node))],
    }]
  })
}

/** Shared bounded Open Graph/business metadata and business JSON-LD normalization for Meta profiles. */
export function normalizeMetaProfileCandidates(
  html: string,
  sourceUrl: string,
  acquiredAt: string,
  options: MetaProfileCandidateOptions,
): BusinessResultCandidate[] {
  const metadata = extractMetaPublicMetadata(html)
  const canonical = canonicalMetaProfileUrl(options.platform, metadata.canonical || metadata['og:url'] || sourceUrl, sourceUrl)
    || canonicalMetaProfileUrl(options.platform, sourceUrl)
  if (!canonical) return []
  const fields: BusinessResultCandidate['fields'] = { publicProfileUrl: canonical }
  const assertedWebsite = safePublicUrl(metadata['business:contact_data:website'] || metadata['profile:website'], sourceUrl)
  const mapping: Array<[EntityField, string | undefined]> = [
    ['name', publicProfileName(options.platform, metadata['og:title'])],
    ['website', assertedWebsite && !['facebook.com', 'instagram.com'].includes(host(assertedWebsite)) ? assertedWebsite : undefined],
    ['phone', metadata['business:contact_data:phone_number']], ['streetAddress', metadata['business:contact_data:street_address']],
    ['locality', metadata['business:contact_data:locality']], ['region', metadata['business:contact_data:region']],
    ['postalCode', metadata['business:contact_data:postal_code']],
    ['category', metadata['business:contact_data:category'] || metadata['profile:category']],
  ]
  for (const [field, value] of mapping) if (value) fields[field] = value
  if (fields.streetAddress && fields.locality && fields.region && fields.postalCode) {
    fields.address = [fields.streetAddress, fields.locality, fields.region, fields.postalCode].join(', ')
  }
  const retainedMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    key === 'canonical' || key === 'og:url' || key === 'og:title' || key === 'description' || key === 'og:description' ||
    key.startsWith('business:contact_data:') || key === 'profile:website' || key === 'profile:category'))
  const metadataCandidate: BusinessResultCandidate[] = fields.name ? [{
    id: `${options.candidatePrefix}-open-graph`, kind: 'semantic_card', sourceType: 'local_place', resultUrl: canonical, fields,
    evidence: [reference(sourceUrl, acquiredAt, options.provider, 'public Open Graph/business metadata', JSON.stringify(retainedMetadata))],
  }] : []
  return [...structuredCandidates(html, sourceUrl, canonical, acquiredAt, options), ...metadataCandidate]
}
