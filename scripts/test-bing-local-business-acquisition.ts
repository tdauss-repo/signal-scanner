import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  acquireBingSearch,
  bingSearchMarketContext,
  bingSearchRequestHeaders,
} from '../server/bingSearch.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { assessSearchCapture, searchResultExtractors } from '../src/utils/searchResultExtraction.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const acquiredAt = '2026-09-28T18:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195',
  phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const reviewedFields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = {
  schemaVersion: 1,
  values: Object.fromEntries(reviewedFields.map((field) => [field, {
    value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: acquiredAt,
  }])) as BusinessProfileState['values'],
}
const queryUrl = `https://www.bing.com/search?q=${encodeURIComponent('Montessori Center of Downriver Southgate MI')}`
const html = readFileSync(new URL('./fixtures/bing-local-business-montessori.html', import.meta.url), 'utf8')
let requestedUrl = new URL(queryUrl)
const capture = await acquireBingSearch(queryUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => {
    requestedUrl = url
    return { status: 200, finalUrl: url.href, body: html }
  },
})

assert.equal(requestedUrl.searchParams.get('q'), 'Montessori Center of Downriver Southgate MI', 'the established Brand query is unchanged')
assert.equal(requestedUrl.searchParams.get('cc'), 'us', 'US country context is explicit')
assert.equal(requestedUrl.searchParams.get('setlang'), 'en-us', 'English result language is explicit')
assert.equal(requestedUrl.searchParams.get('mkt'), 'en-US', 'US-English market is explicit')
assert.deepEqual(bingSearchMarketContext, { country: 'us', language: 'en-us', market: 'en-US' })
assert.match(bingSearchRequestHeaders['user-agent'], /Mozilla\/5\.0.*Chrome/i, 'native acquisition uses an ordinary stable desktop request identity')
assert.equal(bingSearchRequestHeaders['accept-language'], 'en-US,en;q=0.9')
assert.equal('cookie' in bingSearchRequestHeaders, false, 'no browser or personal session cookie is copied')
assert.equal('sec-ch-ua' in bingSearchRequestHeaders, false, 'no transient browser client hints are fabricated')
assert.equal('accept-encoding' in bingSearchRequestHeaders, false, 'compression negotiation remains with the bounded fetch transport')
assert.equal(capture.requestedUrl, queryUrl, 'operator verification URL remains clean and distinct from request context')
assert.equal(capture.statusCode, 200)
assert.equal(capture.resultRegionInspected, true)

const candidates = searchResultExtractors.flatMap((extractor) => extractor.extract(capture))
const local = candidates.filter((candidate) => candidate.sourceType === 'local_place')
assert.equal(local.length, 1, 'a bounded Bing local/business entity is normalized')
assert.deepEqual(local[0].fields, {
  name: 'Montessori Center of Downriver',
  category: 'Preschool in Southgate, MI',
  phone: '+17342826465',
  address: '15575 Northline Rd, Southgate, MI 48195',
  website: 'https://www.montessoridownriver.com/',
  publicProfileUrl: 'https://www.bing.com/maps?q=Montessori+Center+of+Downriver&cp=42.2~-83.2',
  placeIdentity: 'bing-local-montessori-downriver',
})

assert(candidates.some((candidate) => candidate.sourceType === 'local_place'), 'local entity remains available to the shared matcher')
assert(candidates.some((candidate) => candidate.sourceType === 'organic' && candidate.resultUrl?.includes('montessoridownriver.com')), 'existing organic extraction remains intact')
const assessment = assessSearchCapture(capture, profile, profileState, 'Bing Search', 'brand')
assert.equal(assessment.bingIdentityDecision?.decision, 'verified', 'the visible-result fixture verifies through the unchanged Bing matcher')
assert.equal(assessment.automaticObservation, true)
assert.equal(assessment.operatorReviewRequired, false)
assert.deepEqual(new Set(assessment.bingIdentityDecision?.matchedSignals.map((signal) => signal.field)), new Set(['name', 'website', 'phone', 'address']))

const bingPlaceUrl = 'https://www.bing.com/maps?q=Montessori+Center+of+Downriver&osid=fixture-place'
const partialLocalHtml = `<html><body><main id="b_results"><aside id="b_context"><section class="b_entityTP" data-entityid="fixture-place"><h2 class="b_entityTitle">Montessori Center of Downriver</h2><a aria-label="Map" href="${bingPlaceUrl.replace(/&/g, '&amp;')}">Map</a></section></aside></main></body></html>`
const secondaryHtml = `<html><body><main><section class="b_entityTP" data-entityid="fixture-place"><h1 class="b_entityTitle">Montessori Center of Downriver</h1><div aria-label="Address: 15575 Northline Rd, Southgate, MI 48195"></div><a aria-label="Phone: (734) 282-6465" href="tel:+17342826465">Call</a><a aria-label="Website" href="https://montessoridownriver.com/">Website</a><a aria-label="Map" href="${bingPlaceUrl.replace(/&/g, '&amp;')}">Map</a></section></main></body></html>`
const followedUrls: string[] = []
const resolved = await acquireBingSearch(queryUrl, {
  verifyDns: async () => undefined,
  transport: async (url) => {
    followedUrls.push(url.href)
    return { status: 200, finalUrl: url.href, body: followedUrls.length === 1 ? partialLocalHtml : secondaryHtml }
  },
})
assert.equal(followedUrls.length, 2, 'a partial local card permits one bounded Bing-owned detail request')
assert.equal(followedUrls[1], bingPlaceUrl)
assert.equal(resolved.secondaryResolution?.outcome, 'success')
assert.equal(assessSearchCapture(resolved, profile, profileState, 'Bing Search', 'brand').automaticObservation, true, 'secondary Bing-owned identity fields reach the unchanged strong matcher')

let retryOnlyCalls = 0
await acquireBingSearch(queryUrl, {
  verifyDns: async () => undefined,
  allowSecondaryResolution: false,
  transport: async (url) => {
    retryOnlyCalls += 1
    return { status: 200, finalUrl: url.href, body: partialLocalHtml }
  },
})
assert.equal(retryOnlyCalls, 1, 'an identity-rich retry cannot trigger a third Bing request')

const genericHtml = '<html><body><main><ol id="b_results"><li class="b_algo"><h2><a href="https://example.org/montessori">Montessori education</a></h2><p>General educational content.</p></li></ol></main></body></html>'
const noMatch = assessSearchCapture({
  version: 1, requestedUrl: queryUrl, finalUrl: requestedUrl.href, acquiredAt, provider: 'bing-native-fetch', method: 'server_fetch',
  outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: [], html: genericHtml,
}, profile, profileState, 'Bing Search', 'brand')
assert.equal(noMatch.visibilityResult, 'review_required', 'usable Bing results without an identity match remain neutral')
assert.equal(noMatch.operatorReviewRequired, true)
assert.equal(noMatch.blocker, 'no_match')
assert.equal(noMatch.automaticObservation, false)

console.log('Bing local business acquisition PASS: stable US-English context, local entity and organic extraction, unchanged matcher verification, and neutral no-match semantics.')
