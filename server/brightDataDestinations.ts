import { pathToFileURL } from 'node:url'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EvidenceReference, EntityField } from '../src/types/entityMatch.ts'

export type ProvingDestination = 'Apple Maps' | 'Yelp' | 'Facebook' | 'DuckDuckGo' | 'Instagram'
export type DiscoverableProfileDestination = Exclude<ProvingDestination, 'DuckDuckGo'>
export type DestinationAcquisitionBlocker = 'none' | 'provider_permission_blocked' | 'provider_upstream_failure' | 'access_blocked' | 'access_failure' | 'navigation_failure' | 'login_wall' | 'challenge' | 'missing_result_region' | 'malformed_response' | 'configuration_missing'
export type DestinationBrowserClassification = 'normal_result' | 'no_results' | Exclude<DestinationAcquisitionBlocker, 'none' | 'provider_upstream_failure' | 'malformed_response' | 'configuration_missing'>

export interface DestinationBrowserCandidate {
  name?: string
  resultUrl?: string
  businessWebsite?: string
  streetAddress?: string
  address?: string
  locality?: string
  region?: string
  postalCode?: string
  phone?: string
  category?: string
  placeIdentity?: string
  rank?: number
  excerpt?: string
  locator?: string
}

export interface DestinationBrowserObservation {
  title: string
  visibleText: string
  html: string
  resultRegionInspected: boolean
  candidates: DestinationBrowserCandidate[]
  noResults: boolean
}

interface BrowserPage {
  goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<{ status(): number } | null>
  waitForLoadState(state: 'networkidle', options: { timeout: number }): Promise<void>
  evaluate<T>(expression: string): Promise<T>
  url(): string
}
interface RemoteBrowser { newPage(): Promise<BrowserPage>; close(): Promise<void> }
interface RemoteChromium { connectOverCDP(url: string): Promise<RemoteBrowser> }

export interface DestinationBrowserConfig {
  destination: Exclude<ProvingDestination, 'DuckDuckGo'>
  query: string
  cdpUrl: string
  playwrightModule?: string
  /** Optional public profile URL discovered from existing search evidence. Host must match destination. */
  targetUrl?: string
}

export interface DuckDuckGoConfig {
  query: string
  token: string
  zone: string
  countryLanguage?: string
}

export interface ProviderHttpResponse {
  status: number
  statusText?: string
  headers?: Record<string, string>
  bodyText: string
}

export interface SearchProfileDiscoveryCandidate {
  id: string
  title?: string
  name?: string
  description?: string
  resultUrl?: string
  provenance?: { provider?: string; responsePath?: string }
}

export interface ProfileDiscoveryEvidence {
  state: 'profile_discovered'
  destination: DiscoverableProfileDestination
  publicProfileUrl: string
  observedName: string
  sourceCandidateId: string
  sourceProvider: string
  excerpt: string
}

const publicUrl = (value?: string) => {
  if (!value) return undefined
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}
const normalizedWords = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const host = (value?: string) => { try { return new URL(value || '').hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const destinationHost: Record<ProvingDestination, string> = {
  'Apple Maps': 'maps.apple.com', Yelp: 'yelp.com', Facebook: 'facebook.com', DuckDuckGo: 'duckduckgo.com', Instagram: 'instagram.com',
}

const profilePathSupported = (destination: DiscoverableProfileDestination, url: URL) => {
  if (destination === 'Apple Maps') return /\/place(?:[/?#]|$)/i.test(url.pathname)
  if (destination === 'Yelp') return /\/biz\//i.test(url.pathname)
  if (destination === 'Facebook') return !/^\/(?:search|login|help|share)(?:[/?#]|$)/i.test(url.pathname) && url.pathname !== '/'
  return !/^\/(?:accounts|explore|reels?)(?:[/?#]|$)/i.test(url.pathname) && url.pathname !== '/'
}

/** Search evidence may discover a likely public profile URL. It does not verify that destination's record. */
export function discoverPublicProfiles(candidates: SearchProfileDiscoveryCandidate[], destination: DiscoverableProfileDestination, reviewedBusinessName: string): ProfileDiscoveryEvidence[] {
  const expected = normalizedWords(reviewedBusinessName)
  return candidates.slice(0, 100).flatMap((candidate) => {
    const resultUrl = publicUrl(candidate.resultUrl)
    if (!resultUrl || host(resultUrl) !== destinationHost[destination]) return []
    const url = new URL(resultUrl)
    if (!profilePathSupported(destination, url)) return []
    const observedName = candidate.title || candidate.name || ''
    const actual = normalizedWords(observedName)
    if (!expected || !actual || !(actual === expected || actual.includes(expected))) return []
    return [{ state: 'profile_discovered' as const, destination, publicProfileUrl: resultUrl, observedName, sourceCandidateId: candidate.id,
      sourceProvider: candidate.provenance?.provider || 'search_evidence', excerpt: [candidate.title, candidate.description, resultUrl].filter(Boolean).join(' · ').slice(0, 2500) }]
  })
}
export const destinationQueryUrl = (destination: ProvingDestination, query: string) => {
  if (destination === 'Apple Maps') return `https://maps.apple.com/?q=${encodeURIComponent(query)}`
  if (destination === 'Yelp') return `https://www.yelp.com/search?find_desc=${encodeURIComponent(query)}`
  if (destination === 'Facebook') return `https://www.facebook.com/search/top?q=${encodeURIComponent(query)}`
  if (destination === 'Instagram') return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
}

const evidence = (sourceUrl: string, acquiredAt: string, provider: string, locator: string, excerpt: string): EvidenceReference => ({
  sourceUrl, acquiredAt, provider, method: provider === 'brightdata_browser_api' ? 'rendered_browser' : 'server_fetch', locator, excerpt: excerpt.slice(0, 2500),
})

export function normalizeDestinationBrowserCandidates(destination: ProvingDestination, observed: DestinationBrowserObservation, sourceUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  const platformHost = destinationHost[destination]
  return observed.candidates.slice(0, 50).flatMap((item, index) => {
    const resultUrl = publicUrl(item.resultUrl)
    const assertedWebsite = publicUrl(item.businessWebsite)
    const fields: BusinessResultCandidate['fields'] = {}
    const mapping: Partial<Record<EntityField, string | undefined>> = {
      name: item.name, streetAddress: item.streetAddress, address: item.address, locality: item.locality, region: item.region,
      postalCode: item.postalCode, phone: item.phone, category: item.category, placeIdentity: item.placeIdentity,
    }
    for (const [field, value] of Object.entries(mapping)) if (value?.trim()) fields[field as EntityField] = value.trim()
    if (resultUrl && host(resultUrl) === platformHost) fields.publicProfileUrl = resultUrl
    if (assertedWebsite && host(assertedWebsite) && host(assertedWebsite) !== platformHost) fields.website = assertedWebsite
    if (!fields.name && !fields.phone && !fields.address && !fields.website) return []
    return [{
      id: `${destination.toLowerCase().replace(/\s+/g, '-')}-browser-${index + 1}`,
      kind: 'semantic_card' as const,
      ...(resultUrl ? { resultUrl } : {}),
      fields,
      evidence: [evidence(sourceUrl, acquiredAt, 'brightdata_browser_api', item.locator || `bounded-result[${index}]`, item.excerpt || [item.name, item.address, item.phone].filter(Boolean).join(' · '))],
    }]
  })
}

export function classifyDestinationBrowserPage(_destination: ProvingDestination, finalUrl: string, observed: DestinationBrowserObservation, navigationFailed = false, providerError = '', statusCode?: number): DestinationBrowserClassification {
  const page = `${finalUrl}\n${observed.title}\n${observed.visibleText}\n${providerError}`
  if (/restricted in accordance with robots\.txt|ask your account manager to get full access|\(brob\)|error-codes#access-and-permissions/i.test(providerError)) return 'provider_permission_blocked'
  if ([401, 403, 407, 429].includes(statusCode || 0) || /\b(?:access denied|forbidden|request blocked)\b/i.test(page)) return 'access_blocked'
  if (navigationFailed) return 'navigation_failure'
  if (/\/(?:accounts\/)?(?:login|signin)(?:[/?#]|$)/i.test(finalUrl) || /log in to (?:facebook|instagram)|sign in to continue/i.test(page)) return 'login_wall'
  if (/captcha|verify (?:that )?you are human|not a robot|unusual traffic|automated quer/i.test(page)) return 'challenge'
  if (observed.resultRegionInspected && observed.noResults) return 'no_results'
  if (observed.resultRegionInspected && observed.candidates.length) return 'normal_result'
  return observed.html || observed.visibleText ? 'missing_result_region' : 'access_failure'
}

const emptyObservation = (): DestinationBrowserObservation => ({ title: '', visibleText: '', html: '', resultRegionInspected: false, candidates: [], noResults: false })
const stripAnsi = (value: string) => value.split(String.fromCharCode(27)).map((part, index) => index ? part.replace(/^\[[0-9;]*m/, '') : part).join('')
const redact = (value: string) => stripAnsi(value.replace(/wss:\/\/[^@\s]+@/gi, 'wss://***@')).slice(0, 5000)

type BrowserObserver = (config: DestinationBrowserConfig, requestedUrl: string) => Promise<{ observed: DestinationBrowserObservation; finalUrl: string; statusCode?: number; navigationFailed: boolean; error?: string }>

const defaultBrowserObserver: BrowserObserver = async (config, requestedUrl) => {
  if (!config.cdpUrl) return { observed: emptyObservation(), finalUrl: requestedUrl, navigationFailed: false, error: 'BRIGHTDATA_BROWSER_CDP_URL is not configured.' }
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
      return { observed: emptyObservation(), finalUrl: page.url() || requestedUrl, navigationFailed: true, error: redact(error instanceof Error ? error.message : String(error)) }
    }
    const observed = await page.evaluate<DestinationBrowserObservation>(`(() => {
      const destination = ${JSON.stringify(config.destination)};
      const clean = (value, max = 2000) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
      const platformHost = destination === 'Apple Maps' ? 'maps.apple.com' : destination.toLowerCase().replace(' maps', '') + '.com';
      const absolute = value => { try { return new URL(value, location.href).href; } catch { return ''; } };
      const samePlatform = value => { try { return new URL(value).hostname.replace(/^www\\./, '') === platformHost; } catch { return false; } };
      const selectors = destination === 'Apple Maps' ? ['a[href*="/place"]', '[role="listitem"]', '[data-testid*="place" i]']
        : destination === 'Yelp' ? ['a[href*="/biz/"]', 'main li', 'main article']
        : destination === 'Facebook' ? ['main [role="article"]', 'main a[href*="facebook.com/"]']
        : ['main article', 'main a[href^="/"]'];
      const roots = [...new Set(selectors.flatMap(selector => Array.from(document.querySelectorAll(selector))).map(node => node.closest('article, li, [role="article"], [role="listitem"]') || node))].slice(0, 50);
      const candidates = roots.map((scope, index) => {
        const text = clean(scope.innerText || scope.textContent, 3000);
        const links = Array.from(scope.querySelectorAll('a[href]')).slice(0, 30).map(link => ({ url: absolute(link.getAttribute('href')), label: clean(link.innerText || link.textContent || link.getAttribute('aria-label'), 200) }));
        if (scope.matches('a[href]')) links.unshift({ url: absolute(scope.getAttribute('href')), label: clean(scope.innerText || scope.textContent || scope.getAttribute('aria-label'), 200) });
        const profile = links.find(link => samePlatform(link.url) && (destination !== 'Yelp' || /\\/biz\\//.test(link.url))) || links.find(link => samePlatform(link.url));
        const website = links.find(link => !samePlatform(link.url) && /^(website|official (?:site|website)|business website)$/i.test(link.label));
        const heading = scope.querySelector('h1,h2,h3,[role="heading"]');
        const phone = text.match(/(?:\\+?1[ .-]?)?\\(?\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4}/)?.[0] || '';
        const addressNode = scope.querySelector('[data-item-id="address"], [class*="address" i], [aria-label^="address" i], address');
        const categoryNode = scope.querySelector('[class*="category" i], [data-testid*="category" i]');
        return { name: clean(heading?.innerText || heading?.textContent || profile?.label, 300), resultUrl: profile?.url || '', businessWebsite: website?.url || '', phone: clean(phone, 80), address: clean(addressNode?.innerText || addressNode?.textContent || addressNode?.getAttribute('aria-label'), 500), category: clean(categoryNode?.innerText || categoryNode?.textContent, 200), placeIdentity: profile?.url || '', rank: index + 1, excerpt: text, locator: 'bounded-result[' + index + ']' };
      }).filter(item => item.name && (item.resultUrl || item.businessWebsite || item.phone || item.address));
      const structured = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 30).flatMap((script, index) => {
        let value; try { value = JSON.parse(script.textContent || ''); } catch { return []; }
        const queue = Array.isArray(value) ? [...value] : [value]; const found = [];
        while (queue.length && found.length < 30) { const node = queue.shift(); if (!node || typeof node !== 'object') continue; if (Array.isArray(node)) { queue.push(...node); continue; }
          if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
          const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
          if (types.some(type => /Business|Organization|Place|School|Store|Restaurant/i.test(String(type || '')))) { const address = typeof node.address === 'object' && node.address ? node.address : {}; const url = absolute(node.url || node['@id']); found.push({ name: clean(node.name, 300), resultUrl: samePlatform(url) ? url : '', businessWebsite: url && !samePlatform(url) ? url : '', phone: clean(node.telephone, 80), streetAddress: clean(address.streetAddress, 300), locality: clean(address.addressLocality, 120), region: clean(address.addressRegion, 80), postalCode: clean(address.postalCode, 40), address: typeof node.address === 'string' ? clean(node.address, 500) : '', category: clean(node.category || types.join(', '), 200), placeIdentity: clean(node['@id'], 1000), excerpt: clean(JSON.stringify(node), 2500), locator: 'jsonld[' + index + ']' }); }
        } return found;
      });
      const merged = [...structured, ...candidates].slice(0, 50);
      const bodyText = clean(document.body?.innerText, 20000);
      const noResults = /no (?:places|businesses|results) (?:found|available)|did not match/i.test(bodyText);
      const htmlRoot = document.querySelector('main,[role="main"]');
      return { title: clean(document.title, 300), visibleText: bodyText, html: clean(htmlRoot?.outerHTML, 150000), resultRegionInspected: Boolean(merged.length || (noResults && htmlRoot)), candidates: merged, noResults };
    })()`)
    return { observed, finalUrl: page.url() || requestedUrl, statusCode: response?.status(), navigationFailed: false }
  } catch (error) {
    return { observed: emptyObservation(), finalUrl: requestedUrl, navigationFailed: false, error: redact(error instanceof Error ? error.message : String(error)) }
  } finally { await browser?.close().catch(() => undefined) }
}

export async function acquireBrightDataDestinationBrowser(config: DestinationBrowserConfig, observe: BrowserObserver = defaultBrowserObserver): Promise<AcquisitionResult> {
  const started = performance.now()
  const acquiredAt = new Date().toISOString()
  const suppliedTarget = config.targetUrl ? publicUrl(config.targetUrl) : undefined
  const requestedUrl = suppliedTarget || destinationQueryUrl(config.destination, config.query)
  const invalidTarget = Boolean(config.targetUrl && (!suppliedTarget || host(suppliedTarget) !== destinationHost[config.destination]))
  const unavailable = (blocker: DestinationAcquisitionBlocker, error?: string, finalUrl = requestedUrl, statusCode?: number, observed = emptyObservation()): AcquisitionResult => ({
    version: 1, requestedUrl, finalUrl, checkedDestination: config.destination, acquiredAt, method: 'rendered_browser', provider: 'brightdata_browser_api',
    outcome: ['login_wall', 'challenge'].includes(blocker) ? 'blocked' : 'unavailable', confidence: 'unavailable', resultRegionInspected: false, blocker,
    providerAttempts: [{ provider: 'brightdata_browser_api', outcome: 'unavailable', blocker, elapsedMs: Math.round(performance.now() - started) }],
    notes: [blocker === 'provider_permission_blocked' ? 'Bright Data rejected this target under the configured account permissions. Provider access expansion is required before another Browser API attempt.' : blocker === 'access_blocked' ? 'The public target returned an HTTP access restriction before a result region could be inspected.' : 'One bounded Bright Data Browser API proving attempt did not inspect a usable public result region. This is not evidence that the business is absent.'],
    ...(statusCode !== undefined ? { statusCode } : {}), ...(observed.visibleText ? { visibleText: observed.visibleText } : {}), ...(observed.html ? { html: observed.html } : {}), ...(error ? { error: redact(error) } : {}),
  })
  if (!config.cdpUrl) return unavailable('configuration_missing')
  if (invalidTarget) return unavailable('malformed_response', 'Discovered public profile URL does not match the requested destination host.')
  const capture = await observe(config, requestedUrl)
  const classification = classifyDestinationBrowserPage(config.destination, capture.finalUrl, capture.observed, capture.navigationFailed, capture.error, capture.statusCode)
  if (classification !== 'normal_result' && classification !== 'no_results') return unavailable(classification as DestinationAcquisitionBlocker, capture.error || (capture.statusCode ? `HTTP ${capture.statusCode} did not expose a usable public result region.` : undefined), capture.finalUrl, capture.statusCode, capture.observed)
  const candidates = normalizeDestinationBrowserCandidates(config.destination, capture.observed, capture.finalUrl, acquiredAt)
  return {
    version: 1, requestedUrl, finalUrl: capture.finalUrl, checkedDestination: config.destination, acquiredAt, method: 'rendered_browser', provider: 'brightdata_browser_api', outcome: 'success', confidence: 'captured',
    statusCode: capture.statusCode, html: capture.observed.html, visibleText: capture.observed.visibleText, normalizedSearchCandidates: candidates,
    resultRegionInspected: true, blocker: 'none', providerAttempts: [{ provider: 'brightdata_browser_api', outcome: 'success', blocker: 'none', elapsedMs: Math.round(performance.now() - started) }],
    notes: [`Bright Data Browser API inspected a bounded public ${config.destination} result region.`, ...(classification === 'no_results' ? ['The inspected region explicitly reported no results.'] : [])],
  }
}

const unwrap = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  if (source.body && typeof source.body === 'object' && !Array.isArray(source.body)) return source.body as Record<string, unknown>
  if (typeof source.body === 'string') { try { const parsed = JSON.parse(source.body); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed } catch { return source } }
  return source
}
const list = (value: unknown) => Array.isArray(value) ? value : []
const string = (...values: unknown[]) => values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim()
const resolveDuckUrl = (value?: string) => {
  const url = publicUrl(value)
  if (!url) return undefined
  if (host(url) !== 'duckduckgo.com') return url
  try { return publicUrl(new URL(url).searchParams.get('uddg') || undefined) || url } catch { return url }
}

export function normalizeDuckDuckGoPayload(payload: Record<string, unknown>, requestedUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  const items = list(payload.organic).length || Object.hasOwn(payload, 'organic') ? list(payload.organic) : list(payload.organic_results)
  return items.slice(0, 50).flatMap((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const source = value as Record<string, unknown>
    const name = string(source.title, source.name)
    const resultUrl = resolveDuckUrl(string(source.link, source.url, source.resultUrl))
    if (!name || !resultUrl) return []
    const excerpt = [name, string(source.description, source.snippet), resultUrl].filter(Boolean).join(' · ')
    return [{ id: `duckduckgo-serp-${index + 1}`, kind: 'result_link' as const, resultUrl, fields: { name }, evidence: [evidence(requestedUrl, acquiredAt, 'brightdata_serp_api', `organic[${index}]`, excerpt)] }]
  })
}

const defaultDuckRequest = async (config: DuckDuckGoConfig, requestedUrl: string): Promise<ProviderHttpResponse> => {
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: config.zone, url: requestedUrl, format: 'json' }), signal: AbortSignal.timeout(60_000),
  })
  return { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()), bodyText: await response.text() }
}

export async function acquireBrightDataDuckDuckGo(config: DuckDuckGoConfig, request = defaultDuckRequest): Promise<{ capture: AcquisitionResult; rawResponse: unknown }> {
  const started = performance.now()
  const acquiredAt = new Date().toISOString()
  const requested = new URL(destinationQueryUrl('DuckDuckGo', config.query))
  requested.searchParams.set('kl', config.countryLanguage || 'us-en')
  const requestedUrl = requested.href
  const failed = (blocker: DestinationAcquisitionBlocker, error?: string, rawResponse: unknown = { error: blocker }): { capture: AcquisitionResult; rawResponse: unknown } => ({ capture: {
    version: 1, requestedUrl, finalUrl: requestedUrl, checkedDestination: 'DuckDuckGo', acquiredAt, method: 'server_fetch', provider: 'brightdata_serp_api', outcome: 'unavailable', confidence: 'unavailable', resultRegionInspected: false, blocker,
    providerAttempts: [{ provider: 'brightdata_serp_api', outcome: 'unavailable', blocker, elapsedMs: Math.round(performance.now() - started) }], notes: ['Bright Data DuckDuckGo SERP acquisition did not inspect a usable result region. This is not evidence that the business is absent.'], ...(error ? { error } : {}),
  }, rawResponse })
  if (!config.token || !config.zone) return failed('configuration_missing')
  try {
    const response = await request(config, requestedUrl)
    let parsed: unknown
    try { parsed = JSON.parse(response.bodyText) } catch { return failed('malformed_response', 'Provider response was not JSON.', response.bodyText.slice(0, 100_000)) }
    const errorCode = Object.entries(response.headers || {}).find(([key]) => key.toLowerCase() === 'x-brd-error-code')?.[1]
    if (errorCode) return failed(/captcha|challenge/i.test(errorCode) ? 'challenge' : 'access_blocked', `Provider returned error code ${errorCode}.`, parsed)
    if (response.status >= 400) return failed(response.status >= 500 ? 'provider_upstream_failure' : 'access_blocked', `Provider returned HTTP ${response.status}.`, parsed)
    const payload = unwrap(parsed)
    const embeddedStatus = typeof payload.status_code === 'number' ? payload.status_code : undefined
    if (embeddedStatus && embeddedStatus >= 400) return failed(embeddedStatus >= 500 ? 'provider_upstream_failure' : 'access_blocked', `Provider embedded status ${embeddedStatus}.`, parsed)
    const inspected = (Object.hasOwn(payload, 'organic') && Array.isArray(payload.organic)) || (Object.hasOwn(payload, 'organic_results') && Array.isArray(payload.organic_results))
    if (!inspected) return failed('missing_result_region', undefined, parsed)
    const candidates = normalizeDuckDuckGoPayload(payload, requestedUrl, acquiredAt)
    const capture: AcquisitionResult = {
      version: 1, requestedUrl, finalUrl: string((payload.input as Record<string, unknown> | undefined)?.original_url) || requestedUrl, checkedDestination: 'DuckDuckGo', acquiredAt, method: 'server_fetch', provider: 'brightdata_serp_api', outcome: 'success', confidence: 'captured',
      normalizedSearchCandidates: candidates, resultRegionInspected: true, blocker: 'none', providerAttempts: [{ provider: 'brightdata_serp_api', outcome: 'success', blocker: 'none', elapsedMs: Math.round(performance.now() - started) }],
      notes: ['Bright Data SERP API inspected a structured DuckDuckGo organic-result region. Organic destinations remain result URLs unless the matcher establishes the reviewed official domain.'],
    }
    return { capture, rawResponse: parsed }
  } catch (error) { return failed('access_failure', error instanceof Error ? error.message : String(error)) }
}
