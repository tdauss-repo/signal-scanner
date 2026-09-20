import { pathToFileURL } from 'node:url'
import { chromiumSandboxEnabled, publicUrl, renderedBrowserProvider, serverFetchProvider, type BrowserLauncher } from './acquisition.ts'
import { acquireGoogleMapsWithBrightData, acquireGoogleWithBrightData, brightDataProductionCapture } from './brightDataGoogle.ts'
import type { AcquisitionProvider, AcquisitionResult } from '../src/types/acquisition.ts'

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

// A single bounded acquisition per request; the shared runner decides whether to escalate.
let active = false

const brightDataConfigured = () => Boolean(
  process.env.BRIGHTDATA_API_TOKEN
  || process.env.BRIGHTDATA_SERP_ZONE
  || process.env.BRIGHTDATA_BROWSER_CDP_URL,
)

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
  if (active) throw new Error('Public acquisition busy. Retry this check later.')
  active = true
  try {
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
      })
      return { capture: brightDataProductionCapture(run, value) }
    } catch {
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
        blocker: 'acquisition_failure',
        error: 'Bright Data Google acquisition failed.',
      } }
    }
  } finally { active = false }
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
  if (active) throw new Error('Public acquisition busy. Retry this check later.')
  active = true
  try {
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
    } catch {
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
        blocker: 'acquisition_failure',
        error: 'Bright Data Google Maps acquisition failed.',
      } }
    }
  } finally { active = false }
}

export async function acquireRuntime(value: string, method: string) {
  runtimeAllowedUrl(value)
  if (!['server_fetch', 'rendered_browser'].includes(method)) throw new Error('Unsupported acquisition method.')
  if (active) throw new Error('Public acquisition busy. Retry this check later.')
  active = true
  try {
    const provider = method === 'server_fetch' ? serverFetchProvider : await runtimeRenderedProvider()
    if (!provider) return { unavailable: true as const }
    return { capture: await provider.acquire(value) }
  } finally { active = false }
}
