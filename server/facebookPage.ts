import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EntityField, EvidenceReference } from '../src/types/entityMatch.ts'
import { canonicalMetaProfileUrl, classifyMetaPublicAccess, extractMetaPublicMetadata } from '../src/utils/metaPublicEvidence.ts'
import { isBusinessEntityType, parseJsonLdBlocks, structuredEntityAddress, textValue, walkStructuredData } from '../src/utils/structuredEntities.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export interface FacebookTransportResult {
  status: number
  finalUrl: string
  body: string
  location?: string
}

export interface FacebookAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<FacebookTransportResult>
  timeoutMs?: number
}

export const facebookRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const facebookRedirectStatuses = new Set([301, 302, 303, 307, 308])
const host = (value: string) => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const safeHttpsUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(clean(value, 3000), base)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const safePublicUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(clean(value, 3000), base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const reference = (sourceUrl: string, acquiredAt: string, locator: string, excerpt: string): EvidenceReference => ({
  sourceUrl, acquiredAt, provider: 'facebook-native-fetch', method: 'server_fetch', locator, excerpt: excerpt.slice(0, 2500),
})
const structuredCandidates = (html: string, sourceUrl: string, profileUrl: string, acquiredAt: string): BusinessResultCandidate[] => {
  const nodes = walkStructuredData(parseJsonLdBlocks(html).blocks)
  return nodes.filter((entry) => entry.types.some(isBusinessEntityType)).slice(0, 30).flatMap(({ node, types, path }, index) => {
    const name = textValue(node.name)
    if (!name || /^(?:facebook|meta|meta platforms)(?: inc\.?|,? inc\.?)?$/i.test(name)) return []
    const assertedUrl = safePublicUrl(textValue(node.url) || textValue(node['@id']), sourceUrl)
    const assertedProfile = canonicalMetaProfileUrl('Facebook', assertedUrl, sourceUrl)
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
    // `sameAs` commonly mixes social and directory links; only an explicitly asserted
    // entity URL that is not the Facebook page itself may serve as the website field.
    const website = assertedUrl && !assertedProfile && !['facebook.com', 'instagram.com'].includes(host(assertedUrl)) ? assertedUrl : ''
    if (website) fields.website = website
    return [{
      id: `facebook-structured-${index + 1}`, kind: 'structured_entity' as const, sourceType: 'local_place' as const,
      resultUrl: profileUrl, fields, schemaTypes: types,
      evidence: [reference(sourceUrl, acquiredAt, path, JSON.stringify(node))],
    }]
  })
}

/** Extract only canonical/Open Graph business metadata and bounded JSON-LD. */
export function normalizeFacebookPageCandidates(html: string, sourceUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  const metadata = extractMetaPublicMetadata(html)
  const canonical = canonicalMetaProfileUrl('Facebook', metadata.canonical || metadata['og:url'] || sourceUrl, sourceUrl)
    || canonicalMetaProfileUrl('Facebook', sourceUrl)
  if (!canonical) return []
  const fields: BusinessResultCandidate['fields'] = { publicProfileUrl: canonical }
  const assertedWebsite = safePublicUrl(metadata['business:contact_data:website'], sourceUrl)
  const mapping: Array<[EntityField, string | undefined]> = [
    ['name', metadata['og:title']], ['website', assertedWebsite && !['facebook.com', 'instagram.com'].includes(host(assertedWebsite)) ? assertedWebsite : undefined],
    ['phone', metadata['business:contact_data:phone_number']], ['streetAddress', metadata['business:contact_data:street_address']],
    ['locality', metadata['business:contact_data:locality']], ['region', metadata['business:contact_data:region']],
    ['postalCode', metadata['business:contact_data:postal_code']],
  ]
  for (const [field, value] of mapping) if (value) fields[field] = value
  if (fields.streetAddress && fields.locality && fields.region && fields.postalCode) {
    fields.address = [fields.streetAddress, fields.locality, fields.region, fields.postalCode].join(', ')
  }
  const metadataCandidate: BusinessResultCandidate[] = fields.name ? [{
    id: 'facebook-open-graph', kind: 'semantic_card', sourceType: 'local_place', resultUrl: canonical, fields,
    evidence: [reference(sourceUrl, acquiredAt, 'public Open Graph/business metadata', JSON.stringify(Object.fromEntries(Object.entries(metadata).filter(([key]) => key === 'canonical' || key === 'og:url' || key === 'og:title' || key.startsWith('business:contact_data:')))))],
  }] : []
  return [...structuredCandidates(html, sourceUrl, canonical, acquiredAt), ...metadataCandidate]
}

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<FacebookTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', facebookRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body, location: response.headers.get('location') || undefined }
}
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  if (/larger than/i.test(detail)) return 'response_too_large'
  return 'acquisition_failure'
}

/** One public profile request and at most one approved same-host public-profile redirect. */
export async function acquireFacebookPage(value: string, options: FacebookAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'facebook-native-fetch', checkedDestination: 'Facebook',
    method: 'server_fetch', outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [], requestAttempted: true,
  }
  try {
    const canonical = canonicalMetaProfileUrl('Facebook', value)
    if (!canonical) throw new Error('Facebook acquisition requires an explicit public Facebook profile URL.')
    const requested = publicUrl(canonical)
    const verifyDns = options.verifyDns || checkPublicDns
    const transport = options.transport || defaultTransport
    const timeoutMs = options.timeoutMs ?? 12_000
    await verifyDns(requested)
    let response = await transport(requested, AbortSignal.timeout(timeoutMs))
    let redirectUrl: string | undefined
    let redirectAccepted: boolean | undefined
    const initialStatusCode = response.status
    if (facebookRedirectStatuses.has(response.status)) {
      const target = response.location ? safeHttpsUrl(response.location, requested.href) : ''
      const access = target ? classifyMetaPublicAccess('Facebook', response.status, target, '') : undefined
      if (access) return { ...base, statusCode: response.status, initialStatusCode, finalUrl: target || requested.href, blocker: access, outcome: 'blocked', error: 'Facebook requires login or restricted public access.', notes: ['No login or access-control bypass was attempted. This is not evidence that the business is absent.'] }
      const approved = canonicalMetaProfileUrl('Facebook', target, requested.href)
      if (!approved) return { ...base, statusCode: response.status, initialStatusCode, redirectUrl: target || undefined, redirectAccepted: false, outcome: 'unavailable', blocker: response.location ? 'redirect_not_allowed' : 'missing_redirect_location', error: 'Facebook returned an unsupported public redirect.', notes: ['No unsafe redirect was followed.'] }
      redirectUrl = approved
      redirectAccepted = true
      await verifyDns(publicUrl(approved))
      response = await transport(publicUrl(approved), AbortSignal.timeout(timeoutMs))
      if (facebookRedirectStatuses.has(response.status)) return { ...base, initialStatusCode, statusCode: response.status, redirectUrl, redirectAccepted, finalUrl: response.finalUrl, outcome: 'unavailable', blocker: 'redirect_limit', error: 'Facebook returned a second redirect; acquisition stopped at the one-hop limit.', notes: ['No second redirect was followed.'] }
    }
    const finalUrl = response.finalUrl || redirectUrl || requested.href
    const access = classifyMetaPublicAccess('Facebook', response.status, finalUrl, response.body)
    if (access) return { ...base, initialStatusCode, statusCode: response.status, ...(redirectUrl ? { redirectUrl, redirectAccepted } : {}), finalUrl, blocker: access, outcome: 'blocked', html: response.body, error: 'Facebook requires login or restricted public access.', notes: ['No login, session, challenge, or access-control bypass was attempted. This is not evidence that the business is absent.'] }
    if (response.status < 200 || response.status >= 300) return { ...base, initialStatusCode, statusCode: response.status, ...(redirectUrl ? { redirectUrl, redirectAccepted } : {}), finalUrl, blocker: response.status >= 500 ? 'http_5xx' : 'http_error', outcome: 'unavailable', error: `Facebook returned HTTP ${response.status}.`, notes: ['This is not evidence that the business is absent.'] }
    const candidates = normalizeFacebookPageCandidates(response.body, finalUrl, acquiredAt)
    return { ...base, initialStatusCode, statusCode: response.status, ...(redirectUrl ? { redirectUrl, redirectAccepted } : {}), finalUrl,
      outcome: 'success', confidence: 'captured', html: response.body, normalizedSearchCandidates: candidates,
      resultRegionInspected: true, blocker: 'none', notes: [candidates.length
        ? 'Bounded public Facebook profile metadata was captured.'
        : 'Facebook returned a public page, but no supported structured business identity was exposed.'],
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    return { ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['Facebook native acquisition could not complete. This is not evidence that the business is absent.'] }
  }
}
