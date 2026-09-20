import { pathToFileURL } from 'node:url'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EntityField } from '../src/types/entityMatch.ts'

export type GoogleBrightDataProvider = 'brightdata_serp_api' | 'brightdata_browser_api'
export type GoogleAcquisitionOutcome = 'success' | 'unavailable'
export type BrowserPageClassification = 'normal_serp' | 'google_sorry' | 'captcha_or_challenge' | 'consent_wall' | 'access_failure' | 'navigation_failure'
export type MapsBrowserPageClassification = 'normal_maps_result' | 'no_matching_place' | Exclude<BrowserPageClassification, 'normal_serp'>
export type GoogleAcquisitionBlocker =
  | 'none'
  | 'configuration_missing'
  | 'http_5xx'
  | 'http_error'
  | 'embedded_5xx'
  | 'provider_captcha'
  | 'provider_failure'
  | 'malformed_response'
  | 'missing_result_region'
  | 'structurally_insufficient'
  | BrowserPageClassification

export interface GoogleAcquisitionCandidate {
  id: string
  resultType: 'organic' | 'knowledge_panel' | 'local_place'
  rank?: number
  globalRank?: number
  title?: string
  name?: string
  description?: string
  resultUrl?: string
  resultDomain?: string
  displayedUrl?: string
  businessWebsite?: string
  businessDomain?: string
  phone?: string
  address?: string
  streetAddress?: string
  locality?: string
  region?: string
  postalCode?: string
  category?: string
  placeIdentity?: string
  rating?: number
  reviewCount?: number
  provenance: {
    provider: GoogleBrightDataProvider
    responsePath: string
    websiteBasis: 'explicit_business_website' | 'result_destination_only' | 'not_observed'
    destination?: 'google_search' | 'google_maps'
  }
}

export interface NormalizedGoogleAcquisition {
  contractVersion: 1
  provider: GoogleBrightDataProvider
  provenance: GoogleBrightDataProvider
  query: string
  requestedUrl: string
  finalUrl?: string
  outcome: GoogleAcquisitionOutcome
  usable: boolean
  resultRegionInspected: boolean
  candidates: GoogleAcquisitionCandidate[]
  blocker: GoogleAcquisitionBlocker
  challengeClassification: 'none' | 'google_sorry' | 'captcha_or_challenge' | 'consent_wall' | 'provider_captcha'
  elapsedMs: number
  rawProviderMetadataReference: string
  diagnostic: Record<string, unknown>
  destination?: 'google_search' | 'google_maps'
}

export interface SerpHttpResponse {
  status: number
  statusText?: string
  headers?: Record<string, string>
  bodyText: string
}

export interface SerpAcquisitionConfig {
  query: string
  token: string
  zone: string
  country?: string
  language?: string
  location?: string
  rawProviderMetadataReference: string
}

export interface BrowserAcquisitionConfig {
  query: string
  cdpUrl: string
  playwrightModule?: string
  country?: string
  language?: string
  location?: string
  rawProviderMetadataReference: string
}

export interface BrowserObservedPage {
  title: string
  visibleText: string
  resultRegionInspected: boolean
  organic: Array<{ title?: string; resultUrl?: string; displayedUrl?: string; description?: string; rank?: number }>
  knowledge?: { name?: string; businessWebsite?: string; phone?: string; address?: string; locality?: string; region?: string; postalCode?: string; category?: string; placeIdentity?: string }
  local: Array<{ name?: string; businessWebsite?: string; resultUrl?: string; phone?: string; address?: string; locality?: string; region?: string; postalCode?: string; category?: string; placeIdentity?: string; rank?: number }>
  noResults?: boolean
}

export interface GoogleBrightDataRun {
  primaryProvider: 'brightdata_serp_api'
  selectedProvider: GoogleBrightDataProvider | null
  fallbackTriggered: boolean
  fallbackReason: GoogleAcquisitionBlocker | null
  serp: NormalizedGoogleAcquisition
  browser?: NormalizedGoogleAcquisition
  selected: NormalizedGoogleAcquisition | null
  outcome: GoogleAcquisitionOutcome
  blocker: GoogleAcquisitionBlocker
  resultRegionInspected: boolean
  candidates: GoogleAcquisitionCandidate[]
  elapsedMs: number
}

type JsonRecord = Record<string, unknown>
const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const record = (value: unknown): JsonRecord => isRecord(value) ? value : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const has = (value: JsonRecord, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const text = (...values: unknown[]): string | undefined => {
  const value = values.find((item) => typeof item === 'string' && item.trim())
  return typeof value === 'string' ? value.trim() : undefined
}
const finiteNumber = (...values: unknown[]): number | undefined => {
  const value = values.find((item) => typeof item === 'number' && Number.isFinite(item))
  return typeof value === 'number' ? value : undefined
}
const numericValue = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value.replace(/,/g, '')))) return Number(value.replace(/,/g, ''))
  }
  return undefined
}
const domain = (value?: string): string | undefined => {
  if (!value) return undefined
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') }
  catch {
    const match = value.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:[\s/›]|$)/i)
    return match?.[1]?.toLowerCase()
  }
}
const addressText = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined
  if (!isRecord(value)) return undefined
  return [value.street, value.street_address, value.address1, value.city, value.locality, value.state, value.region, value.zip, value.postal_code]
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join(', ') || undefined
}
const addressParts = (source: JsonRecord, combined?: string) => {
  const direct = isRecord(source.address) ? source.address : {}
  const streetAddress = text(source.street_address, source.streetAddress, direct.street_address, direct.streetAddress, direct.street, direct.address1)
  const locality = text(source.city, source.locality, source.address_locality, direct.city, direct.locality, direct.addressLocality)
  const region = text(source.state, source.region, source.address_region, direct.state, direct.region, direct.addressRegion)
  const postalCode = text(source.zip, source.postal_code, source.postalCode, direct.zip, direct.postal_code, direct.postalCode)
  if (streetAddress || locality || region || postalCode || !combined) return { streetAddress, locality, region, postalCode }
  const match = combined.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i)
  return match ? { streetAddress: match[1], locality: match[2], region: match[3].toUpperCase(), postalCode: match[4] } : {}
}

export function googleSearchUrl(query: string, country = 'us', language = 'en', location = '') {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', query)
  url.searchParams.set('gl', country.toLowerCase())
  url.searchParams.set('hl', language.toLowerCase())
  if (location) url.searchParams.set('uule', location)
  return url.href
}

export function googleMapsUrl(query: string, country = 'us', language = 'en') {
  const url = new URL(`https://www.google.com/maps/search/${encodeURIComponent(query)}/`)
  url.searchParams.set('gl', country.toLowerCase())
  url.searchParams.set('hl', language.toLowerCase())
  url.searchParams.set('brd_json', '1')
  return url.href
}

const normalizeOrganic = (items: unknown[], provider: GoogleBrightDataProvider, path = 'organic'): GoogleAcquisitionCandidate[] => items.flatMap((item, index) => {
  const source = record(item)
  const resultUrl = text(source.link, source.url, source.resultUrl)
  const candidate: GoogleAcquisitionCandidate = {
    id: `${provider}-${path.replace(/_/g, '-')}-${index + 1}`,
    resultType: 'organic',
    rank: finiteNumber(source.rank, source.position),
    globalRank: finiteNumber(source.global_rank, source.globalRank),
    title: text(source.title),
    name: text(source.source, source.name),
    description: text(source.description, source.snippet),
    resultUrl,
    resultDomain: domain(resultUrl),
    displayedUrl: text(source.display_link, source.displayed_link, source.displayedUrl),
    provenance: { provider, responsePath: `${path}[${index}]`, websiteBasis: resultUrl ? 'result_destination_only' : 'not_observed' },
  }
  return candidate.title || candidate.name || candidate.resultUrl ? [candidate] : []
})

const normalizeKnowledge = (value: unknown, provider: GoogleBrightDataProvider, path = 'knowledge'): GoogleAcquisitionCandidate[] => {
  const source = record(value)
  if (!Object.keys(source).length) return []
  const businessWebsite = text(source.website, source.website_url, source.businessWebsite)
  const resultUrl = text(source.link, source.profile_link, source.maps_link, source.resultUrl)
  const address = addressText(source.address)
  const parts = addressParts(source, address)
  const candidate: GoogleAcquisitionCandidate = {
    id: `${provider}-knowledge-panel-1`, resultType: 'knowledge_panel', name: text(source.name, source.title),
    description: text(source.description, source.summary), resultUrl, resultDomain: domain(resultUrl), businessWebsite,
    businessDomain: domain(businessWebsite), phone: text(source.phone, source.telephone), address, ...parts,
    category: text(source.type, source.category, source.subtitle), placeIdentity: text(source.fid, source.cid, source.place_id, source.placeIdentity, source.kgmid),
    provenance: { provider, responsePath: path, websiteBasis: businessWebsite ? 'explicit_business_website' : resultUrl ? 'result_destination_only' : 'not_observed' },
  }
  return candidate.name || candidate.businessWebsite || candidate.phone || candidate.address ? [candidate] : []
}

const normalizePlaces = (items: unknown[], provider: GoogleBrightDataProvider, path: string, destination: 'google_search' | 'google_maps' = 'google_search'): GoogleAcquisitionCandidate[] => items.flatMap((item, index) => {
  const source = record(item)
  const businessWebsite = text(source.website, record(source.website).link, record(source.website).url, source.website_url, source.businessWebsite)
  const genericUrl = text(source.url)
  const mapsUrl = genericUrl && /google\.[^/]+\/maps\//i.test(genericUrl) ? genericUrl : undefined
  const resultUrl = text(source.link, source.profile_link, source.maps_link, source.place_url, source.resultUrl, mapsUrl)
  const address = addressText(source.address) || text(source.formatted_address, source.full_address)
  const parts = addressParts(source, address)
  const candidate: GoogleAcquisitionCandidate = {
    id: `${provider}-${path.replace(/_/g, '-')}-${index + 1}`, resultType: 'local_place',
    rank: finiteNumber(source.rank, source.position), globalRank: finiteNumber(source.global_rank, source.globalRank),
    title: text(source.title), name: text(source.name, source.title), description: text(source.description, source.work_status),
    resultUrl, resultDomain: domain(resultUrl), businessWebsite, businessDomain: domain(businessWebsite),
    phone: text(source.phone, source.telephone, source.phone_number), address, ...parts, category: text(source.type, source.category, source.main_category),
    placeIdentity: text(source.fid, source.cid, source.place_id, source.placeIdentity, source.data_id),
    rating: numericValue(source.rating, source.stars), reviewCount: numericValue(source.reviews, source.reviews_count, source.reviews_cnt, source.review_count),
    provenance: { provider, responsePath: `${path}[${index}]`, websiteBasis: businessWebsite ? 'explicit_business_website' : resultUrl ? 'result_destination_only' : 'not_observed', destination },
  }
  return candidate.name || candidate.businessWebsite || candidate.phone || candidate.address ? [candidate] : []
})

export function unwrapSerpPayload(value: unknown): JsonRecord {
  if (!isRecord(value)) return {}
  if (isRecord(value.body)) return value.body
  if (typeof value.body === 'string') {
    try { const parsed = JSON.parse(value.body) as unknown; if (isRecord(parsed)) return parsed } catch { return value }
  }
  return value
}

export function normalizeSerpPayload(payload: JsonRecord): GoogleAcquisitionCandidate[] {
  const organic = array(payload.organic).length || has(payload, 'organic') ? array(payload.organic) : array(payload.organic_results)
  return [
    ...normalizeOrganic(organic, 'brightdata_serp_api'),
    ...normalizeKnowledge(payload.knowledge, 'brightdata_serp_api'),
    ...normalizePlaces(array(payload.snack_pack), 'brightdata_serp_api', 'snack_pack'),
    ...normalizePlaces(array(payload.local_results), 'brightdata_serp_api', 'local_results'),
    ...normalizePlaces(array(payload.local), 'brightdata_serp_api', 'local'),
    ...normalizePlaces(array(payload.places), 'brightdata_serp_api', 'places'),
    ...normalizePlaces(array(payload.map_results), 'brightdata_serp_api', 'map_results'),
  ]
}

const recognizedResultRegion = (payload: JsonRecord) =>
  (has(payload, 'organic') && Array.isArray(payload.organic)) || (has(payload, 'organic_results') && Array.isArray(payload.organic_results)) ||
  (has(payload, 'knowledge') && isRecord(payload.knowledge) && Object.keys(payload.knowledge).length > 0) ||
  ['snack_pack', 'local_results', 'local', 'places', 'map_results'].some((key) => has(payload, key) && Array.isArray(payload[key]))

const representedResultCount = (payload: JsonRecord) =>
  ['organic', 'organic_results', 'snack_pack', 'local_results', 'local', 'places', 'map_results'].reduce((count, key) => count + array(payload[key]).length, 0) +
  (isRecord(payload.knowledge) && Object.keys(payload.knowledge).length ? 1 : 0)

const headerValue = (headers: Record<string, string> | undefined, name: string) => Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || ''
const responseText = (value: unknown) => { try { return JSON.stringify(value).slice(0, 100_000) } catch { return '' } }

export function classifySerpResponse(input: { status: number; headers?: Record<string, string>; parsed: unknown }): { usable: boolean; blocker: GoogleAcquisitionBlocker; resultRegionInspected: boolean; payload: JsonRecord; candidates: GoogleAcquisitionCandidate[]; challengeClassification: NormalizedGoogleAcquisition['challengeClassification'] } {
  const errorCode = headerValue(input.headers, 'x-brd-error-code')
  const payload = unwrapSerpPayload(input.parsed)
  const embeddedStatus = finiteNumber(payload.status_code, record(input.parsed).status_code)
  const body = responseText(input.parsed)
  if (errorCode) return { usable: false, blocker: /captcha/i.test(errorCode) ? 'provider_captcha' : 'provider_failure', resultRegionInspected: false, payload, candidates: [], challengeClassification: /captcha/i.test(errorCode) ? 'provider_captcha' : 'none' }
  if (input.status >= 500) return { usable: false, blocker: 'http_5xx', resultRegionInspected: false, payload, candidates: [], challengeClassification: /captcha/i.test(body) ? 'provider_captcha' : 'none' }
  if (input.status >= 400) return { usable: false, blocker: 'http_error', resultRegionInspected: false, payload, candidates: [], challengeClassification: 'none' }
  if (embeddedStatus && embeddedStatus >= 500) return { usable: false, blocker: 'embedded_5xx', resultRegionInspected: false, payload, candidates: [], challengeClassification: /captcha/i.test(body) ? 'provider_captcha' : 'none' }
  if (/captcha|challenge/i.test(body) && /error|failed|blocked|unblock/i.test(body)) return { usable: false, blocker: 'provider_captcha', resultRegionInspected: false, payload, candidates: [], challengeClassification: 'provider_captcha' }
  if (/unblock(?:er)?[^]{0,80}(?:error|fail)|provider[^]{0,80}(?:error|fail)/i.test(body) || (payload.error && !recognizedResultRegion(payload))) return { usable: false, blocker: 'provider_failure', resultRegionInspected: false, payload, candidates: [], challengeClassification: 'none' }
  if (!isRecord(input.parsed)) return { usable: false, blocker: 'malformed_response', resultRegionInspected: false, payload, candidates: [], challengeClassification: 'none' }
  if (typeof input.parsed.body === 'string' && payload === input.parsed) return { usable: false, blocker: 'malformed_response', resultRegionInspected: false, payload, candidates: [], challengeClassification: 'none' }
  const resultRegionInspected = recognizedResultRegion(payload)
  if (!resultRegionInspected) return { usable: false, blocker: 'missing_result_region', resultRegionInspected: false, payload, candidates: [], challengeClassification: 'none' }
  const candidates = normalizeSerpPayload(payload)
  if (representedResultCount(payload) > 0 && !candidates.length) return { usable: false, blocker: 'structurally_insufficient', resultRegionInspected: true, payload, candidates: [], challengeClassification: 'none' }
  return { usable: true, blocker: 'none', resultRegionInspected: true, payload, candidates, challengeClassification: 'none' }
}

const defaultSerpRequest = async (config: SerpAcquisitionConfig, requestedUrl: string): Promise<SerpHttpResponse> => {
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: config.zone, url: requestedUrl, format: 'json' }), signal: AbortSignal.timeout(60_000),
  })
  return { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()), bodyText: await response.text() }
}

export async function acquireBrightDataSerp(config: SerpAcquisitionConfig, request = defaultSerpRequest): Promise<NormalizedGoogleAcquisition & { rawResponse: unknown }> {
  const started = performance.now()
  const requestedUrl = googleSearchUrl(config.query, config.country, config.language, config.location)
  if (!config.token || !config.zone) return { contractVersion: 1, provider: 'brightdata_serp_api', provenance: 'brightdata_serp_api', query: config.query, requestedUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'configuration_missing', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { requestSent: false, retries: 0 }, rawResponse: { error: 'configuration_missing' } }
  try {
    const response = await request(config, requestedUrl)
    let parsed: unknown
    try { parsed = JSON.parse(response.bodyText) as unknown }
    catch { parsed = response.bodyText }
    const classified = classifySerpResponse({ status: response.status, headers: response.headers, parsed })
    const general = record(classified.payload.general)
    const input = record(classified.payload.input)
    return {
      contractVersion: 1, provider: 'brightdata_serp_api', provenance: 'brightdata_serp_api', query: config.query, requestedUrl,
      finalUrl: text(input.original_url) || requestedUrl, outcome: classified.usable ? 'success' : 'unavailable', usable: classified.usable,
      resultRegionInspected: classified.resultRegionInspected, candidates: classified.candidates, blocker: classified.blocker,
      challengeClassification: classified.challengeClassification, elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference,
      diagnostic: { requestSent: true, retries: 0, httpStatus: response.status, statusText: response.statusText || null, responseId: headerValue(response.headers, 'x-response-id') || null, brightDataErrorCode: headerValue(response.headers, 'x-brd-error-code') || null, reportedSearchEngine: text(general.search_engine) || null, reportedLocation: text(general.location) || null }, rawResponse: parsed,
    }
  } catch (error) {
    return { contractVersion: 1, provider: 'brightdata_serp_api', provenance: 'brightdata_serp_api', query: config.query, requestedUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'provider_failure', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { requestSent: true, retries: 0, error: error instanceof Error ? error.message : String(error) }, rawResponse: { error: 'request_failed' } }
  }
}

const mapsCollectionKeys = ['results', 'places', 'local_results', 'map_results', 'local', 'businesses'] as const

/** Normalize parsed Google Maps/local-place responses without treating place URLs as official websites. */
export function normalizeMapsPayload(payload: JsonRecord, provider: GoogleBrightDataProvider = 'brightdata_serp_api'): GoogleAcquisitionCandidate[] {
  const nestedResults = record(payload.results)
  const collections = mapsCollectionKeys.flatMap((key) => [
    ...normalizePlaces(array(payload[key]), provider, key, 'google_maps'),
    ...normalizePlaces(array(nestedResults[key]), provider, `results.${key}`, 'google_maps'),
  ])
  const singular = ['place', 'overview'].flatMap((key) => {
    const value = payload[key]
    return isRecord(value) && Object.keys(value).length ? normalizePlaces([value], provider, key, 'google_maps') : []
  })
  return [...collections, ...singular]
}

const mapsResultRegion = (payload: JsonRecord) => {
  const nestedResults = record(payload.results)
  return mapsCollectionKeys.some((key) => has(payload, key) && Array.isArray(payload[key]))
    || mapsCollectionKeys.some((key) => has(nestedResults, key) && Array.isArray(nestedResults[key]))
    || ['place', 'overview'].some((key) => has(payload, key) && isRecord(payload[key]))
}

const mapsRepresentedCount = (payload: JsonRecord) => {
  const nestedResults = record(payload.results)
  return mapsCollectionKeys.reduce((count, key) => count + array(payload[key]).length + array(nestedResults[key]).length, 0)
    + ['place', 'overview'].filter((key) => isRecord(payload[key]) && Object.keys(record(payload[key])).length).length
}

export function classifyMapsSerpResponse(input: { status: number; headers?: Record<string, string>; parsed: unknown }) {
  const errorCode = headerValue(input.headers, 'x-brd-error-code')
  const payload = unwrapSerpPayload(input.parsed)
  const embeddedStatus = finiteNumber(payload.status_code, record(input.parsed).status_code)
  const body = responseText(input.parsed)
  const failure = (blocker: GoogleAcquisitionBlocker, challengeClassification: NormalizedGoogleAcquisition['challengeClassification'] = 'none', inspected = false) => ({ usable: false, blocker, resultRegionInspected: inspected, payload, candidates: [] as GoogleAcquisitionCandidate[], challengeClassification })
  if (errorCode) return failure(/captcha/i.test(errorCode) ? 'provider_captcha' : 'provider_failure', /captcha/i.test(errorCode) ? 'provider_captcha' : 'none')
  if (input.status >= 500) return failure('http_5xx', /captcha/i.test(body) ? 'provider_captcha' : 'none')
  if (input.status >= 400) return failure('http_error')
  if (embeddedStatus && embeddedStatus >= 500) return failure('embedded_5xx', /captcha/i.test(body) ? 'provider_captcha' : 'none')
  if (/captcha|challenge/i.test(body) && /error|failed|blocked|unblock/i.test(body)) return failure('provider_captcha', 'provider_captcha')
  if (/unblock(?:er)?[^]{0,80}(?:error|fail)|provider[^]{0,80}(?:error|fail)/i.test(body) || (payload.error && !mapsResultRegion(payload))) return failure('provider_failure')
  if (!isRecord(input.parsed)) return failure('malformed_response')
  if (typeof input.parsed.body === 'string' && payload === input.parsed) return failure('malformed_response')
  if (!mapsResultRegion(payload)) return failure('missing_result_region')
  const candidates = normalizeMapsPayload(payload)
  if (mapsRepresentedCount(payload) > 0 && !candidates.length) return failure('structurally_insufficient', 'none', true)
  return { usable: true, blocker: 'none' as const, resultRegionInspected: true, payload, candidates, challengeClassification: 'none' as const }
}

export async function acquireBrightDataMaps(config: SerpAcquisitionConfig, request = defaultSerpRequest): Promise<NormalizedGoogleAcquisition & { rawResponse: unknown }> {
  const started = performance.now()
  const requestedUrl = googleMapsUrl(config.query, config.country, config.language)
  if (!config.token || !config.zone) return { contractVersion: 1, provider: 'brightdata_serp_api', provenance: 'brightdata_serp_api', destination: 'google_maps', query: config.query, requestedUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'configuration_missing', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { requestSent: false, retries: 0 }, rawResponse: { error: 'configuration_missing' } }
  try {
    const response = await request(config, requestedUrl)
    let parsed: unknown
    try { parsed = JSON.parse(response.bodyText) as unknown }
    catch { parsed = response.bodyText }
    const classified = classifyMapsSerpResponse({ status: response.status, headers: response.headers, parsed })
    const general = record(classified.payload.general)
    const input = record(classified.payload.input)
    return {
      contractVersion: 1, provider: 'brightdata_serp_api', provenance: 'brightdata_serp_api', destination: 'google_maps', query: config.query, requestedUrl,
      finalUrl: text(input.original_url) || requestedUrl, outcome: classified.usable ? 'success' : 'unavailable', usable: classified.usable,
      resultRegionInspected: classified.resultRegionInspected, candidates: classified.candidates, blocker: classified.blocker,
      challengeClassification: classified.challengeClassification, elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference,
      diagnostic: { requestSent: true, retries: 0, httpStatus: response.status, statusText: response.statusText || null, responseId: headerValue(response.headers, 'x-response-id') || null, brightDataErrorCode: headerValue(response.headers, 'x-brd-error-code') || null, reportedSearchEngine: text(general.search_engine) || 'google_maps', reportedLocation: text(general.location) || null }, rawResponse: parsed,
    }
  } catch (error) {
    return { contractVersion: 1, provider: 'brightdata_serp_api', provenance: 'brightdata_serp_api', destination: 'google_maps', query: config.query, requestedUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'provider_failure', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { requestSent: true, retries: 0, error: error instanceof Error ? error.message : String(error) }, rawResponse: { error: 'request_failed' } }
  }
}

const resolveResultUrl = (value: string | undefined, base: string): string | undefined => {
  if (!value) return undefined
  try {
    const direct = new URL(value, base)
    if (/^(?:www\.)?google\./i.test(direct.hostname)) {
      for (const key of ['url', 'q', 'adurl']) {
        const target = direct.searchParams.get(key)
        if (target) { const resolved = new URL(target); if (!/^(?:www\.)?google\./i.test(resolved.hostname)) return resolved.href }
      }
    }
    return direct.href
  } catch { return undefined }
}

export function normalizeBrowserObservation(observed: BrowserObservedPage, requestedUrl: string): GoogleAcquisitionCandidate[] {
  const organic = observed.organic.map((item) => ({ ...item, link: resolveResultUrl(item.resultUrl, requestedUrl) }))
  const knowledge = observed.knowledge ? { ...observed.knowledge, website: resolveResultUrl(observed.knowledge.businessWebsite, requestedUrl) } : undefined
  const local = observed.local.map((item) => ({ ...item, website: resolveResultUrl(item.businessWebsite, requestedUrl), link: resolveResultUrl(item.resultUrl, requestedUrl) }))
  return [
    ...normalizeOrganic(organic, 'brightdata_browser_api', 'organic'),
    ...normalizeKnowledge(knowledge, 'brightdata_browser_api', 'knowledge'),
    ...normalizePlaces(local, 'brightdata_browser_api', 'local'),
  ]
}

export function classifyBrowserPage(finalUrl: string, observed: BrowserObservedPage, navigationFailed = false): BrowserPageClassification {
  if (navigationFailed) return 'navigation_failure'
  const path = (() => { try { return new URL(finalUrl).pathname } catch { return '' } })()
  if (!path) return 'access_failure'
  const page = `${observed.title}\n${observed.visibleText}`
  if (path.startsWith('/sorry') || /unusual traffic|automated queries/i.test(page)) return 'google_sorry'
  if (/captcha|verify (?:that )?you are human|not a robot/i.test(page)) return 'captcha_or_challenge'
  if (/before you continue to google|consent\.google\.|choose your search customization/i.test(`${finalUrl}\n${page}`)) return 'consent_wall'
  return observed.resultRegionInspected ? 'normal_serp' : 'access_failure'
}

interface RemotePage {
  goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<{ status(): number } | null>
  waitForLoadState(state: 'networkidle', options: { timeout: number }): Promise<void>
  evaluate<T>(expression: string): Promise<T>
  url(): string
}
interface RemoteBrowser { newPage(): Promise<RemotePage>; close(): Promise<void> }
interface RemoteChromium { connectOverCDP(url: string): Promise<RemoteBrowser> }

const emptyObserved = (): BrowserObservedPage => ({ title: '', visibleText: '', resultRegionInspected: false, organic: [], local: [] })
const redactConnection = (value: string) => value.replace(/wss:\/\/[^@\s]+@/gi, 'wss://***@')

const defaultBrowserObserve = async (config: BrowserAcquisitionConfig, requestedUrl: string): Promise<{ observed: BrowserObservedPage; finalUrl: string; statusCode?: number; navigationFailed: boolean; error?: string }> => {
  if (!config.cdpUrl) return { observed: emptyObserved(), finalUrl: requestedUrl, navigationFailed: false, error: 'BRIGHTDATA_BROWSER_CDP_URL is not configured.' }
  let browser: RemoteBrowser | undefined
  try {
    const moduleSpecifier = config.playwrightModule ? pathToFileURL(config.playwrightModule).href : 'playwright'
    const { chromium } = await import(moduleSpecifier) as { chromium: RemoteChromium }
    browser = await chromium.connectOverCDP(config.cdpUrl)
    const page = await browser.newPage()
    let response: { status(): number } | null = null
    try {
      response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    } catch (error) {
      return { observed: emptyObserved(), finalUrl: page.url() || requestedUrl, navigationFailed: true, error: redactConnection(error instanceof Error ? error.message : String(error)) }
    }
    const observed = await page.evaluate<BrowserObservedPage>(`(() => {
      const clean = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
      const search = document.querySelector('#search');
      const headings = search ? Array.from(search.querySelectorAll('h3')).slice(0, 20) : [];
      const organic = headings.map((heading, index) => {
        const anchor = heading.closest('a[href]') || heading.parentElement?.querySelector('a[href]');
        let scope = heading.closest('[data-snhf], [data-sncf], article, li') || heading.parentElement;
        for (let depth = 0; scope && depth < 3 && clean(scope.innerText || scope.textContent, 4000).length < 250; depth += 1) scope = scope.parentElement;
        const cite = scope?.querySelector('cite');
        const text = clean(scope?.innerText || scope?.textContent, 2500);
        return { title: clean(heading.innerText || heading.textContent, 300), resultUrl: String(anchor?.href || '').slice(0, 2048), displayedUrl: clean(cite?.innerText || cite?.textContent, 500), description: text, rank: index + 1 };
      }).filter(item => item.title && item.resultUrl);
      const rhs = document.querySelector('#rhs, [role="complementary"]');
      const rhsText = clean(rhs?.innerText || rhs?.textContent, 8000);
      const rhsLinks = rhs ? Array.from(rhs.querySelectorAll('a[href]')).slice(0, 80) : [];
      const website = rhsLinks.find(link => /^(website|official site)$/i.test(clean(link.innerText || link.textContent || link.getAttribute('aria-label'), 100)));
      const name = clean(rhs?.querySelector('h1, h2, [data-attrid="title"]')?.textContent, 300);
      const phone = rhsText.match(/(?:\\+?1[ .-]?)?\\(?\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4}/)?.[0] || '';
      const addressNode = rhs?.querySelector('[data-attrid*="address" i], [data-item-id="address"]');
      const categoryNode = rhs?.querySelector('[data-attrid*="category" i], [data-attrid*="subtitle" i]');
      const placeLink = rhsLinks.find(link => /\\/maps\\/(?:place|search)\\//i.test(String(link.href || '')));
      const knowledge = rhs && (name || website || phone || addressNode) ? { name, businessWebsite: String(website?.href || '').slice(0, 2048), phone: clean(phone, 80), address: clean(addressNode?.textContent || addressNode?.getAttribute('aria-label'), 500), category: clean(categoryNode?.textContent, 200), placeIdentity: String(placeLink?.href || '').slice(0, 2048) } : undefined;
      const localScopes = search ? Array.from(search.querySelectorAll('[data-cid], [data-local-attribute], .VkpGBb')).slice(0, 10) : [];
      const local = localScopes.map((scope, index) => {
        const scopeText = clean(scope.innerText || scope.textContent, 2500);
        const links = Array.from(scope.querySelectorAll('a[href]')).slice(0, 30);
        const websiteLink = links.find(link => /^(website|official site)$/i.test(clean(link.innerText || link.textContent || link.getAttribute('aria-label'), 100)));
        const profileLink = links.find(link => /\\/maps\\/(?:place|search)\\//i.test(String(link.href || '')));
        const heading = scope.querySelector('h3, h2, [role="heading"]');
        const address = clean(scope.querySelector('[data-item-id="address"], [data-local-attribute="d3adr"]')?.textContent, 500);
        const phone = scopeText.match(/(?:\\+?1[ .-]?)?\\(?\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4}/)?.[0] || '';
        return { name: clean(heading?.innerText || heading?.textContent, 300), businessWebsite: String(websiteLink?.href || '').slice(0, 2048), resultUrl: String(profileLink?.href || '').slice(0, 2048), phone: clean(phone, 80), address, category: clean(scope.querySelector('[data-local-attribute="d3r"]')?.textContent, 200), placeIdentity: clean(scope.getAttribute('data-cid') || profileLink?.href, 2048), rank: index + 1 };
      }).filter(item => item.name && (item.businessWebsite || item.resultUrl || item.phone || item.address));
      const noResults = /did not match any documents|no results found/i.test(clean(search?.innerText || search?.textContent, 3000));
      return { title: clean(document.title, 300), visibleText: clean(document.body?.innerText, 20000), resultRegionInspected: Boolean((search && (organic.length || local.length || noResults)) || knowledge), organic, knowledge, local };
    })()`)
    return { observed, finalUrl: page.url() || requestedUrl, statusCode: response?.status(), navigationFailed: false }
  } catch (error) {
    return { observed: emptyObserved(), finalUrl: requestedUrl, navigationFailed: false, error: redactConnection(error instanceof Error ? error.message : String(error)) }
  } finally { await browser?.close().catch(() => undefined) }
}

export async function acquireBrightDataBrowser(config: BrowserAcquisitionConfig, observe = defaultBrowserObserve): Promise<NormalizedGoogleAcquisition> {
  const started = performance.now()
  const requestedUrl = googleSearchUrl(config.query, config.country, config.language, config.location)
  if (!config.cdpUrl) return { contractVersion: 1, provider: 'brightdata_browser_api', provenance: 'brightdata_browser_api', query: config.query, requestedUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'configuration_missing', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { connectionAttempted: false, retries: 0, challengeInteractionAttempted: false } }
  const capture = await observe(config, requestedUrl)
  if (capture.error && !capture.navigationFailed) return { contractVersion: 1, provider: 'brightdata_browser_api', provenance: 'brightdata_browser_api', query: config.query, requestedUrl, finalUrl: capture.finalUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'access_failure', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { connectionAttempted: true, retries: 0, challengeInteractionAttempted: false, error: capture.error } }
  const classification = classifyBrowserPage(capture.finalUrl, capture.observed, capture.navigationFailed)
  const usable = classification === 'normal_serp'
  const candidates = usable ? normalizeBrowserObservation(capture.observed, requestedUrl) : []
  const challengeClassification = ['google_sorry', 'captcha_or_challenge', 'consent_wall'].includes(classification) ? classification as NormalizedGoogleAcquisition['challengeClassification'] : 'none'
  return { contractVersion: 1, provider: 'brightdata_browser_api', provenance: 'brightdata_browser_api', query: config.query, requestedUrl, finalUrl: capture.finalUrl, outcome: usable ? 'success' : 'unavailable', usable, resultRegionInspected: usable && capture.observed.resultRegionInspected, candidates, blocker: usable ? 'none' : classification, challengeClassification, elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { connectionAttempted: true, navigationStatus: capture.statusCode || null, classification, retries: 0, challengeInteractionAttempted: false, title: capture.observed.title, boundedVisibleText: capture.observed.visibleText.slice(0, 20_000), error: capture.error || null } }
}

export function classifyMapsBrowserPage(finalUrl: string, observed: BrowserObservedPage, navigationFailed = false): MapsBrowserPageClassification {
  if (navigationFailed) return 'navigation_failure'
  const path = (() => { try { return new URL(finalUrl).pathname } catch { return '' } })()
  if (!path) return 'access_failure'
  const page = `${observed.title}\n${observed.visibleText}`
  if (path.startsWith('/sorry') || /unusual traffic|automated queries/i.test(page)) return 'google_sorry'
  if (/captcha|verify (?:that )?you are human|not a robot/i.test(page)) return 'captcha_or_challenge'
  if (/before you continue to google|consent\.google\.|choose your search customization/i.test(`${finalUrl}\n${page}`)) return 'consent_wall'
  if (observed.resultRegionInspected && observed.noResults) return 'no_matching_place'
  if (observed.resultRegionInspected && observed.local.length) return 'normal_maps_result'
  return 'access_failure'
}

const defaultMapsBrowserObserve = async (config: BrowserAcquisitionConfig, requestedUrl: string): Promise<{ observed: BrowserObservedPage; finalUrl: string; statusCode?: number; navigationFailed: boolean; error?: string }> => {
  if (!config.cdpUrl) return { observed: emptyObserved(), finalUrl: requestedUrl, navigationFailed: false, error: 'BRIGHTDATA_BROWSER_CDP_URL is not configured.' }
  let browser: RemoteBrowser | undefined
  try {
    const moduleSpecifier = config.playwrightModule ? pathToFileURL(config.playwrightModule).href : 'playwright'
    const { chromium } = await import(moduleSpecifier) as { chromium: RemoteChromium }
    browser = await chromium.connectOverCDP(config.cdpUrl)
    const page = await browser.newPage()
    let response: { status(): number } | null = null
    try {
      response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    } catch (error) {
      return { observed: emptyObserved(), finalUrl: page.url() || requestedUrl, navigationFailed: true, error: redactConnection(error instanceof Error ? error.message : String(error)) }
    }
    const observed = await page.evaluate<BrowserObservedPage>(`(() => {
      const clean = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
      const mapsUrl = value => { try { const url = new URL(String(value || ''), location.href); return /google\\.[^/]+\\/maps\\/(?:place|search)/i.test(url.href) ? url.href.slice(0, 2048) : ''; } catch { return ''; } };
      const action = (scope, matcher) => Array.from(scope?.querySelectorAll('a[href], button') || []).find(node => matcher.test(clean(node.getAttribute('aria-label') || node.textContent, 150)));
      const record = (scope, rank) => {
        const placeLink = Array.from(scope.querySelectorAll('a[href]')).map(link => mapsUrl(link.href)).find(Boolean) || '';
        const heading = scope.querySelector('h1, h2, h3, [role="heading"], a.hfpxzc');
        const website = action(scope, /^(?:website|official site)(?:\\b|:)/i);
        const phoneNode = scope.querySelector('[data-item-id^="phone:"], [data-tooltip*="phone" i]') || action(scope, /^(?:phone|call)(?:\\b|:)/i);
        const addressNode = scope.querySelector('[data-item-id="address"], [data-tooltip*="address" i]') || action(scope, /^address(?:\\b|:)/i);
        const categoryNode = scope.querySelector('[jsaction*="category" i], [data-item-id*="category" i]');
        const websiteUrl = website && website.tagName === 'A' ? String(website.href || '') : '';
        const name = clean(heading?.getAttribute('aria-label') || heading?.textContent, 300);
        return { name, businessWebsite: websiteUrl && !mapsUrl(websiteUrl) ? websiteUrl.slice(0, 2048) : '', resultUrl: placeLink, phone: clean(phoneNode?.getAttribute('aria-label') || phoneNode?.textContent, 100).replace(/^(?:phone|call):?\\s*/i, ''), address: clean(addressNode?.getAttribute('aria-label') || addressNode?.textContent, 500).replace(/^address:?\\s*/i, ''), category: clean(categoryNode?.textContent, 200), placeIdentity: clean(scope.getAttribute('data-cid') || placeLink, 2048), rank };
      };
      const feed = document.querySelector('[role="feed"]');
      const cards = feed ? Array.from(feed.querySelectorAll('[role="article"]')).slice(0, 20).map((scope, index) => record(scope, index + 1)).filter(item => item.name && (item.resultUrl || item.phone || item.address || item.businessWebsite)) : [];
      const main = document.querySelector('main, [role="main"]');
      const detail = main?.querySelector('h1') ? record(main, 1) : null;
      const local = detail && detail.name && (detail.resultUrl || detail.phone || detail.address || detail.businessWebsite) ? [detail, ...cards.filter(item => item.placeIdentity !== detail.placeIdentity)] : cards;
      const visibleText = clean(document.body?.innerText, 20000);
      const noResults = /no results found|can't find|couldn't find|did not match any places/i.test(visibleText);
      return { title: clean(document.title, 300), visibleText, resultRegionInspected: Boolean(local.length || noResults), organic: [], local, noResults };
    })()`)
    return { observed, finalUrl: page.url() || requestedUrl, statusCode: response?.status(), navigationFailed: false }
  } catch (error) {
    return { observed: emptyObserved(), finalUrl: requestedUrl, navigationFailed: false, error: redactConnection(error instanceof Error ? error.message : String(error)) }
  } finally { await browser?.close().catch(() => undefined) }
}

export async function acquireBrightDataMapsBrowser(config: BrowserAcquisitionConfig, observe = defaultMapsBrowserObserve): Promise<NormalizedGoogleAcquisition> {
  const started = performance.now()
  const requestedUrl = googleMapsUrl(config.query, config.country, config.language)
  if (!config.cdpUrl) return { contractVersion: 1, provider: 'brightdata_browser_api', provenance: 'brightdata_browser_api', destination: 'google_maps', query: config.query, requestedUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'configuration_missing', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { connectionAttempted: false, retries: 0, challengeInteractionAttempted: false } }
  const capture = await observe(config, requestedUrl)
  if (capture.error && !capture.navigationFailed) return { contractVersion: 1, provider: 'brightdata_browser_api', provenance: 'brightdata_browser_api', destination: 'google_maps', query: config.query, requestedUrl, finalUrl: capture.finalUrl, outcome: 'unavailable', usable: false, resultRegionInspected: false, candidates: [], blocker: 'access_failure', challengeClassification: 'none', elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { connectionAttempted: true, retries: 0, challengeInteractionAttempted: false, error: capture.error } }
  const classification = classifyMapsBrowserPage(capture.finalUrl, capture.observed, capture.navigationFailed)
  const usable = ['normal_maps_result', 'no_matching_place'].includes(classification)
  const candidates = usable ? normalizePlaces(capture.observed.local, 'brightdata_browser_api', 'maps', 'google_maps') : []
  const challengeClassification = ['google_sorry', 'captcha_or_challenge', 'consent_wall'].includes(classification) ? classification as NormalizedGoogleAcquisition['challengeClassification'] : 'none'
  const blocker: GoogleAcquisitionBlocker = usable ? 'none' : classification as Exclude<MapsBrowserPageClassification, 'normal_maps_result' | 'no_matching_place'>
  return { contractVersion: 1, provider: 'brightdata_browser_api', provenance: 'brightdata_browser_api', destination: 'google_maps', query: config.query, requestedUrl, finalUrl: capture.finalUrl, outcome: usable ? 'success' : 'unavailable', usable, resultRegionInspected: usable && capture.observed.resultRegionInspected, candidates, blocker, challengeClassification, elapsedMs: Math.round(performance.now() - started), rawProviderMetadataReference: config.rawProviderMetadataReference, diagnostic: { connectionAttempted: true, navigationStatus: capture.statusCode || null, classification, retries: 0, challengeInteractionAttempted: false, title: capture.observed.title, boundedVisibleText: capture.observed.visibleText.slice(0, 20_000), error: capture.error || null } }
}

export interface OrchestratorDependencies {
  acquireSerp?: typeof acquireBrightDataSerp
  acquireBrowser?: typeof acquireBrightDataBrowser
}

export interface MapsOrchestratorDependencies {
  acquireSerp?: typeof acquireBrightDataMaps
  acquireBrowser?: typeof acquireBrightDataMapsBrowser
}

const browserFallbackEligible = (blocker: GoogleAcquisitionBlocker) => [
  'http_5xx', 'http_error', 'embedded_5xx', 'provider_captcha', 'provider_failure', 'malformed_response', 'missing_result_region', 'structurally_insufficient',
].includes(blocker)

export async function acquireGoogleWithBrightData(config: SerpAcquisitionConfig & { browserCdpUrl: string; playwrightModule?: string; browserMetadataReference: string }, dependencies: OrchestratorDependencies = {}): Promise<GoogleBrightDataRun> {
  const started = performance.now()
  const serp = await (dependencies.acquireSerp || acquireBrightDataSerp)(config)
  if (serp.usable) return { primaryProvider: 'brightdata_serp_api', selectedProvider: 'brightdata_serp_api', fallbackTriggered: false, fallbackReason: null, serp, selected: serp, outcome: 'success', blocker: 'none', resultRegionInspected: serp.resultRegionInspected, candidates: serp.candidates, elapsedMs: Math.round(performance.now() - started) }
  if (!browserFallbackEligible(serp.blocker)) return { primaryProvider: 'brightdata_serp_api', selectedProvider: null, fallbackTriggered: false, fallbackReason: null, serp, selected: null, outcome: 'unavailable', blocker: serp.blocker, resultRegionInspected: false, candidates: [], elapsedMs: Math.round(performance.now() - started) }
  const browser = await (dependencies.acquireBrowser || acquireBrightDataBrowser)({ query: config.query, cdpUrl: config.browserCdpUrl, playwrightModule: config.playwrightModule, country: config.country, language: config.language, location: config.location, rawProviderMetadataReference: config.browserMetadataReference })
  const selected = browser.usable ? browser : null
  return { primaryProvider: 'brightdata_serp_api', selectedProvider: selected?.provider || null, fallbackTriggered: true, fallbackReason: serp.blocker, serp, browser, selected, outcome: selected ? 'success' : 'unavailable', blocker: selected ? 'none' : browser.blocker, resultRegionInspected: selected?.resultRegionInspected || false, candidates: selected?.candidates || [], elapsedMs: Math.round(performance.now() - started) }
}

export async function acquireGoogleMapsWithBrightData(config: SerpAcquisitionConfig & { browserCdpUrl: string; playwrightModule?: string; browserMetadataReference: string }, dependencies: MapsOrchestratorDependencies = {}): Promise<GoogleBrightDataRun> {
  const started = performance.now()
  const serp = await (dependencies.acquireSerp || acquireBrightDataMaps)(config)
  if (serp.usable) return { primaryProvider: 'brightdata_serp_api', selectedProvider: 'brightdata_serp_api', fallbackTriggered: false, fallbackReason: null, serp, selected: serp, outcome: 'success', blocker: 'none', resultRegionInspected: serp.resultRegionInspected, candidates: serp.candidates, elapsedMs: Math.round(performance.now() - started) }
  if (!browserFallbackEligible(serp.blocker)) return { primaryProvider: 'brightdata_serp_api', selectedProvider: null, fallbackTriggered: false, fallbackReason: null, serp, selected: null, outcome: 'unavailable', blocker: serp.blocker, resultRegionInspected: false, candidates: [], elapsedMs: Math.round(performance.now() - started) }
  const browser = await (dependencies.acquireBrowser || acquireBrightDataMapsBrowser)({ query: config.query, cdpUrl: config.browserCdpUrl, playwrightModule: config.playwrightModule, country: config.country, language: config.language, location: config.location, rawProviderMetadataReference: config.browserMetadataReference })
  const selected = browser.usable ? browser : null
  return { primaryProvider: 'brightdata_serp_api', selectedProvider: selected?.provider || null, fallbackTriggered: true, fallbackReason: serp.blocker, serp, browser, selected, outcome: selected ? 'success' : 'unavailable', blocker: selected ? 'none' : browser.blocker, resultRegionInspected: selected?.resultRegionInspected || false, candidates: selected?.candidates || [], elapsedMs: Math.round(performance.now() - started) }
}

const matcherFields = (candidate: GoogleAcquisitionCandidate): BusinessResultCandidate['fields'] => {
  const fields: BusinessResultCandidate['fields'] = {}
  const observed: Partial<Record<EntityField, string | undefined>> = {
    // Organic `source` values can be publisher labels. The result title is the
    // bounded business-name evidence; local/knowledge entities expose `name`.
    name: candidate.resultType === 'organic' ? candidate.title || candidate.name : candidate.name || candidate.title,
    website: candidate.businessWebsite,
    phone: candidate.phone,
    address: candidate.address,
    streetAddress: candidate.streetAddress,
    locality: candidate.locality,
    region: candidate.region,
    postalCode: candidate.postalCode,
    category: candidate.category,
    placeIdentity: candidate.placeIdentity,
  }
  for (const [field, value] of Object.entries(observed)) if (value) fields[field as EntityField] = value
  return fields
}

/** Lossless handoff into the existing entity matcher without treating publisher URLs as business websites. */
export function brightDataMatcherCandidates(acquisition: NormalizedGoogleAcquisition, acquiredAt: string): BusinessResultCandidate[] {
  const method: AcquisitionResult['method'] = acquisition.provider === 'brightdata_serp_api' ? 'server_fetch' : 'rendered_browser'
  return acquisition.candidates.map((candidate) => ({
    id: candidate.id,
    kind: candidate.resultType === 'organic' ? 'result_link' : 'semantic_card',
    ...(candidate.resultUrl ? { resultUrl: candidate.resultUrl } : {}),
    fields: matcherFields(candidate),
    evidence: [{
      sourceUrl: acquisition.finalUrl || acquisition.requestedUrl,
      acquiredAt,
      method,
      provider: acquisition.provider,
      locator: candidate.provenance.responsePath,
      excerpt: JSON.stringify({ destination: acquisition.destination, resultType: candidate.resultType, rank: candidate.rank, title: candidate.title, name: candidate.name, resultUrl: candidate.resultUrl, resultDomain: candidate.resultDomain, businessWebsite: candidate.businessWebsite, phone: candidate.phone, address: candidate.address, locality: candidate.locality, region: candidate.region, postalCode: candidate.postalCode, category: candidate.category, placeIdentity: candidate.placeIdentity, rating: candidate.rating, reviewCount: candidate.reviewCount }).slice(0, 2500),
    }],
  }))
}

/** Production-safe capture: normalized evidence and bounded diagnostics only; credentials/raw provider payloads are omitted. */
export function brightDataProductionCapture(run: GoogleBrightDataRun, requestedUrl: string, checkedDestination: 'Google Search' | 'Google Maps' = 'Google Search'): AcquisitionResult {
  const acquiredAt = new Date().toISOString()
  const attempts = [run.serp, ...(run.browser ? [run.browser] : [])].map((attempt) => ({ provider: attempt.provider, outcome: attempt.outcome, blocker: attempt.blocker, elapsedMs: attempt.elapsedMs }))
  if (run.selected) {
    return {
      version: 1,
      requestedUrl,
      finalUrl: run.selected.finalUrl || run.selected.requestedUrl,
      acquiredAt,
      provider: run.selected.provider,
      checkedDestination,
      method: run.selected.provider === 'brightdata_serp_api' ? 'server_fetch' : 'rendered_browser',
      outcome: 'success',
      confidence: 'captured',
      notes: [run.fallbackTriggered ? `Bright Data Browser API fallback selected after ${run.fallbackReason}.` : 'Bright Data SERP API returned a usable structured result region.'],
      normalizedSearchCandidates: brightDataMatcherCandidates(run.selected, acquiredAt),
      resultRegionInspected: run.selected.resultRegionInspected,
      blocker: run.selected.blocker,
      providerAttempts: attempts,
    }
  }
  const last = run.browser || run.serp
  return {
    version: 1,
    requestedUrl,
    finalUrl: last.finalUrl || last.requestedUrl,
    acquiredAt,
    provider: last.provider,
    checkedDestination,
    method: last.provider === 'brightdata_serp_api' ? 'server_fetch' : 'rendered_browser',
    outcome: 'failed',
    confidence: 'unavailable',
    notes: ['Bright Data did not return a usable Google result region. This is not evidence that the business is absent.'],
    normalizedSearchCandidates: [],
    resultRegionInspected: false,
    blocker: run.blocker,
    providerAttempts: attempts,
    error: `Google acquisition unavailable: ${run.blocker}`,
  }
}
