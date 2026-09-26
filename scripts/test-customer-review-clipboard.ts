import assert from 'node:assert/strict'
import { writeFileSync, unlinkSync } from 'node:fs'
import { build, stop } from 'esbuild'
import { copyText } from '../src/utils/copyText.ts'
import {
  customerVisibilityReviewQaText,
  serializeCustomerVisibilityReview,
  type CustomerVisibilityReviewExport,
} from '../src/utils/customerVisibilityReviewExport.ts'

const review: CustomerVisibilityReviewExport = {
  reviewVersion: '1.0',
  business: {
    name: 'Montessori Center of Downriver', category: 'Montessori school', city: 'Southgate', state: 'MI',
    website: 'https://montessoridownriver.example/', displayWebsite: 'montessoridownriver.example',
    websitePreview: { headline: 'Montessori Center of Downriver', subheadline: 'Montessori school in Southgate, MI' },
  },
  overall: { state: 'improvements_recommended', headline: 'A few improvements are recommended', summary: 'Approved improvements are ready for review.' },
  scanAreas: [{ id: 'website', name: 'Website & Technical', state: 'issue', summary: 'We found confirmed improvements worth addressing.' }],
  verifiedStrengths: [{ title: 'Programs page', summary: 'Program information is prominently linked.' }],
  confirmedIssues: [{ id: 'website-local-content', title: 'Homepage local identity clarity', label: 'Starter Visibility Cleanup', summary: 'Southgate can be clearer.', foundLocalAction: 'Clarify the school’s Southgate and Downriver context.' }],
  needsReview: ['Google Maps'],
  recommendedPackage: { name: 'Starter Visibility Cleanup', summary: 'Approved work only.', included: ['Homepage local identity clarity'], cta: 'Review Recommended Plan' },
}
const qaText = customerVisibilityReviewQaText(review, true)
const json = serializeCustomerVisibilityReview(review)

// Secure Clipboard API path.
let clipboardText = ''
let legacyCalls = 0
const clipboardResult = await copyText(qaText, {
  clipboard: { async writeText(text) { clipboardText = text } },
  legacyCopy() { legacyCalls++; return true },
})
assert.deepEqual(clipboardResult, { copied: true, method: 'clipboard' })
assert.equal(clipboardText, qaText)
assert.equal(legacyCalls, 0)

// HTTP/LAN path without navigator.clipboard.
let legacyText = ''
const fallbackResult = await copyText(json, {
  legacyCopy(text) { legacyText = text; return true },
})
assert.deepEqual(fallbackResult, { copied: true, method: 'legacy' })
assert.equal(legacyText, json)

// Permission denial must still attempt the compatibility copy.
let rejectedFallbackAttempted = false
const rejectedResult = await copyText(qaText, {
  clipboard: { async writeText() { throw new DOMException('Denied', 'NotAllowedError') } },
  legacyCopy(text) { rejectedFallbackAttempted = true; assert.equal(text, qaText); return true },
})
assert.equal(rejectedFallbackAttempted, true)
assert.deepEqual(rejectedResult, { copied: true, method: 'legacy' })

// Both Customer Review payloads travel through the same helper without alteration.
const copied: string[] = []
for (const content of [qaText, json]) {
  const result = await copyText(content, { legacyCopy(text) { copied.push(text); return true } })
  assert.equal(result.copied, true)
}
assert.deepEqual(copied, [qaText, json])
assert.equal(copied[0], customerVisibilityReviewQaText(review, true))
assert.equal(copied[1], JSON.stringify(review, null, 2))

// Total programmatic failure yields manual mode; its panel retains selectable exact content.
const manualResult = await copyText(json, {
  clipboard: { async writeText() { throw new Error('Blocked') } },
  legacyCopy() { return false },
})
assert.deepEqual(manualResult, { copied: false, method: 'manual' })
const compiled = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {ManualCopyFallback} from './src/components/CustomerReviewPanel'; export const render=(props)=>renderToStaticMarkup(React.createElement(ManualCopyFallback,props));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } })
const renderPath = new URL('../.customer-review-clipboard-render.mjs', import.meta.url)
writeFileSync(renderPath, compiled.outputFiles[0].text)
try {
  const { render } = await import(renderPath.href)
  const html = render({ label: 'Customer Review JSON', content: json }) as string
  assert(html.includes('Automatic copy is unavailable. Select the text below and copy manually.'))
  assert(html.includes('Customer Review JSON'))
  assert(html.includes('Montessori Center of Downriver'))
  assert(/<textarea[^>]*readonly/i.test(html), 'manual fallback content is rendered in a selectable read-only textarea')
} finally {
  unlinkSync(renderPath)
  stop()
}

console.log('Customer Review clipboard PASS: Clipboard API, legacy fallback, denial fallback, exact QA/JSON payloads, and selectable manual mode.')
