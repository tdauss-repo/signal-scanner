import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate } from '../src/types/entityMatch.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export interface BingSearchTransportResult {
  status: number
  finalUrl: string
  body: string
}

export interface BingSearchAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<BingSearchTransportResult>
  timeoutMs?: number
  /** Identity-rich retries are already the one extra request and cannot follow again. */
  allowSecondaryResolution?: boolean
}

const bingHost = (value: string) => value.replace(/^www\./, '').toLowerCase() === 'bing.com'
const resultRegion = (html: string) => /<(?:main)\b|\bid=["']b_results["']|\bclass=["'][^"']*\bb_algo\b/i.test(html)
const blockedPage = (status: number, html: string) => [401, 403, 429].includes(status) ||
  /<title[^>]*>[^<]*(?:access denied|verify you are human|unusual traffic|captcha)/i.test(html)

export const bingSearchMarketContext = { country: 'us', language: 'en-us', market: 'en-US' } as const
export const bingSearchRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const
const marketUrl = (value: URL) => {
  const url = new URL(value.href)
  url.searchParams.set('cc', bingSearchMarketContext.country)
  url.searchParams.set('setlang', bingSearchMarketContext.language)
  url.searchParams.set('mkt', bingSearchMarketContext.market)
  return url
}

const decodedAttribute = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
const safeBingUrl = (value: string, base: string) => {
  try {
    const url = new URL(decodedAttribute(value), base)
    return url.protocol === 'https:' && bingHost(url.hostname) && !url.username && !url.password ? url : undefined
  } catch { return undefined }
}
const approvedBingResolutionTarget = (value: string, base: string) => {
  const url = safeBingUrl(value, base)
  if (!url || !/^\/maps(?:[/?#]|$)/i.test(url.pathname)) return undefined
  const surfacedIdentity = /\/maps\/place(?:[/?#]|$)/i.test(url.pathname) || ['q', 'osid', 'cp', 'ss'].some((key) => url.searchParams.get(key)?.trim())
  return surfacedIdentity ? url : undefined
}
const surfacedBingResolutionTarget = (html: string, base: string) => {
  const targets = [...html.matchAll(/<(?:a|link)\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)]
    .slice(0, 300)
    .map((match) => approvedBingResolutionTarget(match[1] || match[2] || '', base))
    .filter((value): value is URL => Boolean(value))
  const unique = [...new Map(targets.map((url) => [url.href, url])).values()]
  return unique.length === 1 ? unique[0] : undefined
}
const plainText = (value: string) => decodedAttribute(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
const attributeValue = (value: string, attribute: string) => decodedAttribute(value.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find(Boolean) || '')
/** Server-side normalization is intentionally limited to explicit Bing local-entity scopes. */
const normalizedCandidates = (html: string, url: string, acquiredAt: string): BusinessResultCandidate[] => {
  const candidates: BusinessResultCandidate[] = []
  const scopes = [...html.matchAll(/<(section|div)\b([^>]*(?:\bb_entity(?:TP|Local|Business)\b|\bdata-entity(?:id|-id)\s*=)[^>]*)>([\s\S]*?)<\/\1>/gi)].slice(0, 20)
  for (const [index, match] of scopes.entries()) {
    const outerAttributes = match[2]
    const content = match[3]
    const fields: BusinessResultCandidate['fields'] = {}
    const heading = content.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] || ''
    if (heading) fields.name = plainText(heading)
    const addressLabel = [...content.matchAll(/<[^>]+\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)]
      .map((item) => decodedAttribute(item[1] || item[2] || '')).find((item) => /^address\s*:/i.test(item))
    if (addressLabel) fields.address = addressLabel.replace(/^address\s*:\s*/i, '')
    const anchors = [...content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 50)
    let website = ''
    let mapUrl = ''
    for (const anchor of anchors) {
      const href = attributeValue(anchor[1], 'href')
      const label = attributeValue(anchor[1], 'aria-label') || plainText(anchor[2])
      if (/^tel:/i.test(href)) fields.phone = href.slice(4)
      else if (/^phone\s*:/i.test(label)) fields.phone = label.replace(/^phone\s*:\s*/i, '')
      const resolved = href ? safeBingUrl(href, url) : undefined
      if (resolved && /^\/maps(?:[/?#]|$)/i.test(resolved.pathname)) mapUrl = resolved.href
      if (/^(?:website|official (?:site|website))$/i.test(label) && href) {
        try {
          const target = new URL(decodedAttribute(href), url)
          if (['http:', 'https:'].includes(target.protocol) && !bingHost(target.hostname)) website = target.href
        } catch { /* unsupported link */ }
      }
    }
    if (website) fields.website = website
    if (mapUrl) fields.publicProfileUrl = mapUrl
    const entityIdentity = attributeValue(outerAttributes, 'data-entityid') || attributeValue(outerAttributes, 'data-entity-id')
    if (entityIdentity || mapUrl) fields.placeIdentity = entityIdentity || mapUrl
    if (!fields.name || !(fields.phone || fields.address || fields.website || fields.publicProfileUrl || fields.placeIdentity)) continue
    candidates.push({
      id: `${url}#bing-local-${index}`,
      kind: 'semantic_card', sourceType: 'local_place', ...(website ? { resultUrl: website } : {}), fields,
      evidence: [{ sourceUrl: url, acquiredAt, provider: 'bing-native-fetch', method: 'server_fetch', locator: `bing-local-entity[${index}]`, excerpt: plainText(content).slice(0, 2500) }],
    })
  }
  return candidates
}
const localIdentityIsAlreadyUsable = (candidates: BusinessResultCandidate[]) => candidates.some((candidate) => {
  if (candidate.sourceType !== 'local_place') return false
  const groups = [candidate.fields.name, candidate.fields.website || candidate.resultUrl, candidate.fields.phone, candidate.fields.address || candidate.fields.streetAddress].filter(Boolean)
  return groups.length >= 2 && Boolean(candidate.fields.name || candidate.fields.website || candidate.resultUrl)
})

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<BingSearchTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', bingSearchRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body }
}

const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  return 'acquisition_failure'
}

/**
 * One bounded, read-only Bing HTML search request plus, only when the response
 * exposes one unambiguous Bing Maps target and lacks a usable local identity,
 * one Bing-owned detail request. It never follows an external result, executes
 * scripts, maintains a browser profile, or bypasses access controls.
 */
export async function acquireBingSearch(value: string, options: BingSearchAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1,
    requestedUrl: value,
    acquiredAt,
    provider: 'bing-native-fetch',
    checkedDestination: 'Bing Search',
    method: 'server_fetch',
    outcome: 'failed',
    confidence: 'unavailable',
    resultRegionInspected: false,
    notes: [],
  }
  try {
    const cleanUrl = publicUrl(value)
    if (!bingHost(cleanUrl.hostname) || cleanUrl.pathname !== '/search' || !cleanUrl.searchParams.get('q')?.trim()) {
      throw new Error('Bing acquisition requires a clean Bing Search query URL.')
    }
    const url = marketUrl(cleanUrl)
    await (options.verifyDns || checkPublicDns)(url)
    const transport = options.transport || defaultTransport
    const signal = AbortSignal.timeout(options.timeoutMs ?? 12_000)
    const result = await transport(url, signal)
    const final = publicUrl(result.finalUrl)
    if (!bingHost(final.hostname)) return {
      ...base,
      finalUrl: result.finalUrl,
      statusCode: result.status,
      blocker: 'redirect_not_allowed',
      error: 'Bing redirected outside the approved search host.',
      notes: ['The redirected target was not acquired. This is not evidence that the business is absent.'],
    }
    if (blockedPage(result.status, result.body)) return {
      ...base,
      finalUrl: final.href,
      statusCode: result.status,
      outcome: 'blocked',
      blocker: 'access_blocked',
      error: 'Bing restricted the bounded public request.',
      notes: ['No challenge bypass was attempted. This is not evidence that the business is absent.'],
    }
    if (result.status < 200 || result.status >= 300) return {
      ...base,
      finalUrl: final.href,
      statusCode: result.status,
      blocker: result.status >= 500 ? 'http_5xx' : 'http_error',
      error: `Bing returned HTTP ${result.status}.`,
      notes: ['The request did not produce usable public evidence. This is not evidence that the business is absent.'],
    }
    if (!result.body.trim()) return {
      ...base,
      finalUrl: final.href,
      statusCode: result.status,
      outcome: 'partial',
      blocker: 'missing_result_region',
      error: 'Bing returned an empty response.',
      notes: ['No usable result region was captured. This is not evidence that the business is absent.'],
    }
    const inspected = resultRegion(result.body)
    const primary: AcquisitionResult = {
      ...base,
      finalUrl: final.href,
      acquiredAt: new Date().toISOString(),
      statusCode: result.status,
      outcome: inspected ? 'success' : 'partial',
      confidence: 'captured',
      html: result.body,
      resultRegionInspected: inspected,
      blocker: inspected ? 'none' : 'missing_result_region',
      notes: inspected ? ['Bounded Bing public result region captured in a US-English market context.'] : ['HTML was captured, but a standard Bing result region was not established. Assisted verification remains available.'],
    }
    if (!inspected || options.allowSecondaryResolution === false) return primary
    const primaryCandidates = normalizedCandidates(result.body, final.href, primary.acquiredAt)
    if (localIdentityIsAlreadyUsable(primaryCandidates)) return primary
    const target = surfacedBingResolutionTarget(result.body, final.href)
    if (!target) return primary
    try {
      await (options.verifyDns || checkPublicDns)(target)
      const resolved = await transport(target, signal)
      const resolvedFinal = publicUrl(resolved.finalUrl || target.href)
      const secondaryBase = { owner: 'bing' as const, used: true, requestedUrl: target.href, finalUrl: resolvedFinal.href, statusCode: resolved.status }
      if (!bingHost(resolvedFinal.hostname) || !/^\/maps(?:[/?#]|$)/i.test(resolvedFinal.pathname)) return {
        ...primary,
        secondaryResolution: { ...secondaryBase, outcome: 'unavailable', blocker: 'redirect_not_allowed' },
        notes: [...primary.notes, 'The surfaced Bing-owned resolution target returned an unsupported destination and was not used as evidence.'],
      }
      if (blockedPage(resolved.status, resolved.body)) return {
        ...primary,
        secondaryResolution: { ...secondaryBase, outcome: 'restricted', blocker: 'access_blocked' },
        notes: [...primary.notes, 'The single Bing-owned detail request was restricted; no bypass or additional request was attempted.'],
      }
      if (resolved.status < 200 || resolved.status >= 300 || !resolved.body.trim()) return {
        ...primary,
        secondaryResolution: { ...secondaryBase, outcome: 'unavailable', blocker: resolved.status >= 500 ? 'http_5xx' : 'http_error' },
        notes: [...primary.notes, 'The single Bing-owned detail request did not return usable public evidence.'],
      }
      const secondaryCandidates = normalizedCandidates(resolved.body, resolvedFinal.href, primary.acquiredAt)
      return {
        ...primary,
        normalizedSearchCandidates: secondaryCandidates,
        secondaryResolution: { ...secondaryBase, outcome: secondaryCandidates.length ? 'success' : 'unavailable', blocker: secondaryCandidates.length ? 'none' : 'no_match' },
        notes: [...primary.notes, secondaryCandidates.length
          ? 'One Bing-owned public detail target surfaced by the result was resolved and normalized.'
          : 'The single Bing-owned detail request exposed no supported business identity record.'],
      }
    } catch (error) {
      return {
        ...primary,
        secondaryResolution: { owner: 'bing', used: true, requestedUrl: target.href, outcome: 'unavailable', blocker: failureBlocker(error) },
        notes: [...primary.notes, 'The single Bing-owned detail request was unavailable; no additional request was attempted.'],
      }
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    return {
      ...base,
      blocker,
      error: error instanceof Error ? error.message : String(error),
      notes: ['Bing native acquisition could not complete. This is not evidence that the business is absent.'],
    }
  }
}
