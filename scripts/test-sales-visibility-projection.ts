import assert from 'node:assert/strict'
import type { SearchDestinationObservation } from '../src/types/audit.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { projectSalesVisibility, salesCockpitVisibility, salesVisibilityGroups } from '../src/utils/salesVisibilityProjection.ts'

const base = (destination: SearchDestinationObservation['destination'] = 'Google Search') => defaultSearchDestinationObservation(destination, 'Example Business')
const automated = (observation: SearchDestinationObservation, result: 'found' | 'not_found' | 'unavailable' | 'review_required', extra = {}) => ({ ...observation, provenance: 'automated_acquisition' as const, automation: { runId: 'run', state: 'evidence_captured' as const, inspectedUrl: 'https://example.test/search', captures: [{ provider: 'brightdata', requestedUrl: '', finalUrl: '', acquiredAt: '', outcome: 'success', confidence: 'captured', notes: [] }], evidence: 'retained evidence', interpreted: true, automaticObservation: result === 'found', assessment: { visibilityResult: result, automaticObservation: result === 'found', operatorReviewRequired: result !== 'found' && result !== 'not_found', resultRegionInspected: result !== 'unavailable', confidence: result === 'found' ? 'high' : 'low', blocker: result === 'unavailable' ? 'provider_upstream_failure' : result === 'not_found' ? 'no_match' : 'multiple_entities', matches: [], ambiguityReasons: [], ...extra } } })

const unavailable = projectSalesVisibility(automated(base(), 'unavailable'))
assert.equal(unavailable.state, 'manual_verification_needed')
assert.equal(unavailable.customerFindingEligible, false)
assert(!unavailable.explanation.toLowerCase().includes('provider'))
assert.equal(unavailable.technicalDetail.provider, 'brightdata')

const good = projectSalesVisibility({ ...automated(base(), 'found'), overallResult: 'found_match' })
assert.equal(good.state, 'verified_correct')
assert.equal(good.customerFindingEligible, false)

const discrepancy = projectSalesVisibility({ ...automated(base(), 'found'), overallResult: 'found_conflicting_information' })
assert.equal(discrepancy.state, 'verified_correction_needed')
assert.equal(discrepancy.customerFindingEligible, true)
assert.equal(discrepancy.starterPackageEligible, true)
assert.equal(discrepancy.deliveryResponsibility, 'Found Local can implement')

const absence = projectSalesVisibility({ ...automated(base(), 'not_found'), overallResult: 'not_found' })
assert.equal(absence.state, 'not_found')
assert.equal(absence.customerFindingEligible, true)

const discovered = projectSalesVisibility(automated(base('Yelp'), 'review_required', { matches: [{ candidate: { fields: { publicProfileUrl: 'https://www.yelp.com/biz/example', }, resultUrl: 'https://www.yelp.com/biz/example' } }] }))
assert.equal(discovered.state, 'profile_discovered')
assert.equal(discovered.customerFindingEligible, false)
assert.equal(discovered.deliveryResponsibility, 'Manual verification required before recommendation')
assert.equal(discovered.evidenceUrl, 'https://www.yelp.com/biz/example')

const groups = salesVisibilityGroups([{ ...automated(base(), 'found'), overallResult: 'found_match' }, { ...automated(base('Apple Maps'), 'unavailable') }])
assert.equal(groups.lookingGood.length, 1)
assert.equal(groups.stillToVerify.length, 1)

const bingBrand = { ...automated(base('Bing Search'), 'found'), overallResult: 'found_match' as const }
const bingLocation = { ...automated(base('Bing Search'), 'review_required'), overallResult: 'manual_review_needed' as const }
const googleBrand = { ...automated(base(), 'found'), overallResult: 'found_match' as const }
const googleLocation = { ...automated(base(), 'review_required'), overallResult: 'manual_review_needed' as const }
const cockpit = salesCockpitVisibility([
  { queryId: 'search-brand-canonical', observation: bingBrand }, { queryId: 'search-brand-market', observation: bingLocation },
  { queryId: 'search-brand-canonical', observation: googleBrand }, { queryId: 'search-brand-market', observation: googleLocation },
  { queryId: 'search-brand-market', observation: { ...automated(base('Apple Maps'), 'unavailable'), overallResult: 'unable_to_verify' as const } },
])
assert.equal(cockpit.lookingGood.filter((item) => item.destination === 'Bing Search').length, 1)
assert.equal(cockpit.deeperReview.filter((item) => item.displayDestination === 'Bing location visibility').length, 1)
assert.equal(cockpit.deeperReview.some((item) => item.destination === 'Google Search'), false)
assert.equal(cockpit.deeperReview.filter((item) => item.destination === 'Apple Maps').length, 1)
console.log('Sales visibility projection PASS: neutral acquisition failures, profile discovery, verified positives, evidence-backed recommendations, and operator-only technical detail.')
