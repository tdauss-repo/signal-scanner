import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AcquisitionResult, RenderedResultEvidence } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfile, BusinessProfileState } from '../src/types/audit.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { assessBusinessCandidates, normalizedEntityField } from '../src/utils/entityMatcher.ts'
import { runVisibilityScan } from '../src/utils/visibilityScan.ts'
import { summarizePublicPresence } from '../src/utils/publicPresence.ts'
import { renderedBrowserProvider, type BrowserLauncher } from '../server/acquisition.ts'

const historical = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')).response
const profile = normalizeWorkspaceProfile({ businessName: 'Example Learning Center', website: 'https://example-learning.org/', streetAddress: '123 Main Street', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', localMarket: 'Southgate, MI' })
const reviewed = (value: BusinessProfile): BusinessProfileState => ({ schemaVersion: 1, values: Object.fromEntries(Object.entries(value).map(([field, fieldValue]) => [field, { value: fieldValue, source: 'fixture operator review', status: 'operator_reviewed', confidence: 'high' }])) })
const capture = (html: string, overrides: Partial<AcquisitionResult> = {}): AcquisitionResult => ({ version: 1, requestedUrl: 'https://www.google.com/search?q=example', finalUrl: 'https://www.google.com/search?q=example', provider: 'fixture-provider', method: 'server_fetch', acquiredAt: '2026-09-19T12:00:00.000Z', outcome: 'success', confidence: 'captured', notes: [], html, ...overrides })
const renderedEvidence = (sourceUrl = 'https://www.google.com/search?q=example'): RenderedResultEvidence => ({ sourceUrl, capturedAt: '2026-09-19T12:00:00.000Z', resultRegionInspected: true, candidates: [{ locator: 'main heading[0]', name: `${profile.businessName} — Official Site`, links: [{ url: profile.website, text: 'Website' }], phones: [profile.phone], excerpt: `${profile.businessName} ${profile.city} ${profile.state}` }] })
const maryLive = JSON.parse(readFileSync(new URL('./fixtures/mary-google-live-shape-2026-09-20.json', import.meta.url), 'utf8'))
const maryLiveProfile = normalizeWorkspaceProfile(maryLive.profile)

assert.equal(normalizedEntityField('streetAddress', 'Address: 15575 Northline Rd'), normalizedEntityField('streetAddress', '15575 Northline Road'), 'Live Address label and road abbreviation normalize equivalently')
assert.notEqual(normalizedEntityField('streetAddress', '15576 Northline Road'), normalizedEntityField('streetAddress', '15575 Northline Road'), 'A different house number remains meaningful')
assert.notEqual(normalizedEntityField('streetAddress', '15575 Allen Road'), normalizedEntityField('streetAddress', '15575 Northline Road'), 'A different street remains meaningful')
const maryLiveBrand = assessBusinessCandidates(maryLive.brand, maryLiveProfile, reviewed(maryLiveProfile), 'brand')
assert.equal(maryLiveBrand.confidence, 'high')
assert.equal(maryLiveBrand.visibilityResult, 'found')
assert.equal(maryLiveBrand.automaticObservation, true)
assert.equal(maryLiveBrand.operatorReviewRequired, false)
assert.equal(maryLiveBrand.blocker, 'none', 'Fresh Mary Browser knowledge evidence is a strong Brand match after semantic address normalization')
const maryLiveLocation = assessBusinessCandidates(maryLive.location, maryLiveProfile, reviewed(maryLiveProfile), 'location')
assert.equal(maryLiveLocation.selected?.candidate.id, 'brightdata-serp-knowledge-panel')
assert.equal(maryLiveLocation.confidence, 'high')
assert.equal(maryLiveLocation.visibilityResult, 'found')
assert.equal(maryLiveLocation.automaticObservation, true)
assert.equal(maryLiveLocation.operatorReviewRequired, false)
assert.equal(maryLiveLocation.blocker, 'none', 'The equivalent Mary knowledge/local records do not become multiple entities')
assert(maryLiveLocation.matches.some((match) => match.candidate.id === 'brightdata-serp-creative-montessori'), 'Creative Montessori remains retained as competitor evidence')

const domain = assessSearchCapture(capture(`<main><article><h3>${profile.businessName}</h3><a href="/url?q=${encodeURIComponent(profile.website)}">${profile.businessName}</a></article></main>`), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(domain.confidence, 'high')
assert.equal(domain.visibilityResult, 'found')
assert.equal(domain.operatorReviewRequired, false)
assert.equal(domain.automaticObservation, true, '1: reviewed name + official domain auto-records a Brand match')
assert(domain.selected?.matchedFields.some((field) => field.field === 'name'))
assert(domain.selected?.matchedFields.some((field) => field.field === 'website'))

const bingWrapper = 'https://www.bing.com/ck/a?u=a1opaque-wrapper-value&ntb=1'
const bingSemantic = assessSearchCapture(capture(`<main><li><h2><a href="${bingWrapper}">${profile.businessName} - Child-Centered Education</a></h2><cite>montessoridownriver.com</cite></li></main>`, {
  requestedUrl: `https://www.bing.com/search?q=${encodeURIComponent(profile.businessName)}`,
  finalUrl: `https://www.bing.com/search?q=${encodeURIComponent(profile.businessName)}`,
}), { ...profile, website: 'https://montessoridownriver.com/' }, reviewed({ ...profile, website: 'https://montessoridownriver.com/' }), 'Bing Search', 'brand')
assert.equal(bingSemantic.automaticObservation, true, '1a: a semantic result card carries its displayed official domain into Brand matching')
assert.equal(bingSemantic.selected?.candidate.fields.website, 'https://montessoridownriver.com/')
assert.equal(bingSemantic.selected?.candidate.fields.publicProfileUrl, undefined, '1b: the redirect wrapper is not retained as a business public profile')

const bingCapture = capture('<html><body><main>Rendered Bing results</main></body></html>', {
  requestedUrl: `https://www.bing.com/search?q=${encodeURIComponent(profile.businessName)}`,
  finalUrl: `https://www.bing.com/search?q=${encodeURIComponent(profile.businessName)}`,
  method: 'rendered_browser',
  renderedResultEvidence: {
    sourceUrl: `https://www.bing.com/search?q=${encodeURIComponent(profile.businessName)}`,
    capturedAt: '2026-09-19T12:00:00.000Z',
    resultRegionInspected: true,
    candidates: [{ locator: 'main heading[0]', name: `- Child-Centered Education ${profile.businessName}`, links: [{ url: bingWrapper, text: 'montessoridownriver.com' }], phones: [], excerpt: `montessoridownriver.com ${profile.businessName} - Child-Centered Education` }],
  },
})
const bingDisplayedDomain = assessSearchCapture(bingCapture, { ...profile, website: 'https://montessoridownriver.com/' }, reviewed({ ...profile, website: 'https://montessoridownriver.com/' }), 'Bing Search', 'brand')
assert.equal(bingDisplayedDomain.automaticObservation, true, '1c: a displayed official domain in bounded rendered evidence supplies Brand corroboration')
assert.equal(bingDisplayedDomain.selected?.candidate.fields.website, 'https://montessoridownriver.com/')
assert.equal(bingDisplayedDomain.selected?.candidate.fields.publicProfileUrl, undefined, '1d: an unresolved search redirect wrapper is not treated as the business website or public profile')
assert(bingDisplayedDomain.selected?.evidence.some((item) => item.locator.includes('displayed destination')), 'Displayed-domain provenance is retained')

const sameDomainCapture = { ...bingCapture, renderedResultEvidence: { ...bingCapture.renderedResultEvidence!, candidates: [
  bingCapture.renderedResultEvidence!.candidates[0],
  { locator: 'main heading[1]', name: `Programs - ${profile.businessName}`, links: [{ url: `${bingWrapper}-subpage`, text: 'montessoridownriver.com/programs' }], displayedUrls: ['montessoridownriver.com/programs'], phones: [], excerpt: `montessoridownriver.com/programs Programs - ${profile.businessName}` },
] } }
const sameDomain = assessSearchCapture(sameDomainCapture, { ...profile, website: 'https://montessoridownriver.com/' }, reviewed({ ...profile, website: 'https://montessoridownriver.com/' }), 'Bing Search', 'brand')
assert.equal(sameDomain.automaticObservation, true, '1e: homepage and subpage representations on the reviewed official domain are one identity')
assert(!sameDomain.ambiguityReasons.some((reason) => reason.includes('Multiple plausible')))

const publisherDomains = ['privateschoolreview.com', 'greatschools.org', 'yelp.com', 'chamberofcommerce.com', 'usnews.com', 'niche.com', 'localschooldirectory.com']
const publisherResultsCapture = { ...bingCapture, renderedResultEvidence: { ...bingCapture.renderedResultEvidence!, candidates: [
  bingCapture.renderedResultEvidence!.candidates[0],
  ...publisherDomains.map((publisher, index) => ({ locator: `main heading[${index + 1}]`, name: index === 0 ? `(2026-27 Profile) - , ${profile.businessName} Southgate MI` : index === 1 ? `School directory: ${profile.businessName} reviews and profile` : `${profile.businessName} - School profile`, links: [{ url: `https://${publisher}/school/example`, text: publisher }], displayedUrls: [publisher], phones: [], excerpt: `${profile.businessName} ${publisher}` })),
] } }
const publisherResults = assessSearchCapture(publisherResultsCapture, { ...profile, website: 'https://montessoridownriver.com/' }, reviewed({ ...profile, website: 'https://montessoridownriver.com/' }), 'Bing Search', 'brand')
assert.equal(publisherResults.automaticObservation, true, '1f: official-domain match plus third-party publisher results remains an automatic Brand match')
assert.equal(publisherResults.confidence, 'high')
assert.equal(publisherResults.visibilityResult, 'found')
assert.equal(publisherResults.operatorReviewRequired, false)
const publisherMatch = publisherResults.matches.find((match) => match.candidate.resultUrl?.includes('greatschools.org'))!
assert(publisherMatch)
assert.equal(publisherMatch.candidate.fields.website, undefined, '1g: a publisher result destination is not modeled as the business website')
assert.equal(publisherMatch.conflictingFields.some((field) => field.field === 'website'), false)
const decoratedPublisher = publisherResults.matches.find((match) => match.candidate.resultUrl?.includes('privateschoolreview.com'))!
assert(decoratedPublisher.conflictingFields.some((field) => field.field === 'name'), 'The live-shaped SEO title remains visible as a name variation')
assert.equal(publisherResults.blocker, 'none', '1h: title variation plus publisher resultUrl alone does not establish a competing entity')

const explicitOfficialCandidates = [
  { id: 'official', kind: 'semantic_card' as const, fields: { name: profile.businessName, website: profile.website }, evidence: [] },
  { id: 'distinct-official', kind: 'structured_entity' as const, fields: { name: `${profile.businessName} West`, website: 'https://different-learning-center.example/' }, evidence: [] },
]
const distinctBusinesses = assessBusinessCandidates(explicitOfficialCandidates, profile, reviewed(profile), 'brand')
assert.equal(distinctBusinesses.automaticObservation, false, '1i: two plausible businesses with different asserted official domains remain ambiguous')
assert.equal(distinctBusinesses.operatorReviewRequired, true)
assert(distinctBusinesses.ambiguityReasons.some((reason) => reason.includes('Multiple plausible')))

const differentName = `Profile: West ${profile.businessName} Detroit`
const conflictingPhone = assessBusinessCandidates([
  explicitOfficialCandidates[0],
  { id: 'conflicting-phone', kind: 'structured_entity' as const, fields: { name: differentName, phone: '313-555-0100' }, evidence: [] },
], profile, reviewed(profile), 'brand')
assert.equal(conflictingPhone.automaticObservation, false, '1j: a different name plus conflicting phone requires review')
assert.equal(conflictingPhone.operatorReviewRequired, true)

const conflictingAddress = assessBusinessCandidates([
  explicitOfficialCandidates[0],
  { id: 'conflicting-address', kind: 'structured_entity' as const, fields: { name: differentName, streetAddress: '999 Other Road', locality: 'Detroit', region: 'MI' }, evidence: [] },
], profile, reviewed(profile), 'brand')
assert.equal(conflictingAddress.automaticObservation, false, '1k: a different name plus conflicting address/location requires review')
assert.equal(conflictingAddress.operatorReviewRequired, true)

const conflictingWebsite = assessBusinessCandidates([
  explicitOfficialCandidates[0],
  { id: 'conflicting-website', kind: 'structured_entity' as const, fields: { name: differentName, website: 'https://other-business.example/' }, evidence: [] },
], profile, reviewed(profile), 'brand')
assert.equal(conflictingWebsite.automaticObservation, false, '1l: a different name plus asserted conflicting official website requires review')
assert.equal(conflictingWebsite.operatorReviewRequired, true)

const publishersOnly = assessBusinessCandidates(publisherDomains.slice(0, 3).map((publisher, index) => ({ id: `publisher-${index}`, kind: 'result_link' as const, resultUrl: `https://${publisher}/example`, fields: { name: profile.businessName }, evidence: [] })), profile, reviewed(profile), 'brand')
assert.equal(publishersOnly.automaticObservation, false, '1m: same-name third-party results without an official-domain match remain review-required')
assert.equal(publishersOnly.operatorReviewRequired, true)

const mary = normalizeWorkspaceProfile({ businessName: 'Montessori Center of Downriver', website: 'https://montessoridownriver.com/', streetAddress: '15575 Northline Rd', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', primaryCategory: 'Preschool' })
const maryKnowledge = { id: 'mary-knowledge', kind: 'semantic_card' as const, fields: { name: mary.businessName, website: mary.website, phone: '(734) 282-6465', streetAddress: mary.streetAddress, locality: mary.city, region: mary.state, postalCode: mary.zip, category: 'Preschool in Southgate, Michigan', placeIdentity: 'google-place-mary' }, evidence: [] }
const creativeCompetitor = { id: 'creative-montessori', kind: 'semantic_card' as const, fields: { name: 'Creative Montessori Center', website: 'https://creative-montessori.example/', phone: '313-555-0100', streetAddress: '999 Other Road', locality: 'Southgate', region: 'MI', placeIdentity: 'google-place-creative' }, evidence: [] }
const maryLocationWithCompetitor = assessBusinessCandidates([maryKnowledge, creativeCompetitor], mary, reviewed(mary), 'location')
assert.equal(maryLocationWithCompetitor.confidence, 'high')
assert.equal(maryLocationWithCompetitor.automaticObservation, true)
assert.equal(maryLocationWithCompetitor.visibilityResult, 'found')
assert.equal(maryLocationWithCompetitor.operatorReviewRequired, false)
assert.equal(maryLocationWithCompetitor.blocker, 'none', '1n: a strong location-qualified knowledge match is not downgraded by an unrelated competitor')
assert(maryLocationWithCompetitor.matches.some((match) => match.candidate.id === creativeCompetitor.id), '1o: unrelated competitors remain retained as result evidence')

const maryBrandWithCompetitor = assessBusinessCandidates([
  { ...maryKnowledge, id: 'mary-official-brand', fields: { name: mary.businessName, website: mary.website } },
  creativeCompetitor,
], mary, reviewed(mary), 'brand')
assert.equal(maryBrandWithCompetitor.automaticObservation, true)
assert.equal(maryBrandWithCompetitor.blocker, 'none', '1p: a strong official-domain Brand match is not downgraded by a differently named business')

const competingMary = (id: string, fields: typeof maryKnowledge.fields) => ({ id, kind: 'semantic_card' as const, fields, evidence: [] })
const locationConflict = (other: ReturnType<typeof competingMary>) => assessBusinessCandidates([maryKnowledge, other], mary, reviewed(mary), 'location')
const sameNamePhoneConflict = locationConflict(competingMary('mary-phone-conflict', { ...maryKnowledge.fields, phone: '313-555-9999', placeIdentity: 'google-place-mary-other-phone' }))
assert.equal(sameNamePhoneConflict.blocker, 'multiple_entities')
assert.equal(sameNamePhoneConflict.operatorReviewRequired, true, '1q: a same-name record with a conflicting phone still requires review')
const sameNameAddressConflict = locationConflict(competingMary('mary-address-conflict', { ...maryKnowledge.fields, streetAddress: '500 Different Avenue', locality: 'Detroit', postalCode: '48201', placeIdentity: 'google-place-mary-other-address' }))
assert.equal(sameNameAddressConflict.blocker, 'multiple_entities')
assert.equal(sameNameAddressConflict.operatorReviewRequired, true, '1r: a same-name record with a conflicting address still requires review')
const sameNameWebsiteConflict = locationConflict(competingMary('mary-website-conflict', { ...maryKnowledge.fields, website: 'https://different-montessori.example/', placeIdentity: 'google-place-mary-other-site' }))
assert.equal(sameNameWebsiteConflict.blocker, 'multiple_entities')
assert.equal(sameNameWebsiteConflict.operatorReviewRequired, true, '1s: a same-name record with a conflicting asserted official website still requires review')
const similarStrongConflict = locationConflict(competingMary('mary-similar-conflict', { ...maryKnowledge.fields, name: 'Montessori Center Downriver West', phone: '313-555-8888', website: 'https://downriver-west.example/', streetAddress: '700 West Road', locality: 'Southgate', placeIdentity: 'google-place-downriver-west' }))
assert.equal(similarStrongConflict.blocker, 'multiple_entities')
assert.equal(similarStrongConflict.operatorReviewRequired, true, '1t: a similar-name candidate with competing strong identity signals remains ambiguous')

const phoneAddress = `<main><article itemscope itemtype="https://schema.org/Organization"><h2 itemprop="name">${profile.businessName}</h2><a href="tel:${profile.phone}" itemprop="telephone">Call</a><span itemprop="streetAddress">123 Main St.</span><span itemprop="addressLocality">Southgate</span><span itemprop="addressRegion">Michigan</span><span itemprop="postalCode">48195</span></article></main>`
const identity = assessSearchCapture(capture(phoneAddress), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(identity.automaticObservation, true, '2: reviewed name + phone/address auto-records a Brand match')
assert(identity.selected?.matchedFields.some((field) => field.field === 'phone'))
assert(identity.selected?.matchedFields.some((field) => field.field === 'streetAddress'))

const ambiguous = assessSearchCapture(capture(`<main><article><h3>${profile.businessName}</h3><p>Possible public result</p></article></main>`), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(ambiguous.automaticObservation, false)
assert.equal(ambiguous.visibilityResult, 'review_required')
assert.equal(ambiguous.operatorReviewRequired, true, '3: a name without corroborating identity remains ambiguous')

const conflict = assessSearchCapture(capture(`<main><article itemscope itemtype="https://schema.org/Organization"><h2 itemprop="name">${profile.businessName}</h2><a itemprop="url" href="https://other.example/">Website</a><span itemprop="addressLocality">Detroit</span></article></main>`), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(conflict.automaticObservation, false)
assert.equal(conflict.blocker, 'identifier_conflict')
assert(conflict.selected?.conflictingFields.some((field) => field.field === 'website'))
assert(conflict.selected?.conflictingFields.some((field) => field.field === 'locality'), '4: conflicting domain/location is surfaced')

const absent = assessSearchCapture(capture('<main><article><h3>Different Company</h3><a href="https://different.example/">Different Company</a></article></main>'), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(absent.visibilityResult, 'not_found')
assert.equal(absent.blocker, 'no_match')
assert.equal(absent.resultRegionInspected, true)
assert.equal(absent.operatorReviewRequired, false, '5: only a normal inspected result region can produce not found')
const locationAbsent = assessSearchCapture(capture('<main><article><h3>Different Company</h3><a href="https://different.example/">Different Company</a></article></main>', { requestedUrl: 'https://www.bing.com/search?q=example+southgate', finalUrl: 'https://www.bing.com/search?q=example+southgate' }), profile, reviewed(profile), 'Bing Search', 'location')
assert.equal(locationAbsent.visibilityResult, 'not_found')
assert.equal(locationAbsent.blocker, 'no_match', 'Bing Location not-found still requires a normal inspected result region with no relevant candidate')
const unreviewedAbsence = assessSearchCapture(capture('<main><article><h3>Different Company</h3><a href="https://different.example/">Different Company</a></article></main>'), profile, { schemaVersion: 1, values: {} }, 'Google Search', 'brand')
assert.equal(unreviewedAbsence.visibilityResult, 'review_required', 'Not found also requires a reviewed business identity')

const unavailable = assessSearchCapture(capture('', { outcome: 'failed', error: 'EAI_AGAIN' }), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(unavailable.visibilityResult, 'unavailable')
assert.equal(unavailable.operatorReviewRequired, true)
assert.notEqual(unavailable.blocker, 'no_match', '6: acquisition failure never becomes not found')
const challenge = assessSearchCapture(capture('<main><h1>Our systems have detected unusual traffic from your computer network</h1></main>', { method: 'rendered_browser' }), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(challenge.visibilityResult, 'unavailable')
assert.equal(challenge.blocker, 'access_blocked')
assert.equal(challenge.operatorReviewRequired, true, '7: unusual-traffic page remains unavailable without bypass')

const rendered = assessSearchCapture(capture('<html><body><main>Rendered results</main></body></html>', { method: 'rendered_browser', renderedResultEvidence: renderedEvidence() }), profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(rendered.automaticObservation, true)
assert.equal(rendered.confidence, 'high')
assert.equal(rendered.selected?.evidence[0].method, 'rendered_browser', '8: rendered evidence proceeds through normal matching with provenance')
let closed = false
const launcher: BrowserLauncher = { async launch() { return { async close() { closed = true }, async newContext() { return { async route() {}, async newPage() { return {
  async goto() { return { status: () => 200 } }, async content() { return '<html><title>Search results</title><main><h3>Rendered result</h3></main></html>' }, url() { return 'https://www.google.com/search?q=example' },
  async evaluate<T>(expression: string) {
    if (expression.startsWith('document.body')) return `${profile.businessName} ${profile.city} ${profile.state}` as T
    if (expression.includes('resultRegionInspected')) return renderedEvidence() as T
    return { captureMethod: 'rendered_browser', links: [], jsonLdTextBlocks: [] } as T
  }, async screenshot() {},
} } } } } } }
const playwrightCapture = await renderedBrowserProvider(launcher, {}, async () => undefined).acquire('https://www.google.com/search?q=example')
const playwrightMatch = assessSearchCapture(playwrightCapture, profile, reviewed(profile), 'Google Search', 'brand')
assert.equal(playwrightMatch.automaticObservation, true, '8: successful Playwright capture is matched instead of forced to review')
assert.equal(playwrightMatch.operatorReviewRequired, false)
assert(closed)

const otherProfile = normalizeWorkspaceProfile({ businessName: 'Other Studio', website: 'https://other-studio.example/', city: 'Sylvania', state: 'OH', phone: '419-555-0100' })
const isolated = assessSearchCapture(capture('<main>Rendered results</main>', { method: 'rendered_browser', renderedResultEvidence: renderedEvidence() }), otherProfile, reviewed(otherProfile), 'Google Search', 'brand')
assert.equal(isolated.automaticObservation, false, '9: evidence for one profile cannot auto-match another profile')

const state: AuditState = { profile, businessProfile: reviewed(profile), checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: { entityClarity: [], customerQuestions: [] } }
let current = state
const run = await runVisibilityScan(state, { automationVersion: 2, async website() { return historical }, async acquire(url, method) {
  const query = new URL(url).searchParams.get('q') || ''
  if (url.includes('google.com/search') && query === profile.businessName && method === 'server_fetch') return capture('<main>Loading result content</main>', { requestedUrl: url, finalUrl: url, method, outcome: 'partial' })
  if (url.includes('google.com/search') && query === profile.businessName && method === 'rendered_browser') return capture('<main>Rendered result content</main>', { requestedUrl: url, finalUrl: url, method, renderedResultEvidence: renderedEvidence(url) })
  return capture('', { requestedUrl: url, finalUrl: url, method, outcome: 'failed', error: 'Fixture unavailable', confidence: 'unavailable' })
} }, (update) => { current = update(current) })
const googleBrand = current.searchDestinationObservations['search-brand-canonical']['Google Search']!
assert.equal(googleBrand.overallResult, 'found_match')
assert.equal(googleBrand.reviewed, false)
assert.equal(googleBrand.automation?.assessment?.confidence, 'high')
assert.equal(googleBrand.automation?.assessment?.operatorReviewRequired, false)
assert.equal(googleBrand.automation?.captures.at(-1)?.method, 'rendered_browser')
const summary = summarizePublicPresence(current)
assert.equal(summary.attempted, 16)
assert.equal(summary.evidence, 1)
assert.equal(summary.automatic, 1)
assert.equal(summary.reviewRequired, 15)
assert.equal(run.checks.find((check) => check.queryMode === 'brand' && check.destination === 'Google Search')?.state, 'evidence_captured')
assert.deepEqual(current.profile, profile, 'Observed evidence never overwrites the reviewed profile')

console.log('Public Presence promotion PASS: Brand confidence, ambiguity/conflicts, bounded not-found, failure/challenge handling, rendered matching, aggregate counts and profile isolation.')
