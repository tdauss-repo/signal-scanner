import assert from 'node:assert/strict'
import { acquireAppleMaps, canonicalApplePlaceUrl, normalizeAppleMapsRedirectCandidate, type AppleMapsTransportResult } from '../server/appleMaps.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { brandPresenceVerificationEvidenceKey } from '../src/utils/brandPresenceVerification.ts'
import { projectSalesVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, publicPresenceUrl } from '../src/utils/searchVisibility.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const observedAt = '2026-09-28T20:00:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: observedAt,
}])) as BusinessProfileState['values'] }
const query = 'Montessori Center of Downriver Southgate MI'
const searchUrl = publicPresenceUrl('Apple Maps', query)
const placeUrl = (values: { name?: string; address?: string; placeId?: string; coordinate?: string }) => {
  const url = new URL('https://maps.apple.com/place')
  if (values.placeId) url.searchParams.set('place-id', values.placeId)
  if (values.address) url.searchParams.set('address', values.address)
  if (values.coordinate) url.searchParams.set('coordinate', values.coordinate)
  if (values.name) url.searchParams.set('name', values.name)
  return url.href
}
const maryPlace = placeUrl({
  placeId: 'fixture-apple-place', name: 'Montessori Center Of Downriver',
  address: '15575 Northline Rd, Southgate, MI 48195, United States', coordinate: '42.205,-83.204',
})
const sequence = (responses: Array<AppleMapsTransportResult | Error>) => {
  let calls = 0
  return {
    transport: async () => {
      const response = responses[calls++]
      if (response instanceof Error) throw response
      assert(response, 'unexpected extra transport request')
      return response
    },
    calls: () => calls,
  }
}
const redirect = (location: string, status = 301): AppleMapsTransportResult => ({ status, finalUrl: searchUrl, body: '', location })
const shell = (url: string): AppleMapsTransportResult => ({ status: 200, finalUrl: url, body: '<html><main>Apple Maps</main></html>' })
const acquireSequence = async (responses: Array<AppleMapsTransportResult | Error>) => {
  const harness = sequence(responses)
  const capture = await acquireAppleMaps(searchUrl, { verifyDns: async () => undefined, transport: harness.transport })
  return { capture, calls: harness.calls() }
}

const parsed = normalizeAppleMapsRedirectCandidate(maryPlace, observedAt)!
assert.equal(parsed.sourceType, 'local_place')
assert.equal(parsed.fields.name, 'Montessori Center Of Downriver')
assert.equal(parsed.fields.address, '15575 Northline Rd, Southgate, MI 48195, United States')
assert.equal(parsed.fields.placeIdentity, 'fixture-apple-place')
assert.equal(parsed.fields.phone, undefined, 'redirect parameters never fabricate phone')
assert.equal(parsed.fields.website, undefined, 'redirect parameters never fabricate website')
assert.equal(parsed.fields.category, undefined, 'redirect parameters never fabricate category')
assert.equal(parsed.fields.publicProfileUrl?.includes('coordinate='), false, 'presentation-only coordinates stay out of the stable profile URL')
assert.equal(canonicalApplePlaceUrl(maryPlace, maryPlace), parsed.fields.publicProfileUrl)

const mary = await acquireSequence([redirect(maryPlace), shell(maryPlace)])
assert.equal(mary.calls, 2, 'one approved redirect is followed exactly once')
assert.equal(mary.capture.initialStatusCode, 301)
assert.equal(mary.capture.redirectAccepted, true)
assert.equal(mary.capture.redirectUrl, maryPlace)
assert.equal(mary.capture.finalUrl, maryPlace)
assert.equal(mary.capture.finalRequestState, 'shell')
assert.equal(mary.capture.outcome, 'success', 'redirect evidence survives a sparse final SPA shell')
const maryAssessment = assessSearchCapture(mary.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(maryAssessment.automaticObservation, true, 'matching redirect name and address satisfy the existing Apple threshold')
assert.equal(maryAssessment.visibilityResult, 'found')
assert.deepEqual(new Set(maryAssessment.selected?.matchedFields.map((item) => item.field)), new Set(['name', 'address']))
const observation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Apple Maps', query), overallResult: 'found_match', provenance: 'automated_acquisition',
  observedAt, observedResultUrl: maryAssessment.selected?.candidate.resultUrl, canonicalProfileUrl: maryAssessment.selected?.candidate.fields.publicProfileUrl,
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
  automation: { runId: 'apple-redirect-run', state: 'evidence_captured', queryMode: 'brand', inspectedUrl: searchUrl, captures: [mary.capture], evidence: '', interpreted: true, automaticObservation: true, assessment: maryAssessment },
}, { profile, brandPresence: true })
const sales = projectSalesVisibility(observation, { profile, profileState })
assert.equal(sales.headline, 'Verified automatically')
assert.equal(brandPresenceEvidenceSummary(observation, sales).source, 'Public Apple Maps place resolution')
const alternateCoordinate = maryPlace.replace('42.205%2C-83.204', '42.206%2C-83.205')
assert.equal(brandPresenceVerificationEvidenceKey(observation, profile, profileState), brandPresenceVerificationEvidenceKey({
  ...observation, observedResultUrl: alternateCoordinate, canonicalProfileUrl: alternateCoordinate,
}, profile, profileState), 'presentation-only coordinate changes do not churn the Apple material fingerprint')

for (const status of [301, 302, 303, 307, 308]) {
  const accepted = await acquireSequence([redirect(maryPlace, status), shell(maryPlace)])
  assert.equal(accepted.capture.outcome, 'success', `HTTP ${status} is an accepted one-hop public place resolution`)
  assert.equal(accepted.capture.initialStatusCode, status)
}

const unavailableEnrichment = await acquireSequence([redirect(maryPlace), new Error('fixture final request unavailable')])
assert.equal(unavailableEnrichment.capture.outcome, 'success', 'public redirect evidence is sufficient when final HTML cannot be acquired')
assert.equal(unavailableEnrichment.capture.finalRequestState, 'unavailable')
assert.equal(assessSearchCapture(unavailableEnrichment.capture, profile, profileState, 'Apple Maps', 'brand').automaticObservation, true)

const enrichedHtml = `<script type="application/json">${JSON.stringify({ place: {
  name: profile.businessName, formattedAddress: '15575 Northline Rd, Southgate, MI 48195, United States',
  phoneNumber: '+1 (734) 282-6465', website: 'https://montessoridownriver.com/', categoryName: 'Montessori School',
  placeId: 'fixture-apple-place', placeUrl: maryPlace,
} })}</script>`
const enriched = await acquireSequence([redirect(maryPlace), { status: 200, finalUrl: maryPlace, body: enrichedHtml }])
assert.equal(enriched.capture.finalRequestState, 'success')
assert.equal(enriched.capture.normalizedSearchCandidates?.[0].fields.phone, '+1 (734) 282-6465')
assert.equal(enriched.capture.normalizedSearchCandidates?.[0].fields.website, 'https://montessoridownriver.com/')
assert.equal(enriched.capture.normalizedSearchCandidates?.[0].fields.category, 'Montessori School')

const nameOnlyUrl = placeUrl({ placeId: 'name-only', name: profile.businessName })
const nameOnly = await acquireSequence([redirect(nameOnlyUrl), shell(nameOnlyUrl)])
assert.equal(assessSearchCapture(nameOnly.capture, profile, profileState, 'Apple Maps', 'brand').automaticObservation, false, 'name-only redirect is insufficient')

const idOnlyUrl = placeUrl({ placeId: 'id-only' })
const idOnly = await acquireSequence([redirect(idOnlyUrl), shell(idOnlyUrl)])
const idOnlyAssessment = assessSearchCapture(idOnly.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(idOnlyAssessment.visibilityResult, 'review_required', 'place-id-only shell stays neutral')
assert.equal(idOnlyAssessment.blocker, 'no_match')

const conflictingUrl = placeUrl({ placeId: 'conflict', name: profile.businessName, address: '15585 Northline Rd, Southgate, MI 48195' })
const conflicting = await acquireSequence([redirect(conflictingUrl), shell(conflictingUrl)])
const conflictAssessment = assessSearchCapture(conflicting.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(conflictAssessment.automaticObservation, false)
assert.equal(conflictAssessment.blocker, 'identifier_conflict', 'matching name with conflicting address requires review')

const unrelatedUrl = placeUrl({ placeId: 'other', name: 'Unrelated Montessori School', address: '900 Other Rd, Taylor, MI 48180' })
const unrelated = await acquireSequence([redirect(unrelatedUrl), shell(unrelatedUrl)])
const unrelatedAssessment = assessSearchCapture(unrelated.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(unrelatedAssessment.visibilityResult, 'review_required')
assert.equal(unrelatedAssessment.blocker, 'no_match')
assert.notEqual(unrelatedAssessment.visibilityResult, 'not_found', 'automated Apple no-match never establishes absence')

for (const unsafe of ['https://example.com/place?place-id=bad', 'http://maps.apple.com/place?place-id=bad']) {
  const rejected = await acquireSequence([redirect(unsafe)])
  assert.equal(rejected.calls, 1)
  assert.equal(rejected.capture.outcome, 'unavailable')
  assert.equal(rejected.capture.redirectAccepted, false)
  assert.equal(rejected.capture.blocker, 'redirect_not_allowed')
}

const secondRedirect = await acquireSequence([redirect(maryPlace), { ...redirect(maryPlace, 302), finalUrl: maryPlace }])
assert.equal(secondRedirect.calls, 2)
assert.equal(secondRedirect.capture.outcome, 'unavailable')
assert.equal(secondRedirect.capture.blocker, 'redirect_limit', 'a second redirect stops neutral')

const missingLocation = await acquireSequence([{ status: 301, finalUrl: searchUrl, body: '' }])
assert.equal(missingLocation.capture.outcome, 'unavailable')
assert.equal(missingLocation.capture.blocker, 'redirect_missing_location')

const restricted = await acquireSequence([redirect(maryPlace), { status: 403, finalUrl: maryPlace, body: '<title>Access denied</title>' }])
assert.equal(restricted.capture.outcome, 'blocked')
assert.equal(restricted.capture.finalRequestState, 'restricted')
assert.equal(assessSearchCapture(restricted.capture, profile, profileState, 'Apple Maps', 'brand').visibilityResult, 'unavailable', 'final access restriction remains neutral')

console.log('Apple Maps redirect evidence PASS: locality redirect resolution, stable place identity, name/address matching, additive enrichment, one-hop safety, neutral failures, and no automated absence.')
