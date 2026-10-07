import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acquireBingSearch, bingMapsBusinessSearchUrl, type BingSearchTransportResult } from '../server/bingSearch.ts'
import type { AcquisitionResult, BingReviewedIdentityInput } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState, SearchDestinationObservation } from '../src/types/audit.ts'
import { buildCustomerVisibilityReviewExport } from '../src/utils/customerVisibilityReviewExport.ts'
import { customerStrengthCandidates } from '../src/utils/customerStrengths.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const observedAt = '2026-10-06T12:00:00.000Z'
const query = 'Montessori Center of Downriver Southgate MI'
const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
const genericHtml = readFileSync(new URL('./fixtures/bing-generic-montessori-serp.html', import.meta.url), 'utf8')
const maryMapsHtml = readFileSync(new URL('./fixtures/bing-maps-montessori-local.html', import.meta.url), 'utf8')
const identity: BingReviewedIdentityInput = {
  businessName: 'Montessori Center of Downriver', website: 'https://montessoridownriver.com/', phone: '734-282-6465',
  streetAddress: '15575 Northline Rd', city: 'Southgate', state: 'MI', zip: '48195', primaryCategory: 'Preschool',
}
const profile = normalizeWorkspaceProfile(identity)
const fields: BusinessProfileField[] = ['businessName', 'website', 'phone', 'streetAddress', 'city', 'state', 'zip', 'primaryCategory']
const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'golden fixture', confidence: 'high', status: 'operator_reviewed', recordedAt: observedAt,
}])) as BusinessProfileState['values'] }
const assess = (capture: AcquisitionResult) => assessSearchCapture(capture, profile, profileState, 'Bing Search', 'brand')
const mapsUrl = bingMapsBusinessSearchUrl(query)
assert.equal(mapsUrl.href, 'https://www.bing.com/maps/default.aspx?ss=yp.Montessori+Center+of+Downriver+Southgate+MI')

const run = async (responses: Array<string | ((url: URL) => BingSearchTransportResult)>) => {
  const urls: string[] = []
  const capture = await acquireBingSearch(searchUrl, {
    reviewedIdentity: identity,
    verifyDns: async () => undefined,
    transport: async (url) => {
      urls.push(url.href)
      const response = responses[urls.length - 1]
      assert(response, `unexpected Bing request ${url.href}`)
      return typeof response === 'function' ? response(url) : { status: 200, finalUrl: url.href, body: response }
    },
  })
  return { capture, urls, assessment: assess(capture) }
}

const directHtml = readFileSync(new URL('./fixtures/bing-local-business-montessori.html', import.meta.url), 'utf8')
const direct = await run([directHtml])
assert.equal(direct.urls.length, 1, 'A: a verified primary Search result stops the Bing chain')
assert.equal(direct.assessment.automaticObservation, true)

const directOrganicHtml = `<html><main><ol id="b_results"><li class="b_algo"><h2><a href="https://montessoridownriver.com/">Montessori Center of Downriver</a></h2><p>Official school website.</p></li></ol></main></html>`
const directOrganic = await run([directOrganicHtml])
assert.equal(directOrganic.urls.length, 1, 'A: a verified primary organic result also stops the Bing chain')
assert.equal(directOrganic.assessment.automaticObservation, true)

const primaryConflictHtml = directHtml
  .replace(/<ol id="b_results">[\s\S]*?<\/ol>/, '<ol id="b_results"></ol>')
  .replace('https://www.montessoridownriver.com/', 'https://different.example/')
  .replace('tel:+17342826465', 'tel:+13135550100')
  .replace('(734) 282-6465', '(313) 555-0100')
const primaryConflict = await run([primaryConflictHtml])
assert.equal(primaryConflict.urls.length, 1, 'A: a primary local record claiming Mary with conflicting identifiers stops before Maps')
assert.equal(primaryConflict.assessment.automaticObservation, false)
assert.equal(primaryConflict.assessment.blocker, 'identifier_conflict')

const golden = await run([genericHtml, maryMapsHtml])
assert.equal(golden.urls.length, 2, 'B: a generic primary gets exactly one documented Bing Maps business search')
assert.equal(golden.urls[1], mapsUrl.href)
assert.deepEqual(golden.capture.bingLocalResolution?.steps.map((step) => step.stage), ['search_primary', 'maps_search'])
assert.equal(golden.assessment.visibilityResult, 'found')
assert.equal(golden.assessment.automaticObservation, true)
assert.equal(golden.assessment.operatorReviewRequired, false)
assert.deepEqual(new Set(golden.assessment.selected?.matchedFields.map((field) => field.field)), new Set([
  'name', 'streetAddress', 'locality', 'region', 'postalCode', 'address', 'phone', 'website', 'category',
]))
assert.equal(golden.assessment.selected?.candidate.fields.placeIdentity, 'bing-mary-I5420B8793429BEE8')

const emptyMaps = await run([genericHtml, '<html><main id="maps-shell">Bing Maps</main></html>'])
assert.equal(emptyMaps.urls.length, 2, 'C: empty Maps evidence does not query spray')
assert.equal(emptyMaps.assessment.visibilityResult, 'review_required')
assert.equal(emptyMaps.assessment.automaticObservation, false)
assert.equal(emptyMaps.assessment.blocker, 'no_match')

const structured = (place: Record<string, unknown>) => `<html><main id="maps-shell"></main><script type="application/json">${JSON.stringify({ localSearch: { places: [place] } })}</script></html>`
const wrong = await run([genericHtml, structured({ __type: 'LocalBusiness', name: 'Different Montessori School', Website: 'https://different.example/', PhoneNumber: '313-555-0100', address: { formattedAddress: '900 Other Rd, Taylor, MI 48180' }, entityId: 'wrong-business' })])
assert.equal(wrong.assessment.automaticObservation, false, 'D: a wrong Maps business never verifies')

const nameOnly = await run([genericHtml, structured({ __type: 'LocalBusiness', name: identity.businessName, entityId: 'name-only' })])
assert.equal(nameOnly.assessment.automaticObservation, false, 'E: name plus a Bing identifier remains insufficient')

const nameDomain = await run([genericHtml, structured({ __type: 'LocalBusiness', name: identity.businessName, Website: identity.website, entityId: 'name-domain' })])
assert.equal(nameDomain.assessment.automaticObservation, true, 'F: name plus official domain uses the unchanged matcher outcome')

const nameAddressPhone = await run([genericHtml, structured({ __type: 'LocalBusiness', name: identity.businessName, PhoneNumber: identity.phone, address: { formattedAddress: '15575 Northline Rd, Southgate, MI 48195' }, entityId: 'name-address-phone' })])
assert.equal(nameAddressPhone.assessment.automaticObservation, true, 'G: name, address, and phone use the unchanged matcher outcome')

const detailUrl = 'https://www.bing.com/maps?q=Montessori+Center+of+Downriver&cp=42.212820~-83.211933&osid=mary-detail'
const partialMaps = structured({ __type: 'LocalBusiness', name: identity.businessName, entityId: 'mary-detail', webSearchUrl: detailUrl })
const detail = await run([genericHtml, partialMaps, maryMapsHtml])
assert.equal(detail.urls.length, 3, 'H: the provider follows at most one surfaced Bing-owned detail')
assert.equal(detail.urls[2], detailUrl)
assert.deepEqual(detail.capture.bingLocalResolution?.steps.map((step) => step.stage), ['search_primary', 'maps_search', 'maps_detail'])
assert.equal(detail.assessment.automaticObservation, true)
assert(detail.capture.bingLocalResolution?.steps.every((step) => step.requestedUrl.startsWith('https://www.bing.com/')), 'I: every request remains a Bing-owned server fetch')
assert.equal(detail.capture.method, 'server_fetch')
assert.equal(detail.capture.bingLocalResolution?.steps.some((step) => /browser|manual/i.test(step.stage)), false, 'J: no browser or manual fallback exists')

const observation: SearchDestinationObservation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Bing Search', query), overallResult: 'found_match', provenance: 'automated_acquisition',
  reviewed: false, observedAt, observedResultUrl: golden.assessment.selected?.candidate.resultUrl,
  canonicalProfileUrl: golden.assessment.selected?.candidate.fields.publicProfileUrl,
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
  automation: {
    runId: 'bing-golden-run', state: 'evidence_captured', queryMode: 'brand', inspectedUrl: searchUrl,
    captures: [golden.capture], evidence: 'Bing Maps local identity evidence.', interpreted: true, automaticObservation: true,
    assessment: golden.assessment,
  },
}, { profile, brandPresence: true })
const state: AuditState = {
  profile, businessProfile: profileState, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: observedAt, reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': { 'Bing Search': observation } },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
}
assert(customerStrengthCandidates(state, []).some((strength) => strength.id === 'search:Bing Search'), 'golden Bing evidence is strength eligible')
assert.equal(buildCustomerVisibilityReviewExport(state, [], []).needsReview.includes('Bing Search'), false, 'golden Bing is excluded from needsReview')

console.log('Bing local provider chain PASS: direct stop, generic-to-Maps recovery, structured normalization, neutral failures, one detail maximum, golden Mary strength, and customer boundary.')
