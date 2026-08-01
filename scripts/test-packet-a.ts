import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { defaultProfile } from '../src/data/demoProfile.ts'
import type { AIAnswerObservation, AIAnswerPlatform, AIAnswerTestState, BusinessProfileState, SearchVisibilityTestState, VoiceAssistantObservation } from '../src/types/audit.ts'
import { defaultSearchDestinationObservation, buildSearchVisibilityQueries, migrateLegacySearchDestinationObservations, normalizeSearchDestinationObservation, normalizeSearchResultTypes, resultTypesForDestination, searchResultTypeLabel } from '../src/utils/searchVisibility.ts'
import { updateManualWebsiteObservationDraft } from '../src/utils/websiteAuditState.ts'
import { aggregateReviewedSearchObservations } from '../src/utils/searchAggregation.ts'
import { reviewedAIPresenceCount, summarizeAIVisibilityEvidence } from '../src/utils/aiPresence.ts'
import { numericOverallScoreAreas, overallVisibilityCheckedCount, overallVisibilityScore } from '../src/utils/scoring.ts'
import { projectPublicObservationToProfiles, publicPresenceCoverage, publicPresenceQualityLabel } from '../src/utils/publicPresence.ts'

const reviewed: BusinessProfileState = { schemaVersion: 1, values: { primaryCategory: { value: 'Montessori school', source: 'owner', confidence: 'high', status: 'owner_confirmed' } } }
const profile = { ...defaultProfile, businessName: 'Montessori Downriver', localMarket: 'Southgate, MI', targetLocation: 'Southgate MI', primaryCategory: 'Montessori school' }
const canonical = buildSearchVisibilityQueries(profile, reviewed)
assert.equal(canonical.filter((query) => query.role === 'Brand Presence').length, 1)
assert.equal(canonical.some((query) => query.isDiagnostic), false)
assert.equal(buildSearchVisibilityQueries(profile, reviewed, { includeLocationDiagnostic: true }).some((query) => query.isDiagnostic), true)

const google = { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_weak' as const, evidenceNotes: 'Website observed.' }
const bing = { ...defaultSearchDestinationObservation('Bing Search', 'Montessori Downriver'), overallResult: 'not_found' as const }
assert.equal(google.overallResult, 'found_weak')
assert.equal(bing.overallResult, 'not_found')
assert.deepEqual(normalizeSearchResultTypes(['Official website', 'Not found']), ['official_website', 'not_found'])
assert.equal(searchResultTypeLabel('Apple Maps', 'local_business_profile').includes('Google Business Profile'), false)
assert.equal(resultTypesForDestination('Apple Maps').includes('social_profile'), false)
assert.equal(resultTypesForDestination('Google Maps').includes('local_business_profile'), true)
const searchPanelSource = readFileSync(new URL('../src/components/SearchVisibilityPanel.tsx', import.meta.url), 'utf8')
assert.match(searchPanelSource, /htmlFor=\{`\$\{query\.id\}-\$\{destination\}-\$\{type\}`\}/)
assert.match(searchPanelSource, /className="result-type-option"/)

const aggregateOne = aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_prominently', reviewed: true },
  { ...defaultSearchDestinationObservation('Bing Search', 'Montessori Downriver'), overallResult: 'not_found', reviewed: true },
])
const aggregateTwo = aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Bing Search', 'Montessori Downriver'), overallResult: 'not_found', reviewed: true },
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_prominently', reviewed: true },
])
assert.equal(aggregateOne?.kind, 'mixed')
assert.deepEqual(aggregateOne, aggregateTwo)
assert.equal(aggregateOne?.observations.map((item) => item.destination).join(', '), 'Bing Search, Google Search')
assert.equal(aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Google Maps', 'Montessori Downriver'), overallResult: 'found_prominently', reviewed: true },
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_weak', reviewed: true },
])?.kind, 'mixed')
assert.deepEqual(JSON.parse(JSON.stringify(aggregateOne)), aggregateOne)
assert.equal(aggregateReviewedSearchObservations([defaultSearchDestinationObservation('Google Maps', 'Montessori Downriver')]), null)
assert.equal(aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_prominently', reviewed: true },
  { ...defaultSearchDestinationObservation('Apple Maps', 'Montessori Downriver'), overallResult: 'not_found', reviewed: true },
])?.kind, 'strong')
const confirmedAndSupported = aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_prominently', confidence: 'owner_confirmed', reviewed: true },
  { ...defaultSearchDestinationObservation('Bing Search', 'Montessori Downriver'), overallResult: 'found_prominently', confidence: 'public_search_observed', reviewed: true },
])
assert.equal(confirmedAndSupported?.evidenceConfidence, 'public_search_observed')
const supportedAndUncertain = aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_weak', confidence: 'public_search_observed', reviewed: true },
  { ...defaultSearchDestinationObservation('Bing Search', 'Montessori Downriver'), overallResult: 'found_weak', confidence: 'manual_needs_confirmation', reviewed: true },
])
assert.equal(supportedAndUncertain?.evidenceConfidence, 'manual_needs_confirmation')
const confidenceOrderOne = aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_prominently', confidence: 'owner_confirmed', reviewed: true },
  { ...defaultSearchDestinationObservation('Bing Search', 'Montessori Downriver'), overallResult: 'found_prominently', confidence: 'public_search_observed', reviewed: true },
])
const confidenceOrderTwo = aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Bing Search', 'Montessori Downriver'), overallResult: 'found_prominently', confidence: 'public_search_observed', reviewed: true },
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_prominently', confidence: 'owner_confirmed', reviewed: true },
])
assert.equal(confidenceOrderOne?.evidenceConfidence, confidenceOrderTwo?.evidenceConfidence)
assert.deepEqual(JSON.parse(JSON.stringify(confidenceOrderOne)), confidenceOrderOne)
assert.equal(aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Google Search', 'Montessori Downriver'), overallResult: 'found_prominently', confidence: 'owner_confirmed', reviewed: true },
  { ...defaultSearchDestinationObservation('Apple Maps', 'Montessori Downriver'), overallResult: 'not_found', confidence: 'manual_needs_confirmation', reviewed: true },
])?.evidenceConfidence, 'owner_confirmed')
assert.equal(aggregateReviewedSearchObservations([
  { ...defaultSearchDestinationObservation('Apple Maps', 'Montessori Downriver'), overallResult: 'not_found', reviewed: true },
]), null)

const legacy: SearchVisibilityTestState = { visibilityResult: 'found_directory_only', whereFound: 'Directory', observedResultTypes: [], observedAt: '2026-08-01T00:00:00.000Z', searchDestination: 'Bing Search', provenance: 'legacy_imported', evidenceNotes: 'Legacy note', competitorsObserved: 'Legacy competitor', recommendedAction: 'Legacy action', evidenceConfidence: 'public_search_observed', packageFit: 'Starter Visibility Cleanup' }
const migrated = migrateLegacySearchDestinationObservations({ 'search-brand-canonical': legacy })
assert.equal(migrated['search-brand-canonical']['Bing Search']?.evidenceNotes, 'Legacy note')
assert.deepEqual(migrated['search-brand-canonical']['Bing Search']?.observedResultTypes, ['directory_listing'])

const ai: AIAnswerObservation[] = [{ id: 'ai-1', evidenceMode: 'consumer_observation', promptType: 'non_branded_discovery', promptUsed: 'What Montessori schools are near Southgate?', platform: 'Gemini', model: '', observedAt: '', loginState: 'unknown', locationContext: '', personalizationContext: 'unknown', mentioned: 'yes', mentionPosition: 'early', recommendationStrength: 'included_among_options', officialWebsiteCited: 'unclear', factualAccuracy: 'partially_accurate', unsupportedClaims: '', competitorsMentioned: '', rawResponse: 'Raw source response', sourceLinks: '', evidenceNotes: 'Operator interpretation', recommendedAction: '', operatorReviewed: true, provenance: 'operator_observation' }]
assert.notEqual(ai[0].rawResponse, ai[0].evidenceNotes)
const aiTests = Object.fromEntries(['ChatGPT','Gemini','Perplexity','Copilot','Claude','Grok'].map((platform) => [platform, { resultStatus: 'unknown', evidenceConfidence: 'ai_answer_response', rawResponse: '', evidenceNotes: '', sourcesMentioned: '', gapTitle: '', suggestedFix: '', priority: 'Low', packageFit: 'Starter Visibility Cleanup', observations: [] }])) as Record<AIAnswerPlatform, AIAnswerTestState>
assert.equal(reviewedAIPresenceCount(aiTests), 0)
assert.equal(summarizeAIVisibilityEvidence(aiTests, profile).statusLabel, 'AI/GEO readiness assessed')
const scoreBeforeAI = overallVisibilityScore({ website: 75 })
const checkedBeforeAI = overallVisibilityCheckedCount({ website: 3 })
assert.equal(numericOverallScoreAreas.includes('AI Visibility' as never), false)
aiTests.Gemini.observations = ai
assert.equal(reviewedAIPresenceCount(aiTests), 1)
assert.equal(summarizeAIVisibilityEvidence(aiTests, profile).statusLabel, 'Reviewed manual AI Presence evidence')
assert.equal(summarizeAIVisibilityEvidence(aiTests, profile).reviewedObservationCount, 1)
assert.equal(summarizeAIVisibilityEvidence(aiTests, profile).recordedObservationCount, 1)
assert.equal(overallVisibilityScore({ website: 75 }), scoreBeforeAI)
assert.equal(overallVisibilityCheckedCount({ website: 3 }), checkedBeforeAI)

const coverage = publicPresenceCoverage({ one: { 'Google Search': { ...defaultSearchDestinationObservation('Google Search', 'one'), overallResult: 'found_prominently' } } }, ['one'])
assert.deepEqual(coverage, { completed: 1, total: 3 })
assert.deepEqual(publicPresenceCoverage({ one: { 'Apple Maps': { ...defaultSearchDestinationObservation('Apple Maps', 'one'), overallResult: 'found_prominently' } } }, ['one']), { completed: 0, total: 3 })
const completePresence = { one: { 'Google Search': { ...defaultSearchDestinationObservation('Google Search', 'one'), overallResult: 'found_prominently' }, 'Google Maps': { ...defaultSearchDestinationObservation('Google Maps', 'one'), overallResult: 'found_prominently' }, 'Bing Search': { ...defaultSearchDestinationObservation('Bing Search', 'one'), overallResult: 'found_prominently' } } }
assert.equal(publicPresenceQualityLabel(completePresence, ['one']), 'Strong')
assert.equal(publicPresenceCoverage(completePresence, ['one']).completed, 3)
const foundClearsNotFound = normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation('Google Search', 'one'), overallResult: 'found_prominently', observedResultTypes: ['not_found'] })
assert.deepEqual(foundClearsNotFound.observedResultTypes, [])
const notFoundClearsPositive = normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation('Google Search', 'one'), overallResult: 'not_found', observedResultTypes: ['official_website'] })
assert.deepEqual(notFoundClearsPositive.observedResultTypes, ['not_found'])
const positiveClearsNotFound = normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation('Google Search', 'one'), overallResult: 'found_weak', observedResultTypes: ['not_found', 'official_website'] })
assert.deepEqual(positiveClearsNotFound.observedResultTypes, ['official_website'])
const legacyContradiction = normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation('Google Search', 'one'), overallResult: 'found_prominently', reviewed: true, observedResultTypes: ['not_found'] })
assert.deepEqual(JSON.parse(JSON.stringify(legacyContradiction)), legacyContradiction)
const projected = projectPublicObservationToProfiles({ activeRows: [], ignoredSuggestionIds: [] }, 'business', { ...defaultSearchDestinationObservation('Apple Maps', 'one'), overallResult: 'found_prominently', observedAt: '2026-08-01T00:00:00.000Z', evidenceNotes: 'Observed Apple listing' })
assert.equal(projected.activeRows.length, 1)
assert.equal(projected.activeRows[0].ownerAdminAccessStatus, 'Unverified - public listing only')
assert.equal(projectPublicObservationToProfiles(projected, 'business', { ...defaultSearchDestinationObservation('Apple Maps', 'one'), overallResult: 'found_prominently', observedAt: '2026-08-01T00:00:00.000Z', evidenceNotes: 'Observed Apple listing' }).activeRows.length, 1)
const ownerConfirmed = { ...projected, activeRows: [{ ...projected.activeRows[0], ownerAdminAccessStatus: 'Confirmed with owner', ownerAccessStatus: 'Confirmed with owner', listingResult: 'found_accurate' as const }] }
assert.equal(projectPublicObservationToProfiles(ownerConfirmed, 'business', { ...defaultSearchDestinationObservation('Apple Maps', 'one'), overallResult: 'found_conflicting_information' }).activeRows[0].ownerAdminAccessStatus, 'Confirmed with owner')
const socialProfiles = ['Yelp', 'Facebook', 'Instagram'] as const
const projectedSocial = socialProfiles.reduce((state, destination) => projectPublicObservationToProfiles(state, 'business', { ...defaultSearchDestinationObservation(destination, 'one'), overallResult: 'found_prominently', observedAt: '2026-08-01T00:00:00.000Z' }), { activeRows: [], ignoredSuggestionIds: [] })
assert.equal(projectedSocial.activeRows.length, 3)
assert.equal(projectedSocial.activeRows.every((row) => row.ownerAdminAccessStatus === 'Unverified - public listing only'), true)

const voice: VoiceAssistantObservation = { id: 'voice-1', assistant: 'Siri / Apple', deviceOrInterface: 'iPhone', exactUtterance: 'Call Montessori Downriver', locationContext: '', loginState: 'unknown', observedAt: '', result: 'unable_to_verify', responseTranscript: '', visibleSource: '', evidenceNotes: '', evidenceConfidence: 'manual_needs_confirmation', provenance: 'operator_observation', operatorReviewed: false, recommendedAction: '' }
assert.equal(voice.result, 'unable_to_verify')

const invalidated = updateManualWebsiteObservationDraft({ sourceUrl: '', recordedAt: '2026-08-01T00:00:00.000Z', acquisition: null, observedTitle: 'Old', observedMetaDescription: '', visibleHomepageText: '', observedLinks: '', observedSchemaSnippet: '', notes: '', analyzedAt: '2026-08-01T00:00:00.000Z' }, { observedTitle: 'Changed' })
assert.equal(invalidated.analyzedAt, '')
console.log('Packet A state-integrity checks passed.')
