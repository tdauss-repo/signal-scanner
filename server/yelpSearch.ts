import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EntityField, EvidenceReference } from '../src/types/entityMatch.ts'
import { isBusinessEntityType, parseJsonLdBlocks, structuredEntityAddress, textValue, walkStructuredData } from '../src/utils/structuredEntities.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export interface YelpTransportResult {
  status: number
  finalUrl: string
  body: string
}

export interface YelpAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<YelpTransportResult>
  timeoutMs?: number
}

const approvedHost = (value: string) => value.toLowerCase() === 'www.yelp.com'
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const normalizedWords = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const decodeHtml = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
const stripTags = (value: string) => clean(decodeHtml(value.replace(/<[^>]*>/g, ' ')), 300)
const attributes = (value: string) => Object.fromEntries([...value.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
  .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? '')]))

export const yelpRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

const safeUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(clean(value, 3000), base)
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined
  } catch { return undefined }
}

export const canonicalYelpBusinessUrl = (value: unknown, base = 'https://www.yelp.com/') => {
  const url = safeUrl(value, base)
  if (!url || !approvedHost(url.hostname) || !/^\/biz\/[^/?#]+\/?$/i.test(url.pathname)) return ''
  return `https://www.yelp.com${url.pathname.replace(/\/$/, '')}`
}

const reference = (sourceUrl: string, acquiredAt: string, locator: string, excerpt: string): EvidenceReference => ({
  sourceUrl, acquiredAt, provider: 'yelp-native-fetch', method: 'server_fetch', locator, excerpt: excerpt.slice(0, 2500),
})

const externalOfficialWebsite = (value: unknown, base: string) => {
  const values = Array.isArray(value) ? value : [value]
  return values.map((item) => safeUrl(item, base)).find((url) => url && ![
    'yelp.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'google.com', 'apple.com',
  ].some((host) => url.hostname.replace(/^www\./, '').toLowerCase() === host || url.hostname.toLowerCase().endsWith(`.${host}`)))?.href
}

const structuredCandidates = (html: string, sourceUrl: string, acquiredAt: string, scope: 'search' | 'profile') => {
  const parsed = parseJsonLdBlocks(html)
  const nodes = walkStructuredData(parsed.blocks)
  return nodes.filter((entry) => entry.types.some(isBusinessEntityType)).slice(0, 50).flatMap(({ node, types, path }, index) => {
    const name = textValue(node.name)
    if (!name) return []
    const address = structuredEntityAddress(node, nodes)
    const fields: BusinessResultCandidate['fields'] = { name }
    const mapping: Array<[EntityField, unknown]> = [
      ['phone', node.telephone], ['category', node.category], ['streetAddress', address.streetAddress],
      ['locality', address.addressLocality], ['region', address.addressRegion], ['postalCode', address.postalCode],
    ]
    for (const [field, value] of mapping) if (textValue(value)) fields[field] = textValue(value)
    const addressText = typeof node.address === 'string' ? clean(node.address) : [fields.streetAddress, fields.locality, fields.region, fields.postalCode].filter(Boolean).join(', ')
    if (addressText) fields.address = addressText
    const assertedUrl = safeUrl(node.url || node['@id'], sourceUrl)
    const profileUrl = canonicalYelpBusinessUrl(assertedUrl?.href, sourceUrl)
    if (profileUrl) fields.publicProfileUrl = profileUrl
    else if (assertedUrl && !approvedHost(assertedUrl.hostname)) fields.website = assertedUrl.href
    const website = externalOfficialWebsite(node.sameAs, sourceUrl)
    if (website) fields.website = website
    const resultUrl = profileUrl || undefined
    return [{
      id: `yelp-${scope}-structured-${index + 1}`,
      kind: 'structured_entity' as const,
      sourceType: 'local_place' as const,
      ...(resultUrl ? { resultUrl } : {}),
      fields,
      schemaTypes: types,
      evidence: [reference(sourceUrl, acquiredAt, `${scope}:${path}`, JSON.stringify(node))],
    }]
  })
}

const canonicalMetadataUrl = (html: string, sourceUrl: string) => {
  const tags = [...html.matchAll(/<(?:link|meta)\b([^>]*)>/gi)].slice(0, 200)
  for (const tag of tags) {
    const attrs = attributes(tag[1])
    if ((attrs.rel || '').toLowerCase() === 'canonical' || (attrs.property || '').toLowerCase() === 'og:url') {
      const canonical = canonicalYelpBusinessUrl(attrs.href || attrs.content, sourceUrl)
      if (canonical) return canonical
    }
  }
  return ''
}

const boundedResultContext = (html: string, anchorIndex: number) => {
  const starts = [html.lastIndexOf('<article', anchorIndex), html.lastIndexOf('<li', anchorIndex)].filter((index) => index >= 0)
  const start = starts.length ? Math.max(...starts) : anchorIndex
  const tag = html.slice(start, start + 20).match(/^<(article|li)\b/i)?.[1]?.toLowerCase()
  if (!tag) return ''
  const end = html.indexOf(`</${tag}>`, anchorIndex)
  if (end < 0 || end - start > 5000) return ''
  return stripTags(html.slice(start, end + tag.length + 3))
}

/** Extract explicit Yelp /biz links and bounded JSON-LD business records only. */
export function normalizeYelpHtmlCandidates(html: string, sourceUrl: string, acquiredAt: string, scope: 'search' | 'profile' = 'search'): BusinessResultCandidate[] {
  const candidates: BusinessResultCandidate[] = structuredCandidates(html, sourceUrl, acquiredAt, scope)
  const seenProfiles = new Set(candidates.map((candidate) => candidate.fields.publicProfileUrl).filter(Boolean))
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 600)
  for (const match of links) {
    const attrs = attributes(match[1])
    const profileUrl = canonicalYelpBusinessUrl(attrs.href, sourceUrl)
    const name = stripTags(match[2]) || clean(attrs['aria-label'], 300)
    if (!profileUrl || !name || name.length > 200 || seenProfiles.has(profileUrl)) continue
    const resultContext = boundedResultContext(html, match.index || 0)
    seenProfiles.add(profileUrl)
    candidates.push({
      id: `yelp-${scope}-link-${candidates.length + 1}`,
      kind: 'result_link', sourceType: 'local_place', resultUrl: profileUrl,
      fields: { name, publicProfileUrl: profileUrl },
      evidence: [reference(sourceUrl, acquiredAt, `${scope}:a[href^="/biz/"]`, `${resultContext || name} — ${profileUrl}`)],
    })
    if (candidates.length >= 50) break
  }
  const canonical = scope === 'profile' ? canonicalMetadataUrl(html, sourceUrl) : ''
  if (canonical) for (const candidate of candidates) {
    candidate.resultUrl ||= canonical
    candidate.fields.publicProfileUrl ||= canonical
  }
  return candidates
}

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<YelpTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', yelpRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body }
}
const blockedPage = (status: number, html: string) => [401, 403, 429].includes(status) ||
  /(?:captcha|verify you are human|unusual traffic|access denied|security check|challenge-platform)/i.test(html)
const resultRegion = (html: string) => /<main\b|\/biz\/[a-z0-9_-]+|data-testid=["'][^"']*(?:search|serp|business)[^"']*["']|no results/i.test(html)
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  if (/larger than/i.test(detail)) return 'response_too_large'
  return 'acquisition_failure'
}
const matchingName = (expected: string, observed: string) => {
  const wanted = normalizedWords(expected).replace(/\b(?:inc|llc|ltd|corp|company)$/, '').trim()
  const actual = normalizedWords(observed).replace(/\b(?:inc|llc|ltd|corp|company)$/, '').trim()
  return Boolean(wanted && actual && (wanted === actual || actual.startsWith(`${wanted} `) || actual.endsWith(` ${wanted}`)))
}
const hasStrongSearchIdentity = (candidate: BusinessResultCandidate) => Boolean(candidate.fields.name &&
  (candidate.fields.address || candidate.fields.streetAddress || candidate.fields.phone || candidate.fields.website))
const hasLocationContinuity = (candidate: BusinessResultCandidate, location: string) => {
  const expected = normalizedWords(location)
  const [city = '', remainder = ''] = location.split(',', 2).map(normalizedWords)
  const region = remainder.match(/\b[a-z]{2}\b/)?.[0] || ''
  const postal = remainder.match(/\b\d{5}\b/)?.[0] || ''
  const asserted = [candidate.fields.address, candidate.fields.streetAddress, candidate.fields.locality, candidate.fields.region,
    candidate.fields.postalCode, ...candidate.evidence.map((item) => item.excerpt)].filter(Boolean).map((value) => normalizedWords(String(value))).join(' ')
  if (city && (region || postal)) return asserted.includes(city) && Boolean((region && asserted.includes(` ${region} `)) || (postal && asserted.includes(postal)))
  const tokens = expected.split(' ').filter((token) => token.length > 1)
  return tokens.length >= 2 && tokens.filter((token) => asserted.split(' ').includes(token)).length >= 2
}

/** One bounded Yelp search and at most one exact same-host public /biz enrichment. */
export async function acquireYelpSearch(value: string, options: YelpAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'yelp-native-fetch', checkedDestination: 'Yelp',
    method: 'server_fetch', outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [],
    profileFollow: { used: false, outcome: 'not_used' },
  }
  try {
    const requested = publicUrl(value)
    const businessName = requested.searchParams.get('find_desc')?.trim() || ''
    const location = requested.searchParams.get('find_loc')?.trim() || ''
    if (!approvedHost(requested.hostname) || requested.protocol !== 'https:' || requested.pathname !== '/search' || !businessName || !location) {
      throw new Error('Yelp acquisition requires a clean public search URL with find_desc and find_loc.')
    }
    const verifyDns = options.verifyDns || checkPublicDns
    const transport = options.transport || defaultTransport
    const timeoutMs = options.timeoutMs ?? 12_000
    await verifyDns(requested)
    const search = await transport(requested, AbortSignal.timeout(timeoutMs))
    const finalSearch = publicUrl(search.finalUrl || requested.href)
    if (!approvedHost(finalSearch.hostname) || finalSearch.pathname !== '/search') return {
      ...base, finalUrl: search.finalUrl, statusCode: search.status, outcome: 'unavailable', blocker: 'redirect_not_allowed',
      error: 'Yelp search resolved outside the approved public search route.',
      notes: ['The unsupported target was not acquired. This is not evidence that the business is absent.'],
    }
    if (blockedPage(search.status, search.body)) return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'blocked', blocker: 'access_restricted',
      error: 'Yelp restricted the bounded public search request.',
      notes: ['No challenge bypass was attempted. This is not evidence that the business is absent.'],
    }
    if (search.status < 200 || search.status >= 300) return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'unavailable', blocker: search.status >= 500 ? 'http_5xx' : 'http_error',
      error: `Yelp returned HTTP ${search.status}.`, notes: ['The public search did not produce usable evidence. This is not evidence that the business is absent.'],
    }
    const inspected = resultRegion(search.body)
    const searchCandidates = normalizeYelpHtmlCandidates(search.body, finalSearch.href, acquiredAt, 'search')
    if (!inspected) return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'unavailable', blocker: 'missing_result_region', html: search.body,
      error: 'Yelp returned HTML without a supported public result region.', notes: ['Assisted verification remains available.'],
    }
    const exactProfiles = [...new Set(searchCandidates.filter((candidate) => matchingName(businessName, candidate.fields.name || '') && hasLocationContinuity(candidate, location))
      .map((candidate) => canonicalYelpBusinessUrl(candidate.fields.publicProfileUrl || candidate.resultUrl, finalSearch.href)).filter(Boolean))]
    const searchSufficient = searchCandidates.some((candidate) => matchingName(businessName, candidate.fields.name || '') && hasStrongSearchIdentity(candidate))
    if (searchSufficient || exactProfiles.length !== 1) return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'success', confidence: 'captured', html: search.body,
      normalizedSearchCandidates: searchCandidates, resultRegionInspected: true, blocker: 'none',
      notes: [searchSufficient ? 'Yelp search exposed structured business identity evidence; no profile enrichment was needed.'
        : 'Yelp search was inspected, but it did not expose one unambiguous public business profile for bounded enrichment.'],
    }
    const profileUrl = publicUrl(exactProfiles[0])
    await verifyDns(profileUrl)
    const profile = await transport(profileUrl, AbortSignal.timeout(timeoutMs))
    const finalProfile = publicUrl(profile.finalUrl || profileUrl.href)
    if (!approvedHost(finalProfile.hostname) || !canonicalYelpBusinessUrl(finalProfile.href)) return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'unavailable', blocker: 'profile_redirect_not_allowed',
      normalizedSearchCandidates: searchCandidates, resultRegionInspected: true,
      profileFollow: { used: true, requestedUrl: profileUrl.href, finalUrl: profile.finalUrl, statusCode: profile.status, outcome: 'unavailable', blocker: 'profile_redirect_not_allowed' },
      error: 'Yelp business enrichment resolved outside the approved public /biz route.', notes: ['No external or authentication route was followed.'],
    }
    if (blockedPage(profile.status, profile.body)) return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'blocked', blocker: 'access_restricted',
      normalizedSearchCandidates: searchCandidates, resultRegionInspected: true,
      profileFollow: { used: true, requestedUrl: profileUrl.href, finalUrl: finalProfile.href, statusCode: profile.status, outcome: 'restricted', blocker: 'access_restricted' },
      error: 'Yelp restricted the bounded public business-profile request.', notes: ['No challenge bypass was attempted. This is not evidence that the business is absent.'],
    }
    if (profile.status < 200 || profile.status >= 300) return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'unavailable', blocker: profile.status >= 500 ? 'http_5xx' : 'http_error',
      normalizedSearchCandidates: searchCandidates, resultRegionInspected: true,
      profileFollow: { used: true, requestedUrl: profileUrl.href, finalUrl: finalProfile.href, statusCode: profile.status, outcome: 'unavailable', blocker: profile.status >= 500 ? 'http_5xx' : 'http_error' },
      error: `Yelp business profile returned HTTP ${profile.status}.`, notes: ['The enrichment request was bounded and did not produce usable identity evidence.'],
    }
    const profileCandidates = normalizeYelpHtmlCandidates(profile.body, finalProfile.href, acquiredAt, 'profile')
      .map((candidate) => ({ ...candidate, resultUrl: candidate.resultUrl || canonicalYelpBusinessUrl(finalProfile.href), fields: {
        ...candidate.fields, publicProfileUrl: candidate.fields.publicProfileUrl || canonicalYelpBusinessUrl(finalProfile.href),
      } }))
    return {
      ...base, finalUrl: finalSearch.href, statusCode: search.status, outcome: 'success', confidence: 'captured', html: profile.body,
      normalizedSearchCandidates: [...searchCandidates, ...profileCandidates], resultRegionInspected: true, blocker: 'none',
      profileFollow: { used: true, requestedUrl: profileUrl.href, finalUrl: finalProfile.href, statusCode: profile.status, outcome: 'success' },
      notes: ['Yelp search result region captured and one exact same-host public /biz profile was inspected for structured identity enrichment.'],
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    return { ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['Yelp native acquisition could not complete. This is not evidence that the business is absent.'] }
  }
}
