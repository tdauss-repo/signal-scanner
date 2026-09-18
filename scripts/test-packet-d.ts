import assert from 'node:assert/strict'
import { build, stop } from 'esbuild'
import { auditWebsite } from '../server/websiteAudit.ts'
import { createServerFetchProvider, publicUrl, renderedBrowserProvider, chromiumSandboxEnabled, type BrowserLauncher } from '../server/acquisition.ts'
import type { AuditState } from '../src/types/audit.ts'
import { defaultManualWebsiteObservation, normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { deriveWebsiteFindings, mergeIntelligentFindings } from '../src/utils/findingIntelligence.ts'
import { normalizeAcquisition, metaDescriptionsFromHtml } from '../src/utils/acquisition.ts'
import { browserWebsiteObservationFromPayload, parseBrowserWebsiteEvidencePayload, updateBrowserWebsiteObservationDraft } from '../src/utils/browserWebsiteObservation.ts'
import { canPresentFinding, canReviewFinding, customerReviewKey, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { isStarterEligible } from '../src/utils/salesReadiness.ts'

// Synthetic controlled responses, not Mary scan results. Real acquisition is separately reported.
const html = `<html><head><title>Fixture</title><meta name="description" content="Intentional preschool description"><meta content='Just another WordPress site' name='description'></head><body>Preschool contact</body></html>`
assert.deepEqual(metaDescriptionsFromHtml(html), ['Intentional preschool description', 'Just another WordPress site'])
assert.deepEqual(metaDescriptionsFromHtml(`<!-- <meta name="description" content="no"> --><script>const tag = '<meta name="description" content="no">'</script><meta content="A parent's choice" name=description>`), ["A parent's choice"])
const originalFetch = globalThis.fetch
const originalInfo = console.info
console.info = () => undefined
let tlsError = 'CERT_HAS_EXPIRED'
globalThis.fetch = async (input, init) => {
  if (init?.method === 'HEAD') return new Response('', { status: 404 })
  if (String(input).startsWith('https:')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: tlsError } })
  return new Response(html, { status: 200 })
}
try {
  const profile = normalizeWorkspaceProfile({ businessName: 'Montessori fixture (synthetic)', website: 'http://school.example.org/' })
  const result = await auditWebsite({ website: profile.website, businessName: profile.businessName, phone: '', services: [], serviceAreas: [] })
  assert(result.ok)
  assert.equal(result.transportEvidence?.https.errorType, 'tls_certificate')
  assert.equal(result.metaDescriptions?.length, 2)
  const state: AuditState = {
    profile, businessProfile: { schemaVersion: 1, values: {} }, checks: {}, notes: {}, evidenceConfidence: {},
    lastUpdated: result.analyzedAt, reportSummary: '', websiteAudit: { lastSuccessful: result, latestAttempt: result, browserObservation: null, manualObservation: defaultManualWebsiteObservation() },
    selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {},
    voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: { entityClarity: [], customerQuestions: [] },
  }
  const candidates = deriveWebsiteFindings(state)
  assert.equal(candidates.length, 2)
  assert(candidates.every((finding) => !finding.reviewed && canReviewFinding(finding) && !canPresentFinding(finding)))
  assert.equal(summarizeCustomerScan(state, [], candidates).findings.length, 0)
  assert(!candidates.some((finding) => /h1/i.test(finding.id)))
  assert.match(candidates[1].intelligence!.customer.found, /WordPress/)
  assert.equal(candidates[0].intelligence!.evidence.provenance.sourceUrl, result.fetchedUrl)
  state.customerFindingReviews = Object.fromEntries(candidates.map((finding) => [finding.id, customerReviewKey(state, finding)]))
  const summary = summarizeCustomerScan(state, [], candidates)
  assert.equal(summary.findings.length, 2)
  assert(summary.findings.every(isStarterEligible))
  assert(summary.findings.every((finding) => finding.intelligence?.lifecycle === 'Evidence captured'))
  const restored = structuredClone(state)
  restored.websiteAudit = normalizeWebsiteAuditWorkspaceState(JSON.parse(JSON.stringify(state.websiteAudit)))
  assert.equal(deriveWebsiteFindings(restored).length, 2)
  assert.equal(summarizeCustomerScan(restored, [], deriveWebsiteFindings(restored)).findings.length, 2)
  const changed = structuredClone(state)
  changed.websiteAudit.lastSuccessful!.metaDescriptions = ['Corrected description']
  const remaining = deriveWebsiteFindings(changed)
  assert.equal(remaining.length, 1)
  assert.equal(summarizeCustomerScan(changed, [], remaining).findings.length, 0)
  const excluded = { ...candidates[0], salesPackageFit: 'excluded' as const }
  assert(!canReviewFinding(excluded))
  const withoutVerification = { ...candidates[0], verificationMethod: '' }
  assert(!canReviewFinding(withoutVerification))
  const differentBusiness = structuredClone(state)
  differentBusiness.profile = normalizeWorkspaceProfile({ businessName: 'JEM fixture', website: 'https://photography.example.org/' })
  assert.equal(deriveWebsiteFindings(differentBusiness).length, 0)
  assert.equal(summarizeCustomerScan(differentBusiness, [], candidates).findings.length, 0)

  tlsError = 'EAI_AGAIN'
  const network = await auditWebsite({ website: profile.website, businessName: '', phone: '', services: [], serviceAreas: [] })
  assert(network.ok)
  const uncertain = { ...state, websiteAudit: { ...state.websiteAudit, lastSuccessful: network, latestAttempt: network } }
  assert(!deriveWebsiteFindings(uncertain).some((finding) => finding.id === 'finding-website-https'))
  network.metaDescriptions = ['Single description']
  network.h1Text = []
  assert.equal(deriveWebsiteFindings(uncertain).length, 0) // H1 alone is not a finding.
  assert.equal(mergeIntelligentFindings(uncertain, [{ ...candidates[0], id: 'website-https' }]).length, 0)

  const payload = { schema: 'found-local-browser-website-evidence', captureVersion: 1, capturedAt: '2099-01-01T00:00:00Z', sourceUrl: profile.website,
    captureProvider: 'playwright-chromium', captureMethod: 'rendered_browser', title: 'Fixture', metaDescription: 'First', metaDescriptions: ['First', 'Second'],
    h1Text: [], h2Text: [], visibleText: 'Fixture', links: [], jsonLdTextBlocks: [] }
  const parsed = parseBrowserWebsiteEvidencePayload(JSON.stringify(payload))
  assert(parsed.ok)
  const observation = browserWebsiteObservationFromPayload(parsed.payload, '2099-01-01T00:01:00Z')
  assert.equal(observation.acquisition!.method, 'rendered_browser')
  const browserOnly = { ...state, websiteAudit: { ...state.websiteAudit, lastSuccessful: null, latestAttempt: null, browserObservation: observation } }
  assert.equal(deriveWebsiteFindings(browserOnly).length, 1)
  assert.equal(deriveWebsiteFindings(browserOnly)[0].intelligence!.evidence.provenance.provider, 'playwright-chromium')
  const edit = updateBrowserWebsiteObservationDraft(observation, { metaDescription: 'Corrected scalar' })
  assert.equal(edit.metaDescriptions, undefined)
  assert.equal(edit.acquisition, null)
  const single = structuredClone(browserOnly)
  single.websiteAudit.browserObservation!.metaDescriptions = ['Single']
  assert.equal(deriveWebsiteFindings(single).length, 0)
  // Newer contradictory rendered evidence does not carry forward an old transport finding.
  const newer = { ...state, websiteAudit: { ...state.websiteAudit, browserObservation: single.websiteAudit.browserObservation } }
  assert.equal(deriveWebsiteFindings(newer).length, 0)
  const edited = { ...state, websiteAudit: { ...state.websiteAudit, browserObservation: edit } }
  assert.equal(deriveWebsiteFindings(edited).length, 0)
  assert(!parseBrowserWebsiteEvidencePayload(JSON.stringify({ ...payload, metaDescriptions: 12 })).ok)

  for (const method of ['server_fetch', 'browser_assisted_observation', 'operator_observation', 'rendered_browser'] as const) {
    const provenance = { ...result.acquisition, method, provider: `fixture-${method}` }
    const normalized = normalizeAcquisition(provenance, { html, screenshotReference: 'fixture.png' })
    assert.equal(normalized.provider, provenance.provider)
    assert.equal(normalized.finalUrl, provenance.sourceUrl)
    assert.equal(normalized.acquiredAt, provenance.occurredAt)
    assert.equal(normalized.screenshotReference, 'fixture.png')
    assert.equal(normalizeAcquisition({ ...provenance, outcome: 'blocked' }).outcome, 'blocked')
  }
  assert.throws(() => publicUrl('http://127.0.0.1/'))
  assert.throws(() => publicUrl('https://username:password@example.org'))
  const provider = createServerFetchProvider(async () => undefined)
  globalThis.fetch = async () => new Response(html, { status: 200 })
  const acquired = await provider.acquire(profile.website)
  assert.equal(acquired.outcome, 'success')
  assert.equal(acquired.html, html)
  globalThis.fetch = async () => new Response('<title>Just a moment</title>', { status: 200 })
  assert.equal((await provider.acquire(profile.website)).outcome, 'blocked')
  globalThis.fetch = async () => new Response('Forbidden', { status: 403 })
  assert.equal((await provider.acquire(profile.website)).outcome, 'blocked')
  globalThis.fetch = async () => { throw new Error('Fixture provider unavailable') }
  assert.equal((await provider.acquire(profile.website)).outcome, 'failed')
  const failedAudit = await auditWebsite({ website: profile.website, businessName: '', phone: '', services: [], serviceAreas: [] })
  assert(!failedAudit.ok)
  assert.equal(deriveWebsiteFindings({ ...state, websiteAudit: { ...state.websiteAudit, latestAttempt: failedAudit } }).length, 0)
  let closed = false
  const launches: Parameters<BrowserLauncher['launch']>[0][] = []
  const contexts: { ignoreHTTPSErrors: boolean; serviceWorkers: string; acceptDownloads: boolean }[] = []
  const launcher: BrowserLauncher = { launch: async (options) => {
    launches.push(options)
    return { close: async () => { closed = true }, newContext: async (contextOptions) => {
      contexts.push(contextOptions)
      return { route: async () => undefined, newPage: async () => ({
        goto: async () => ({ status: () => 200 }), content: async () => html, url: () => profile.website,
        evaluate: async <T,>(expression: string) => (expression.startsWith('document.body') ? 'Fixture text' : parsed.payload) as T,
        screenshot: async () => undefined,
      }) }
    } }
  } }
  const rendered = await renderedBrowserProvider(launcher, {}, async () => undefined).acquire(profile.website)
  assert.equal(rendered.outcome, 'success')
  assert.equal(rendered.browserEvidence?.captureMethod, 'rendered_browser')
  assert(closed)
  assert.equal(launches[0].chromiumSandbox, true) // Direct provider default.
  for (const configuredValue of [undefined, '', 'true', 'FALSE', '0', 'false']) {
    const captured = await renderedBrowserProvider(launcher, {
      chromiumSandbox: chromiumSandboxEnabled(configuredValue),
    }, async () => undefined).acquire(profile.website)
    assert.deepEqual(launches.at(-1), {
      headless: true, executablePath: undefined, timeout: 15_000,
      chromiumSandbox: configuredValue !== 'false',
    })
    assert.deepEqual(contexts.at(-1), { ignoreHTTPSErrors: false, serviceWorkers: 'block', acceptDownloads: false })
    // Only launch sandbox configuration changes; evidence and provenance do not.
    const { acquiredAt: originalTime, ...originalCapture } = rendered
    const { acquiredAt: captureTime, ...comparisonCapture } = captured
    assert(originalTime && captureTime)
    assert.deepEqual(comparisonCapture, originalCapture)
  }
  const failed = await renderedBrowserProvider(launcher, {}, async () => { throw new Error('DNS blocked fixture') }).acquire(profile.website)
  assert.equal(failed.outcome, 'failed')
  assert.equal(failed.browserEvidence, undefined)

  // Actual customer components: raw implementation details absent; no manufactured Results.
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {CustomerScanView} from './src/components/CustomerScanView'; export const render = props => renderToStaticMarkup(React.createElement(CustomerScanView, props));`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` } })
  const { render } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
  for (const view of ['Findings', 'Action Plan']) {
    const markup = render({ state, items: [], fixes: candidates, view, loading: false, scanError: false, onView() {}, onScan() {}, onWorkbench() {} })
    assert.match(markup, /Secure website connection/)
    assert.match(markup, /Homepage search description/)
    assert(!markup.includes('Identify which theme, plugin or framework'))
    assert(!markup.includes('JEM'))
  }
  const emptyResults = render({ state, items: [], fixes: candidates, view: 'Results', onView() {}, onScan() {}, onWorkbench() {} })
  assert.match(emptyResults, /Verified improvements will appear here/)
  assert(!emptyResults.includes('Homepage search description'))
  console.info = originalInfo
  console.log('Packet D: detection, review/presentation, persistence, isolation, provider normalization/failure and customer surfaces PASS (synthetic, no network).')
} finally {
  globalThis.fetch = originalFetch
  console.info = originalInfo
  stop()
}
