export interface WebsiteAuditRequest {
  website: string
  businessName: string
  phone: string
  services: string[]
  serviceAreas: string[]
}


export interface LinkEvidence {
  url: string
  anchorText: string
  sourceRegion: 'header' | 'navigation' | 'footer' | 'body'
  internal: boolean
  classification: 'contact' | 'rejected-contact-candidate' | 'other'
  reason: string
}

export interface WebsiteAuditResult {
  ok: true
  normalizedUrl: string
  fetchedUrl: string
  fetchStrategyUsed: string
  redirectCount: number
  title: string
  metaDescription: string
  canonicalUrl: string
  h1Text: string[]
  h2Text: string[]
  visibleTextSummary: string
  businessNameFound: boolean
  phoneNumberMatches: string[]
  servicePhraseMatches: string[]
  serviceAreaPhraseMatches: string[]
  serviceLinks: string[]
  jsonLdSchemaBlocks: unknown[]
  detectedSchemaTypes: string[]
  faqIndicators: string[]
  hasContactLink: boolean
  contactLinks: string[]
  contactLinkEvidence: LinkEvidence[]
  rejectedContactCandidates: LinkEvidence[]
  socialProfileLinks: string[]
  sitemapAvailable: boolean
  robotsAvailable: boolean
  homepageStatus: number
  contentLength: number
  httpsAvailable: boolean
  httpsStatus: number | null
  httpAvailable: boolean
  httpStatus: number | null
  httpRedirectsToHttps: boolean
  analyzedAt: string
}

export interface WebsiteAuditBlockedResult {
  ok: false
  status: number
  statusText?: string
  error: string
  errorType: string
  details: string
  recommendedNextStep: string
  requestedUrl: string
  normalizedUrl?: string
  redirectUrl: string
  finalUrl?: string
  redirectOccurred: boolean
  redirectCount: number
  blocked: boolean
  fetchStrategyUsed: string
  httpsFallbackTried: boolean
  protocolFallbackTried: boolean
  wwwFallbackTried: boolean
  timestamp: string
}

const maxHtmlBytes = 1_000_000
const timeoutMs = 8_000

const defaultHeaders = {
  accept: 'text/html,application/xhtml+xml',
  'user-agent': 'BusinessScannerTool/1.0 authorized-customer-website-audit',
}

const browserLikeHeaders = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
}

const compatibleScannerHeaders = {
  'user-agent': 'Mozilla/5.0 compatible LocalSignalScanner/0.1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
}

export class WebsiteAuditError extends Error {
  statusCode: number
  errorType: string

  constructor(message: string, statusCode = 400, errorType = 'request_error') {
    super(message)
    this.statusCode = statusCode
    this.errorType = errorType
  }
}

const normalizeWebsiteUrl = (website: string) => {
  const trimmed = website.trim()
  if (!trimmed) {
    throw new WebsiteAuditError('Website URL is required.')
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new WebsiteAuditError('Website URL is invalid.')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new WebsiteAuditError('Website URL must use http or https.')
  }

  url.hash = ''
  return url
}

const toggleWww = (url: URL) => {
  const toggled = new URL(url.toString())
  toggled.hostname = /^www\./i.test(toggled.hostname)
    ? toggled.hostname.replace(/^www\./i, '')
    : `www.${toggled.hostname}`
  return toggled
}

const toggleProtocol = (url: URL) => {
  const toggled = new URL(url.toString())
  toggled.protocol = url.protocol === 'https:' ? 'http:' : 'https:'
  return toggled
}

const pathVariants = (url: URL) => {
  const variants = [new URL(url.toString())]
  const alternate = new URL(url.toString())

  if (url.pathname === '' || url.pathname === '/') {
    alternate.pathname = url.pathname === '/' ? '' : '/'
  } else if (url.pathname.endsWith('/')) {
    alternate.pathname = url.pathname.replace(/\/+$/, '')
  } else {
    alternate.pathname = `${url.pathname}/`
  }

  if (alternate.toString() !== url.toString()) variants.push(alternate)
  return variants
}

export const buildWebsiteUrlVariants = (website: string) => {
  const normalized = normalizeWebsiteUrl(website)
  const bases = [
    normalized,
    toggleProtocol(normalized),
    toggleWww(normalized),
    toggleProtocol(toggleWww(normalized)),
  ]
  const seen = new Set<string>()
  const variants: URL[] = []

  for (const base of bases) {
    for (const variant of pathVariants(base)) {
      const key = variant.toString()
      if (!seen.has(key)) {
        seen.add(key)
        variants.push(variant)
      }
    }
  }

  return variants
}

const failureResult = (
  requestedUrl: string,
  normalizedUrl: URL,
  attemptedUrl: URL,
  response: Response | null,
  errorType: string,
  details: string,
  fetchStrategyUsed: string,
  redirectCount: number,
  protocolFallbackTried: boolean,
  wwwFallbackTried: boolean,
): WebsiteAuditBlockedResult => {
  const finalUrl = response?.url || attemptedUrl.toString()
  const status = response?.status ?? 0
  const blocked = status === 403 || errorType === 'http_forbidden'
  const error =
    errorType === 'dns_resolution'
      ? 'Website hostname could not be resolved'
      : errorType === 'tls_certificate'
        ? 'Website HTTPS certificate could not be verified'
        : errorType === 'timeout'
          ? 'Website did not respond before the scan timed out'
          : errorType === 'connection_error'
            ? 'Automated website check could not connect'
            : blocked
              ? 'Automated homepage access blocked'
              : 'Website automated scan failed.'
  const recommendedNextStep =
    errorType === 'dns_resolution'
      ? 'The scanner could not resolve this hostname from the backend environment. Confirm the site in a browser, then use Browser Observation Review if it remains reachable there.'
      : errorType === 'tls_certificate'
        ? 'The HTTPS certificate could not be verified by the scanner. The scan also tests the HTTP variant when appropriate; if no safe automated path succeeds, verify the site in a browser and use Browser Observation Review.'
        : errorType === 'timeout' || errorType === 'connection_error'
          ? 'The automated scanner could not establish a usable connection. Confirm browser access and use Browser Observation Review if needed.'
          : blocked
            ? 'The website host refused the automated request even though the site may open normally in a browser. Use Browser Observation Review for this site.'
            : 'Retry later or complete a manual website review.'

  return {
    ok: false,
    status,
    statusText: response?.statusText,
    error,
    errorType,
    details,
    recommendedNextStep,
    requestedUrl,
    normalizedUrl: normalizedUrl.toString(),
    redirectUrl: finalUrl,
    finalUrl,
    redirectOccurred: Boolean(response?.redirected),
    redirectCount,
    blocked,
    fetchStrategyUsed,
    httpsFallbackTried: protocolFallbackTried,
    protocolFallbackTried,
    wwwFallbackTried,
    timestamp: new Date().toISOString(),
  }
}

const relevantResponseHeaders = (response: Response) => {
  const headerNames = [
    'server',
    'cf-ray',
    'x-cache',
    'x-servedby',
    'x-timer',
    'content-type',
    'location',
    'via',
  ]

  return headerNames.reduce(
    (headers, name) => {
      const value = response.headers.get(name)
      return value ? { ...headers, [name]: value } : headers
    },
    {} as Record<string, string>,
  )
}

const logWebsiteAuditAttempt = (
  label: string,
  data: Record<string, unknown>,
) => {
  console.info(`[website-audit] ${label}`, data)
}

const fetchWithLimit = async (
  url: URL,
  method: 'GET' | 'HEAD' = 'GET',
  headers: Record<string, string> = defaultHeaders,
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: method === 'GET' ? headers : { ...headers, accept: '*/*' },
    })

    if (method === 'HEAD') return { response, body: '' }

    const reader = response.body?.getReader()
    if (!reader) return { response, body: '' }

    const chunks: Uint8Array[] = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      received += value.byteLength
      if (received > maxHtmlBytes) {
        reader.cancel().catch(() => undefined)
        throw new WebsiteAuditError(
          'Homepage HTML is larger than the 1 MB audit limit.',
          413,
        )
      }
      chunks.push(value)
    }

    const body = new TextDecoder().decode(concatChunks(chunks, received))
    return { response, body }
  } catch (error) {
    if (error instanceof WebsiteAuditError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WebsiteAuditError('Website fetch timed out.', 504, 'timeout')
    }
    const cause = (error as Error & { cause?: { code?: string; message?: string } })
      .cause
    if (
      cause?.code &&
      /CERT|TLS|VERIFY|SIGNATURE/i.test(cause.code)
    ) {
      throw new WebsiteAuditError(
        `Website TLS certificate chain could not be verified by the backend fetch runtime. ${cause.message ?? ''}`.trim(),
        526,
        'tls_certificate',
      )
    }
    if (cause?.code && /ENOTFOUND|EAI_AGAIN/i.test(cause.code)) {
      throw new WebsiteAuditError(
        `The scanner could not resolve the website hostname. ${cause.message ?? ''}`.trim(),
        502,
        'dns_resolution',
      )
    }
    if (cause?.code && /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/i.test(cause.code)) {
      throw new WebsiteAuditError(
        `The scanner could not establish a connection to the website. ${cause.message ?? ''}`.trim(),
        502,
        'connection_error',
      )
    }
    throw new WebsiteAuditError(
      cause?.message
        ? `Unable to fetch the website homepage. ${cause.message}`
        : 'Unable to fetch the website homepage.',
      502,
      'fetch_error',
    )
  } finally {
    clearTimeout(timeout)
  }
}

const concatChunks = (chunks: Uint8Array[], totalLength: number) => {
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return combined
}

const stripTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

const decodeEntities = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, codePoint: string) =>
      String.fromCodePoint(Number(codePoint)),
    )
    .replace(/&#x([\da-f]+);/gi, (_match, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    )

const cleanText = (text: string) =>
  decodeEntities(text).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim()

const firstMatch = (html: string, pattern: RegExp) => {
  const match = html.match(pattern)
  return match?.[1] ? cleanText(match[1]) : ''
}

const allMatches = (html: string, pattern: RegExp) =>
  [...html.matchAll(pattern)]
    .map((match) => cleanText(stripTags(match[1] ?? '')))
    .filter(Boolean)

const attrValue = (tag: string, attribute: string) => {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i')
  return cleanText(tag.match(pattern)?.[1] ?? '')
}

const containsPhrase = (haystack: string, phrase: string) =>
  haystack.toLowerCase().includes(phrase.trim().toLowerCase())

const normalizePhoneDigits = (phone: string) => phone.replace(/\D/g, '')

const phoneMatches = (visibleText: string, expectedPhone: string) => {
  const expectedDigits = normalizePhoneDigits(expectedPhone)
  const found = new Set<string>()
  const phonePattern =
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g

  for (const match of visibleText.matchAll(phonePattern)) {
    const phone = cleanText(match[0])
    if (!expectedDigits || normalizePhoneDigits(phone).endsWith(expectedDigits)) {
      found.add(phone)
    }
  }

  return [...found]
}

const parseJsonLd = (html: string) => {
  const blocks: unknown[] = []
  const scriptPattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

  for (const match of html.matchAll(scriptPattern)) {
    const raw = cleanText(match[1] ?? '')
    if (!raw) continue
    try {
      blocks.push(JSON.parse(raw))
    } catch {
      blocks.push({ parseError: true, raw: raw.slice(0, 500) })
    }
  }

  return blocks
}

const collectSchemaTypes = (value: unknown, found = new Set<string>()) => {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, found)
    return found
  }

  if (!value || typeof value !== 'object') return found

  const record = value as Record<string, unknown>
  const type = record['@type']
  if (typeof type === 'string') found.add(type)
  if (Array.isArray(type)) {
    for (const item of type) {
      if (typeof item === 'string') found.add(item)
    }
  }

  for (const nested of Object.values(record)) {
    if (typeof nested === 'object' && nested !== null) {
      collectSchemaTypes(nested, found)
    }
  }

  return found
}

const elementRanges = (html: string, tagName: string) =>
  [...html.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, 'gi'))].map(
    (match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }),
  )

const linkSourceRegion = (
  index: number,
  regions: Record<'header' | 'navigation' | 'footer', Array<{ start: number; end: number }>>,
): LinkEvidence['sourceRegion'] => {
  if (regions.navigation.some((range) => index >= range.start && index < range.end)) return 'navigation'
  if (regions.header.some((range) => index >= range.start && index < range.end)) return 'header'
  if (regions.footer.some((range) => index >= range.start && index < range.end)) return 'footer'
  return 'body'
}

const contactIntentPattern = /\b(contact(?: us)?|book(?:ing)?|schedule|appointment|inquir(?:e|y)|call|register|registration)\b/i
const contactPathSegmentPattern = /(?:^|[-_/])(contact(?:-us)?|book(?:ing)?|schedule|appointment|inquir(?:e|y)|call|register|registration)(?:[-_/]|$)/i
const legacyLooseContactPattern = /contact|booking|inquire|call/i

const classifyLink = (
  url: URL,
  anchorText: string,
  baseUrl: URL,
  sourceRegion: LinkEvidence['sourceRegion'],
): LinkEvidence => {
  const internal = url.hostname.replace(/^www\./i, '') === baseUrl.hostname.replace(/^www\./i, '')
  const href = url.toString()
  const protocolContact = ['tel:', 'mailto:'].includes(url.protocol)
  const anchorContact = contactIntentPattern.test(anchorText)
  const pathContact = contactPathSegmentPattern.test(url.pathname)

  if (protocolContact) {
    return { url: href, anchorText, sourceRegion, internal, classification: 'contact', reason: `${url.protocol.slice(0, -1)} link` }
  }
  if (anchorContact) {
    return { url: href, anchorText, sourceRegion, internal, classification: 'contact', reason: 'anchor text expresses contact/booking intent' }
  }
  if (internal && pathContact) {
    return { url: href, anchorText, sourceRegion, internal, classification: 'contact', reason: 'internal path expresses contact/booking intent' }
  }

  // Preserve diagnostics for URLs that the old loose substring matcher would have accepted.
  // Example: `/Recalls?...` contains the letters "call" inside "recalls" but is not a call/contact link.
  if (legacyLooseContactPattern.test(href)) {
    return {
      url: href,
      anchorText,
      sourceRegion,
      internal,
      classification: 'rejected-contact-candidate',
      reason: 'contact-like text appears only as a loose URL substring; no supported contact intent was found',
    }
  }

  return { url: href, anchorText, sourceRegion, internal, classification: 'other', reason: 'no contact intent detected' }
}

const extractLinkEvidence = (html: string, baseUrl: URL) => {
  const regions = {
    header: elementRanges(html, 'header'),
    navigation: elementRanges(html, 'nav'),
    footer: elementRanges(html, 'footer'),
  }

  return [...html.matchAll(/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      try {
        const url = new URL(match[2] ?? '', baseUrl)
        const anchorText = cleanText(stripTags(match[4] ?? ''))
        const sourceRegion = linkSourceRegion(match.index ?? 0, regions)
        return classifyLink(url, anchorText, baseUrl, sourceRegion)
      } catch {
        return null
      }
    })
    .filter((value): value is LinkEvidence => value !== null)
}

const unique = <T>(items: T[]) => [...new Set(items)]

const checkAvailability = async (baseUrl: URL, path: string) => {
  const url = new URL(path, baseUrl.origin)
  try {
    const { response } = await fetchWithLimit(url, 'HEAD')
    if (response.ok) return true
    if ([405, 403].includes(response.status)) {
      const getResult = await fetchWithLimit(url, 'GET')
      return getResult.response.ok
    }
    return false
  } catch {
    return false
  }
}


const probeUrl = async (url: URL) => {
  try {
    const { response } = await fetchWithLimit(url, 'GET', browserLikeHeaders)
    return {
      available: response.ok,
      status: response.status,
      finalUrl: response.url || url.toString(),
    }
  } catch {
    return { available: false, status: null, finalUrl: url.toString() }
  }
}

const inspectTransportSecurity = async (fetchedBaseUrl: URL) => {
  const httpsUrl = new URL(fetchedBaseUrl.toString())
  httpsUrl.protocol = 'https:'
  const httpUrl = new URL(fetchedBaseUrl.toString())
  httpUrl.protocol = 'http:'

  const [httpsProbe, httpProbe] = await Promise.all([
    fetchedBaseUrl.protocol === 'https:'
      ? Promise.resolve({ available: true, status: 200, finalUrl: fetchedBaseUrl.toString() })
      : probeUrl(httpsUrl),
    fetchedBaseUrl.protocol === 'http:'
      ? Promise.resolve({ available: true, status: 200, finalUrl: fetchedBaseUrl.toString() })
      : probeUrl(httpUrl),
  ])

  return {
    httpsAvailable: httpsProbe.available,
    httpsStatus: httpsProbe.status,
    httpAvailable: httpProbe.available,
    httpStatus: httpProbe.status,
    httpRedirectsToHttps:
      httpProbe.available && /^https:/i.test(httpProbe.finalUrl),
  }
}

const failurePriority = (attempt: WebsiteAuditBlockedResult) => {
  if (attempt.errorType === 'http_forbidden') return 100
  if (attempt.errorType === 'http_error') return 90
  if (attempt.errorType === 'tls_certificate') return 80
  if (attempt.errorType === 'dns_resolution') return 70
  if (attempt.errorType === 'timeout') return 60
  if (attempt.errorType === 'connection_error') return 50
  return 10
}

const bestFailureAttempt = (attempts: WebsiteAuditBlockedResult[]) =>
  attempts.reduce<WebsiteAuditBlockedResult | undefined>((best, attempt) => {
    if (!best || failurePriority(attempt) > failurePriority(best)) return attempt
    return best
  }, undefined)

export const auditWebsite = async (
  request: WebsiteAuditRequest,
): Promise<WebsiteAuditResult | WebsiteAuditBlockedResult> => {
  const requestedUrl = request.website.trim()
  const url = normalizeWebsiteUrl(request.website)
  const variants = buildWebsiteUrlVariants(request.website)
  const strategies = [
    { name: 'normal fetch', headers: defaultHeaders },
    { name: 'compatible scanner browser-like headers', headers: compatibleScannerHeaders },
    { name: 'browser-like headers', headers: browserLikeHeaders },
    {
      name: 'browser-like headers with referer',
      headers: { ...browserLikeHeaders, referer: url.origin },
    },
  ]
  const attempts: WebsiteAuditBlockedResult[] = []
  let response: Response | null = null
  let body = ''
  let fetchStrategyUsed = ''
  let redirectCount = 0

  logWebsiteAuditAttempt('start', {
    requestedUrl,
    normalizedUrl: url.toString(),
    variants: variants.map((variant) => variant.toString()),
  })

  let successfulAttemptUrl: URL | null = null
  const originalHost = url.hostname
  const originalProtocol = url.protocol

  for (const variant of variants) {
    for (const strategy of strategies) {
      try {
        const result = await fetchWithLimit(variant, 'GET', strategy.headers)
        response = result.response
        body = result.body
        fetchStrategyUsed = `${strategy.name} (${variant.toString()})`
        redirectCount = response.redirected ? 1 : 0

        logWebsiteAuditAttempt('attempt result', {
          requestedUrl,
          normalizedUrl: url.toString(),
          attemptUrl: variant.toString(),
          finalUrl: response.url || variant.toString(),
          status: response.status,
          statusText: response.statusText,
          responseHeaders: relevantResponseHeaders(response),
          userAgent: strategy.headers['user-agent'],
          fetchStrategyUsed,
          redirectCount,
          protocolFallbackTried: variant.protocol !== originalProtocol,
          wwwFallbackTried: variant.hostname !== originalHost,
        })

        if (response.ok && body.trim()) {
          successfulAttemptUrl = variant
          break
        }

        attempts.push(
          failureResult(
            requestedUrl,
            url,
            variant,
            response,
            response.status === 403 ? 'http_forbidden' : 'http_error',
            response.status === 403
              ? 'HTTP 403 Forbidden. The website may block server-side scans even though it opens in a browser.'
              : `Homepage returned HTTP ${response.status} ${response.statusText || ''}.`.trim(),
            fetchStrategyUsed,
            redirectCount,
            variant.protocol !== originalProtocol,
            variant.hostname !== originalHost,
          ),
        )
      } catch (error) {
        if (error instanceof WebsiteAuditError && error.statusCode !== 400) {
          const errorType = error.errorType
          const fetchStrategy = `${strategy.name} (${variant.toString()})`
          logWebsiteAuditAttempt('attempt error', {
            requestedUrl,
            normalizedUrl: url.toString(),
            attemptUrl: variant.toString(),
            userAgent: strategy.headers['user-agent'],
            fetchStrategyUsed: fetchStrategy,
            errorType,
            message: error.message,
            stack: error.stack,
            protocolFallbackTried: variant.protocol !== originalProtocol,
            wwwFallbackTried: variant.hostname !== originalHost,
          })
          attempts.push(
            failureResult(
              requestedUrl,
              url,
              variant,
              null,
              errorType,
              error.message,
              fetchStrategy,
              0,
              variant.protocol !== originalProtocol,
              variant.hostname !== originalHost,
            ),
          )
          if (errorType === 'dns_resolution' || errorType === 'tls_certificate') break
          continue
        }
        throw error
      }

      if (response.ok && body.trim()) break
    }

    if (response && response.ok && body.trim()) break
  }

  if (!response || !response.ok || !body.trim()) {
    const protocolFallbackTried = variants.some(
      (variant) => variant.protocol !== originalProtocol,
    )
    const wwwFallbackTried = variants.some(
      (variant) => variant.hostname !== originalHost,
    )
    const selectedAttempt = bestFailureAttempt(attempts)
    if (selectedAttempt) {
      return {
        ...selectedAttempt,
        protocolFallbackTried,
        wwwFallbackTried,
        httpsFallbackTried: protocolFallbackTried,
      }
    }

    return failureResult(
      requestedUrl,
      url,
      variants.at(-1) ?? url,
      null,
      'fetch_error',
      'Unable to fetch usable homepage HTML with safe request strategies.',
      'No strategy completed',
      0,
      protocolFallbackTried,
      wwwFallbackTried,
    )
  }

  const fetchedUrl = response.url || successfulAttemptUrl?.toString() || url.toString()
  const fetchedBaseUrl = new URL(fetchedUrl)
  const title = firstMatch(body, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const metaDescription = firstMatch(
    body,
    /<meta\b(?=[^>]*name\s*=\s*["']description["'])[^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i,
  )
  const canonicalTag = body.match(
    /<link\b(?=[^>]*rel\s*=\s*["']canonical["'])[^>]*>/i,
  )?.[0]
  const canonicalUrl = canonicalTag ? attrValue(canonicalTag, 'href') : ''
  const h1Text = allMatches(body, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)
  const h2Text = allMatches(body, /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)
  const visibleText = cleanText(stripTags(body))
  const linkEvidence = extractLinkEvidence(body, fetchedBaseUrl)
  const links = linkEvidence.map((link) => link.url)
  const jsonLdSchemaBlocks = parseJsonLd(body)
  const detectedSchemaTypes = unique(
    jsonLdSchemaBlocks.flatMap((block) => [...collectSchemaTypes(block)]),
  )

  const faqIndicators = unique([
    ...detectedSchemaTypes.filter((type) => /faq/i.test(type)),
    ...(visibleText.match(/\b(faq|frequently asked questions)\b/gi) ?? []),
    ...h2Text.filter((heading) => /\?/.test(heading)),
  ]).slice(0, 12)

  const servicePhraseMatches = request.services.filter((service) =>
    containsPhrase(visibleText, service),
  )
  const serviceAreaPhraseMatches = request.serviceAreas.filter((area) =>
    containsPhrase(visibleText, area),
  )
  const businessNameFound = request.businessName
    ? containsPhrase(visibleText, request.businessName) ||
      containsPhrase(title, request.businessName) ||
      containsPhrase(metaDescription, request.businessName)
    : false
  const serviceLinks = links.filter((link) =>
    request.services.some((service) => {
      const serviceSlug = service.trim().toLowerCase().replace(/\s+/g, '-')
      const servicePlain = service.trim().toLowerCase().replace(/\s+/g, '')
      const linkLower = link.toLowerCase()
      return linkLower.includes(serviceSlug) || linkLower.includes(servicePlain)
    }),
  )
  const contactLinkEvidence = linkEvidence.filter((link) => link.classification === 'contact')
  const rejectedContactCandidates = linkEvidence.filter(
    (link) => link.classification === 'rejected-contact-candidate',
  )
  const contactLinks = contactLinkEvidence.map((link) => link.url)
  const socialProfileLinks = links.filter((link) =>
    /facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com|x\.com|twitter\.com/i.test(
      link,
    ),
  )

  const [sitemapAvailable, robotsAvailable, transportSecurity] = await Promise.all([
    checkAvailability(fetchedBaseUrl, '/sitemap.xml'),
    checkAvailability(fetchedBaseUrl, '/robots.txt'),
    inspectTransportSecurity(fetchedBaseUrl),
  ])

  return {
    ok: true,
    normalizedUrl: url.toString(),
    fetchedUrl,
    fetchStrategyUsed,
    redirectCount,
    title,
    metaDescription,
    canonicalUrl,
    h1Text,
    h2Text,
    visibleTextSummary: visibleText.slice(0, 900),
    businessNameFound,
    phoneNumberMatches: phoneMatches(visibleText, request.phone),
    servicePhraseMatches,
    serviceAreaPhraseMatches,
    serviceLinks: unique(serviceLinks).slice(0, 12),
    jsonLdSchemaBlocks,
    detectedSchemaTypes,
    faqIndicators,
    hasContactLink: contactLinks.length > 0,
    contactLinks: unique(contactLinks).slice(0, 12),
    contactLinkEvidence: contactLinkEvidence.slice(0, 12),
    rejectedContactCandidates: rejectedContactCandidates.slice(0, 12),
    socialProfileLinks: unique(socialProfileLinks).slice(0, 12),
    sitemapAvailable,
    robotsAvailable,
    homepageStatus: response.status,
    contentLength: body.length,
    ...transportSecurity,
    analyzedAt: new Date().toISOString(),
  }
}
