import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { AuditState, BusinessProfileField, BusinessProfileState, FixItem, SearchDestinationObservation } from '../src/types/audit.ts'
import type { BusinessResultCandidate } from '../src/types/entityMatch.ts'
import { brandPresenceBusinessIdentityKey } from '../src/utils/brandPresenceAcquisitionResilience.ts'
import { recoverRetainedBrandPresenceFromWorkspace } from '../src/utils/brandPresenceWorkspaceRetention.ts'
import { workspaceStorageFailureMessage, writeStorageJson } from '../src/utils/browserStorage.ts'
import { buildCustomerFindingRefinement, customerReviewKey, defaultCustomerFindingWording } from '../src/utils/customerScan.ts'
import { buildCustomerVisibilityReviewExport, serializeCustomerVisibilityReview } from '../src/utils/customerVisibilityReviewExport.ts'
import { assessBusinessCandidates } from '../src/utils/entityMatcher.ts'
import { evidenceFingerprint } from '../src/utils/evidenceFingerprint.ts'
import { buildPackageScopeOverride } from '../src/utils/packagePreparation.ts'
import { packagePricingKey } from '../src/utils/packagePricing.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { buildWorkspaceFile, parseWorkspaceFile, serializeWorkspaceFile, workspaceFilename, workspaceRecordFromState } from '../src/utils/workspaceFile.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const verifiedAt = '2026-10-05T16:00:00.000Z'
const scanAt = '2026-10-11T17:34:00.000Z'
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', website: 'http://www.montessoridownriver.com/', primaryCategory: 'Montessori school',
  streetAddress: '15575 Northline Road', city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465',
  secondaryCategories: 'Preschool, Kindergarten', primaryServices: 'Toddler Program, Preschool, Kindergarten', localMarket: 'Downriver, MI',
})
const reviewedFields: BusinessProfileField[] = ['businessName', 'website', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone']
const businessProfile: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(reviewedFields.map((field) => [field, {
  value: profile[field], source: 'operator_entered', status: 'operator_reviewed', confidence: 'high', recordedAt: verifiedAt,
}])) as BusinessProfileState['values'] }
const candidate: BusinessResultCandidate = {
  id: 'mary-bing', kind: 'semantic_card', sourceType: 'organic', resultUrl: profile.website,
  fields: { name: profile.businessName, website: profile.website, phone: profile.phone }, evidence: [],
}
const assessment = assessBusinessCandidates([candidate], profile, businessProfile, 'brand', { automaticIdentityPolicy: 'bing_search' })
const capture: AcquisitionResult = {
  version: 1, requestedUrl: 'https://www.bing.com/search?q=Montessori+Center+of+Downriver+Southgate+MI', acquiredAt: verifiedAt,
  method: 'server_fetch', provider: 'fixture', outcome: 'success', confidence: 'captured', resultRegionInspected: true, notes: [],
}
const bing: SearchDestinationObservation = {
  ...defaultSearchDestinationObservation('Bing Search', 'Montessori Center of Downriver Southgate MI'),
  observedAt: verifiedAt, provenance: 'automated_acquisition', reviewed: false, overallResult: 'found_match',
  observedResultTypes: ['official_website', 'business_name_correct', 'website_correct', 'phone_correct'],
  confidence: 'scanner_detected_public_page', evidenceKind: 'external_observation', evidenceNotes: 'Mary identity matched.',
  automation: { runId: 'run-oct-5', queryMode: 'brand', state: 'evidence_captured', inspectedUrl: capture.requestedUrl,
    captures: [capture], evidence: 'Bounded Bing evidence.', interpreted: true, automaticObservation: true,
    businessIdentityKey: brandPresenceBusinessIdentityKey(profile, businessProfile), assessment },
}
const finding = (id: string, issue: string): FixItem => ({
  id, area: 'Website', sourceArea: 'website', priority: 'Medium', status: 'fail', reviewed: true, issue,
  fix: `Address ${issue.toLowerCase()}.`, whyItMatters: `${issue} matters to local customers.`, evidenceSummary: `Current evidence for ${issue}.`,
  verificationMethod: `Verify ${issue}.`, salesPackageFit: 'starter',
})
const hosting = finding('website-hosting', 'Hosting modernization')
const starterFindings = [finding('website-location', 'Homepage location clarity'), finding('website-schema', 'Business identity markup'), finding('website-description', 'Homepage search description')]
const fixes = [hosting, ...starterFindings]

let state: AuditState = {
  profile, businessProfile, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: scanAt, reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: { 'search-brand-canonical': { 'Bing Search': bing } },
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: fixes,
  salesReadiness: normalizeSalesReadiness(undefined, profile), visibilityRuns: [{
    version: 2, id: 'run-oct-11', profileKey: evidenceFingerprint(profile), startedAt: '2026-10-11T17:30:00.000Z', endedAt: scanAt,
    status: 'completed_with_review', checks: [], businessEvidence: [], summary: {
      attempted: 12, successful: 10, evidenceCaptured: 10, operatorReview: 4, interactiveReview: 2,
      manualInterventionsRequired: 2, acquisitionFailures: 1, providerEscalations: 0,
      candidateFindings: 4, candidateFindingIds: fixes.map((fix) => fix.id), customerApprovedFindings: 0,
    },
  }],
}
state = recoverRetainedBrandPresenceFromWorkspace(state, Date.parse(scanAt))
assert(state.brandPresenceLastKnownVerified?.bing_search, 'Mary retained Brand Presence is present before save')

for (const fix of fixes) {
  const defaults = defaultCustomerFindingWording(fix, state)
  if (fix.id === 'website-location') state.customerFindingRefinements = { [fix.id]: buildCustomerFindingRefinement(state, fix, { ...defaults, title: 'Clear Southgate identity' })! }
  const key = customerReviewKey(state, fix)
  state.customerFindingReviews = { ...state.customerFindingReviews, [fix.id]: key }
  state.customerFindingDecisionSnapshots = { ...state.customerFindingDecisionSnapshots,
    [fix.id]: { evidenceKey: key, disposition: 'approved', finding: structuredClone(fix), customerWording: { ...defaults, ...(fix.id === 'website-location' ? { title: 'Clear Southgate identity' } : {}) } },
  }
  const scope = buildPackageScopeOverride(state, fix, fix === hosting ? {
    scopeClassification: 'separate', packageAssignment: 'Hosting Modernization & Migration', deliveryDescription: fix.fix,
    includedScope: 'Website hosting modernization and migration', internalNote: '',
  } : {
    scopeClassification: 'starter', packageAssignment: 'Starter Visibility Cleanup', deliveryDescription: fix.fix,
    includedScope: fix.issue, internalNote: '',
  })
  assert(scope)
  state.packageScopeOverrides = { ...state.packageScopeOverrides, [fix.id]: scope }
}
state.packagePricing = { version: 1, currency: 'USD', packages: {
  [packagePricingKey('Starter Visibility Cleanup', 'starter')]: {
    packageName: 'Starter Visibility Cleanup', scopeClassification: 'starter',
    oneTimePrice: { amountCents: 49900, currency: 'USD', billingType: 'one_time' },
  },
  [packagePricingKey('Hosting Modernization & Migration', 'separate')]: {
    packageName: 'Hosting Modernization & Migration', scopeClassification: 'separate',
    oneTimePrice: { amountCents: 34900, currency: 'USD', billingType: 'one_time' },
  },
} }

const quota = writeStorageJson({ setItem() { throw new DOMException('Quota exceeded', 'QuotaExceededError') } }, 'workspace', state)
assert.equal(quota.ok, false)
assert.match(workspaceStorageFailureMessage(quota.error), /current work remains open.*Save this workspace/s)

const record = workspaceRecordFromState(state, { id: 'workspace-mary', now: scanAt })
const serialized = serializeWorkspaceFile(record, scanAt)
assert.equal(workspaceFilename(record), 'street-and-signal-montessori-center-of-downriver-2026-10-11.json')
assert.equal(buildWorkspaceFile(record, scanAt).version, 1)
const opened = parseWorkspaceFile(serialized)
assert.equal(opened.ok, true)
if (!opened.ok) throw new Error(opened.error)
assert.equal(parseWorkspaceFile(JSON.stringify(record)).ok, true, 'supported legacy raw workspace records remain importable')
const olderRecord = structuredClone(record) as Partial<typeof record> & { payload: Partial<AuditState> }
delete olderRecord.payload.businessProfile
delete olderRecord.payload.searchDestinationObservations
assert.equal(parseWorkspaceFile(JSON.stringify(olderRecord)).ok, true, 'normalizable older workspace payloads remain importable')
const restored = recoverRetainedBrandPresenceFromWorkspace(opened.scan.payload as AuditState, Date.parse(scanAt))

assert.equal(restored.profile.businessName, profile.businessName)
assert.equal(restored.visibilityRuns?.at(-1)?.endedAt, scanAt)
assert.equal(restored.visibilityRuns?.at(-1)?.summary?.candidateFindingIds?.length, 4)
assert.equal(restored.customerFindingReviews && Object.keys(restored.customerFindingReviews).length, 4)
assert.equal(restored.customerFindingRefinements?.['website-location']?.title, 'Clear Southgate identity')
assert(restored.brandPresenceLastKnownVerified?.bing_search)
assert.equal(restored.packageScopeOverrides?.[hosting.id]?.packageAssignment, 'Hosting Modernization & Migration')
assert.equal(restored.packagePricing?.packages[packagePricingKey('Starter Visibility Cleanup', 'starter')].oneTimePrice?.amountCents, 49900)
assert.equal(restored.packagePricing?.packages[packagePricingKey('Hosting Modernization & Migration', 'separate')].oneTimePrice?.amountCents, 34900)
const customerReview = buildCustomerVisibilityReviewExport(restored, [], fixes)
assert.equal(customerReview.recommendedPackage.price?.display, '$499 one-time')
assert.equal(customerReview.additionalRecommendedWork?.[0].price?.display, '$349 one-time')
assert.equal(customerReview.pricingSummary?.initialTotal?.display, '$848 one-time')
assert(serializeCustomerVisibilityReview(customerReview).includes('Clear Southgate identity'))

assert.equal(parseWorkspaceFile(JSON.stringify({ ...buildWorkspaceFile(record, scanAt), version: 99 })).ok, false)
assert.equal(parseWorkspaceFile('{broken').ok, false)
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const openSource = appSource.slice(appSource.indexOf('const openWorkspaceFile'), appSource.indexOf('const saveBeforeReplacingWorkspace'))
assert.match(openSource, /parseWorkspaceFile/)
assert.match(openSource, /normalizeSavedScan/)
assert.match(openSource, /normalizeAuditState/)
assert.doesNotMatch(openSource, /runVisibilityScan|fetch\(|acquire[A-Z]/, 'Open Workspace performs no provider acquisition')
const customerViewSource = readFileSync(new URL('../src/components/CustomerScanView.tsx', import.meta.url), 'utf8')
assert.match(customerViewSource, />Save Workspace</)
assert.match(customerViewSource, />Open Workspace</)
assert.match(customerViewSource, /Browser storage is full[\s\S]*automatic saving is unavailable[\s\S]*onClick=\{props\.onSaveWorkspace\}/)
const businessPanelSource = readFileSync(new URL('../src/components/BusinessWorkspacePanel.tsx', import.meta.url), 'utf8')
assert.match(businessPanelSource, />Save Business</)
assert.match(businessPanelSource, /Save Workspace creates the restorable JSON file/)

console.log('Workspace save/open PASS: quota fallback, v1 and legacy parsing, full Mary restoration, decisions/refinement, retained verification, $499 + $349 = $848 pricing, Customer Review, validation, deterministic filename, and no open-time acquisition.')
