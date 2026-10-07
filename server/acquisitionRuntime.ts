import { pathToFileURL } from 'node:url'
import { chromiumSandboxEnabled, publicUrl, renderedBrowserProvider, serverFetchProvider, type BrowserLauncher } from './acquisition.ts'
import { acquireGoogleMapsWithBrightData, acquireGoogleWithBrightData, brightDataProductionCapture } from './brightDataGoogle.ts'
import { acquireBingSearch } from './bingSearch.ts'
import { acquireAppleMaps } from './appleMaps.ts'
import { acquireDuckDuckGoSearch } from './duckDuckGoSearch.ts'
import { acquireYelpSearch } from './yelpSearch.ts'
import { acquireFacebookPage } from './facebookPage.ts'
import { acquireInstagramProfile } from './instagramProfile.ts'
import { canonicalMetaProfileUrl } from '../src/utils/metaPublicEvidence.ts'
import type { AcquisitionProvider, AcquisitionResult, BingReviewedIdentityInput } from '../src/types/acquisition.ts'

const destinationHosts = ['www.google.com', 'www.bing.com', 'maps.apple.com', 'duckduckgo.com', 'www.yelp.com', 'www.facebook.com', 'www.instagram.com']
export function runtimeAllowedUrl(value: string, extraHosts = process.env.FOUND_LOCAL_PUBLIC_DIRECTORY_HOSTS || '') {
  const url = publicUrl(value)
  const destinationAllowed = destinationHosts.some((host) => host.replace(/^www\./, '') === url.hostname.replace(/^www\./, ''))
  const configured = extraHosts.split(',').map((s) => s.trim()).filter(Boolean)
  if (!destinationAllowed && !configured.includes(url.hostname)) throw new Error('Public capture host is not configured for this runtime. Use manual observation or configure the reviewed public directory hostname.')
  return url
}

export async function runtimeRenderedProvider(): Promise<AcquisitionProvider | undefined> {
  const modulePath = process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE
  if (!modulePath) return undefined
  try {
    const { chromium } = await import(pathToFileURL(modulePath).href) as { chromium: BrowserLauncher }
    return renderedBrowserProvider(chromium, {
      executablePath: process.env.FOUND_LOCAL_CHROMIUM,
      chromiumSandbox: chromiumSandboxEnabled(process.env.FOUND_LOCAL_CHROMIUM_SANDBOX),
    })
  } catch (error) {
    return { async acquire(url): Promise<AcquisitionResult> { return { version: 1, requestedUrl: url, acquiredAt: new Date().toISOString(), method: 'rendered_browser', provider: 'playwright-chromium', outcome: 'failed', confidence: 'unavailable', notes: ['Optional rendered runtime unavailable. Interactive review required.'], error: String(error) } } }
  }
}

type AcquisitionLane = 'shared' | 'bing_native' | 'apple_maps_native' | 'duckduckgo_native' | 'yelp_native' | 'facebook_native' | 'instagram_native'
const activeLanes = new Set<AcquisitionLane>()

/** Dedicated native Bing work does not contend with unrelated Google or generic/browser work. */
export async function runInAcquisitionLane<T>(lane: AcquisitionLane, work: () => Promise<T>): Promise<T> {
  if (activeLanes.has(lane)) throw new Error(`${lane === 'bing_native' ? 'Bing native' : lane === 'apple_maps_native' ? 'Apple Maps native' : lane === 'duckduckgo_native' ? 'DuckDuckGo native' : lane === 'yelp_native' ? 'Yelp native' : lane === 'facebook_native' ? 'Facebook native' : lane === 'instagram_native' ? 'Instagram native' : 'Public'} acquisition busy. Retry this check later.`)
  activeLanes.add(lane)
  try { return await work() } finally { activeLanes.delete(lane) }
}

const brightDataConfigured = () => Boolean(
  process.env.BRIGHTDATA_API_TOKEN
  || process.env.BRIGHTDATA_SERP_ZONE
  || process.env.BRIGHTDATA_BROWSER_CDP_URL,
)

export type GoogleRuntimeConfigurationStatus = 'configured' | 'partial' | 'unconfigured'
export function googleSearchRuntimeConfigurationStatus(): GoogleRuntimeConfigurationStatus {
  const token = Boolean(process.env.BRIGHTDATA_API_TOKEN?.trim())
  const zone = Boolean(process.env.BRIGHTDATA_SERP_ZONE?.trim())
  return token && zone ? 'configured' : token || zone || Boolean(process.env.BRIGHTDATA_BROWSER_CDP_URL?.trim()) ? 'partial' : 'unconfigured'
}

const runtimeFailureBlocker = (error: unknown) => /timeout|aborted/i.test(`${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`)
  ? 'provider_timeout'
  : 'runtime_exception'

/** Two SERP attempts plus the optional Browser fallback remain below the 180s scan boundary. */
export const googleBrandSerpAttemptTimeoutMs = 52_000
export const googleBrandBrowserNavigationTimeoutMs = 35_000
export const googleBrandBrowserSettleTimeoutMs = 5_000

/**
 * Google-only production provider. An entirely unconfigured runtime explicitly
 * yields to the retained direct acquisition ladder; partial or failed provider
 * configuration remains an unavailable Bright Data attempt and never becomes
 * evidence of absence.
 */
export async function acquireGoogleSearchRuntime(value: string) {
  const url = runtimeAllowedUrl(value)
  if (url.hostname.replace(/^www\./, '') !== 'google.com' || url.pathname !== '/search') {
    throw new Error('Bright Data Google acquisition requires a Google Search URL.')
  }
  const query = url.searchParams.get('q')?.trim()
  if (!query) throw new Error('Google Search query is required.')
  if (!brightDataConfigured()) return { unavailable: true as const, notConfigured: true as const }
  return runInAcquisitionLane('shared', async () => {
    try {
      const run = await acquireGoogleWithBrightData({
        query,
        token: process.env.BRIGHTDATA_API_TOKEN || '',
        zone: process.env.BRIGHTDATA_SERP_ZONE || '',
        country: process.env.BRIGHTDATA_SERP_COUNTRY || 'us',
        language: process.env.BRIGHTDATA_SERP_LANGUAGE || 'en',
        location: process.env.BRIGHTDATA_SERP_LOCATION || '',
        browserCdpUrl: process.env.BRIGHTDATA_BROWSER_CDP_URL || '',
        playwrightModule: process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE,
        rawProviderMetadataReference: 'runtime:brightdata_serp_api',
        browserMetadataReference: 'runtime:brightdata_browser_api',
        requestTimeoutMs: googleBrandSerpAttemptTimeoutMs,
        navigationTimeoutMs: googleBrandBrowserNavigationTimeoutMs,
        networkIdleTimeoutMs: googleBrandBrowserSettleTimeoutMs,
      })
      return { capture: brightDataProductionCapture(run, value) }
    } catch (error) {
      const blocker = runtimeFailureBlocker(error)
      return { capture: {
        version: 1 as const,
        requestedUrl: value,
        acquiredAt: new Date().toISOString(),
        provider: 'brightdata-google',
        method: 'server_fetch' as const,
        outcome: 'failed' as const,
        confidence: 'unavailable' as const,
        notes: ['Bright Data Google acquisition failed. This is not evidence that the business is absent.'],
        resultRegionInspected: false,
        blocker,
        error: `Bright Data Google acquisition unavailable: ${blocker}.`,
      } }
    }
  })
}

export async function acquireGoogleMapsRuntime(value: string) {
  const url = runtimeAllowedUrl(value)
  if (url.hostname.replace(/^www\./, '') !== 'google.com' || !url.pathname.startsWith('/maps/')) {
    throw new Error('Bright Data Google Maps acquisition requires a Google Maps URL.')
  }
  const encodedQuery = url.pathname.match(/^\/maps\/search\/([^/]+)/)?.[1]
  let query = url.searchParams.get('q')?.trim() || ''
  if (!query && encodedQuery) {
    try { query = decodeURIComponent(encodedQuery).trim() } catch { query = '' }
  }
  if (!query) throw new Error('Google Maps search query is required.')
  if (!brightDataConfigured()) return { unavailable: true as const, notConfigured: true as const }
  return runInAcquisitionLane('shared', async () => {
    try {
      const run = await acquireGoogleMapsWithBrightData({
        query,
        token: process.env.BRIGHTDATA_API_TOKEN || '',
        zone: process.env.BRIGHTDATA_SERP_ZONE || '',
        country: process.env.BRIGHTDATA_SERP_COUNTRY || 'us',
        language: process.env.BRIGHTDATA_SERP_LANGUAGE || 'en',
        location: process.env.BRIGHTDATA_SERP_LOCATION || '',
        browserCdpUrl: process.env.BRIGHTDATA_BROWSER_CDP_URL || '',
        playwrightModule: process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE,
        rawProviderMetadataReference: 'runtime:brightdata_maps_serp_api',
        browserMetadataReference: 'runtime:brightdata_maps_browser_api',
      })
      return { capture: brightDataProductionCapture(run, value, 'Google Maps') }
    } catch (error) {
      const blocker = runtimeFailureBlocker(error)
      return { capture: {
        version: 1 as const,
        requestedUrl: value,
        acquiredAt: new Date().toISOString(),
        provider: 'brightdata-google-maps',
        checkedDestination: 'Google Maps' as const,
        method: 'server_fetch' as const,
        outcome: 'failed' as const,
        confidence: 'unavailable' as const,
        notes: ['Bright Data Google Maps acquisition failed. This is not evidence that the business is absent.'],
        resultRegionInspected: false,
        blocker,
        error: `Bright Data Google Maps acquisition unavailable: ${blocker}.`,
      } }
    }
  })
}

export async function acquireBingSearchRuntime(value: string, options: { reviewedIdentity?: BingReviewedIdentityInput } = {}) {
  const url = runtimeAllowedUrl(value)
  if (url.hostname.replace(/^www\./, '') !== 'bing.com' || url.pathname !== '/search' || !url.searchParams.get('q')?.trim()) {
    throw new Error('Bing acquisition requires a Bing Search query URL.')
  }
  return runInAcquisitionLane('bing_native', async () => ({ capture: await acquireBingSearch(url.href, { reviewedIdentity: options.reviewedIdentity }) }))
}

export async function acquireAppleMapsRuntime(value: string) {
  const url = runtimeAllowedUrl(value)
  if (url.hostname.replace(/^www\./, '') !== 'maps.apple.com' || (!url.searchParams.get('q')?.trim() && !/\/place(?:[/?#]|$)/i.test(url.pathname))) {
    throw new Error('Apple Maps acquisition requires a public Apple Maps search or place URL.')
  }
  return runInAcquisitionLane('apple_maps_native', async () => ({ capture: await acquireAppleMaps(url.href, {
    serverToken: process.env.APPLE_MAPS_SERVER_TOKEN || process.env.APPLE_MAPS_SERVER_ACCESS_TOKEN,
  }) }))
}

export async function acquireDuckDuckGoSearchRuntime(value: string) {
  const url = runtimeAllowedUrl(value)
  if (url.hostname.replace(/^www\./, '') !== 'duckduckgo.com' || url.pathname !== '/' || !url.searchParams.get('q')?.trim()) {
    throw new Error('DuckDuckGo acquisition requires a public search query URL.')
  }
  return runInAcquisitionLane('duckduckgo_native', async () => ({ capture: await acquireDuckDuckGoSearch(url.href) }))
}

export async function acquireYelpSearchRuntime(value: string) {
  const url = runtimeAllowedUrl(value)
  if (url.hostname.toLowerCase() !== 'www.yelp.com' || url.pathname !== '/search' ||
    !url.searchParams.get('find_desc')?.trim() || !url.searchParams.get('find_loc')?.trim()) {
    throw new Error('Yelp acquisition requires a public search URL with business and location context.')
  }
  return runInAcquisitionLane('yelp_native', async () => ({ capture: await acquireYelpSearch(url.href) }))
}

export async function acquireFacebookPageRuntime(value: string) {
  const url = runtimeAllowedUrl(value)
  const canonical = canonicalMetaProfileUrl('Facebook', url.href)
  if (!canonical) throw new Error('Facebook acquisition requires an explicit public Facebook profile URL.')
  return runInAcquisitionLane('facebook_native', async () => ({ capture: await acquireFacebookPage(canonical) }))
}

export async function acquireInstagramProfileRuntime(value: string) {
  const url = runtimeAllowedUrl(value)
  const canonical = canonicalMetaProfileUrl('Instagram', url.href)
  if (!canonical) throw new Error('Instagram acquisition requires an explicit public Instagram profile URL.')
  return runInAcquisitionLane('instagram_native', async () => ({ capture: await acquireInstagramProfile(canonical) }))
}

export async function acquireRuntime(value: string, method: string) {
  runtimeAllowedUrl(value)
  if (!['server_fetch', 'rendered_browser'].includes(method)) throw new Error('Unsupported acquisition method.')
  return runInAcquisitionLane('shared', async () => {
    const provider = method === 'server_fetch' ? serverFetchProvider : await runtimeRenderedProvider()
    if (!provider) return { unavailable: true as const }
    return { capture: await provider.acquire(value) }
  })
}
