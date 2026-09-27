import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchVisibilityPanel } from '../src/components/SearchVisibilityPanel.tsx'
import type { AuditState, BusinessProfile, BusinessProfileState } from '../src/types/audit.ts'
import {
  brandPresenceEvidenceSummary,
  serializeBrandPresenceTechnicalEvidence,
  shortEvidenceUrl,
} from '../src/utils/brandPresenceEvidenceDetail.ts'
import { buildCustomerVisibilityReviewExport } from '../src/utils/customerVisibilityReviewExport.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { projectSalesVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })
process.env.TZ = 'America/Detroit'

const profile: BusinessProfile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', website: 'http://www.montessoridownriver.com/',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465',
  primaryCategory: 'Preschool', secondaryCategories: 'Montessori School, Kindergarten',
})
const profileState: BusinessProfileState = {
  schemaVersion: 1,
  values: Object.fromEntries((['businessName', 'website', 'streetAddress', 'city', 'state', 'zip', 'phone', 'primaryCategory', 'secondaryCategories'] as const).map((field) => [field, {
    value: profile[field], source: 'operator_entered', recordedAt: '2026-09-26T22:39:00Z', confidence: 'high', status: 'operator_reviewed',
  }])) as BusinessProfileState['values'],
}
const observedResultUrl = 'http://montessoridownriver.com/infographic-parenting-book-recommendations/?utm_source=long-provider-value'
const hugePayloadMarker = `RAW_PROVIDER_PAYLOAD_${'x'.repeat(20_000)}`
const candidate = { id: 'organic', kind: 'result_link' as const, resultUrl: observedResultUrl, fields: { name: profile.businessName, website: observedResultUrl }, evidence: [] }
const match = { candidate, matchedFields: [], conflictingFields: [], missingFields: [], unreviewedProfileFields: [], confidence: 'medium' as const, automaticObservation: false, ambiguityReasons: ['Business identity requires review.'], evidence: [] }
const capture = {
  version: 1 as const, provider: 'brightdata_browser_api', method: 'rendered_browser' as const,
  requestedUrl: 'https://www.google.com/search?q=Montessori&sxsrf=transient&ei=session', finalUrl: 'https://www.google.com/search?q=Montessori&ei=session',
  acquiredAt: '2026-09-26T22:39:00Z', outcome: 'success' as const, confidence: 'captured' as const,
  visibleText: hugePayloadMarker, resultRegionInspected: true, notes: ['Provider diagnostic note.'],
}
const organic = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  provenance: 'automated_acquisition', observedAt: '2026-09-26T22:39:00Z', overallResult: 'manual_review_needed',
  automation: {
    runId: 'run', state: 'awaiting_review', inspectedUrl: capture.requestedUrl, captures: [capture], evidence: 'Organic result captured.', interpreted: true, automaticObservation: false, queryMode: 'brand',
    assessment: { matches: [match], selected: match, confidence: 'medium', automaticObservation: false, visibilityResult: 'review_required', operatorReviewRequired: true, resultRegionInspected: true, ambiguityReasons: match.ambiguityReasons, blocker: 'insufficient_identity', tier3Candidate: false },
  },
}, { profile, brandPresence: true })

const sales = projectSalesVisibility(organic, { profile, profileState })
const summary = brandPresenceEvidenceSummary(organic, sales)
assert.equal(summary.acquisition, 'Automated evidence')
assert.equal(summary.result, 'Website result discovered')
assert.equal(summary.observedResultUrl, observedResultUrl)
assert.equal(summary.knownProfileUrl, undefined, 'an organic page is not presented as a known profile')
assert.equal(summary.verificationUrl, organic.verificationUrl)
assert.notEqual(summary.verificationUrl, summary.observedResultUrl)
assert.equal(summary.automationState, 'Review required')
assert.equal(summary.interpretation, 'Google returned a page from the business website, but the business information shown in search has not yet been verified.')
assert.equal(shortEvidenceUrl(observedResultUrl), 'montessoridownriver.com/infographic-parenting-book-recommendations/')
assert.equal(shortEvidenceUrl(capture.requestedUrl), 'google.com/search', 'query strings never dominate normal URL labels')

const markup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Search': organic } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
assert(markup.includes('Operator evidence &amp; acquisition detail'))
assert(markup.includes('Website result discovered'))
assert(markup.includes('montessoridownriver.com/infographic-parenting-book-recommendations/'))
assert(markup.includes('09/26/2026, 6:39 PM (local time)'), 'observed UTC time is formatted in browser-local time')
assert(markup.includes('Google Search verification query'))
assert(!markup.includes(hugePayloadMarker), 'collapsed normal evidence detail does not render the raw provider payload')
assert(!markup.includes('sxsrf=transient'), 'transient request URLs are absent from the normal summary')
assert.match(markup, /<details class="brand-presence-raw-evidence"><summary>Raw technical evidence<\/summary>/, 'technical disclosure exists and is collapsed by default')
assert(markup.indexOf('Expected business identity') < markup.indexOf('Operator evidence &amp; acquisition detail'), 'assisted verification remains before evidence drill-down')
for (const control of ['Open Google Search', 'Found — looks correct', 'Found — correction needed', 'Not found', 'Unable to determine']) assert(markup.includes(control), `${control} remains available`)

const raw = serializeBrandPresenceTechnicalEvidence(organic)
assert(raw.includes(hugePayloadMarker), 'the complete retained provider payload remains available on demand')
assert(raw.includes(capture.requestedUrl), 'request/debug metadata remains available technically')
const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const rawCss = css.match(/\.brand-presence-raw-evidence pre \{[\s\S]*?\n\}/)?.[0] || ''
assert.match(rawCss, /max-height:\s*22rem/)
assert.match(rawCss, /overflow:\s*auto/)
assert.match(rawCss, /white-space:\s*pre-wrap/)
const componentSource = readFileSync(new URL('../src/components/SearchVisibilityPanel.tsx', import.meta.url), 'utf8')
assert(componentSource.includes('Copy raw evidence'))

const yelpUrl = 'https://www.yelp.com/biz/montessori-center-of-downriver-southgate'
const yelp = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Yelp', profile.businessName), canonicalProfileUrl: yelpUrl,
  overallResult: 'manual_review_needed', provenance: 'automated_acquisition',
}, { profile, brandPresence: true })
assert.equal(brandPresenceEvidenceSummary(yelp, projectSalesVisibility(yelp, { profile, profileState })).knownProfileUrl, yelpUrl)
const invalidYelp = normalizeSearchDestinationObservation({ ...yelp, canonicalProfileUrl: 'https://example.com/arbitrary-page' }, { profile, brandPresence: true })
assert.equal(brandPresenceEvidenceSummary(invalidYelp, projectSalesVisibility(invalidYelp, { profile, profileState })).knownProfileUrl, undefined)

const unavailable = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Google Maps', profile.businessName), provenance: 'automated_acquisition', overallResult: 'unable_to_verify',
  automation: { runId: 'failed', state: 'failed', inspectedUrl: 'https://provider.invalid/request', captures: [{ ...capture, outcome: 'unavailable', confidence: 'unavailable', visibleText: 'STACK_AND_PROVIDER_RESPONSE' }], evidence: 'Exception stack.', interpreted: false, queryMode: 'brand', assessment: { matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable', operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: [], blocker: 'provider_upstream_failure', tier3Candidate: false } },
}, { profile, brandPresence: true })
const failureSummary = brandPresenceEvidenceSummary(unavailable, projectSalesVisibility(unavailable, { profile, profileState }))
assert.equal(failureSummary.acquisition, 'Automated check unavailable')
assert.equal(failureSummary.result, 'No verified result')
assert.equal(failureSummary.reason, 'Provider could not complete this check.')
assert.equal(failureSummary.nextStep, 'Use assisted verification.')
const failureMarkup = renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}}
  observations={{ 'search-brand-canonical': { 'Google Maps': unavailable } }} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
assert(failureMarkup.includes('Provider could not complete this check.'))
assert(!failureMarkup.includes('STACK_AND_PROVIDER_RESPONSE'), 'provider response remains outside the normal collapsed view')

const timedOut = normalizeSearchDestinationObservation({
  ...unavailable,
  automation: { ...unavailable.automation!, captures: [{ ...capture, outcome: 'failed', confidence: 'unavailable', blocker: 'provider_timeout', error: 'Google Search acquisition timed out after 85000 ms.' }] },
}, { profile, brandPresence: true })
assert.equal(brandPresenceEvidenceSummary(timedOut, projectSalesVisibility(timedOut, { profile, profileState })).reason, 'Provider timeout.', 'bounded provider cause is visible without raw diagnostics')

const state: AuditState = {
  profile, businessProfile: profileState, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '2026-09-26T22:39:00Z', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: { 'search-brand-canonical': { 'Google Search': organic } }, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
}
const beforeExport = buildCustomerVisibilityReviewExport(state, [], [])
renderToStaticMarkup(<SearchVisibilityPanel profile={profile} profileState={profileState} legacyTests={{}} observations={state.searchDestinationObservations} onChange={() => undefined} onAddToActionPlan={() => undefined} />)
assert.deepEqual(buildCustomerVisibilityReviewExport(state, [], []), beforeExport, 'operator-only rendering leaves customer export unchanged')

console.log('Brand Presence evidence detail PASS: concise local-time summary, bounded lazy raw evidence, safe URL labels, provider-failure wording, verification priority, and unchanged customer export.')
