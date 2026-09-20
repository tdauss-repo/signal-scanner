import assert from 'node:assert/strict'
import { acquireBrightDataDestinationBrowser, acquireBrightDataDuckDuckGo, classifyDestinationBrowserPage, discoverPublicProfiles, normalizeDestinationBrowserCandidates, normalizeDuckDuckGoPayload, type DestinationBrowserObservation } from '../server/brightDataDestinations.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import type { BusinessProfile, BusinessProfileState } from '../src/types/audit.ts'

const profile = normalizeWorkspaceProfile({ businessName: 'Example Studio', website: 'https://example.com/', streetAddress: '1 Main Street', city: 'Example', state: 'MI', zip: '48111', phone: '555-555-0100' })
const reviewed = (value: BusinessProfile): BusinessProfileState => ({ schemaVersion: 1, values: Object.fromEntries(Object.entries(value).map(([field, fieldValue]) => [field, { value: fieldValue, source: 'fixture review', status: 'operator_reviewed', confidence: 'high' }])) })
const state = reviewed(profile)
const observed = (overrides: Partial<DestinationBrowserObservation> = {}): DestinationBrowserObservation => ({ title: 'Public results', visibleText: 'Example Studio 1 Main Street Example MI 48111 555-555-0100', html: '<main><article>Example Studio</article></main>', resultRegionInspected: true, noResults: false, candidates: [{ name: 'Example Studio', resultUrl: 'https://maps.apple.com/place?place-id=example-1', businessWebsite: profile.website, phone: profile.phone, address: '1 Main Street, Example, MI 48111', category: 'Photography studio', placeIdentity: 'apple-place-1', excerpt: 'Example Studio 1 Main Street Example MI 48111 555-555-0100', locator: 'place[0]' }], ...overrides })
const redactionFixtureCdpUrl = `wss://${['fixture-user', 'fixture-password'].join(':')}@brd.superproxy.io:9222`

const apple = await acquireBrightDataDestinationBrowser({ destination: 'Apple Maps', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async (_config, requestedUrl) => ({ observed: observed(), finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }))
assert.equal(apple.outcome, 'success')
assert.equal(apple.resultRegionInspected, true)
assert.equal(apple.checkedDestination, 'Apple Maps')
assert.equal(apple.normalizedSearchCandidates?.[0].fields.publicProfileUrl?.startsWith('https://maps.apple.com/'), true)
assert.equal(apple.normalizedSearchCandidates?.[0].fields.website, profile.website, 'Apple place URL stays separate from an explicitly asserted official website')
const appleMatch = assessSearchCapture(apple, profile, state, 'Apple Maps', 'brand')
assert.equal(appleMatch.visibilityResult, 'found')
assert.equal(appleMatch.confidence, 'high')
assert.equal(appleMatch.automaticObservation, true, 'matcher-ready Apple place evidence can produce a strong Brand observation')

const appleShell = await acquireBrightDataDestinationBrowser({ destination: 'Apple Maps', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async (_config, requestedUrl) => ({ observed: observed({ visibleText: 'Apple Maps', html: '<main>Loading map</main>', resultRegionInspected: false, candidates: [] }), finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }))
assert.equal(appleShell.outcome, 'unavailable')
assert.equal(appleShell.blocker, 'missing_result_region')
assert.equal(assessSearchCapture(appleShell, profile, state, 'Apple Maps', 'brand').visibilityResult, 'unavailable', 'a rendered Maps shell cannot become not_found')

const applePermission = await acquireBrightDataDestinationBrowser({ destination: 'Apple Maps', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async () => ({ observed: observed({ visibleText: '', html: '', resultRegionInspected: false, candidates: [] }), finalUrl: 'about:blank', navigationFailed: true, error: `page.goto: Requested URL is restricted in accordance with robots.txt. Ask your account manager to get full access for targeting this site (brob). ${redactionFixtureCdpUrl}` }))
assert.equal(applePermission.blocker, 'provider_permission_blocked')
assert.equal(applePermission.outcome, 'unavailable')
assert.equal(applePermission.resultRegionInspected, false)
assert.equal(applePermission.error?.includes('wss://***@brd.superproxy.io'), true)
assert.equal(applePermission.error?.includes('fixture-user:fixture-password'), false)
const applePermissionAssessment = assessSearchCapture(applePermission, profile, state, 'Apple Maps', 'brand')
assert.equal(applePermissionAssessment.visibilityResult, 'unavailable', 'a provider permission restriction never becomes not_found')
assert.equal(applePermissionAssessment.operatorReviewRequired, true)
assert.equal(applePermissionAssessment.resultRegionInspected, false)

const appleNoResults = await acquireBrightDataDestinationBrowser({ destination: 'Apple Maps', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async (_config, requestedUrl) => ({ observed: observed({ visibleText: 'No places found', html: '<main>No places found</main>', resultRegionInspected: true, noResults: true, candidates: [] }), finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }))
assert.equal(assessSearchCapture(appleNoResults, profile, state, 'Apple Maps', 'brand').visibilityResult, 'not_found', 'only an explicitly inspected normal no-result region can become not_found')

const yelpObserved = observed({ candidates: [{ name: profile.businessName, resultUrl: 'https://www.yelp.com/biz/example-studio-example', phone: profile.phone, address: '1 Main St, Example, MI 48111', category: 'Photographers', excerpt: 'Example Studio 1 Main St Example MI 48111', locator: 'biz[0]' }] })
const yelp = await acquireBrightDataDestinationBrowser({ destination: 'Yelp', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async (_config, requestedUrl) => ({ observed: yelpObserved, finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }))
assert.equal(yelp.normalizedSearchCandidates?.[0].fields.publicProfileUrl, 'https://www.yelp.com/biz/example-studio-example')
assert.equal(yelp.normalizedSearchCandidates?.[0].fields.website, undefined, 'Yelp profile URL is not an official business website')
assert.equal(assessSearchCapture(yelp, profile, state, 'Yelp', 'brand').automaticObservation, true)

const yelpAccess = await acquireBrightDataDestinationBrowser({ destination: 'Yelp', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async (_config, requestedUrl) => ({ observed: observed({ visibleText: '', html: '', resultRegionInspected: false, candidates: [] }), finalUrl: requestedUrl, statusCode: 403, navigationFailed: false }))
assert.equal(yelpAccess.blocker, 'access_blocked')
assert.equal(yelpAccess.outcome, 'unavailable')
assert.equal(yelpAccess.statusCode, 403)
const yelpAccessAssessment = assessSearchCapture(yelpAccess, profile, state, 'Yelp', 'brand')
assert.equal(yelpAccessAssessment.visibilityResult, 'unavailable', 'Yelp HTTP access failure remains unavailable')
assert.equal(yelpAccessAssessment.operatorReviewRequired, true)

const yelpProfileUrl = 'https://www.yelp.com/biz/example-studio-example'
const directYelp = await acquireBrightDataDestinationBrowser({ destination: 'Yelp', query: profile.businessName, targetUrl: yelpProfileUrl, cdpUrl: 'fixture-cdp' }, async (_config, requestedUrl) => {
  assert.equal(requestedUrl, yelpProfileUrl)
  return { observed: yelpObserved, finalUrl: requestedUrl, statusCode: 200, navigationFailed: false }
})
assert.equal(directYelp.requestedUrl, yelpProfileUrl, 'a search-discovered profile URL can be used for a bounded direct proving attempt')

const facebookLogin = await acquireBrightDataDestinationBrowser({ destination: 'Facebook', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async () => ({ observed: observed({ title: 'Log in to Facebook', visibleText: 'Log in to Facebook', html: '<main>Log in to Facebook</main>', resultRegionInspected: false, candidates: [] }), finalUrl: 'https://www.facebook.com/login/', statusCode: 200, navigationFailed: false }))
assert.equal(facebookLogin.outcome, 'blocked')
assert.equal(facebookLogin.blocker, 'login_wall')
assert.equal(assessSearchCapture(facebookLogin, profile, state, 'Facebook', 'brand').visibilityResult, 'unavailable')

const instagramLogin = await acquireBrightDataDestinationBrowser({ destination: 'Instagram', query: profile.businessName, cdpUrl: 'fixture-cdp' }, async () => ({ observed: observed({ title: 'Login • Instagram', visibleText: 'Log in to Instagram', html: '<main>Log in to Instagram</main>', resultRegionInspected: false, candidates: [] }), finalUrl: 'https://www.instagram.com/accounts/login/', statusCode: 200, navigationFailed: false }))
assert.equal(instagramLogin.blocker, 'login_wall')
assert.equal(assessSearchCapture(instagramLogin, profile, state, 'Instagram', 'brand').visibilityResult, 'unavailable')

const browserChallenge = classifyDestinationBrowserPage('Yelp', 'https://www.yelp.com/search', observed({ visibleText: 'Verify you are human', html: '<main>Verify you are human</main>', resultRegionInspected: false, candidates: [] }))
assert.equal(browserChallenge, 'challenge')

const duckPayload = { general: { search_engine: 'duckduckgo' }, organic: [{ title: 'Example Studio — Official Site', link: profile.website, description: 'Example Studio photography', rank: 1 }] }
const duck = await acquireBrightDataDuckDuckGo({ query: profile.businessName, token: 'test-token', zone: 'test-zone' }, async (_config, requestedUrl) => ({ status: 200, bodyText: JSON.stringify({ body: duckPayload, input: { original_url: requestedUrl } }) }))
assert.equal(duck.capture.outcome, 'success')
assert.equal(duck.capture.resultRegionInspected, true)
assert.equal(duck.capture.normalizedSearchCandidates?.[0].resultUrl, profile.website)
assert.equal(duck.capture.normalizedSearchCandidates?.[0].fields.website, undefined, 'DuckDuckGo organic destinations enter as resultUrl only')
const duckMatch = assessSearchCapture(duck.capture, profile, state, 'DuckDuckGo', 'brand')
assert.equal(duckMatch.visibilityResult, 'found')
assert.equal(duckMatch.automaticObservation, true, 'the existing matcher may establish an exact reviewed domain from a DuckDuckGo result URL')

const wrappedDuck = normalizeDuckDuckGoPayload({ organic_results: [{ title: profile.businessName, link: `https://duckduckgo.com/l/?uddg=${encodeURIComponent(profile.website)}` }] }, 'https://duckduckgo.com/?q=example', '2026-09-20T00:00:00.000Z')
assert.equal(wrappedDuck[0].resultUrl, profile.website)
assert.equal(wrappedDuck[0].fields.website, undefined)

const duckFailure = await acquireBrightDataDuckDuckGo({ query: profile.businessName, token: 'test-token', zone: 'test-zone' }, async () => ({ status: 502, headers: { 'x-brd-error-code': 'captcha_failed' }, bodyText: JSON.stringify({ error: 'provider failure' }) }))
assert.equal(duckFailure.capture.outcome, 'unavailable')
assert.equal(duckFailure.capture.blocker, 'challenge')
assert.equal(duckFailure.capture.resultRegionInspected, false)
assert.equal(assessSearchCapture(duckFailure.capture, profile, state, 'DuckDuckGo', 'brand').visibilityResult, 'unavailable', 'provider failure cannot become not_found')

const duckEmbeddedFailure = await acquireBrightDataDuckDuckGo({ query: profile.businessName, token: 'test-token', zone: 'test-zone' }, async () => ({ status: 200, bodyText: JSON.stringify({ status_code: 502, error: 'upstream failed' }) }))
assert.equal(duckEmbeddedFailure.capture.blocker, 'provider_upstream_failure')
assert.equal(duckEmbeddedFailure.capture.outcome, 'unavailable')
assert.equal(duckEmbeddedFailure.capture.resultRegionInspected, false)
const duckEmbeddedAssessment = assessSearchCapture(duckEmbeddedFailure.capture, profile, state, 'DuckDuckGo', 'brand')
assert.equal(duckEmbeddedAssessment.visibilityResult, 'unavailable', 'an embedded provider 5xx remains unavailable')
assert.equal(duckEmbeddedAssessment.operatorReviewRequired, true)

const discoveries = discoverPublicProfiles([{ id: 'google-organic-4', title: 'Example Studio', description: '1 Main St · 555-555-0100', resultUrl: yelpProfileUrl, provenance: { provider: 'brightdata_serp_api', responsePath: 'organic[3]' } }], 'Yelp', profile.businessName)
assert.equal(discoveries[0].state, 'profile_discovered')
assert.equal(discoveries[0].publicProfileUrl, yelpProfileUrl)
assert.equal(discoverPublicProfiles([{ id: 'competitor', title: 'Different Studio', resultUrl: 'https://www.facebook.com/different-studio/' }], 'Facebook', profile.businessName).length, 0, 'an unrelated social result is not profile discovery for the reviewed business')
assert.equal(discoverPublicProfiles([{ id: 'partial-name', title: 'Studio', resultUrl: yelpProfileUrl }], 'Yelp', profile.businessName).length, 0, 'a partial generic name cannot become profile discovery')

const normalizedApple = normalizeDestinationBrowserCandidates('Apple Maps', observed(), 'https://maps.apple.com/?q=Example', '2026-09-20T00:00:00.000Z')
assert.equal(normalizedApple[0].fields.publicProfileUrl?.includes('maps.apple.com'), true)
assert.equal(JSON.stringify([apple, duck.capture]).includes('test-token'), false)
assert.equal(JSON.stringify([apple, duck.capture]).includes('fixture-user'), false, 'capture/export contracts never retain provider credentials')

console.log('Destination Bright Data proving PASS: bounded Browser/structured acquisition, URL separation, matcher handoff, challenge/login handling, and not-found safeguards.')
