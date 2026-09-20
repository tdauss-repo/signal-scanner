import assert from 'node:assert/strict'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessProfile, BusinessProfileState, SearchDestinationObservation } from '../src/types/audit.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { acceptOperatorAssistedBrandObservation, operatorAssistedEvidenceIsCurrent, parseOperatorAssistedBrandObservation } from '../src/utils/operatorAssistedSearch.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const profile = normalizeWorkspaceProfile({ businessName: 'Montessori Center of Downriver', website: 'https://montessoridownriver.com/', streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', localMarket: 'Southgate, MI' })
const reviewed = (value: BusinessProfile): BusinessProfileState => ({ schemaVersion: 1, values: Object.fromEntries(Object.entries(value).map(([field, fieldValue]) => [field, { value: fieldValue, source: 'operator review fixture', status: 'operator_reviewed', confidence: 'high' }])) })
const profileState = reviewed(profile)
const sourceUrl = 'https://www.google.com/search?q=Montessori%20Center%20of%20Downriver'
const prior: SearchDestinationObservation = { destination: 'Google Search', query: profile.businessName, overallResult: 'manual_review_needed', observedResultTypes: [], observedAt: '2026-09-19T12:00:00.000Z', confidence: 'manual_needs_confirmation', evidenceNotes: '', competitorsObserved: '', recommendedAction: '', provenance: 'automated_acquisition', evidenceKind: 'acquisition_failure', reviewed: false }

const domain = parseOperatorAssistedBrandObservation(`${profile.businessName}\nmontessoridownriver.com`, sourceUrl, profile, profileState)
assert.equal(domain.assessment.confidence, 'high')
assert.equal(domain.assessment.visibilityResult, 'found')
assert.equal(domain.assessment.operatorReviewRequired, false)
assert(domain.assessment.selected?.matchedFields.some((field) => field.field === 'website'), '1: pasted name + official domain is a high-confidence found match')

const phoneAddress = parseOperatorAssistedBrandObservation(`${profile.businessName}\n15575 Northline Rd\nSouthgate, MI\n(734) 282-6465`, sourceUrl, profile, profileState)
assert.equal(phoneAddress.assessment.confidence, 'high')
assert.equal(phoneAddress.assessment.automaticObservation, true)
assert(phoneAddress.assessment.selected?.matchedFields.some((field) => field.field === 'phone'))
assert(phoneAddress.assessment.selected?.matchedFields.some((field) => field.field === 'streetAddress'), '2: name + matching phone/address is a high-confidence found match')

const provingTarget = parseOperatorAssistedBrandObservation(`${profile.businessName}\nmontessoridownriver.com\n15575 Northline Rd\nSouthgate, MI\n734-282-6465`, sourceUrl, profile, profileState)
assert.equal(provingTarget.assessment.visibilityResult, 'found')
assert.equal(provingTarget.assessment.confidence, 'high')
assert.equal(provingTarget.assessment.operatorReviewRequired, false, 'Mary-shaped operator evidence is accepted when the reviewed profile contains Northline Road')

const ambiguous = parseOperatorAssistedBrandObservation(profile.businessName, sourceUrl, profile, profileState)
assert.equal(ambiguous.assessment.automaticObservation, false)
assert.equal(ambiguous.assessment.operatorReviewRequired, true, '3: same name without corroboration remains review-required')

const conflict = parseOperatorAssistedBrandObservation(`${profile.businessName}\nhttps://different.example/\n15575 Other Road\nDetroit, MI`, sourceUrl, profile, profileState)
assert.equal(conflict.assessment.automaticObservation, false)
assert.equal(conflict.assessment.operatorReviewRequired, true)
assert(conflict.assessment.selected?.conflictingFields.some((field) => field.field === 'website'))
assert(conflict.assessment.selected?.conflictingFields.some((field) => field.field === 'locality'), '4: conflicting domain/location is retained for review')

const challengeCapture: AcquisitionResult = { version: 1, requestedUrl: sourceUrl, finalUrl: 'https://www.google.com/sorry/index', method: 'rendered_browser', provider: 'playwright-chromium', acquiredAt: '2026-09-19T12:00:00.000Z', outcome: 'success', confidence: 'captured', notes: [], html: '<main>Our systems have detected unusual traffic from your computer network</main>' }
const blocked = assessSearchCapture(challengeCapture, profile, profileState, 'Google Search', 'brand')
assert.equal(blocked.visibilityResult, 'unavailable')
assert.equal(blocked.blocker, 'access_blocked')
assert.equal(blocked.operatorReviewRequired, true, '5: Google challenge evidence remains unavailable before operator evidence')

const accepted = acceptOperatorAssistedBrandObservation(prior, domain, profile, profileState, '2026-09-19T12:05:00.000Z')
assert.equal(accepted.overallResult, 'found_match')
assert.equal(accepted.provenance, 'operator_assisted_browser')
assert.equal(accepted.operatorAssisted?.provenance, 'operator_assisted_browser')
assert.equal(accepted.operatorAssisted?.assessment.operatorReviewRequired, false)
assert.equal(accepted.reviewed, false, 'Accepting identity evidence does not approve an Action Plan finding')
assert.equal(operatorAssistedEvidenceIsCurrent(accepted, profile, profileState), true, '6: accepted evidence is bound to the current reviewed profile')
assert.equal(operatorAssistedEvidenceIsCurrent(accepted, { ...profile, website: 'https://other.example/' }, reviewed({ ...profile, website: 'https://other.example/' })), false, 'Profile changes invalidate accepted operator-assisted evidence')

const automatedCapture: AcquisitionResult = { version: 1, requestedUrl: sourceUrl, finalUrl: sourceUrl, method: 'rendered_browser', provider: 'fixture', acquiredAt: '2026-09-19T12:00:00.000Z', outcome: 'success', confidence: 'captured', notes: [], html: `<main><article><h2>${profile.businessName}</h2><a href="${profile.website}">Official website</a></article></main>` }
const automated = assessSearchCapture(automatedCapture, profile, profileState, 'Google Search', 'brand')
assert.equal(automated.automaticObservation, true)
assert.equal(automated.visibilityResult, 'found', '7: normal automated acquisition continues through the existing matcher')

const conflictingAccepted = acceptOperatorAssistedBrandObservation(prior, conflict, profile, profileState)
assert.equal(conflictingAccepted.overallResult, 'found_conflicting_information')
assert.equal(conflictingAccepted.operatorAssisted?.assessment.operatorReviewRequired, true)

console.log('Operator-assisted Google Brand PASS: parsing, high matches, ambiguity/conflicts, challenge preservation, provenance, profile binding and automated behavior.')
