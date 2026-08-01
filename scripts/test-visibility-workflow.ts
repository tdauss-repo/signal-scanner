import assert from 'node:assert/strict'
import { defaultProfile } from '../src/data/demoProfile.ts'
import type { AIAnswerObservation, BusinessProfileState, VoiceAssistantObservation } from '../src/types/audit.ts'
import { controlledScanConnection } from '../src/utils/aiProviderAdapter.ts'
import { buildSearchVisibilityQueries, defaultSearchVisibilityTest, legacyWhereFoundToTypes, searchVisibilityQueryToAuditItem } from '../src/utils/searchVisibility.ts'

const reviewed: BusinessProfileState = {
  schemaVersion: 1,
  values: {
    primaryCategory: { value: 'Montessori school', source: 'owner', confidence: 'high', status: 'owner_confirmed' },
    primaryServices: { value: 'Toddler program, preschool', source: 'review', confidence: 'high', status: 'operator_reviewed' },
  },
}
const profile = { ...defaultProfile, businessName: 'Montessori Downriver', localMarket: 'Southgate, MI', targetLocation: 'Southgate MI', primaryCategory: 'Montessori school', primaryServices: 'Toddler program, preschool' }
const queries = buildSearchVisibilityQueries(profile, reviewed)
assert.equal(queries.filter((query) => query.role === 'Brand Presence' && !query.isDiagnostic).length, 1)
assert.equal(queries.find((query) => query.id === 'search-brand-canonical')?.query, 'Montessori Downriver')
assert.equal(queries.some((query) => query.query === 'Montessori Downriver Montessori school'), false)
assert.equal(queries.some((query) => query.role === 'Core Local Discovery'), true)

const noServices = buildSearchVisibilityQueries(profile, { schemaVersion: 1, values: { primaryCategory: reviewed.values.primaryCategory! } })
assert.equal(noServices.some((query) => query.id === 'search-core-service-market'), false)
const links = searchVisibilityQueryToAuditItem(queries[0]).evidenceLinks.map((link) => link.label)
assert.deepEqual(links, ['Google Search', 'Google Maps', 'Bing Search'])

const observation = { ...defaultSearchVisibilityTest(), observedResultTypes: ['official_website', 'directory_listing'] as const, observedAt: '2026-07-31T00:00:00.000Z', searchDestination: 'Google Search' }
assert.deepEqual(JSON.parse(JSON.stringify(observation)).observedResultTypes, ['official_website', 'directory_listing'])
assert.deepEqual(legacyWhereFoundToTypes('Google Business Profile / map result'), ['local_business_profile'])

const controlled = controlledScanConnection()
assert.equal(controlled.connected, false)
const ai: AIAnswerObservation[] = [{ id: '1', evidenceMode: 'consumer_observation', promptType: 'non_branded_discovery', promptUsed: 'What Montessori school options are near Southgate MI?', platform: 'Gemini', model: '', observedAt: '', loginState: 'unknown', locationContext: '', personalizationContext: 'unknown', mentioned: 'yes', mentionPosition: 'early', recommendationStrength: 'included_among_options', officialWebsiteCited: 'unclear', factualAccuracy: 'unable_to_verify', unsupportedClaims: '', competitorsMentioned: '', rawResponse: '', sourceLinks: '', evidenceNotes: '', recommendedAction: '', operatorReviewed: true, provenance: 'operator_observation' }]
assert.equal(ai.filter((item) => item.mentioned === 'yes').length, 1)
assert.equal(ai[0].promptUsed.includes(profile.businessName), false)

const voice: VoiceAssistantObservation = { id: 'voice-1', assistant: 'Siri / Apple', deviceOrInterface: 'iPhone', exactUtterance: 'Call Montessori Downriver', locationContext: 'Southgate', loginState: 'unknown', observedAt: '', result: 'unable_to_verify', responseTranscript: '', visibleSource: '', evidenceNotes: '', evidenceConfidence: 'operator_observation', provenance: 'operator_observation', operatorReviewed: false, recommendedAction: '' }
assert.equal(voice.result, 'unable_to_verify')
console.log('Visibility workflow compatibility checks passed.')
