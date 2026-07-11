import type {
  DirectoryCandidateUrl,
  DirectoryCheckMethod,
  DirectoryType,
} from '../src/types/audit.ts'

export interface DirectoryCandidateRequest {
  businessName: string
  websiteDomain: string
  localMarket: string
  state: string
  primaryCategory: string
  serviceTags: string[]
  directoryName: string
  expectedDirectoryDomain: string
  directoryType: DirectoryType
  checkMethod: DirectoryCheckMethod
  existingDirectoryUrls?: string
}

export interface DirectoryCandidateResponse {
  ok: boolean
  candidateUrls: DirectoryCandidateUrl[]
  manualSearchLinks: DirectoryCandidateUrl[]
  searchedQueries: string[]
  message?: string
}

const timeoutMs = 6_000

const knownDirectoryDomains: Array<[RegExp, string]> = [
  [/weddingwire/i, 'weddingwire.com'],
  [/the knot/i, 'theknot.com'],
  [/zola/i, 'zola.com'],
  [/greatschools/i, 'greatschools.org'],
  [/private school review/i, 'privateschoolreview.com'],
  [/booksy/i, 'booksy.com'],
  [/vagaro/i, 'vagaro.com'],
  [/fresha/i, 'fresha.com'],
  [/styleseat/i, 'styleseat.com'],
  [/angi/i, 'angi.com'],
  [/homeadvisor/i, 'homeadvisor.com'],
  [/thumbtack/i, 'thumbtack.com'],
  [/houzz/i, 'houzz.com'],
  [/bbb/i, 'bbb.org'],
]

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const displayDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

const decodeHtml = (value = '') =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    )
    .replace(/\s+/g, ' ')
    .trim()

const stripTags = (value = '') => decodeHtml(value.replace(/<[^>]+>/g, ' '))

const normalizeUrl = (url: string) => {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      .toString()
  } catch {
    return ''
  }
}

const expectedDomainFor = (request: DirectoryCandidateRequest) =>
  request.expectedDirectoryDomain ||
  knownDirectoryDomains.find(([pattern]) => pattern.test(request.directoryName))?.[1] ||
  ''

const looksLikeProfileUrl = (url: string) =>
  /profile|vendor|vendors|marketplace|biz|business|listing|directory|store|company|provider|school|review/i.test(
    url,
  )

const searchResultUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return parsed.toString()
  } catch {
    return url
  }
}

const confidenceFor = (
  request: DirectoryCandidateRequest,
  candidate: Pick<DirectoryCandidateUrl, 'url' | 'title' | 'snippet'>,
) => {
  const expectedDomain = expectedDomainFor(request)
  const domainMatches = expectedDomain
    ? displayDomain(candidate.url).includes(expectedDomain)
    : true
  const haystack = `${candidate.title} ${candidate.snippet ?? ''} ${candidate.url}`.toLowerCase()
  const businessNameMatch = request.businessName
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .some((part) => haystack.includes(part))
  const locationMatch = [request.localMarket, request.state]
    .filter(Boolean)
    .some((part) => haystack.includes(part.toLowerCase()))
  const profileLike = looksLikeProfileUrl(candidate.url)

  if (domainMatches && businessNameMatch && locationMatch && profileLike) {
    return 'High'
  }
  if (domainMatches && businessNameMatch) return 'Medium'
  return 'Low'
}

const reasonFor = (
  request: DirectoryCandidateRequest,
  candidate: DirectoryCandidateUrl,
) => {
  const expectedDomain = expectedDomainFor(request)
  const reasons = []
  if (expectedDomain && candidate.displayDomain.includes(expectedDomain)) {
    reasons.push(`Matches expected directory domain ${expectedDomain}.`)
  }
  if (
    `${candidate.title} ${candidate.snippet ?? ''} ${candidate.url}`
      .toLowerCase()
      .includes(request.businessName.toLowerCase().split(/\s+/)[0] ?? '')
  ) {
    reasons.push('Includes a business-name signal.')
  }
  if (looksLikeProfileUrl(candidate.url)) {
    reasons.push('URL looks like a listing/profile page.')
  }
  if (reasons.length === 0) {
    reasons.push('Possible candidate from targeted lookup; operator confirmation required.')
  }
  return reasons.join(' ')
}

const candidateFromUrl = (
  request: DirectoryCandidateRequest,
  url: string,
  source: string,
  title?: string,
  snippet?: string,
): DirectoryCandidateUrl | null => {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return null
  const candidateBase = {
    title: title || `${request.directoryName} candidate`,
    url: normalizedUrl,
    displayDomain: displayDomain(normalizedUrl),
    snippet,
  }
  const confidence = confidenceFor(request, candidateBase)
  const candidate: DirectoryCandidateUrl = {
    id: `${slug(request.directoryName)}-${slug(source)}-${slug(normalizedUrl).slice(0, 48)}`,
    ...candidateBase,
    source,
    confidence,
    reason: '',
    discoveredAt: new Date().toISOString(),
  }
  return { ...candidate, reason: reasonFor(request, candidate) }
}

const operatorUrlCandidates = (request: DirectoryCandidateRequest) => {
  const expectedDomain = expectedDomainFor(request)
  return (request.existingDirectoryUrls ?? '')
    .split(/[\n,;]/)
    .map((url) => candidateFromUrl(request, url, 'Operator-entered directory URL'))
    .filter((candidate): candidate is DirectoryCandidateUrl => Boolean(candidate))
    .filter(
      (candidate) =>
        !expectedDomain || candidate.displayDomain.includes(expectedDomain),
    )
}

const searchQueries = (request: DirectoryCandidateRequest) => {
  const expectedDomain = expectedDomainFor(request)
  const primaryService = request.serviceTags.find(Boolean) || request.primaryCategory
  return [
    `${request.businessName} ${request.localMarket} ${request.directoryName}`,
    `${request.businessName} ${request.websiteDomain} ${request.directoryName}`,
    `${request.businessName} ${request.localMarket} ${request.state} ${request.directoryName}`,
    expectedDomain
      ? `site:${expectedDomain} ${request.businessName} ${request.localMarket}`
      : '',
    expectedDomain
      ? `site:${expectedDomain} ${request.businessName} ${request.websiteDomain}`
      : '',
    `${request.businessName} ${primaryService} ${request.directoryName}`,
  ]
    .map((query) => query.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

const manualSearchCandidate = (
  request: DirectoryCandidateRequest,
  query: string,
  index: number,
): DirectoryCandidateUrl => ({
  id: `${slug(request.directoryName)}-manual-search-${index}`,
  title: `Manual search: ${query}`,
  url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  displayDomain: 'google.com',
  snippet:
    'Manual search fallback. Open results, confirm the correct public listing URL, then save it in the scanner.',
  source: 'Manual search fallback',
  confidence: 'Low',
  reason:
    'No confirmed candidate URL is implied by this link. It is only a manual search fallback.',
  discoveredAt: new Date().toISOString(),
})

type DuckDuckGoTopic = {
  FirstURL?: string
  Text?: string
  Result?: string
  Name?: string
  Topics?: DuckDuckGoTopic[]
}

const flattenTopics = (topics: DuckDuckGoTopic[] = []): DuckDuckGoTopic[] =>
  topics.flatMap((topic) =>
    topic.Topics?.length ? flattenTopics(topic.Topics) : [topic],
  )

const fetchDuckDuckGoCandidates = async (
  request: DirectoryCandidateRequest,
  query: string,
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL('https://api.duckduckgo.com/')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('no_html', '1')
    url.searchParams.set('skip_disambig', '1')

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'BusinessScannerTool/1.0 directory-candidate-lookup',
      },
    })
    if (!response.ok) return []

    const payload = (await response.json()) as {
      AbstractURL?: string
      Heading?: string
      AbstractText?: string
      Results?: DuckDuckGoTopic[]
      RelatedTopics?: DuckDuckGoTopic[]
    }

    const urls = [
      payload.AbstractURL
        ? candidateFromUrl(
            request,
            payload.AbstractURL,
            'DuckDuckGo Instant Answer',
            payload.Heading,
            payload.AbstractText,
          )
        : null,
      ...flattenTopics([...(payload.Results ?? []), ...(payload.RelatedTopics ?? [])])
        .map((topic) =>
          topic.FirstURL
            ? candidateFromUrl(
                request,
                topic.FirstURL,
                'DuckDuckGo Instant Answer',
                topic.Text?.split(' - ')[0] || topic.Name,
                topic.Text,
              )
            : null,
        ),
    ]

    const expectedDomain = expectedDomainFor(request)
    return urls
      .filter((candidate): candidate is DirectoryCandidateUrl => Boolean(candidate))
      .filter(
        (candidate) =>
          !expectedDomain || candidate.displayDomain.includes(expectedDomain),
      )
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

const fetchDuckDuckGoHtmlCandidates = async (
  request: DirectoryCandidateRequest,
  query: string,
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL('https://duckduckgo.com/html/')
    url.searchParams.set('q', query)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent':
          'Mozilla/5.0 compatible BusinessScannerTool/1.0 directory-candidate-lookup',
      },
    })
    if (!response.ok) return []

    const html = await response.text()
    const expectedDomain = expectedDomainFor(request)
    const resultBlocks = html.match(/<div class="result[\s\S]*?<\/div>\s*<\/div>/g) ?? []

    return resultBlocks
      .map((block) => {
        const linkMatch = block.match(
          /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
        )
        if (!linkMatch) return null

        const resultUrl = searchResultUrl(decodeHtml(linkMatch[1]))
        const snippetMatch =
          block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) ??
          block.match(/<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/)
        const candidate = candidateFromUrl(
          request,
          resultUrl,
          'DuckDuckGo Search Result',
          stripTags(linkMatch[2]),
          snippetMatch ? stripTags(snippetMatch[1]) : undefined,
        )
        if (!candidate) return null
        if (expectedDomain && !candidate.displayDomain.includes(expectedDomain)) {
          return null
        }
        return candidate
      })
      .filter((candidate): candidate is DirectoryCandidateUrl => Boolean(candidate))
      .slice(0, 6)
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

const dedupeCandidates = (candidates: DirectoryCandidateUrl[]) => {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false
    seen.add(candidate.url)
    return true
  })
}

export const discoverDirectoryCandidates = async (
  request: DirectoryCandidateRequest,
): Promise<DirectoryCandidateResponse> => {
  const queries = searchQueries(request)
  const manualSearchLinks = queries.map((query, index) =>
    manualSearchCandidate(request, query, index),
  )
  const operatorCandidates = operatorUrlCandidates(request)
  const searchCandidates = (
    await Promise.all(
      queries.slice(0, 4).flatMap((query) => [
        fetchDuckDuckGoCandidates(request, query),
        fetchDuckDuckGoHtmlCandidates(request, query),
      ]),
    )
  ).flat()

  const candidateUrls = dedupeCandidates([
    ...operatorCandidates,
    ...searchCandidates,
  ]).sort((a, b) => {
    const rank = { High: 0, Medium: 1, Low: 2 }
    return rank[a.confidence] - rank[b.confidence]
  })

  return {
    ok: true,
    candidateUrls,
    manualSearchLinks,
    searchedQueries: queries,
    message:
      candidateUrls.length > 0
        ? 'Candidate URLs found. Operator confirmation is required before saving.'
        : 'No candidate URLs found automatically. Use manual search.',
  }
}
