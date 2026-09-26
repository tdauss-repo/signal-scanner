import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AuditState, BusinessProfileState, FixItem } from '../src/types/audit.ts'
import type { WebsiteAuditResult } from '../src/types/websiteAudit.ts'
import { defaultProfile } from '../src/data/demoProfile.ts'
import { buildAuditItems } from '../src/data/auditCatalog.ts'
import { reviewedBusinessProfile } from '../src/utils/businessProfileState.ts'
import { createIsolatedBusinessWorkspace } from '../src/utils/workspaceIsolation.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { mapAutoAuditToWebsiteChecks } from '../src/utils/websiteAutoAudit.ts'
import {
  customerReviewKey,
  customerReviewReadiness,
  defaultCustomerFindingWording,
  summarizeCustomerScan,
} from '../src/utils/customerScan.ts'
import { derivePackagePreparation } from '../src/utils/packagePreparation.ts'
import { buildCustomerVisibilityReviewExport, customerVisibilityReviewQaText, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'

const reviewed = (value: unknown) => ({ value, source: 'operator acceptance fixture', recordedAt: '2026-09-25T12:00:00Z', confidence: 'high' as const, status: 'operator_reviewed' as const })
const maryFacts: BusinessProfileState = { schemaVersion: 1, values: {
  businessName: reviewed('Montessori Center of Downriver'),
  primaryCategory: reviewed('Montessori school'),
  website: reviewed('https://montessoridownriver.example/'),
  streetAddress: reviewed('15575 Northline Road'), city: reviewed('Southgate'), state: reviewed('MI'), zip: reviewed('48195'),
  phone: reviewed('734-282-6465'), primaryServices: reviewed('Toddler Program, Preschool, Kindergarten'),
  localMarket: reviewed('Southgate and Downriver, MI'), serviceArea: reviewed('Southgate, MI, Downriver'),
  keywords: reviewed('Montessori school Southgate'),
} }

const staleJemProfile = normalizeWorkspaceProfile({
  ...defaultProfile,
  businessName: 'JEM Photography', primaryCategory: 'Photography studio',
  primaryServices: 'Wedding photography', serviceArea: 'Detroit, MI', keywords: 'Detroit photographer',
})
const baseState: AuditState = {
  profile: staleJemProfile, businessProfile: maryFacts, checks: {}, notes: {}, evidenceConfidence: {},
  lastUpdated: '2026-09-25T12:00:00Z', reportSummary: '', websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {},
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, staleJemProfile),
}

const maryProfile = reviewedBusinessProfile(baseState.profile, baseState.businessProfile)
assert.equal(maryProfile.businessName, 'Montessori Center of Downriver')
assert.equal(maryProfile.primaryCategory, 'Montessori school')
assert.equal(maryProfile.primaryServices, 'Toddler Program, Preschool, Kindergarten')
assert.equal(maryProfile.phone, '734-282-6465')
for (const stale of ['Photography studio', 'Wedding photography', 'Detroit photographer', defaultProfile.phone]) {
  assert.equal(JSON.stringify(maryProfile).includes(stale), false, `reviewed Mary projection must not retain ${stale}`)
}
const sameNameContamination = reviewedBusinessProfile(
  { ...staleJemProfile, businessName: 'Montessori Center of Downriver' },
  maryFacts,
)
for (const stale of ['Photography studio', 'Wedding photography', 'Detroit photographer']) {
  assert.equal(JSON.stringify(sameNameContamination).includes(stale), false, `a reviewed category mismatch must clear unreviewed ${stale} even when the business name already matches`)
}

const localFinding: FixItem = {
  id: 'website-local-content', area: 'Website SEO', sourceArea: 'website', priority: 'Medium', status: 'partial', reviewed: true,
  issue: 'Service-area copy', whyItMatters: 'Generic scanner interpretation.', fix: 'Add generic service-area copy.',
  evidenceSummary: 'Service-area phrases found on homepage: Downriver', evidenceNote: 'Service-area phrases found on homepage: Downriver',
  verificationMethod: 'Recheck the homepage after an approved change.', salesPackageFit: 'starter',
}
const wording = defaultCustomerFindingWording(localFinding, baseState)
assert.equal(wording.title, 'Homepage local identity clarity')
assert.match(wording.summary, /includes some local context/)
assert.match(wording.recommendedAction, /physical location and community served/)
assert.equal(`${wording.summary} ${wording.recommendedAction}`.toLowerCase().includes('photograph'), false)

const photographerState = { ...baseState, profile: staleJemProfile, businessProfile: { schemaVersion: 1 as const, values: {} } }
const photographerWording = defaultCustomerFindingWording(localFinding, photographerState)
assert.equal(photographerWording.title, 'Service-area clarity')
assert.match(photographerWording.recommendedAction, /cities and areas served/)

const programFinding: FixItem = { ...localFinding, id: 'website-service-pages', issue: 'Service pages/content indicators' }
const programWording = defaultCustomerFindingWording(programFinding, baseState)
assert.equal(programWording.title, 'Programs and offerings visibility')
assert.match(programWording.summary, /path from the homepage could be clearer/)
assert.equal(/program pages are missing/i.test(programWording.summary), false)
assert.match(programWording.recommendedAction, /existing program or offering pages/)

const schemaWording = defaultCustomerFindingWording({ ...localFinding, id: 'website-schema', issue: 'Incomplete machine-readable business identity', fix: 'Add entity-appropriate LocalBusiness schema.' }, baseState)
assert.equal(schemaWording.title, 'Help search and AI understand your school')
assert.match(schemaWording.summary, /name, location, contact details, and website/)
assert.match(schemaWording.recommendedAction, /add clear business information/)
assert.equal(/entity-appropriate|LocalBusiness|machine-readable/i.test(`${schemaWording.title} ${schemaWording.summary} ${schemaWording.recommendedAction}`), false)

const fixture = JSON.parse(readFileSync(new URL('./fixtures/website-audit-montessori-2026-09-16.json', import.meta.url), 'utf8')) as { response: WebsiteAuditResult }
const observed = { ...fixture.response, serviceAreaPhraseMatches: ['Downriver'], servicePhraseMatches: [], serviceLinks: ['https://montessoridownriver.example/our-programs/'] }
const mapping = mapAutoAuditToWebsiteChecks(observed, maryProfile)
assert.equal(mapping.statuses['website-local-content'], 'partial', 'Some community context is not the same as no local context')
assert.match(mapping.notes['website-local-content'], /Downriver/)
assert.equal(mapping.statuses['website-service-pages'], 'pass', 'A prominent program link prevents a false missing-program-page issue')
assert.match(mapping.notes['website-service-pages'], /our-programs/)

const state: AuditState = { ...baseState, profile: maryProfile, checks: mapping.statuses, notes: mapping.notes }
state.customerFindingReviews = { [localFinding.id]: customerReviewKey(state, localFinding) }
const items = buildAuditItems(maryProfile)
const readiness = customerReviewReadiness(state, summarizeCustomerScan(state, items, [localFinding]))
assert.equal(readiness.state, 'ready')
assert.equal(readiness.approvedFindings, 1)
assert.equal(readiness.awaitingDisposition, 0)

const packagePreparation = derivePackagePreparation(state, [localFinding])
assert.equal(packagePreparation.starterItems[0]?.finding, 'Homepage local identity clarity')
assert.match(packagePreparation.starterItems[0]?.remediationAction || '', /physical location and community served/)

const customerReview = buildCustomerVisibilityReviewExport(state, items, [localFinding])
assert.equal(customerReview.reviewVersion, '1.0')
assert.equal(customerReview.business.category, 'Montessori school')
assert.equal(customerReview.confirmedIssues[0]?.title, 'Homepage local identity clarity')
assert.equal(customerReview.scanAreas.find((area) => area.id === 'website')?.state, 'issue')
for (const area of ['search_maps', 'business_information', 'ai_discovery'] as const) {
  assert.equal(customerReview.scanAreas.find((entry) => entry.id === area)?.state, 'review', `${area} must not inherit a website issue`)
}
const customerJson = serializeCustomerVisibilityReview(customerReview)
const qaText = customerVisibilityReviewQaText(customerReview, true)
assert.match(qaText, /CUSTOMER REVIEW — OPERATOR QA/)
assert.match(qaText, /Montessori Center of Downriver/)
assert.match(qaText, /Montessori school/)
assert.match(qaText, /Homepage local identity clarity/)
assert.match(qaText, /physical location and community served/)
assert.match(qaText, /Starter Visibility Cleanup/)
assert.match(qaText, /READY FOR CUSTOMER PRESENTATION/)
for (const issue of customerReview.confirmedIssues) {
  for (const value of [issue.title, issue.summary, issue.foundLocalAction]) assert(qaText.includes(value), 'QA text and JSON projection must use the same customer finding fields')
}
for (const scope of customerReview.recommendedPackage.included) assert(qaText.includes(scope), 'QA text and JSON projection must use the same package scope')
for (const forbidden of ['Photography studio', 'Wedding photography', 'Detroit photographer', 'Service-area phrases found', 'fingerprint', 'provider']) {
  assert.equal(customerJson.includes(forbidden), false, `${forbidden} must not leak into customer JSON`)
  assert.equal(qaText.includes(forbidden), false, `${forbidden} must not leak into customer QA text`)
}

const contaminated: AuditState = {
  ...state,
  aiAnswerTests: { Gemini: { resultStatus: 'partial', evidenceConfidence: 'ai_answer_response', rawResponse: 'JEM-only answer', evidenceNotes: 'JEM-only evidence', sourcesMentioned: 'JEM Photography', gapTitle: 'JEM-only title', suggestedFix: 'JEM-only action', priority: 'High', packageFit: 'Later / monthly visibility work', observations: [] } } as AuditState['aiAnswerTests'],
  customerFindingDismissals: { old: 'old evidence' },
  customerFindingRefinements: { old: { evidenceKey: 'old evidence', title: 'Old customer title' } },
  machineReadability: { profileKey: 'old', status: 'evidence_captured', sourceUrl: '', capturedAt: '', acquisition: null, checks: [], conditions: [], entities: [], schemaTypes: [] },
}
const blank = createIsolatedBusinessWorkspace(contaminated, '2026-09-25T13:00:00Z')
assert.equal(blank.profile.businessName, '')
assert.equal(blank.profile.primaryCategory, '')
assert.equal(blank.profile.primaryServices, '')
assert.equal(blank.profile.keywords, '')
assert.deepEqual(blank.checks, {})
assert.deepEqual(blank.searchDestinationObservations, {})
assert.equal(JSON.stringify(blank.aiAnswerTests).includes('JEM-only'), false)
assert.deepEqual(blank.manualFixes, [])
assert.equal(blank.customerFindingReviews, undefined)
assert.equal(blank.customerFindingDismissals, undefined)
assert.equal(blank.customerFindingRefinements, undefined)
assert.equal(blank.machineReadability, undefined)
assert.equal(blank.visibilityRuns, undefined)

const saved = JSON.parse(JSON.stringify(state)) as AuditState
assert.equal(reviewedBusinessProfile(saved.profile, saved.businessProfile).primaryCategory, 'Montessori school', 'Saved-scan JSON retains reviewed profile authority')

console.log('Operator workflow reconciliation PASS: reviewed-profile isolation, new-workspace reset, business-aware wording, Downriver/program evidence logic, approved-only package/export, and area-specific customer states.')
