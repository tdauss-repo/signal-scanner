import assert from 'node:assert/strict'
import { defaultProfile } from '../src/data/demoProfile.ts'
import { deriveCorroboration, effectivePackageFit, entityAction, normalizeSalesReadiness, questionAction, seededCustomerQuestions, sortSalesActions } from '../src/utils/salesReadiness.ts'

const profile = { ...defaultProfile, businessName: 'Montessori Downriver', primaryCategory: 'Montessori school' }
const state = normalizeSalesReadiness(undefined, profile)
assert.equal(state.entityClarity.length, 4)
assert.equal(state.customerQuestions.length, 5)
assert.equal(state.customerQuestions.every((question) => question.status === 'Unable to verify'), true)
const entity = { ...state.entityClarity[0], result: 'Conflicting' as const, expectedValue: 'Montessori Downriver', observedValue: 'Different name', sourceEvidence: 'Observed public page name.', sourceUrl: 'https://example.test', reviewed: true, confidence: 'public_page_observed' as const }
assert.equal(entityAction(entity)?.salesPackageFit, 'starter')
assert.equal(entityAction({ ...entity, result: 'Unable to verify' }), null)
const question = { ...state.customerQuestions[0], status: 'Owner confirmation needed' as const, reviewed: true, supportingEvidence: 'No public enrollment path observed.', packageFit: 'owner_action' as const }
assert.equal(questionAction(question)?.salesPackageFit, 'owner_action')
assert.equal(questionAction({ ...question, reviewed: false }), null)
const rows = [{ directoryName: 'Apple Business Connect / Apple Maps', listingUrl: 'https://maps.apple.com/example', publicEvidenceNotes: 'Business name: Montessori Downriver; Category: Montessori school; Phone: 734-555-0100; Website: https://example.test; Address: Southgate MI; Hours: 8am-3pm', lastCheckedAt: '2026-08-01T00:00:00.000Z', evidenceConfidence: 'public_page_observed' as const, ownerAdminAccessStatus: 'Unverified - public listing only' }]
assert.deepEqual(deriveCorroboration(profile, rows), deriveCorroboration(profile, rows))
assert.equal(deriveCorroboration(profile, rows).find((item) => item.field === 'Business name')?.observedValue, 'Montessori Downriver')
assert.equal(deriveCorroboration(profile, rows).find((item) => item.field === 'Business name')?.result, 'Match')
assert.equal(deriveCorroboration(profile, [{ ...rows[0], publicEvidenceNotes: 'acquisition unavailable' }]).every((item) => item.result === 'Acquisition unavailable'), true)
assert.equal(deriveCorroboration(profile, [{ ...rows[0], publicEvidenceNotes: '', listingResult: 'not_found' }]).every((item) => item.result === 'Not found'), true)
const actions = [
  { id: 'later', priority: 'High' as const, area: 'Website', issue: 'Later', fix: '', status: 'partial' as const, salesPackageFit: 'later' as const, impact: 'high' as const, salesConfidence: 'confirmed' as const, salesEffort: 'small' as const },
  { id: 'starter', priority: 'Low' as const, area: 'Website', issue: 'Starter', fix: '', status: 'partial' as const, salesPackageFit: 'starter' as const, impact: 'medium' as const, salesConfidence: 'supported' as const, salesEffort: 'small' as const },
]
assert.deepEqual(sortSalesActions(actions).map((action) => action.id), ['starter', 'later'])
assert.deepEqual(sortSalesActions([...actions].reverse()).map((action) => action.id), ['starter', 'later'])
assert.equal(effectivePackageFit({ ...actions[0], packageFit: 'Starter Visibility Cleanup', salesPackageFit: 'excluded' }), 'excluded')
assert.equal(seededCustomerQuestions({ ...profile, businessName: 'Other Business', primaryCategory: '' }).length, 0)
console.log('Packet B sales-readiness checks passed.')
