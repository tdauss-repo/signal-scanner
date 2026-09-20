import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { AcquisitionProvider, AcquisitionResult, RenderedResultEvidence } from '../src/types/acquisition.ts'
import type { BrowserWebsiteEvidencePayload } from '../src/types/websiteAudit.ts'
import { fetchPage } from './pageTransport.ts'

const base = (url: string, method: AcquisitionResult['method'], provider: string): AcquisitionResult => ({
  version: 1, requestedUrl: url, method, provider, acquiredAt: new Date().toISOString(),
  outcome: 'failed', confidence: 'unavailable', notes: [],
})

/** Bounded public acquisition. No authentication, persistent browser profile, or bypass.
 * Explicit allowlist bounds the browser to the requested site and caller-approved public hosts.
 * CLI callers select targets explicitly; the internal application adapter additionally enforces
 * its configured destination/directory host allowlist. Do not expose as a general public URL proxy.
 */
export function publicUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    (url.port && !['80', '443'].includes(url.port)) || isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    !url.hostname.includes('.') || /\.(localhost|local|internal|test)$/i.test(url.hostname)) throw new Error('Only public HTTP(S) hostnames on standard ports are supported.')
  return url
}

export async function checkPublicDns(url: URL) {
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => {
    if (isIP(address) === 6) return !/^[23][0-9a-f]{3}:/i.test(address) // global unicast only
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b))
  })) throw new Error('Target does not resolve exclusively to public addresses.')
}

const outcomeFor = (status: number, html: string): AcquisitionResult['outcome'] =>
  [401, 403, 429].includes(status) || /<title[^>]*>\s*(just a moment|access denied|verify you are human)/i.test(html) ? 'blocked'
    : status >= 200 && status < 300 ? html.trim() ? 'success' : 'partial' : 'failed'

export const createServerFetchProvider = (verifyDns = checkPublicDns): AcquisitionProvider => ({
  async acquire(value) {
    const result = base(value, 'server_fetch', 'found-local-server')
    try {
      const url = publicUrl(value)
      await verifyDns(url)
      // No redirect following in the proving provider: a new host needs explicit review.
      // Existing websiteAudit keeps its established bounded fallback/redirect behavior.
      const { response, body } = await fetchPage(url, 'GET', { 'user-agent': 'FoundLocal/1.0 public-evidence-review', accept: 'text/html' }, AbortSignal.timeout(8_000), 1_000_000, 'manual')
      return { ...result, finalUrl: response.url || value, acquiredAt: new Date().toISOString(), statusCode: response.status,
        outcome: outcomeFor(response.status, body), html: body,
        confidence: response.ok ? 'captured' : 'unavailable', notes: response.status >= 300 && response.status < 400 ? [`Redirect requires explicit target review: ${response.headers.get('location') || '(missing)'}`] : [] }
    } catch (error) { return { ...result, error: error instanceof Error ? error.message : String(error) } }
  },
})
export const serverFetchProvider = createServerFetchProvider()

// Minimal structural types keep Playwright optional and outside the production dependency tree.
interface Route {
  request(): { url(): string; method(): string }
  abort(): Promise<void>
  continue(): Promise<void>
}
interface BrowserPage {
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<{ status(): number } | null>
  content(): Promise<string>
  evaluate<T>(expression: string): Promise<T>
  url(): string
  screenshot(options: { path: string; fullPage: boolean; timeout: number }): Promise<unknown>
}
export interface BrowserLauncher {
  launch(options: { headless: boolean; executablePath?: string; timeout: number; chromiumSandbox: boolean }): Promise<{
    newContext(options: { ignoreHTTPSErrors: boolean; serviceWorkers: string; acceptDownloads: boolean }): Promise<{
      route(pattern: string, handler: (route: Route) => Promise<void>): Promise<void>
      newPage(): Promise<BrowserPage>
    }>
    close(): Promise<void>
  }>
}

/** Only the literal environment value "false" opts out; absent/other values stay sandboxed. */
export const chromiumSandboxEnabled = (configuredValue: string | undefined) => configuredValue !== 'false'

export function renderedBrowserProvider(chromium: BrowserLauncher, options: { executablePath?: string; screenshotPath?: string; allowedHosts?: string[]; chromiumSandbox?: boolean } = {}, verifyDns = checkPublicDns): AcquisitionProvider {
  return { async acquire(value) {
    const result = base(value, 'rendered_browser', 'playwright-chromium')
    let browser: Awaited<ReturnType<BrowserLauncher['launch']>> | undefined
    let denied = 0
    try {
      const url = publicUrl(value)
      await verifyDns(url)
      const allowed = new Set([url.hostname, ...(options.allowedHosts || [])])
      browser = await chromium.launch({ headless: true, executablePath: options.executablePath, timeout: 15_000, chromiumSandbox: options.chromiumSandbox !== false })
      const context = await browser.newContext({ ignoreHTTPSErrors: false, serviceWorkers: 'block', acceptDownloads: false })
      await context.route('**/*', async (route) => {
        try {
          const request = route.request()
          const target = publicUrl(request.url())
          if (!['GET', 'HEAD'].includes(request.method()) || !allowed.has(target.hostname)) throw new Error('Outside bounded public capture')
          await verifyDns(target)
          await route.continue()
        } catch { denied += 1; await route.abort() }
      })
      const page = await context.newPage()
      const response = await page.goto(value, { waitUntil: 'load', timeout: 15_000 })
      const html = await page.content()
      if (Buffer.byteLength(html) > 1_000_000) throw new Error('Rendered HTML exceeds 1 MB limit.')
      const visibleText = await page.evaluate<string>('document.body?.innerText?.slice(0, 100000) || ""')
      const browserEvidence = await page.evaluate<BrowserWebsiteEvidencePayload>(`(() => {
        const text = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
        const descriptions = Array.from(document.querySelectorAll('meta[name="description" i]')).slice(0, 30).map(node => text(node.getAttribute('content'), 1000));
        const headings = (tag, limit) => Array.from(document.querySelectorAll(tag)).slice(0, limit).map(node => text(node.innerText || node.textContent, 300)).filter(Boolean);
        return { schema: 'found-local-browser-website-evidence', captureVersion: 1, captureProvider: 'playwright-chromium', captureMethod: 'rendered_browser',
          capturedAt: new Date().toISOString(), sourceUrl: location.href, title: text(document.title, 300), metaDescription: descriptions[0] || '', metaDescriptions: descriptions,
          h1Text: headings('h1', 20), h2Text: headings('h2', 40), visibleText: text(document.body?.innerText, 12000),
          links: Array.from(document.querySelectorAll('a[href]')).slice(0, 150).map(node => ({url: node.href.slice(0, 2048), anchorText: text(node.innerText || node.textContent, 300), sourceRegion: node.closest('nav') ? 'navigation' : node.closest('header') ? 'header' : node.closest('footer') ? 'footer' : 'body', internal: new URL(node.href).hostname.replace(/^www\\./, '') === location.hostname.replace(/^www\\./, '')})).filter(link => /^(https?:|tel:|mailto:)/i.test(link.url)),
          jsonLdTextBlocks: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 10).map(node => text(node.textContent, 5000)).filter(Boolean)
        };
      })()`)
      const renderedResultEvidence = await page.evaluate<RenderedResultEvidence>(`(() => {
        const clean = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
        const main = document.querySelector('main, [role="main"]');
        const headings = main ? Array.from(main.querySelectorAll('h1, h2, h3')).slice(0, 80) : [];
        const candidates = headings.map((heading, index) => {
          let scope = heading.closest('article, li, [role="listitem"]') || heading.parentElement || heading;
          for (let depth = 0; depth < 2 && scope.parentElement && scope.parentElement !== main && !scope.querySelector('a[href], a[href^="tel:"]'); depth += 1) {
            const parentText = clean(scope.parentElement.innerText || scope.parentElement.textContent, 3000);
            if (parentText.length > 2500) break;
            scope = scope.parentElement;
          }
          const links = Array.from(scope.querySelectorAll('a[href]')).slice(0, 12).map(node => ({ url: String(node.href || '').slice(0, 2048), text: clean(node.innerText || node.textContent || node.getAttribute('aria-label'), 300) })).filter(link => /^https?:/i.test(link.url));
          const displayedUrls = Array.from(scope.querySelectorAll('cite')).slice(0, 5).map(node => clean(node.innerText || node.textContent, 500)).filter(Boolean);
          const phones = Array.from(scope.querySelectorAll('a[href^="tel:"]')).slice(0, 5).map(node => clean(node.getAttribute('href').slice(4), 80)).filter(Boolean);
          return { locator: 'main heading[' + index + ']', name: clean(heading.innerText || heading.textContent, 300), links, displayedUrls, phones, excerpt: clean(scope.innerText || scope.textContent, 2500) };
        }).filter(candidate => candidate.name);
        return { sourceUrl: location.href, capturedAt: new Date().toISOString(), resultRegionInspected: Boolean(main && (candidates.length || main.querySelector('a[href]'))), candidates };
      })()`)
      const status = response?.status()
      const outcome = status ? outcomeFor(status, html) : 'partial'
      if (options.screenshotPath) await page.screenshot({ path: options.screenshotPath, fullPage: false, timeout: 5_000 })
      return { ...result, acquiredAt: new Date().toISOString(), finalUrl: page.url(), statusCode: status,
        outcome: denied && outcome === 'success' ? 'partial' : outcome, html, visibleText, renderedResultEvidence,
        screenshotReference: options.screenshotPath,
        // Blocked/partial pages must not become importable SEO evidence.
        ...(outcome === 'success' && !denied ? { browserEvidence } : {}),
        confidence: outcome === 'success' || outcome === 'partial' ? 'captured' : 'unavailable',
        notes: [`${denied} requests outside the bounded read-only capture were blocked.`, 'No login, clicks, challenge bypass or persistent browser profile. Partial rendering requires operator review.'] }
    } catch (error) { return { ...result, error: error instanceof Error ? error.message : String(error) } }
    finally { await browser?.close().catch(() => undefined) }
  } }
}
