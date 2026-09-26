import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AuditItem, AuditState, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import { customerReviewReadiness, summarizeCustomerScan } from '../src/utils/customerScan.ts'
import {
  buildCustomerStrengthPresentation,
  customerStrengthCandidates,
  customerStrengthReviewItems,
  effectiveCustomerStrengths,
} from '../src/utils/customerStrengths.ts'
import {
  buildCustomerVisibilityReviewExport,
  customerVisibilityReviewQaText,
  serializeCustomerVisibilityReview,
} from '../src/utils/customerVisibilityReviewExport.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver',
  primaryCategory: 'Montessori school',
  city: 'Southgate',
  state: 'MI',
  streetAddress: '15575 Northline Road',
  website: 'https://montessoridownriver.example/',
})

const googleObservation = (overrides: Partial<SearchDestinationObservation> = {}): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation('Google Search', profile.businessName),
  provenance: 'automated_acquisition',
  evidenceKind: 'captured_result',
  confidence: 'scanner_detected_public_page',
  overallResult: 'found_match',
  observedResultTypes: ['official_website', 'business_name_correct', 'website_correct'],
  evidenceNotes: 'Reviewed name and official website match.',
  reviewed: true,
  automation: {
    runId: 'run-one', state: 'evidence_captured', inspectedUrl: 'https://www.google.com/search?q=montessori',
    captures: [{ version: 1, provider: 'fixture-provider', requestedUrl: 'https://www.google.com/', finalUrl: 'https://www.google.com/', acquiredAt: '2026-09-26T12:00:00Z', method: 'rendered_browser', outcome: 'success', confidence: 'captured', notes: [] }],
    evidence: 'RAW SEARCH CAPTURE', interpreted: true, automaticObservation: true, queryMode: 'brand',
    assessment: {
      visibilityResult: 'found', automaticObservation: true, operatorReviewRequired: false, resultRegionInspected: true,
      confidence: 'high', blocker: 'none', tier3Candidate: false, ambiguityReasons: [],
      matches: [{
        candidate: { id: 'google-mary', kind: 'result_link', resultUrl: profile.website, fields: { name: profile.businessName, website: profile.website }, evidence: [] },
        matchedFields: [{ field: 'name', expected: profile.businessName, observed: profile.businessName }], conflictingFields: [], missingFields: [], unreviewedProfileFields: [], confidence: 'high', automaticObservation: true, ambiguityReasons: [], evidence: [],
      }],
    },
  },
  ...overrides,
})

const neutralObservation = (destination: SearchDestination): SearchDestinationObservation => ({
  ...defaultSearchDestinationObservation(destination, profile.businessName),
  overallResult: 'manual_review_needed', evidenceNotes: 'Still needs review.', reviewed: false,
})

const items: AuditItem[] = [
  { id: 'website-faq', area: 'website', label: 'FAQ schema/content', description: 'FAQ and program content were observed.', weight: 8, access: 'public', evidenceLinks: [], fix: '' },
  { id: 'website-sitemap-robots', area: 'website', label: 'Sitemap/robots presence', description: 'Sitemap and robots files were observed.', weight: 8, access: 'public', evidenceLinks: [], fix: '' },
]

const makeState = (): AuditState => ({
  profile: structuredClone(profile), businessProfile: { schemaVersion: 1, values: {} },
  checks: { 'website-faq': 'pass', 'website-sitemap-robots': 'pass' },
  notes: { 'website-faq': 'FAQ and program links were found on the website.', 'website-sitemap-robots': 'Both sitemap.xml and robots.txt were available.' },
  evidenceConfidence: { 'website-faq': 'scanner_detected_public_page', 'website-sitemap-robots': 'scanner_detected_public_page' },
  lastUpdated: '2026-09-26T12:00:00Z', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {},
  searchDestinationObservations: {
    'search-brand-canonical': {
      'Google Search': googleObservation(),
      'Google Maps': neutralObservation('Google Maps'),
      'Bing Search': neutralObservation('Bing Search'),
      'Apple Maps': neutralObservation('Apple Maps'),
      DuckDuckGo: neutralObservation('DuckDuckGo'),
      Yelp: neutralObservation('Yelp'),
      Facebook: neutralObservation('Facebook'),
      Instagram: neutralObservation('Instagram'),
    },
  },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, profile),
})

const state = makeState()
const rawEvidence = structuredClone({ checks: state.checks, notes: state.notes, observations: state.searchDestinationObservations })
const initial = customerStrengthReviewItems(state, items)
assert.equal(initial.length, 3)
assert(initial.every((strength) => strength.state === 'included_generated'), 'historical workspaces include generated strengths by default')
assert.deepEqual(initial.map(({ title, summary }) => ({ title, summary })), [
  { title: 'Google Search', summary: 'We verified that the business identity shown in Google Search matches the reviewed information for Montessori Center of Downriver.' },
  { title: 'Helpful website content', summary: 'The website includes useful FAQ and program information that helps families understand the school.' },
  { title: 'Search accessibility', summary: 'The website includes the basic files search engines use to discover and access its pages.' },
])
assert.deepEqual(buildCustomerVisibilityReviewExport(state, items, []).verifiedStrengths, initial.map(({ title, summary }) => ({ title, summary })), 'unrefined strengths export with generated defaults')
const serviceState = makeState()
serviceState.profile = normalizeWorkspaceProfile({ ...serviceState.profile, businessName: 'Example Photography', primaryCategory: 'Photography studio' })
const serviceFaq = customerStrengthReviewItems(serviceState, items).find((strength) => strength.id === 'check:website-faq')!
assert.match(serviceFaq.summary, /FAQ and service information/)
assert.doesNotMatch(serviceFaq.summary, /families|school/, 'generated FAQ wording follows bounded business context rather than hard-coded Montessori copy')

const candidates = new Map(customerStrengthCandidates(state, items).map((strength) => [strength.id, strength]))
const refinements = {
  'search:Google Search': {
    included: true,
    title: 'Google Search',
    summary: 'We confirmed that Google Search shows the reviewed business identity for Montessori Center of Downriver.',
  },
  'check:website-faq': {
    included: true,
    title: 'Helpful website content',
    summary: 'The website gives families useful FAQ and program information about the school.',
  },
  'check:website-sitemap-robots': {
    included: true,
    title: 'Search accessibility',
    summary: 'The website provides the basic files search engines use to discover and access its pages.',
  },
}
state.customerStrengthPresentations = Object.fromEntries(Object.entries(refinements).map(([id, input]) => [id, buildCustomerStrengthPresentation(candidates.get(id)!, input)]))
assert(customerStrengthReviewItems(state, items).every((strength) => strength.state === 'included_refined'))

let review = buildCustomerVisibilityReviewExport(state, items, [])
let qa = customerVisibilityReviewQaText(review, true)
assert.deepEqual(review.verifiedStrengths, Object.values(refinements).map(({ title, summary }) => ({ title, summary })), 'JSON uses operator-refined wording')
for (const strength of review.verifiedStrengths) {
  assert(qa.includes(`- ${strength.title}\n  ${strength.summary}`), 'Copy Review Text uses the exact effective strength projection')
}
assert.doesNotMatch(review.verifiedStrengths[0].summary, /Maps|Bing|online visibility|search visibility/i, 'Google Search strength stays destination-specific')

const faq = candidates.get('check:website-faq')!
state.customerStrengthPresentations[faq.id] = buildCustomerStrengthPresentation(faq, { included: false, title: refinements[faq.id].title, summary: refinements[faq.id].summary })
review = buildCustomerVisibilityReviewExport(state, items, [])
qa = customerVisibilityReviewQaText(review, true)
assert.equal(review.verifiedStrengths.some((strength) => strength.title === 'Helpful website content'), false, 'hidden strength stays out of JSON')
assert.equal(qa.includes('The website gives families useful FAQ'), false, 'hidden strength stays out of QA text')
assert.equal(state.checks['website-faq'], 'pass', 'hiding customer presentation does not alter scan evidence')

state.customerStrengthPresentations[faq.id] = buildCustomerStrengthPresentation(faq, { included: true, title: refinements[faq.id].title, summary: refinements[faq.id].summary })
assert.equal(effectiveCustomerStrengths(state, items).some((strength) => strength.title === 'Helpful website content'), true, 'include restores a hidden strength')
assert.deepEqual({ checks: state.checks, notes: state.notes, observations: state.searchDestinationObservations }, rawEvidence, 'strength presentation actions leave raw evidence unchanged')

const unchanged = structuredClone(state)
unchanged.lastUpdated = '2026-09-27T12:00:00Z'
const unchangedGoogle = unchanged.searchDestinationObservations['search-brand-canonical']['Google Search']!
unchangedGoogle.observedAt = '2026-09-27T12:00:00Z'
unchangedGoogle.automation = { ...unchangedGoogle.automation!, runId: 'run-two', inspectedUrl: 'https://provider.example/new-request', captures: [{ ...unchangedGoogle.automation!.captures[0], provider: 'another-provider', acquiredAt: '2026-09-27T12:00:00Z' }] }
assert.deepEqual(effectiveCustomerStrengths(unchanged, items), effectiveCustomerStrengths(state, items), 'timestamps, run IDs, URLs, and providers do not invalidate unchanged strength evidence')

const changed = structuredClone(state)
changed.searchDestinationObservations['search-brand-canonical']['Google Search']!.evidenceNotes = 'Materially different identity evidence was reviewed.'
const changedItems = customerStrengthReviewItems(changed, items)
assert.equal(changedItems.find((strength) => strength.id === 'search:Google Search')?.state, 'needs_reconfirmation')
assert.equal(effectiveCustomerStrengths(changed, items).some((strength) => strength.id === 'search:Google Search'), false, 'stale operator wording cannot export as current truth')
assert.equal(customerReviewReadiness(changed, summarizeCustomerScan(changed, items, [])).state, 'not_ready', 'stale strength state blocks customer export pending reconciliation')

const disappeared = structuredClone(state)
disappeared.checks['website-sitemap-robots'] = 'unknown'
assert.equal(effectiveCustomerStrengths(disappeared, items).some((strength) => strength.id === 'check:website-sitemap-robots'), false, 'a strength missing from current evidence cannot remain active')
assert(disappeared.customerStrengthPresentations?.['check:website-sitemap-robots'], 'historical presentation state may remain internally for later reconciliation')

const reopened = JSON.parse(JSON.stringify(state)) as AuditState
assert.deepEqual(effectiveCustomerStrengths(reopened, items), effectiveCustomerStrengths(state, items), 'saved workspace JSON round-trip preserves strength presentation state')
const serialized = serializeCustomerVisibilityReview(buildCustomerVisibilityReviewExport(reopened, items, []))
for (const forbidden of ['evidenceKey', 'included_generated', 'operator_refined', 'customerStrengthPresentations', 'RAW SEARCH CAPTURE', 'fixture-provider']) assert.equal(serialized.includes(forbidden), false, `${forbidden} stays outside customer JSON`)

const strengthUi = readFileSync(new URL('../src/components/VerifiedStrengthReview.tsx', import.meta.url), 'utf8')
for (const expected of ['What’s working', 'verified strengths', 'Scanner strength · read only', 'Customer-facing wording', 'Edit customer wording', 'Hide from customer', 'operator refined']) assert(strengthUi.includes(expected), `Review UI includes ${expected}`)

console.log('Customer strength refinement PASS: Mary defaults/refinements, include/hide, immutable evidence, stable rescans, stale reconciliation, shared QA/JSON projection, narrow Google scope, persistence, and Review controls.')
