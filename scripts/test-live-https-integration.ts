import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build, stop } from 'esbuild'
import type { AuditState } from '../src/types/audit.ts'
import type { WebsiteAuditResult } from '../src/types/websiteAudit.ts'
import { auditWebsite } from '../server/websiteAudit.ts'
import { mapAutoAuditToWebsiteChecks, runWebsiteAutoAudit } from '../src/utils/websiteAutoAudit.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { deriveWebsiteFindings, mergeIntelligentFindings } from '../src/utils/findingIntelligence.ts'
import { canReviewFinding, customerReviewKey, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { isStarterEligible } from '../src/utils/salesReadiness.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8'))
const historical: WebsiteAuditResult = fixture.response
const profile = normalizeWorkspaceProfile({ ...fixture.request, primaryServices: '', serviceArea: 'Southgate, MI' })
const stateFor = (result: WebsiteAuditResult): AuditState => {
  const mapping = mapAutoAuditToWebsiteChecks(result, profile)
  return {
    profile, businessProfile: { schemaVersion: 1, values: {} }, checks: mapping.statuses, notes: mapping.notes, evidenceConfidence: {},
    lastUpdated: result.analyzedAt, reportSummary: '',
    websiteAudit: normalizeWebsiteAuditWorkspaceState({ lastSuccessful: result, latestAttempt: result }),
    selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {},
    voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
    salesReadiness: { entityClarity: [], customerQuestions: [] },
  }
}
// The captured complete pre-D API payload does not contain a failure cause. Do not
// fabricate one from httpsAvailable:false or the derived check status alone.
assert.equal(historical.httpAvailable, true)
assert.equal(historical.httpsAvailable, false)
assert.equal(historical.transportEvidence, undefined)
assert.equal(stateFor(historical).checks['website-https'], 'fail')
assert.equal(deriveWebsiteFindings(stateFor(historical)).length, 0)

const originalFetch = globalThis.fetch
const originalInfo = console.info
console.info = () => undefined
// Replay captured metadata through the REAL server evaluator and API client. This
// is a controlled transport replay, not a new live capture or a hand-built result.
const homepage = `<html><head><title>${historical.title}</title>${fixture.descriptionElements.join('')}<link rel="canonical" href="${historical.canonicalUrl}"></head><body>${historical.visibleTextSummary}</body></html>`
let failureCode: string | null = 'ECONNRESET'
let allNetworkUnavailable = false
const responseAt = (body: string, url: string, status = 200) => {
  const response = new Response(body, { status, headers: { 'content-type': 'text/html' } })
  Object.defineProperty(response, 'url', { value: url })
  return response
}
const transportFetch: typeof fetch = async (input, options) => {
  const url = String(input)
  if (url === '/api/audit-website') {
    // Same serialized body as the Express handler: response.json(await auditWebsite()).
    const request = JSON.parse(String(options?.body))
    return new Response(JSON.stringify(await auditWebsite(request)), { headers: { 'content-type': 'application/json' } })
  }
  if (allNetworkUnavailable || (url.startsWith('https:') && failureCode)) {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: failureCode || 'EAI_AGAIN' } })
  }
  if (options?.method === 'HEAD') return responseAt('', url)
  const finalUrl = failureCode ? historical.fetchedUrl : historical.fetchedUrl.replace('http:', 'https:')
  return responseAt(homepage, finalUrl)
}
globalThis.fetch = transportFetch
try {
  const scan = async () => {
    const result = await runWebsiteAutoAudit(profile)
    assert(result.ok)
    return result
  }
  const resetResult = await scan()
  assert.deepEqual(resetResult.transportEvidence, {
    http: { available: true, status: 200, finalUrl: historical.fetchedUrl },
    https: { available: false, status: null, finalUrl: historical.fetchedUrl.replace('http:', 'https:'), errorType: 'connection_error', errorCode: 'ECONNRESET' },
  })
  assert.equal(resetResult.httpAvailable, true)
  assert.equal(resetResult.httpsAvailable, false)
  assert.equal(resetResult.httpsStatus, null)
  assert.deepEqual(resetResult.metaDescriptions, ['Just another WordPress site', historical.jsonLdSchemaBlocks[0] && (historical.jsonLdSchemaBlocks[0] as { '@graph': { description: string }[] })['@graph'][0].description])
  const state = stateFor(resetResult)
  assert.equal(state.checks['website-https'], 'fail')
  const candidates = mergeIntelligentFindings(state, [])
  assert.deepEqual(candidates.map((finding) => finding.issue), ['Secure website connection', 'Homepage search description'])
  assert(candidates.every(canReviewFinding))
  assert(candidates.every((finding) => !isStarterEligible(finding)))
  assert.equal(summarizeCustomerScan(state, [], candidates).findings.length, 0)
  const https = candidates.find((finding) => finding.id === 'finding-website-https')!
  state.customerFindingReviews = { [https.id]: customerReviewKey(state, https) }
  const approved = summarizeCustomerScan(state, [], candidates).findings
  assert.equal(approved.length, 1)
  assert(isStarterEligible(approved[0]))
  assert.match(approved[0].intelligence!.customer.found, /secure HTTPS version/)

  const bundle = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {CustomerScanView} from './src/components/CustomerScanView'; import {CustomerFindingReview} from './src/components/CustomerFindingReview'; export const render = props => renderToStaticMarkup(React.createElement(CustomerScanView, props)); export const review = props => renderToStaticMarkup(React.createElement(CustomerFindingReview, props));`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` } })
  const { render, review } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
  const reviewMarkup = review({ state, fixes: candidates, onReview() {} })
  assert.match(reviewMarkup, /Secure website connection/)
  assert.match(reviewMarkup, /Homepage search description/)
  const reviewProps = { state, items: [], fixes: candidates, view: 'Review', loading: false, scanError: false, onView() {}, onScan() {}, onWorkbench() {} }
  assert.match(render(reviewProps), /Secure website connection/)
  assert.match(render({ ...reviewProps, state: { ...state, customerFindingReviews: {} } }), /Secure website connection/, 'Review shows candidates before disposition')
  const packageProps = { ...reviewProps, view: 'Package' }
  assert.match(render(packageProps), /Secure website connection/)
  assert(!render({ ...packageProps, state: { ...state, customerFindingReviews: {} } }).includes('Secure website connection'), 'Package remains approved-only')

  failureCode = 'ECONNREFUSED'
  const refused = await scan()
  const changedState = { ...state, websiteAudit: normalizeWebsiteAuditWorkspaceState({ lastSuccessful: refused, latestAttempt: refused }) }
  assert(deriveWebsiteFindings(changedState).some((finding) => finding.id === https.id))
  assert.equal(summarizeCustomerScan(changedState, [], deriveWebsiteFindings(changedState)).findings.length, 0)

  // Broad connection_error is insufficient; so are timeouts, DNS, local permissions,
  // executor/browser errors, ambiguous socket errors and network/host outages.
  for (const code of ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EPERM', 'EACCES', 'UND_ERR_SOCKET', 'BROWSER_EXECUTOR_FAILED']) {
    failureCode = code
    const failedSecureProbe = await scan()
    assert(!deriveWebsiteFindings(stateFor(failedSecureProbe)).some((finding) => finding.id === https.id), code)
    assert(deriveWebsiteFindings(stateFor(failedSecureProbe)).some((finding) => finding.id === 'finding-website-meta-description'), code)
  }
  const legacyCoarse = structuredClone(resetResult)
  delete legacyCoarse.transportEvidence!.https.errorCode
  assert(!deriveWebsiteFindings(stateFor(legacyCoarse)).some((finding) => finding.id === https.id))
  const unrelated = structuredClone(resetResult)
  unrelated.transportEvidence!.https.finalUrl = 'https://unrelated.example.org/'
  assert(!deriveWebsiteFindings(stateFor(unrelated)).some((finding) => finding.id === https.id))
  const noHttp = structuredClone(resetResult)
  noHttp.transportEvidence!.http.available = false
  assert(!deriveWebsiteFindings(stateFor(noHttp)).some((finding) => finding.id === https.id))

  for (const code of ['ECONNRESET', 'EAI_AGAIN', 'EPERM']) {
    allNetworkUnavailable = true
    failureCode = code
    const failed = await runWebsiteAutoAudit(profile)
    assert(!failed.ok)
    assert.equal(deriveWebsiteFindings({ ...state, websiteAudit: { ...state.websiteAudit, latestAttempt: failed } }).length, 0)
  }
  allNetworkUnavailable = false
  failureCode = null
  const healthy = await scan()
  assert.equal(healthy.httpsAvailable, true)
  assert.equal(healthy.httpRedirectsToHttps, true)
  assert(!deriveWebsiteFindings(stateFor(healthy)).some((finding) => finding.id === https.id))
  const h1Only = structuredClone(healthy)
  h1Only.metaDescriptions = ['One intended description']
  h1Only.h1Text = []
  assert.equal(deriveWebsiteFindings(stateFor(h1Only)).length, 0)
  console.info = originalInfo
  console.log('D.2 full audit/client/mapping/review replay passed: reset/refusal, network/DNS/executor exclusion, healthy HTTPS, duplicates, H1, review gates and freshness. Historical capture + controlled transport; NOT a live rescan.')
} finally {
  globalThis.fetch = originalFetch
  console.info = originalInfo
  stop()
}
