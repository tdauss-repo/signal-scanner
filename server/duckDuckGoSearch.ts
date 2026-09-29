import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EvidenceReference } from '../src/types/entityMatch.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export interface DuckDuckGoTransportResult {
  status: number
  finalUrl: string
  body: string
}

export interface DuckDuckGoAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<DuckDuckGoTransportResult>
  timeoutMs?: number
}

const duckHost = (value: string) => value.replace(/^www\./i, '').toLowerCase() === 'duckduckgo.com'
const allowedResultHost = (value: string) => ['duckduckgo.com', 'html.duckduckgo.com'].includes(value.replace(/^www\./i, '').toLowerCase())
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const decodeHtml = (value: string) => value
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
const stripTags = (value: string) => clean(decodeHtml(value.replace(/<[^>]*>/g, ' ')), 300)
const attributes = (value: string) => Object.fromEntries([...value.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
  .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? '')]))
const safeUrl = (value: string, base: string) => {
  try {
    const url = new URL(value, base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const resultUrl = (value: string, base: string) => {
  const resolved = safeUrl(value, base)
  if (!resolved) return ''
  const url = new URL(resolved)
  if (!allowedResultHost(url.hostname)) return url.href
  const wrapped = url.searchParams.get('uddg')
  const target = wrapped ? safeUrl(wrapped, base) : ''
  return target && !allowedResultHost(new URL(target).hostname) ? target : ''
}
const reference = (sourceUrl: string, acquiredAt: string, locator: string, excerpt: string): EvidenceReference => ({
  sourceUrl, acquiredAt, method: 'server_fetch', provider: 'duckduckgo-native-fetch', locator, excerpt: excerpt.slice(0, 2500),
})

/** Normalize only the explicit title/link rows from DuckDuckGo's public HTML results. */
export function normalizeDuckDuckGoHtmlCandidates(html: string, sourceUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  const candidates: BusinessResultCandidate[] = []
  const seen = new Set<string>()
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 500)
  for (const match of links) {
    const attrs = attributes(match[1])
    if (!/(?:^|\s)result__a(?:\s|$)/i.test(attrs.class || '')) continue
    const name = stripTags(match[2])
    const destination = resultUrl(attrs.href || '', sourceUrl)
    if (!name || !destination || seen.has(destination)) continue
    seen.add(destination)
    candidates.push({
      id: `duckduckgo-organic-${candidates.length + 1}`,
      kind: 'result_link',
      sourceType: 'organic',
      resultUrl: destination,
      fields: { name },
      evidence: [reference(sourceUrl, acquiredAt, `result__a[${candidates.length}]`, `${name} — ${destination}`)],
    })
    if (candidates.length >= 50) break
  }
  return candidates
}

export const duckDuckGoRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

export const duckDuckGoHtmlSearchUrl = (query: string) => {
  const url = new URL('https://html.duckduckgo.com/html/')
  url.searchParams.set('q', query)
  url.searchParams.set('kl', 'us-en')
  return url
}

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<DuckDuckGoTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', duckDuckGoRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body }
}
const blockedPage = (status: number, html: string) => [401, 403, 429].includes(status) ||
  /(?:anomaly-modal|captcha|verify you are human|unusual traffic|bots use duckduckgo)/i.test(html)
const resultRegion = (html: string) => /\bclass\s*=\s*["'][^"']*(?:result__a|result__body|results--main|no-results)[^"']*["']|\bid\s*=\s*["']links["']/i.test(html)
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  return 'acquisition_failure'
}

/** One bounded public DuckDuckGo HTML request; no browser, session, or challenge bypass. */
export async function acquireDuckDuckGoSearch(value: string, options: DuckDuckGoAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'duckduckgo-native-fetch', checkedDestination: 'DuckDuckGo',
    method: 'server_fetch', outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [],
  }
  try {
    const requested = publicUrl(value)
    const query = requested.searchParams.get('q')?.trim() || ''
    if (!duckHost(requested.hostname) || !['/', '/html/'].includes(requested.pathname) || !query) {
      throw new Error('DuckDuckGo acquisition requires a clean public search query URL.')
    }
    const url = duckDuckGoHtmlSearchUrl(query)
    await (options.verifyDns || checkPublicDns)(url)
    const result = await (options.transport || defaultTransport)(url, AbortSignal.timeout(options.timeoutMs ?? 12_000))
    const final = publicUrl(result.finalUrl || url.href)
    if (!allowedResultHost(final.hostname) || !['/', '/html/'].includes(final.pathname)) return {
      ...base, finalUrl: result.finalUrl, statusCode: result.status, outcome: 'unavailable', blocker: 'redirect_not_allowed',
      error: 'DuckDuckGo resolved outside the approved public HTML search surface.',
      notes: ['The unsupported target was not acquired. This is not evidence that the business is absent.'],
    }
    if (blockedPage(result.status, result.body)) return {
      ...base, finalUrl: final.href, statusCode: result.status, outcome: 'blocked', blocker: 'access_blocked',
      error: 'DuckDuckGo restricted the bounded public request.',
      notes: ['No challenge bypass was attempted. This is not evidence that the business is absent.'],
    }
    if (result.status < 200 || result.status >= 300) return {
      ...base, finalUrl: final.href, statusCode: result.status, outcome: 'unavailable', blocker: result.status >= 500 ? 'http_5xx' : 'http_error',
      error: `DuckDuckGo returned HTTP ${result.status}.`,
      notes: ['The request did not produce usable public evidence. This is not evidence that the business is absent.'],
    }
    const inspected = resultRegion(result.body)
    const candidates = normalizeDuckDuckGoHtmlCandidates(result.body, final.href, acquiredAt)
    return {
      ...base, finalUrl: final.href, acquiredAt: new Date().toISOString(), statusCode: result.status,
      outcome: inspected ? 'success' : 'unavailable', confidence: inspected ? 'captured' : 'unavailable', html: result.body,
      normalizedSearchCandidates: candidates, resultRegionInspected: inspected, blocker: inspected ? 'none' : 'missing_result_region',
      notes: inspected
        ? ['Bounded public DuckDuckGo HTML result region captured. Result destinations remain observed evidence unless identity matching establishes the reviewed official domain.']
        : ['DuckDuckGo returned HTML without a supported result region. Assisted verification remains available.'],
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    return { ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['DuckDuckGo native acquisition could not complete. This is not evidence that the business is absent.'] }
  }
}
