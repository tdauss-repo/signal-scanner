import assert from 'node:assert/strict'
import { acquireAppleMaps, type AppleMapsTransportResult } from '../server/appleMaps.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { brandPresenceEvidenceSummary } from '../src/utils/brandPresenceEvidenceDetail.ts'
import { projectSalesVisibility } from '../src/utils/salesVisibilityProjection.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, publicPresenceUrl } from '../src/utils/searchVisibility.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const observedAt = '2026-09-28T20:00:00.000Z'
const query = 'Montessori Center of Downriver Southgate MI'
const searchUrl = publicPresenceUrl('Apple Maps', query)
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', website: 'http://www.montessoridownriver.com/',
})
const fields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: observedAt,
}])) as BusinessProfileState['values'] }
const appleSearchUrl = (value: string) => `https://maps.apple.com/search?query=${encodeURIComponent(value)}`
const maryPlaceUrl = (() => {
  const url = new URL('https://maps.apple.com/place')
  url.searchParams.set('place-id', 'fixture-apple-place')
  url.searchParams.set('name', 'Montessori Center Of Downriver')
  url.searchParams.set('address', '15575 Northline Rd, Southgate, MI 48195, United States')
  return url.href
})()
const redirect = (location: string): AppleMapsTransportResult => ({ status: 301, finalUrl: searchUrl, body: '', location })
const page = (url: string, body: string): AppleMapsTransportResult => ({ status: 200, finalUrl: url, body })
const acquireSequence = async (location: string, body = '<html><main>Apple Maps</main></html>') => {
  let calls = 0
  const target = new URL(location)
  const capture = await acquireAppleMaps(searchUrl, {
    verifyDns: async () => undefined,
    transport: async () => {
      calls += 1
      if (calls === 1) return redirect(location)
      if (calls === 2) return page(target.href, body)
      throw new Error('unexpected extra Apple Maps request')
    },
  })
  return { capture, calls }
}

const equivalentSearch = appleSearchUrl('  montessori center OF downriver   SOUTHGATE mi  ')
const appleOwnerShell = `<html><main>Apple Maps</main><script type="application/json">${JSON.stringify({
  application: { parentOrganization: { '@type': 'Organization', name: 'Apple', url: 'https://www.apple.com/' } },
})}</script></html>`
const acceptedShell = await acquireSequence(equivalentSearch, appleOwnerShell)
assert.equal(acceptedShell.calls, 2, 'an approved search redirect is the single followed network hop')
assert.equal(acceptedShell.capture.redirectAccepted, true)
assert.equal(acceptedShell.capture.redirectUrl, equivalentSearch)
assert.equal(acceptedShell.capture.initialStatusCode, 301)
assert.equal(acceptedShell.capture.statusCode, 200)
assert.equal(acceptedShell.capture.finalRequestState, 'shell')
assert.equal(acceptedShell.capture.outcome, 'success', 'a resolved public search shell is completed acquisition, not provider unavailability')
assert.equal(acceptedShell.capture.resultRegionInspected, true)
assert.equal(acceptedShell.capture.normalizedSearchCandidates?.length || 0, 0)
assert.equal(Boolean(acceptedShell.capture.normalizedSearchCandidates?.some((candidate) => candidate.fields.name === 'Apple')), false, 'Apple shell parentOrganization metadata never becomes a searched place candidate')

const shellAssessment = assessSearchCapture(acceptedShell.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(shellAssessment.visibilityResult, 'review_required')
assert.equal(shellAssessment.operatorReviewRequired, true)
assert.equal(shellAssessment.blocker, 'no_match')
assert.notEqual(shellAssessment.visibilityResult, 'not_found', 'an automated Apple Maps no-match never establishes absence')
const shellObservation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Apple Maps', query),
  provenance: 'automated_acquisition', observedAt, confidence: 'neutral', evidenceKind: 'unable_to_verify',
  automation: {
    runId: 'apple-search-shell', state: 'interactive_review_required', queryMode: 'brand', inspectedUrl: searchUrl,
    captures: [acceptedShell.capture], evidence: '', interpreted: true, automaticObservation: false, assessment: shellAssessment,
  },
}, { profile, brandPresence: true })
const shellSales = projectSalesVisibility(shellObservation, { profile, profileState })
const shellSummary = brandPresenceEvidenceSummary(shellObservation, shellSales)
assert.equal(shellSales.headline, 'Verification needed')
assert.equal(shellSales.explanation, 'Apple Maps responded to the public business search, but the automated check could not access enough structured place information to verify the listing.')
assert.equal(shellSummary.acquisition, 'Completed')
assert.equal(shellSummary.appleMapsSearch, 'Resolved')
assert.equal(shellSummary.structuredPlace, 'Not available')
assert.equal(shellSummary.automationState, 'Completed')
assert.match(shellSummary.interpretation || '', /responded to the public business search.*could not access enough structured place information to verify the listing/i)

const unrelatedQuery = await acquireSequence(appleSearchUrl('Unrelated School Taylor MI'))
assert.equal(unrelatedQuery.calls, 1)
assert.equal(unrelatedQuery.capture.redirectAccepted, false)
assert.equal(unrelatedQuery.capture.blocker, 'redirect_not_allowed')

for (const unsafe of [
  `https://example.com/search?query=${encodeURIComponent(query)}`,
  `http://maps.apple.com/search?query=${encodeURIComponent(query)}`,
  `https://maps.apple.com/directions?query=${encodeURIComponent(query)}`,
]) {
  const result = await acquireSequence(unsafe)
  assert.equal(result.calls, 1)
  assert.equal(result.capture.redirectAccepted, false)
  assert.equal(result.capture.blocker, 'redirect_not_allowed')
}

const structuredHtml = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'LocalBusiness', name: 'Montessori Center Of Downriver',
  address: '15575 Northline Rd, Southgate, MI 48195, United States',
  url: maryPlaceUrl,
})}</script>`
const structured = await acquireSequence(appleSearchUrl(query), structuredHtml)
const structuredAssessment = assessSearchCapture(structured.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(structured.capture.outcome, 'success')
assert.equal(structured.capture.finalRequestState, 'success')
assert.equal(structuredAssessment.automaticObservation, true)
assert.equal(structuredAssessment.visibilityResult, 'found')
assert.deepEqual(new Set(structuredAssessment.selected?.matchedFields.map((item) => item.field)), new Set(['name', 'address']))

const placeLinkHtml = `<html><a href="${maryPlaceUrl.replace(/&/g, '&amp;')}">Open place</a></html>`
const canonicalPlace = await acquireSequence(appleSearchUrl(query), placeLinkHtml)
const canonicalAssessment = assessSearchCapture(canonicalPlace.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(canonicalPlace.calls, 2, 'a place URL discovered in search HTML is parsed without a second network request')
assert.equal(canonicalAssessment.automaticObservation, true)
assert.equal(canonicalAssessment.selected?.candidate.fields.placeIdentity, 'fixture-apple-place')
assert.equal(canonicalAssessment.selected?.candidate.fields.publicProfileUrl, maryPlaceUrl)

const idOnlyPlaceUrl = 'https://maps.apple.com/place?place-id=fixture-id-only'
let idOnlyCalls = 0
const idOnlyFollow = await acquireAppleMaps(searchUrl, {
  verifyDns: async () => undefined,
  transport: async () => {
    idOnlyCalls += 1
    if (idOnlyCalls === 1) return redirect(appleSearchUrl(query))
    if (idOnlyCalls === 2) return page(appleSearchUrl(query), `<html><main><a href="${idOnlyPlaceUrl}">Open place</a></main></html>`)
    if (idOnlyCalls === 3) return page(idOnlyPlaceUrl, `<script type="application/json">${JSON.stringify({ place: {
      '@type': 'LocalBusiness', name: profile.businessName, formattedAddress: '15575 Northline Rd, Southgate, MI 48195, United States',
      phoneNumber: profile.phone, website: profile.website, placeId: 'fixture-id-only', placeUrl: idOnlyPlaceUrl,
    } })}</script>`)
    throw new Error('unexpected extra Apple Maps request')
  },
})
assert.equal(idOnlyCalls, 3, 'an id-only place link surfaced by public search permits exactly one Apple-owned place request')
assert.equal(idOnlyFollow.finalUrl, idOnlyPlaceUrl)
assert.equal(assessSearchCapture(idOnlyFollow, profile, profileState, 'Apple Maps', 'brand').automaticObservation, true)
const verifiedObservation = normalizeSearchDestinationObservation({
  ...defaultSearchDestinationObservation('Apple Maps', query), overallResult: 'found_match', provenance: 'automated_acquisition',
  observedAt, observedResultUrl: canonicalAssessment.selected?.candidate.resultUrl,
  canonicalProfileUrl: canonicalAssessment.selected?.candidate.fields.publicProfileUrl,
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation',
  automation: {
    runId: 'apple-search-place', state: 'evidence_captured', queryMode: 'brand', inspectedUrl: searchUrl,
    captures: [canonicalPlace.capture], evidence: '', interpreted: true, automaticObservation: true, assessment: canonicalAssessment,
  },
}, { profile, brandPresence: true })
const verifiedSales = projectSalesVisibility(verifiedObservation, { profile, profileState })
assert.equal(verifiedSales.headline, 'Verified automatically')
assert.equal(verifiedSales.knownProfileUrl, maryPlaceUrl)
assert.equal(brandPresenceEvidenceSummary(verifiedObservation, verifiedSales).structuredPlace, 'Available')

const idOnlyPlace = 'https://maps.apple.com/place?place-id=id-only'
const idOnly = await acquireSequence(appleSearchUrl(query), `<a href="${idOnlyPlace}">Apple Maps</a>`)
const idOnlyAssessment = assessSearchCapture(idOnly.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(idOnlyAssessment.automaticObservation, false)
assert.equal(idOnlyAssessment.visibilityResult, 'review_required')
assert.equal(idOnlyAssessment.blocker, 'no_match')

const conflictUrl = new URL(maryPlaceUrl)
conflictUrl.searchParams.set('address', '15585 Northline Rd, Southgate, MI 48195')
const conflict = await acquireSequence(appleSearchUrl(query), `<a href="${conflictUrl.href.replace(/&/g, '&amp;')}">Apple Maps</a>`)
const conflictAssessment = assessSearchCapture(conflict.capture, profile, profileState, 'Apple Maps', 'brand')
assert.equal(conflictAssessment.automaticObservation, false)
assert.equal(conflictAssessment.visibilityResult, 'review_required')
assert.equal(conflictAssessment.blocker, 'identifier_conflict')

console.log('Apple Maps search redirect PASS: equivalent-query allowlist, one-hop inspection, shell-neutral semantics, structured and canonical-place evidence, unsafe redirect rejection, and unchanged identity thresholds.')
