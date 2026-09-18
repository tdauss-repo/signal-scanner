import { pathToFileURL } from 'node:url'
import { serverFetchProvider, renderedBrowserProvider, chromiumSandboxEnabled, type BrowserLauncher } from '../server/acquisition.ts'
import { metaDescriptionsFromHtml } from '../src/utils/acquisition.ts'

// Explicit CLI escalation only. Output is capture evidence, NOT customer-reviewed truth.
// No implicit Mary default, automatic retry, provider inference, or saved workspace mutation.
const targets = process.argv.slice(2)
if (!targets.length || targets.length > 3) throw new Error('Supply 1–3 explicit public URLs.')
const startedAt = new Date().toISOString()
const start = performance.now()
const captures = []
for (const url of targets) {
  captures.push(await serverFetchProvider.acquire(url))
  const modulePath = process.env.FOUND_LOCAL_PLAYWRIGHT_MODULE
  if (modulePath) {
    try {
      const { chromium } = await import(pathToFileURL(modulePath).href) as { chromium: BrowserLauncher }
      captures.push(await renderedBrowserProvider(chromium, {
        executablePath: process.env.FOUND_LOCAL_CHROMIUM,
        chromiumSandbox: chromiumSandboxEnabled(process.env.FOUND_LOCAL_CHROMIUM_SANDBOX),
      }).acquire(url))
    } catch (error) {
      captures.push({ version: 1 as const, requestedUrl: url, method: 'rendered_browser' as const, provider: 'playwright-chromium', acquiredAt: new Date().toISOString(), outcome: 'failed' as const, confidence: 'unavailable' as const, notes: ['Optional Playwright runtime unavailable; server capture retained.'], error: error instanceof Error ? error.message : String(error) })
    }
  }
}
console.log(JSON.stringify({
  status: 'UNREVIEWED_PUBLIC_ACQUISITION', startedAt, elapsedMs: Math.round(performance.now() - start),
  targetsAttempted: targets.length,
  serverSuccesses: captures.filter((capture) => capture.method === 'server_fetch' && capture.outcome === 'success').length,
  renderedAttempts: captures.filter((capture) => capture.method === 'rendered_browser').length,
  captures: captures.map((capture) => ({ ...capture, metaDescriptions: capture.html ? metaDescriptionsFromHtml(capture.html) : null })),
}, null, 2))
