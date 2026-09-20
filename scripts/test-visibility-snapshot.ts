import assert from 'node:assert/strict'
import { build, stop } from 'esbuild'
import type { AuditState } from '../src/types/audit.ts'
import type { ScanState, VisibilityRun } from '../src/types/visibilityScan.ts'
import { destinationAcquisitionCapabilities } from '../src/utils/acquisitionCapabilities.ts'
import { summarizeCustomerScan } from '../src/utils/customerScan.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { scanProfileKey } from '../src/utils/visibilityScanState.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const profile = normalizeWorkspaceProfile({ businessName: 'Example Studio', website: 'https://example.com/', city: 'Example', state: 'MI' })
const makeState = (): AuditState => ({
  profile, businessProfile: { schemaVersion: 1, values: {} }, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const run = (states: Partial<Record<'WebsiteTechnical' | 'SearchMaps' | 'BusinessInformation' | 'AIDiscovery', ScanState>>): VisibilityRun => ({
  version: 2, id: 'snapshot-run', profileKey: scanProfileKey(profile), startedAt: '2026-09-19T20:00:00Z', endedAt: '2026-09-19T20:01:00Z', businessEvidence: [],
  checks: Object.entries(states).map(([area, state], index) => ({ id: `${area}-${index}`, area: area as keyof typeof states, state, captures: [], evidenceCaptured: state === 'checked_clear', interpreted: state === 'checked_clear' })),
})

let state = makeState()
let summary = summarizeCustomerScan(state, [], [])
assert.equal(summary.snapshot.overall, 'Not yet scanned')
assert(summary.areas.every((area) => area.snapshotStatus === 'Not yet scanned'))

state = makeState()
state.visibilityRuns = [run({ WebsiteTechnical: 'checked_clear', SearchMaps: 'checked_clear', BusinessInformation: 'checked_clear', AIDiscovery: 'checked_clear' })]
summary = summarizeCustomerScan(state, [], [])
assert.equal(summary.snapshot.overall, 'Looking strong')
assert(summary.areas.every((area) => area.snapshotStatus === 'Looking good'))

state = makeState()
state.visibilityRuns = [run({ WebsiteTechnical: 'checked_clear', SearchMaps: 'failed', BusinessInformation: 'not_checked', AIDiscovery: 'not_checked' })]
summary = summarizeCustomerScan(state, [], [])
assert.equal(summary.areas[1].snapshotStatus, 'Not fully verified')
assert.equal(summary.snapshot.overall, 'Not fully verified')
assert.notEqual(summary.snapshot.overall, 'Needs attention', 'Acquisition failure is unresolved verification, not a negative business finding')

state = makeState()
state.visibilityRuns = [run({ WebsiteTechnical: 'checked_clear', SearchMaps: 'needs_attention', BusinessInformation: 'checked_clear', AIDiscovery: 'checked_clear' })]
assert.equal(summarizeCustomerScan(state, [], []).snapshot.overall, 'Needs attention')
assert.equal(summarizeCustomerScan(state, [], [], true).snapshot.overall, 'Scan still being completed')

assert.equal(destinationAcquisitionCapabilities.length, 8)
assert.equal(new Set(destinationAcquisitionCapabilities.map((item) => item.destination)).size, 8)
for (const destination of ['Google Search', 'Google Maps', 'Bing Search']) {
  const capability = destinationAcquisitionCapabilities.find((item) => item.destination === destination)!
  assert.equal(capability.productionStatus, 'production')
  assert.equal(capability.automaticFound, true)
  assert.equal(capability.automaticNotFound, true)
}
for (const capability of destinationAcquisitionCapabilities.filter((item) => item.productionStatus === 'manual_fallback')) {
  assert.equal(capability.automaticFound, false)
  assert.equal(capability.automaticNotFound, false)
}

const compiled = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {CustomerScanView} from './src/components/CustomerScanView'; export const render=(props)=>renderToStaticMarkup(React.createElement(CustomerScanView,props));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } })
const renderPath = new URL('../.visibility-snapshot-render.mjs', import.meta.url)
const { writeFileSync, unlinkSync } = await import('node:fs')
writeFileSync(renderPath, compiled.outputFiles[0].text)
try {
  const { render } = await import(renderPath.href)
  const html = render({ state, items: [], fixes: [], view: 'Scan', loading: false, scanError: false, onScan() {}, onWorkbench() {}, onView() {} }) as string
  assert(html.includes('Visibility Snapshot'))
  assert(html.includes('Overall visibility'))
  assert(html.includes('Review findings'))
  assert(html.includes('Things looking good') && html.includes('Recommended improvements') && html.includes('Areas still to verify'))
  assert(!html.includes('0–100') && !html.includes('SEO score'))
} finally { unlinkSync(renderPath); stop() }

console.log('Visibility Snapshot PASS: qualitative derivation, neutral acquisition failures, customer hierarchy, and eight-destination capability matrix.')
