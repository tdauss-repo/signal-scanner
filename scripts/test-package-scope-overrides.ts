import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AuditState, FixItem } from '../src/types/audit.ts'
import { customerReviewKey } from '../src/utils/customerScan.ts'
import {
  activePackageScopeOverride,
  buildPackageScopeOverride,
  derivePackagePreparation,
  hasStalePackageScopeOverride,
} from '../src/utils/packagePreparation.ts'
import {
  buildCustomerVisibilityReviewExport,
  customerVisibilityReviewAdditionalWork,
  customerVisibilityReviewQaText,
  serializeCustomerVisibilityReview,
} from '../src/utils/customerVisibilityReviewExport.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const profile = normalizeWorkspaceProfile({ businessName: 'Montessori Center of Downriver', primaryCategory: 'Montessori school', city: 'Southgate', state: 'MI', website: 'https://montessoridownriver.example/' })
const makeState = (): AuditState => ({
  profile, businessProfile: { schemaVersion: 1, values: {} }, checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})
const fix = (id: string, issue: string, action: string): FixItem => ({
  id, area: 'Website', sourceArea: id === 'website-schema' ? 'ai_geo_readiness' : 'website', priority: 'Medium', status: 'fail', reviewed: true,
  issue, fix: action, whyItMatters: `${issue} matters for local customers.`, evidenceSummary: `Evidence for ${issue}.`, verificationMethod: `Verify ${issue}.`, salesPackageFit: 'starter',
})
const secure = fix('website-https', 'Modernize and secure the website', 'Configure HTTPS for the current website.')
const local = fix('website-local-content', 'Homepage local identity clarity', 'Clarify the school’s Southgate and Downriver context.')
const schema = fix('website-schema', 'Help search and AI understand your school', 'Add clear school identity information.')
const description = fix('website-meta-description', 'Homepage search description', 'Improve the homepage search description.')
const fixes = [secure, local, schema, description]

const state = makeState()
for (const finding of fixes) state.customerFindingReviews = { ...(state.customerFindingReviews || {}), [finding.id]: customerReviewKey(state, finding) }

// Backward-compatible default: approved findings retain the existing derived Starter projection.
let preparation = derivePackagePreparation(state, fixes)
assert.equal(state.packageScopeOverrides, undefined)
assert.deepEqual(preparation.starterItems.map((item) => item.findingId).sort(), fixes.map((item) => item.id).sort())
assert(preparation.starterItems.every((item) => !item.overridden))

const sourceBeforeOverride = structuredClone(secure)
const override = buildPackageScopeOverride(state, secure, {
  scopeClassification: 'separate',
  packageAssignment: 'Website Hosting Modernization & Migration',
  deliveryDescription: 'Move the website to a modern hosting environment, configure and verify HTTPS, update the website configuration as needed, and verify that the site continues to work correctly after the move.',
  includedScope: 'Website hosting modernization and migration',
  internalNote: 'Legacy H-Sphere environment; final hosting provider and pricing still under review.',
})
assert(override)
assert.deepEqual(secure, sourceBeforeOverride, 'building package scope never mutates the approved finding')
state.packageScopeOverrides = { [secure.id]: override }
assert.equal(activePackageScopeOverride(state, secure)?.packageAssignment, 'Website Hosting Modernization & Migration')
assert.equal(buildPackageScopeOverride(state, secure, { ...override, scopeClassification: 'separate', packageAssignment: 'Starter Visibility Cleanup' })?.packageAssignment, 'Custom / separate project', 'incompatible assignment choices cannot make separate work look like Starter')

preparation = derivePackagePreparation(state, fixes)
assert.deepEqual(preparation.starterItems.map((item) => item.findingId).sort(), [local.id, schema.id, description.id].sort(), 'Starter contains only Starter-assigned approved findings')
assert.equal(preparation.separateScopeItems.length, 1)
assert.equal(preparation.separateScopeItems[0].findingId, secure.id)
assert.equal(preparation.separateScopeItems[0].packageAssignment, 'Website Hosting Modernization & Migration')
assert.match(preparation.separateScopeItems[0].remediationAction, /modern hosting environment/)
assert.equal(preparation.starterItems.some((item) => item.includedScope === 'Website hosting modernization and migration'), false, 'separate work never leaks into Starter included scope')

const review = buildCustomerVisibilityReviewExport(state, [], fixes)
const serialized = serializeCustomerVisibilityReview(review)
const qaText = customerVisibilityReviewQaText(review, true)
assert.equal(review.reviewVersion, '1.0', 'the existing JSON contract remains version 1.0')
assert.deepEqual(review.recommendedPackage.included, preparation.starterItems.map((item) => item.includedScope))
const secureIssue = review.confirmedIssues.find((issue) => issue.id === secure.id)!
assert.equal(secureIssue.label, 'Website Hosting Modernization & Migration')
assert.match(secureIssue.foundLocalAction, /modern hosting environment/)
assert.deepEqual(customerVisibilityReviewAdditionalWork(review), ['Website Hosting Modernization & Migration'])
assert(qaText.includes('Additional recommended work:') && qaText.includes('Website Hosting Modernization & Migration'))
assert.equal(serialized.includes('Website hosting modernization and migration') && review.recommendedPackage.included.includes('Website hosting modernization and migration'), false)
assert.equal(serialized.includes('H-Sphere'), false, 'internal scope note never exports')
assert.equal(qaText.includes('H-Sphere'), false, 'internal scope note never enters customer QA text')
assert.equal(serialized.includes('internalNote'), false, 'internal package metadata is not part of JSON v1.0')

// Unapproved and dismissed findings cannot receive active delivery scope.
const unresolvedState = makeState()
assert.equal(buildPackageScopeOverride(unresolvedState, secure, { ...override, internalNote: '', scopeClassification: 'separate' }), null)
const dismissedState = makeState()
dismissedState.customerFindingDismissals = { [secure.id]: customerReviewKey(dismissedState, secure) }
assert.equal(buildPackageScopeOverride(dismissedState, secure, { ...override, internalNote: '', scopeClassification: 'separate' }), null)
assert.equal(derivePackagePreparation(dismissedState, [secure]).items.length, 0)

// Evidence change + reapproval does not silently reactivate the old scope.
const changed = structuredClone(state)
const changedSecure = { ...secure, evidenceSummary: 'New material HTTPS evidence changes the approved identity.' }
changed.customerFindingReviews![secure.id] = customerReviewKey(changed, changedSecure)
assert.equal(hasStalePackageScopeOverride(changed, changedSecure), true)
assert.equal(activePackageScopeOverride(changed, changedSecure), undefined)
const changedPreparation = derivePackagePreparation(changed, [changedSecure, local, schema, description])
const staleItem = changedPreparation.items.find((item) => item.findingId === secure.id)!
assert.equal(staleItem.staleOverride, true)
assert.equal(changedPreparation.starterItems.some((item) => item.findingId === secure.id), false, 'stale override blocks active package scope until reconciled')
assert.equal(buildCustomerVisibilityReviewExport(changed, [], [changedSecure, local, schema, description]).confirmedIssues.find((issue) => issue.id === secure.id)?.label, 'Package scope requires review')

// Older serialized workspaces without overrides retain defaults safely.
const legacy = JSON.parse(JSON.stringify(makeState())) as AuditState
for (const finding of fixes) legacy.customerFindingReviews = { ...(legacy.customerFindingReviews || {}), [finding.id]: customerReviewKey(legacy, finding) }
assert.equal(legacy.packageScopeOverrides, undefined)
assert.equal(derivePackagePreparation(legacy, fixes).starterItems.length, 4)

// The override itself survives the same JSON persistence path used by saved workspaces.
const reopened = JSON.parse(JSON.stringify(state)) as AuditState
assert.equal(activePackageScopeOverride(reopened, secure)?.includedScope, 'Website hosting modernization and migration')

const panelSource = readFileSync(new URL('../src/components/PackagePreparationPanel.tsx', import.meta.url), 'utf8')
for (const control of ['Edit scope', 'Scope classification', 'Package assignment', 'What Found Local will do', 'Included scope', 'Internal scope note', 'Save scope', 'Cancel']) assert(panelSource.includes(control), `${control} must remain available in Package Preparation`)
assert.equal(panelSource.includes('H-Sphere'), false, 'production UI contains no Montessori-specific hosting logic')

console.log('Package scope override PASS: defaults, approved-only edits, separate scope, customer-safe delivery, stale invalidation, saved compatibility, Starter isolation, v1 export, and Montessori fixture.')
