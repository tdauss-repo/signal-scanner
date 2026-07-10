import type {
  DirectoryFoundData,
  DirectoryListingStatus,
  EvidenceConfidence,
} from '../src/types/audit.ts'

export interface PublicPageCheckRequest {
  listingUrl: string
  businessName: string
  website: string
  phone: string
  phoneNumbers: string[]
  contactStructureNote: string
  localMarket: string
  serviceArea: string
  primaryCategory: string
  secondaryCategories: string
  industryTags: string
  primaryServices: string
  targetLocation: string
}

export interface PublicPageCheckResponse {
  ok: boolean
  requestedUrl: string
  fetchedUrl: string
  status?: number
  listingResult: DirectoryListingStatus
  foundData: DirectoryFoundData
  publicEvidenceNotes: string
  recommendedAction: string
  evidenceConfidence: EvidenceConfidence
  lastCheckedAt: string
  error?: string
}

class PublicPageCheckError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

const maxHtmlBytes = 750_000
const maxTextLength = 25_000
const timeoutMs = 8_000

const headers = {
  accept: 'text/html,application/xhtml+xml',
  'user-agent': 'BusinessScannerTool/1.0 saved-public-directory-page-check',
}

const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) throw new PublicPageCheckError('Listing URL is required.')

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new PublicPageCheckError('Listing URL is invalid.')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new PublicPageCheckError('Listing URL must use http or https.')
  }

  url.hash = ''
  return url
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

const fetchExactUrl = async (url: URL) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers,
    })

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('text/html')) {
      return {
        response,
        body: '',
        nonHtml: true,
      }
    }

    const reader = response.body?.getReader()
    if (!reader) return { response, body: '', nonHtml: false }

    const chunks: Uint8Array[] = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      received += value.byteLength
      if (received > maxHtmlBytes) {
        reader.cancel().catch(() => undefined)
        throw new PublicPageCheckError(
          'Public page HTML is larger than the check limit.',
          413,
        )
      }
      chunks.push(value)
    }

    return {
      response,
      body: new TextDecoder().decode(concatChunks(chunks, received)),
      nonHtml: false,
    }
  } catch (error) {
    if (error instanceof PublicPageCheckError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PublicPageCheckError('Public page fetch timed out.', 504)
    }
    throw new PublicPageCheckError(
      'Public page fetch was unavailable or blocked.',
      502,
    )
  } finally {
    clearTimeout(timeout)
  }
}

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
  decodeEntities(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const stripToVisibleText = (html: string) =>
  cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).slice(0, maxTextLength)

const extractLinks = (html: string, baseUrl: URL) =>
  [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((match) => {
      try {
        return new URL(match[1] ?? '', baseUrl).toString()
      } catch {
        return ''
      }
    })
    .filter(Boolean)

const splitList = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

const normalizeDigits = (value: string) => value.replace(/\D/g, '')

const containsPhrase = (text: string, phrase: string) =>
  Boolean(phrase.trim()) && text.toLowerCase().includes(phrase.trim().toLowerCase())

const phraseSignal = (text: string, phrases: string[]): 'Yes' | 'No' | 'Partial' => {
  const filtered = phrases.filter((phrase) => phrase.trim().length > 1)
  if (filtered.length === 0) return 'No'
  const matches = filtered.filter((phrase) => containsPhrase(text, phrase)).length
  if (matches === 0) return 'No'
  if (matches === filtered.length || matches >= 2) return 'Yes'
  return 'Partial'
}

const phoneSignal = (text: string, phones: string[]): 'Yes' | 'No' | 'Partial' => {
  const expected = phones.map(normalizeDigits).filter(Boolean)
  if (expected.length === 0) return 'No'
  const foundPhones = [
    ...text.matchAll(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g),
  ].map((match) => normalizeDigits(match[0]))

  if (foundPhones.length === 0) return 'No'
  if (
    expected.some((expectedPhone) =>
      foundPhones.some((foundPhone) => foundPhone.endsWith(expectedPhone)),
    )
  ) {
    return 'Yes'
  }
  return 'Partial'
}

const websiteSignal = (
  text: string,
  links: string[],
  website: string,
): 'Yes' | 'No' | 'Partial' => {
  if (!website.trim()) return 'No'
  let domain = ''
  try {
    domain = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
      .hostname.replace(/^www\./i, '')
      .toLowerCase()
  } catch {
    return 'No'
  }

  const combined = `${text} ${links.join(' ')}`.toLowerCase()
  if (combined.includes(domain)) return 'Yes'
  return 'No'
}

const descriptionSignal = (text: string, request: PublicPageCheckRequest) => {
  const contextTerms = [
    request.primaryCategory,
    request.secondaryCategories,
    request.industryTags,
    request.primaryServices,
    request.localMarket,
    request.serviceArea,
  ].flatMap(splitList)

  const wordCount = text.split(/\s+/).filter(Boolean).length
  const context = phraseSignal(text, contextTerms)
  if (wordCount > 120 && context !== 'No') return 'Yes'
  if (wordCount > 60 || context !== 'No') return 'Partial'
  return 'No'
}

const recommendedActionFor = (listingResult: DirectoryListingStatus) => {
  if (listingResult === 'found_accurate') {
    return 'Listing appears accurate based on the public page checked. No immediate cleanup needed.'
  }
  if (listingResult === 'found_incomplete') {
    return 'Update the directory listing with complete contact, website, category, description, and service-area information.'
  }
  if (listingResult === 'found_inaccurate') {
    return 'Correct mismatched listing details so name, phone, website, service area, and category match the business source of truth.'
  }
  return 'Manually review the directory listing and document whether the public information matches the business profile.'
}

const evidenceNotesFor = (
  foundData: DirectoryFoundData,
  listingResult: DirectoryListingStatus,
) => {
  if (listingResult === 'manual_review_needed') {
    return 'Public page fetch was unavailable or blocked. Use manual verification.'
  }

  const found: string[] = []
  const missing: string[] = []
  const partial: string[] = []
  const labels: Array<[keyof DirectoryFoundData, string]> = [
    ['businessNameFound', 'business name'],
    ['websiteFound', 'website'],
    ['phoneFound', 'phone/contact'],
    ['addressOrServiceAreaFound', 'address/service-area wording'],
    ['categoryServicesFound', 'category/services'],
    ['descriptionFound', 'description/context'],
  ]

  labels.forEach(([key, label]) => {
    if (foundData[key] === 'Yes') found.push(label)
    if (foundData[key] === 'No') missing.push(label)
    if (foundData[key] === 'Partial') partial.push(label)
  })

  return [
    `On the public directory page checked, the scanner found ${found.length ? found.join(', ') : 'limited matching information'}.`,
    missing.length ? `Missing or not clearly found: ${missing.join(', ')}.` : '',
    partial.length ? `Partially found or needs review: ${partial.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

const manualReviewResponse = (
  requestedUrl: string,
  fetchedUrl: string,
  status: number | undefined,
  error: string,
): PublicPageCheckResponse => ({
  ok: false,
  requestedUrl,
  fetchedUrl,
  status,
  listingResult: 'manual_review_needed',
  foundData: {
    businessNameFound: 'No',
    phoneFound: 'No',
    websiteFound: 'No',
    addressOrServiceAreaFound: 'No',
    categoryServicesFound: 'No',
    descriptionFound: 'No',
  },
  publicEvidenceNotes:
    'Public page fetch was unavailable or blocked. Use manual verification.',
  recommendedAction: recommendedActionFor('manual_review_needed'),
  evidenceConfidence: 'manual_needs_confirmation',
  lastCheckedAt: new Date().toISOString(),
  error,
})

export const checkPublicDirectoryPage = async (
  request: PublicPageCheckRequest,
): Promise<PublicPageCheckResponse> => {
  let url: URL
  let requestedUrl = request.listingUrl

  try {
    url = normalizeUrl(request.listingUrl)
    requestedUrl = url.toString()
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Public page fetch was unavailable or blocked.'
    const status = error instanceof PublicPageCheckError ? error.statusCode : 400
    return manualReviewResponse(requestedUrl, requestedUrl, status, message)
  }

  try {
    const { response, body, nonHtml } = await fetchExactUrl(url)
    const fetchedUrl = response.url || requestedUrl

    if (!response.ok) {
      return manualReviewResponse(
        requestedUrl,
        fetchedUrl,
        response.status,
        `Public page returned HTTP ${response.status}.`,
      )
    }

    if (nonHtml) {
      return manualReviewResponse(
        requestedUrl,
        fetchedUrl,
        response.status,
        'Public page did not return HTML.',
      )
    }

    const fetchedBaseUrl = new URL(fetchedUrl)
    const visibleText = stripToVisibleText(body)
    const links = extractLinks(body, fetchedBaseUrl)

    if (visibleText.length < 80) {
      return manualReviewResponse(
        requestedUrl,
        fetchedUrl,
        response.status,
        'No useful public page text was extracted.',
      )
    }

    const phones = [request.phone, ...request.phoneNumbers].filter(Boolean)
    const foundData: DirectoryFoundData = {
      businessNameFound: phraseSignal(visibleText, [request.businessName]),
      phoneFound: phoneSignal(visibleText, phones),
      websiteFound: websiteSignal(visibleText, links, request.website),
      addressOrServiceAreaFound: phraseSignal(visibleText, [
        request.localMarket,
        request.targetLocation,
        ...splitList(request.serviceArea),
      ]),
      categoryServicesFound: phraseSignal(visibleText, [
        request.primaryCategory,
        ...splitList(request.secondaryCategories),
        ...splitList(request.industryTags),
        ...splitList(request.primaryServices),
      ]),
      descriptionFound: descriptionSignal(visibleText, request),
    }

    let listingResult: DirectoryListingStatus = 'manual_review_needed'
    if (foundData.businessNameFound !== 'Yes') {
      listingResult = 'manual_review_needed'
    } else {
      const hasContact = ['Yes', 'Partial'].includes(foundData.phoneFound ?? 'No')
      const hasWebsite = foundData.websiteFound === 'Yes'
      const hasArea =
        ['Yes', 'Partial'].includes(foundData.addressOrServiceAreaFound ?? 'No')
      const hasCategory =
        ['Yes', 'Partial'].includes(foundData.categoryServicesFound ?? 'No')

      if ((hasContact || hasWebsite) && (hasArea || hasCategory)) {
        const missingImportant = [
          foundData.phoneFound,
          foundData.websiteFound,
          foundData.addressOrServiceAreaFound,
          foundData.categoryServicesFound,
        ].some((value) => value === 'No')
        listingResult = missingImportant ? 'found_incomplete' : 'found_accurate'
      } else {
        listingResult = 'found_incomplete'
      }
    }

    return {
      ok: true,
      requestedUrl,
      fetchedUrl,
      status: response.status,
      listingResult,
      foundData,
      publicEvidenceNotes: evidenceNotesFor(foundData, listingResult),
      recommendedAction: recommendedActionFor(listingResult),
      evidenceConfidence: 'scanner_detected_public_page',
      lastCheckedAt: new Date().toISOString(),
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Public page fetch was unavailable or blocked.'
    const status = error instanceof PublicPageCheckError ? error.statusCode : 502
    return manualReviewResponse(requestedUrl, requestedUrl, status, message)
  }
}
