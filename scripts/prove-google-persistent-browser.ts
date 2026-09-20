import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromiumSandboxEnabled } from '../server/acquisition.ts'
import type { AcquisitionResult, RenderedResultEvidence } from '../src/types/acquisition.ts'
import { renderedResultExtractor } from '../src/utils/searchResultExtraction.ts'

interface BrowserResponse { status(): number }
interface BrowserPage {
  goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<BrowserResponse | null>
  waitForLoadState(state: 'networkidle', options: { timeout: number }): Promise<void>
  waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>
  content(): Promise<string>
  title(): Promise<string>
  url(): string
  evaluate<T>(expression: string): Promise<T>
  screenshot(options: { path: string; fullPage: boolean; timeout: number }): Promise<void>
}
interface PersistentContext {
  pages(): BrowserPage[]
  newPage(): Promise<BrowserPage>
  close(): Promise<void>
}
interface PersistentChromium {
  launchPersistentContext(userDataDir: string, options: Record<string, unknown>): Promise<PersistentContext>
}

type Classification = 'normal_results' | 'google_sorry' | 'captcha_or_challenge' | 'consent_wall' | 'access_failure' | 'unusable_page'

const query = process.argv.slice(2).join(' ').trim()
if (!query || query.length > 300) throw new Error('Usage: npm run prove:google-persistent-browser -- "Business name" (1–300 characters)')
const modulePath = process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE
const executablePath = process.env.FOUND_LOCAL_CHROMIUM
if (!modulePath || !executablePath) throw new Error('Configure FOUND_LOCAL_PLAYWRIGHT_MODULE and FOUND_LOCAL_CHROMIUM in .env.runtime.local.')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const artifactDir = resolve('debug/google-persistent', stamp)
const profileDir = resolve('.local/found-local-browser/google-profile')
mkdirSync(artifactDir, { recursive: true })
mkdirSync(profileDir, { recursive: true })
const screenshotPath = resolve(artifactDir, 'screenshot.png')
const htmlPath = resolve(artifactDir, 'rendered.html')
const diagnosticPath = resolve(artifactDir, 'diagnostic.json')
const requestedUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
const startedAt = new Date().toISOString()
const started = performance.now()

let context: PersistentContext | undefined
let page: BrowserPage | undefined
let html = ''
let title = ''
let finalUrl = requestedUrl
let statusCode: number | undefined
let navigationError = ''
let screenshotCaptured = false
let visibleResultText = ''
let knowledgePanelText = ''
let renderedEvidence: RenderedResultEvidence = { sourceUrl: requestedUrl, capturedAt: startedAt, resultRegionInspected: false, candidates: [] }
let resultLinks: Array<{ text: string; url: string; domain: string }> = []

try {
  const { chromium } = await import(pathToFileURL(modulePath).href) as { chromium: PersistentChromium }
  context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath,
    chromiumSandbox: chromiumSandboxEnabled(process.env.FOUND_LOCAL_CHROMIUM_SANDBOX),
    ignoreHTTPSErrors: false,
    acceptDownloads: false,
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 },
    timeout: 20_000,
  })
  page = context.pages()[0] || await context.newPage()
  try {
    const response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    statusCode = response?.status()
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    await page.waitForSelector('#search, main, [role="main"], form', { timeout: 10_000 }).catch(() => undefined)
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error)
  }
  finalUrl = page.url() || requestedUrl
  title = await page.title().catch(() => '')
  html = await page.content().catch(() => '')
  const bounded = await page.evaluate<{ visibleResultText: string; knowledgePanelText: string; links: Array<{ text: string; url: string; domain: string }>; renderedEvidence: RenderedResultEvidence }>(`(() => {
    const clean = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
    const region = document.querySelector('#search, main, [role="main"]');
    const linkNodes = region ? Array.from(region.querySelectorAll('a[href]')).slice(0, 150) : [];
    const links = linkNodes.map(node => { try { const url = new URL(node.href); return { text: clean(node.innerText || node.textContent || node.getAttribute('aria-label'), 300), url: url.href.slice(0, 2048), domain: url.hostname.replace(/^www\\./, '') }; } catch { return null; } }).filter(Boolean);
    const main = document.querySelector('main, [role="main"], #search');
    const headings = main ? Array.from(main.querySelectorAll('h1, h2, h3')).slice(0, 80) : [];
    const candidates = headings.map((heading, index) => {
      let scope = heading.closest('article, li, [role="listitem"]') || heading.parentElement || heading;
      for (let depth = 0; depth < 2 && scope.parentElement && scope.parentElement !== main && !scope.querySelector('a[href], a[href^="tel:"]'); depth += 1) {
        if (clean(scope.parentElement.innerText || scope.parentElement.textContent, 3000).length > 2500) break;
        scope = scope.parentElement;
      }
      const scopedLinks = Array.from(scope.querySelectorAll('a[href]')).slice(0, 12).map(node => ({ url: String(node.href || '').slice(0, 2048), text: clean(node.innerText || node.textContent || node.getAttribute('aria-label'), 300) })).filter(link => /^https?:/i.test(link.url));
      const displayedUrls = Array.from(scope.querySelectorAll('cite')).slice(0, 5).map(node => clean(node.innerText || node.textContent, 500)).filter(Boolean);
      const phones = Array.from(scope.querySelectorAll('a[href^="tel:"]')).slice(0, 5).map(node => clean(node.getAttribute('href').slice(4), 80)).filter(Boolean);
      return { locator: 'result heading[' + index + ']', name: clean(heading.innerText || heading.textContent, 300), links: scopedLinks, displayedUrls, phones, excerpt: clean(scope.innerText || scope.textContent, 2500) };
    }).filter(candidate => candidate.name);
    const knowledge = document.querySelector('#rhs, [role="complementary"], [data-attrid]');
    return {
      visibleResultText: clean(region?.innerText || region?.textContent, 20000),
      knowledgePanelText: clean(knowledge?.innerText || knowledge?.textContent, 8000),
      links,
      renderedEvidence: { sourceUrl: location.href, capturedAt: new Date().toISOString(), resultRegionInspected: Boolean(main && (candidates.length || main.querySelector('a[href]'))), candidates }
    };
  })()`).catch(() => ({ visibleResultText: '', knowledgePanelText: '', links: [], renderedEvidence }))
  visibleResultText = bounded.visibleResultText
  knowledgePanelText = bounded.knowledgePanelText
  resultLinks = bounded.links
  renderedEvidence = bounded.renderedEvidence
  await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10_000 }).then(() => { screenshotCaptured = true }).catch(() => undefined)
} catch (error) {
  navigationError = error instanceof Error ? error.message : String(error)
} finally {
  await context?.close().catch(() => undefined)
}

const pageText = `${title}\n${visibleResultText}\n${knowledgePanelText}\n${html.slice(0, 50_000)}`
const finalPath = (() => { try { return new URL(finalUrl).pathname } catch { return '' } })()
const classification: Classification = finalPath.startsWith('/sorry') || /unusual traffic|automated queries/i.test(pageText)
  ? 'google_sorry'
  : /captcha|verify (?:that )?you are human|not a robot/i.test(pageText)
    ? 'captcha_or_challenge'
    : /before you continue to google|consent\.google\.|choose your search customization/i.test(`${finalUrl}\n${pageText}`)
      ? 'consent_wall'
      : navigationError
        ? 'access_failure'
        : renderedEvidence.resultRegionInspected && (visibleResultText || resultLinks.length)
          ? 'normal_results'
          : 'unusable_page'
const outcome = classification === 'normal_results' ? 'success' : ['google_sorry', 'captcha_or_challenge', 'consent_wall'].includes(classification) ? 'blocked' : classification === 'access_failure' ? 'failed' : 'partial'
const capture: AcquisitionResult = { version: 1, requestedUrl, finalUrl, statusCode, provider: 'playwright-persistent-chromium-proving', method: 'rendered_browser', acquiredAt: startedAt,
  outcome, confidence: outcome === 'success' || outcome === 'partial' ? 'captured' : 'unavailable', notes: ['One headed navigation with a dedicated Found Local profile. No login, challenge interaction, retry, stealth plugin or personal browser data.'], html, visibleText: visibleResultText, renderedResultEvidence: renderedEvidence, ...(navigationError ? { error: navigationError } : {}) }
const candidateSummary = renderedResultExtractor.extract(capture).slice(0, 30).map((candidate) => ({ id: candidate.id, name: candidate.fields.name || '', resultUrl: candidate.resultUrl || '', fields: candidate.fields, evidenceLocators: candidate.evidence.map((item) => item.locator) }))
const endedAt = new Date().toISOString()
const diagnostic = {
  status: 'UNREVIEWED_GOOGLE_PERSISTENT_BROWSER_PROVING',
  requestedUrl, finalUrl, title, statusCode, outcome, challengeClassification: classification,
  resultRegionInspected: renderedEvidence.resultRegionInspected,
  visibleResultText: visibleResultText.slice(0, 20_000),
  knowledgePanelText: knowledgePanelText.slice(0, 8_000),
  resultLinks: resultLinks.slice(0, 150),
  resultDomains: [...new Set(resultLinks.map((link) => link.domain).filter(Boolean))],
  extractedCandidateSummary: candidateSummary,
  startedAt, endedAt, elapsedMs: Math.round(performance.now() - started),
  screenshotCaptured, navigationError,
  runtime: { headed: true, persistent: true, dedicatedProfileDir: profileDir, personalProfileUsed: false, loginAttempted: false, challengeInteractionAttempted: false, retries: 0, networkRestrictedByExecutor: process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1' },
  comparison: { currentProductionMode: 'headless non-persistent bounded context', productionFlowModified: false },
  artifacts: { directory: artifactDir, screenshot: screenshotCaptured ? screenshotPath : null, html: htmlPath, diagnostic: diagnosticPath },
}
mkdirSync(dirname(htmlPath), { recursive: true })
writeFileSync(htmlPath, html || '<!doctype html><title>Acquisition unavailable</title>')
writeFileSync(diagnosticPath, JSON.stringify(diagnostic, null, 2))
console.log(JSON.stringify({ artifactDir, outcome, challengeClassification: classification, finalUrl, resultRegionInspected: renderedEvidence.resultRegionInspected, candidates: candidateSummary.length, elapsedMs: diagnostic.elapsedMs, navigationError: navigationError.slice(0, 500) }, null, 2))
// A blocked or unavailable acquisition is a valid proving result once diagnostics are written.
process.exitCode = 0
