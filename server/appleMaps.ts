import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EntityField, EvidenceReference } from '../src/types/entityMatch.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export interface AppleMapsTransportResult {
  status: number
  finalUrl: string
  body: string
}

export interface AppleMapsAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<AppleMapsTransportResult>
  timeoutMs?: number
}

const appleMapsHost = (value: string) => value.replace(/^www\./, '').toLowerCase() === 'maps.apple.com'
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const safeUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(clean(value, 3000), base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const applePlaceUrl = (value: unknown, base: string) => {
  const resolved = safeUrl(value, base)
  if (!resolved) return ''
  const url = new URL(resolved)
  return appleMapsHost(url.hostname) && /\/place(?:[/?#]|$)/i.test(url.pathname) ? url.href : ''
}
const decodedAttribute = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
const htmlAttribute = (html: string, tagPattern: RegExp, attribute: string) => {
  const tag = html.match(tagPattern)?.[0] || ''
  return decodedAttribute(tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find(Boolean) || '')
}
const reference = (sourceUrl: string, acquiredAt: string, locator: string, excerpt: string): EvidenceReference => ({
  sourceUrl, acquiredAt, provider: 'apple-maps-native-fetch', method: 'server_fetch', locator, excerpt: excerpt.slice(0, 2500),
})

const addressFields = (value: unknown) => {
  if (typeof value === 'string') return { address: clean(value, 500) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const address = value as Record<string, unknown>
  const fields: Partial<Record<EntityField, string>> = {}
  const streetAddress = clean(address.streetAddress || address.addressLine || (Array.isArray(address.addressLines) ? address.addressLines.join(' ') : ''), 300)
  const locality = clean(address.addressLocality || address.city, 120)
  const region = clean(address.addressRegion || address.state, 80)
  const postalCode = clean(address.postalCode || address.postCode || address.zip, 40)
  const formatted = clean(address.formattedAddress || address.fullAddress, 500)
  if (streetAddress) fields.streetAddress = streetAddress
  if (locality) fields.locality = locality
  if (region) fields.region = region
  if (postalCode) fields.postalCode = postalCode
  if (formatted) fields.address = formatted
  return fields
}

function structuredJsonBlocks(html: string) {
  const blocks: Array<{ value: unknown; locator: string }> = []
  for (const [index, match] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].slice(0, 80).entries()) {
    const attributes = match[1]
    if (!/\btype\s*=\s*["']application\/(?:ld\+json|json)["']/i.test(attributes)) continue
    try { blocks.push({ value: JSON.parse(match[2]), locator: `structured-json[${index}]` }) } catch { /* malformed blocks are ignored, never guessed */ }
  }
  return blocks
}

/** Normalize only fields explicitly asserted by public Apple place/share data. */
export function normalizeAppleMapsCandidates(html: string, finalUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  const candidates: BusinessResultCandidate[] = []
  const seen = new Set<string>()
  const append = (node: Record<string, unknown>, locator: string) => {
    const fields: BusinessResultCandidate['fields'] = {}
    const assertedTypes = [node['@type'], node.type].flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string')
    const typedPlace = assertedTypes.some((value) => /(?:business|organization|place|school|store|restaurant)/i.test(value))
    const name = clean(node.name || node.displayName, 300)
    const phone = clean(node.telephone || node.phone || node.phoneNumber, 80)
    const categoryValue = node.category || node.categoryName || node.type
    const category = Array.isArray(categoryValue) ? clean(categoryValue.join(', '), 200) : clean(categoryValue, 200)
    const address = addressFields(node.address || node.locationAddress || node.formattedAddress)
    Object.assign(fields, address)
    if (name) fields.name = name
    if (phone) fields.phone = phone
    if (category) fields.category = category
    const profileUrl = [node.placeUrl, node.shareUrl, node.mapsUrl, node.url, node['@id']]
      .map((value) => applePlaceUrl(value, finalUrl)).find(Boolean) || ''
    const website = [node.website, node.businessWebsite, node.url]
      .map((value) => safeUrl(value, finalUrl)).find((value) => value && !appleMapsHost(new URL(value).hostname)) || ''
    const explicitPlaceIdentity = clean(node.placeId || node.placeID || node.mapItemId || node.mapItemIdentifier, 1000)
    const placeIdentity = explicitPlaceIdentity || (typedPlace ? clean(node.muid || node.id || node['@id'], 1000) : '')
    if (!typedPlace && !explicitPlaceIdentity && !profileUrl) return
    if (website) fields.website = website
    if (profileUrl) fields.publicProfileUrl = profileUrl
    if (placeIdentity || profileUrl) fields.placeIdentity = placeIdentity || profileUrl
    if (!name || !(phone || fields.address || fields.streetAddress || website || profileUrl || placeIdentity)) return
    const key = JSON.stringify([name, phone, fields.address, fields.streetAddress, website, profileUrl, placeIdentity])
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({
      id: `apple-maps-place-${candidates.length + 1}`,
      kind: 'structured_entity',
      sourceType: 'local_place',
      ...(profileUrl ? { resultUrl: profileUrl } : {}),
      fields,
      evidence: [reference(finalUrl, acquiredAt, locator, JSON.stringify(node))],
    })
  }
  let budget = 2500
  const visit = (value: unknown, locator: string, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 14 || budget-- <= 0) return
    if (Array.isArray(value)) { value.slice(0, 200).forEach((item, index) => visit(item, `${locator}[${index}]`, depth + 1)); return }
    const node = value as Record<string, unknown>
    append(node, locator)
    Object.entries(node).slice(0, 100).forEach(([key, child]) => visit(child, `${locator}.${key}`, depth + 1))
  }
  for (const block of structuredJsonBlocks(html)) visit(block.value, block.locator, 0)

  const canonicalTag = /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i
  const ogUrlTag = /<meta\b[^>]*\bproperty\s*=\s*["']og:url["'][^>]*>/i
  const canonical = applePlaceUrl(htmlAttribute(html, canonicalTag, 'href') || htmlAttribute(html, ogUrlTag, 'content') || finalUrl, finalUrl)
  if (canonical) {
    const url = new URL(canonical)
    const address = url.searchParams.get('address') || ''
    const name = url.searchParams.get('name') || ''
    const placeIdentity = url.searchParams.get('place-id') || url.searchParams.get('mapitemguid') || url.searchParams.get('id') || ''
    append({ name, address, placeId: placeIdentity, placeUrl: canonical }, 'canonical-place-url')
  }
  return candidates.slice(0, 50)
}

export const appleMapsRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<AppleMapsTransportResult> => {
  const request = async (target: URL) => {
    const { response, body } = await fetchPage(target, 'GET', appleMapsRequestHeaders, signal, 1_000_000, 'manual')
    return { response, body }
  }
  const first = await request(url)
  const location = first.response.headers.get('location')
  if (first.response.status >= 300 && first.response.status < 400 && location) {
    const target = publicUrl(new URL(location, url).href)
    if (appleMapsHost(target.hostname) && /\/place(?:[/?#]|$)/i.test(target.pathname)) {
      const redirected = await request(target)
      return { status: redirected.response.status, finalUrl: redirected.response.url || target.href, body: redirected.body }
    }
  }
  return { status: first.response.status, finalUrl: first.response.url || url.href, body: first.body }
}

const blockedPage = (status: number, html: string) => [401, 403, 429].includes(status) ||
  /<title[^>]*>[^<]*(?:access denied|forbidden|verify you are human|captcha)/i.test(html)
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  return 'acquisition_failure'
}

/** One bounded public Apple Maps page/share request; no scripts or private APIs. */
export async function acquireAppleMaps(value: string, options: AppleMapsAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'apple-maps-native-fetch', checkedDestination: 'Apple Maps',
    method: 'server_fetch', outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [],
  }
  try {
    const url = publicUrl(value)
    if (!appleMapsHost(url.hostname) || (!url.searchParams.get('q')?.trim() && !/\/place(?:[/?#]|$)/i.test(url.pathname))) {
      throw new Error('Apple Maps acquisition requires a public Apple Maps search or place URL.')
    }
    await (options.verifyDns || checkPublicDns)(url)
    const result = await (options.transport || defaultTransport)(url, AbortSignal.timeout(options.timeoutMs ?? 12_000))
    const final = publicUrl(result.finalUrl)
    if (!appleMapsHost(final.hostname)) return { ...base, finalUrl: result.finalUrl, statusCode: result.status, blocker: 'redirect_not_allowed', error: 'Apple Maps redirected outside the approved public host.', notes: ['The redirected target was not acquired. This is not evidence that the business is absent.'] }
    if (blockedPage(result.status, result.body)) return { ...base, finalUrl: final.href, statusCode: result.status, outcome: 'blocked', blocker: 'access_blocked', error: 'Apple Maps restricted the bounded public request.', notes: ['No access restriction was bypassed. This is not evidence that the business is absent.'] }
    if (result.status < 200 || result.status >= 300) return { ...base, finalUrl: final.href, statusCode: result.status, blocker: result.status >= 500 ? 'http_5xx' : 'http_error', error: `Apple Maps returned HTTP ${result.status}.`, notes: ['The request did not produce usable public evidence. This is not evidence that the business is absent.'] }
    const candidates = normalizeAppleMapsCandidates(result.body, final.href, acquiredAt)
    if (!candidates.length) return { ...base, finalUrl: final.href, statusCode: result.status, outcome: 'unavailable', blocker: 'missing_result_region', error: 'Apple Maps returned no supported public place structure.', notes: ['The public response did not expose a structured place record. Assisted verification remains available.'] }
    return { ...base, finalUrl: final.href, acquiredAt: new Date().toISOString(), statusCode: result.status, outcome: 'success', confidence: 'captured', html: result.body, normalizedSearchCandidates: candidates, resultRegionInspected: true, blocker: 'none', notes: ['Bounded public Apple Maps place evidence captured.'] }
  } catch (error) {
    const blocker = failureBlocker(error)
    return { ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['Apple Maps native acquisition could not complete. This is not evidence that the business is absent.'] }
  }
}
