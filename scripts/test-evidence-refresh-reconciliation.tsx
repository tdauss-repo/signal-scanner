import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AuditState, FixItem } from '../src/types/audit.ts'
import { CustomerFindingReview } from '../src/components/CustomerFindingReview.tsx'
import { CustomerReviewPanel } from '../src/components/CustomerReviewPanel.tsx'
import { PackagePreparationPanel } from '../src/components/PackagePreparationPanel.tsx'
import {
  activeCustomerFindingRefinement,
  buildCustomerFindingRefinement,
  customerFindingEvidenceKey,
  findingsNeedingReconciliation,
  hasStaleCustomerFindingApproval,
  hasStaleCustomerFindingRefinement,
  isPresentedFinding,
  reconfirmCustomerFinding,
} from '../src/utils/customerScan.ts'
import {
  activePackageScopeOverride,
  buildPackageScopeOverride,
  derivePackagePreparation,
  hasStalePackageScopeOverride,
} from '../src/utils/packagePreparation.ts'
import { serializeCustomerVisibilityReview, buildCustomerVisibilityReviewExport } from '../src/utils/customerVisibilityReviewExport.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Montessori school',
  website: 'http://montessoridownriver.example/', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', localMarket: 'Southgate and Downriver, MI',
  primaryServices: 'Toddler Program, Preschool, Kindergarten',
})
const reviewed = (value: unknown, recordedAt: string) => ({ value, source: 'operator fixture', recordedAt, confidence: 'high' as const, status: 'operator_reviewed' as const })
const makeState = (): AuditState => ({
  profile,
  businessProfile: { schemaVersion: 1, values: {
    businessName: reviewed(profile.businessName, '2026-09-26T12:00:00Z'),
    primaryCategory: reviewed(profile.primaryCategory, '2026-09-26T12:00:00Z'),
    website: reviewed(profile.website, '2026-09-26T12:00:00Z'),
  } },
  checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '2026-09-26T12:00:00Z', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini',
  aiAnswerTests: {} as AuditState['aiAnswerTests'], searchVisibilityTests: {}, searchDestinationObservations: {},
  voicePromptTests: {}, voiceAssistantObservations: [], directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})

const simpleFinding = (id: string, title: string, action: string, sourceArea: FixItem['sourceArea'] = 'website'): FixItem => ({
  id, area: 'Website', sourceArea, priority: 'Medium', status: 'fail', reviewed: true,
  issue: title, fix: action, whyItMatters: `${title} matters for nearby families.`,
  evidenceSummary: `Material evidence for ${title}.`, evidenceNote: `Material evidence for ${title}.`,
  verificationMethod: `Verify ${title}.`, salesPackageFit: 'starter',
})
const secure: FixItem = {
  ...simpleFinding('finding-website-https', 'Modernize and secure the website', 'Configure and verify HTTPS.'),
  priority: 'High',
  intelligence: {
    ruleVersion: 1, checkId: 'website-https', condition: 'https_endpoint_connection_failed', lifecycle: 'Evidence captured',
    evidence: {
      confidence: 'supported', observations: ['HTTP returned usable content.', 'HTTPS connection was refused.'],
      provenance: { captureVersion: 1, provider: 'provider-a', method: 'server_fetch', outcome: 'success', requestedUrl: profile.website, sourceUrl: profile.website, occurredAt: '2026-09-26T12:01:00Z', attemptSummary: { attemptedCount: 3, selectedStrategy: 'direct' }, recordOrigin: 'captured' },
    },
    customer: { title: 'Modernize and secure the website', found: 'The secure website connection needs attention.', why: 'A secure connection helps visitors use the website with confidence.', recommendation: 'Found Local will configure and verify a secure website connection.', canRemediate: true, confirmation: 'Confirm hosting access.', evidenceSummary: 'HTTPS connection was refused.', verificationSummary: 'Verify HTTPS.' },
    delivery: { technicalChange: 'Configure HTTPS.', steps: ['Configure hosting'], access: ['Hosting'], customerInput: [], dependencies: ['Hosting access'], scope: 'starter' },
    verification: { expectedState: 'HTTPS works.', method: 'Load the secure URL.', criteria: ['Valid secure response'] },
  },
}
const local = simpleFinding('website-local-content', 'Homepage local identity clarity', 'Clarify Southgate and Downriver location context.')
const schema = simpleFinding('website-schema', 'Help search and AI understand your school', 'Add clear school identity information.', 'ai_geo_readiness')
const description = simpleFinding('website-meta-description', 'Homepage search description', 'Replace the duplicate placeholder description.')
const findings = [secure, local, schema, description]

let initial = makeState()
const wording = {
  title: 'Modernize and secure the website', priority: 'High' as const,
  summary: 'The current website does not provide a dependable secure connection for families.',
  recommendedAction: 'Found Local will move the website to modern hosting and configure and verify HTTPS.',
}
initial.customerFindingRefinements = { [secure.id]: buildCustomerFindingRefinement(initial, secure, wording)! }
for (const finding of findings) initial = reconfirmCustomerFinding(initial, finding)
const separateScope = buildPackageScopeOverride(initial, secure, {
  scopeClassification: 'separate', packageAssignment: 'Website Hosting Modernization & Migration',
  deliveryDescription: 'Move the website to modern hosting, configure and verify HTTPS, and verify the site after migration.',
  includedScope: 'Website hosting modernization and migration',
  internalNote: 'Legacy hosting details and pricing remain operator-only.',
})!
initial.packageScopeOverrides = { [secure.id]: separateScope }

// Rescan A: timestamps, run IDs, provider identity, and request-attempt metadata change; evidence does not.
const unchanged = structuredClone(initial)
unchanged.lastUpdated = '2026-09-27T14:30:00Z'
unchanged.businessProfile.values.primaryCategory!.recordedAt = '2026-09-27T14:30:00Z'
unchanged.visibilityRuns = [{ version: 2, id: 'new-run-id', profileKey: 'new-run-profile-key', profileReviewKey: 'request-99', startedAt: '2026-09-27T14:00:00Z', endedAt: '2026-09-27T14:30:00Z', status: 'completed', checks: [], businessEvidence: [] }]
const unchangedSecure = structuredClone(secure)
unchangedSecure.intelligence!.evidence.provenance.occurredAt = '2026-09-27T14:01:00Z'
unchangedSecure.intelligence!.evidence.provenance.provider = 'provider-b'
unchangedSecure.intelligence!.evidence.provenance.attemptSummary = { attemptedCount: 7, selectedStrategy: 'fallback' }
const unchangedFindings = [unchangedSecure, local, schema, description]
for (const finding of unchangedFindings) assert.equal(isPresentedFinding(unchanged, finding), true, `${finding.id} approval survives a semantically identical rescan`)
assert.equal(activeCustomerFindingRefinement(unchanged, unchangedSecure)?.recommendedAction, wording.recommendedAction)
assert.equal(activePackageScopeOverride(unchanged, unchangedSecure)?.packageAssignment, 'Website Hosting Modernization & Migration')
let preparation = derivePackagePreparation(unchanged, unchangedFindings)
assert.equal(preparation.starterItems.length, 3)
assert.equal(preparation.separateScopeItems.length, 1)
assert.equal(preparation.reconciliationItems.length, 0)

// Legacy full-workspace keys are interpreted materially during migration.
const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, ordered(nested)])) : value
const legacy = makeState()
const legacyBase = [legacy.profile, legacy.businessProfile, legacy.checks, legacy.notes, legacy.evidenceConfidence, legacy.websiteAudit, legacy.searchDestinationObservations, legacy.aiAnswerTests, legacy.directories, legacy.salesReadiness, secure]
const legacyRefinement = { ...buildCustomerFindingRefinement(legacy, secure, wording)!, evidenceKey: JSON.stringify(ordered(legacyBase)) }
legacy.customerFindingRefinements = { [secure.id]: legacyRefinement }
legacy.customerFindingReviews = { [secure.id]: JSON.stringify(ordered([...legacyBase, { customerRefinement: legacyRefinement }])) }
legacy.packageScopeOverrides = { [secure.id]: { ...separateScope, evidenceKey: legacy.customerFindingReviews[secure.id] } }
assert.equal(isPresentedFinding(legacy, unchangedSecure), true, 'legacy approval survives timestamp/provider-only refresh')
assert.equal(activeCustomerFindingRefinement(legacy, unchangedSecure)?.recommendedAction, wording.recommendedAction)
assert.equal(activePackageScopeOverride(legacy, unchangedSecure)?.packageAssignment, 'Website Hosting Modernization & Migration')

// Rescan B: the substantive HTTPS observation changes.
const changed = structuredClone(unchanged)
const changedSecure = structuredClone(unchangedSecure)
changedSecure.evidenceSummary = 'HTTPS now responds, but the certificate identity does not match the website hostname.'
changedSecure.evidenceNote = changedSecure.evidenceSummary
changedSecure.intelligence!.condition = 'tls_validation_failed'
changedSecure.intelligence!.evidence.observations = ['HTTPS responded.', 'The certificate identity did not match the website hostname.']
const changedFindings = [changedSecure, local, schema, description]
assert.equal(isPresentedFinding(changed, changedSecure), false)
assert.equal(hasStaleCustomerFindingApproval(changed, changedSecure), true)
assert.equal(hasStaleCustomerFindingRefinement(changed, changedSecure), true)
assert.equal(hasStalePackageScopeOverride(changed, changedSecure), true)
for (const finding of [local, schema, description]) assert.equal(isPresentedFinding(changed, finding), true, 'unrelated finding decisions remain current')

const contradictoryLegacyState = structuredClone(changed)
contradictoryLegacyState.customerFindingReviews![secure.id] = customerFindingEvidenceKey(changed, changedSecure)
assert.equal(hasStaleCustomerFindingRefinement(contradictoryLegacyState, changedSecure), true)
assert.equal(isPresentedFinding(contradictoryLegacyState, changedSecure), false, 'stale wording prevents a base-only legacy approval from appearing current')

preparation = derivePackagePreparation(changed, changedFindings)
assert.equal(preparation.confirmedItems.length, 3)
assert.equal(preparation.starterItems.length, 3)
assert.equal(preparation.reconciliationItems.length, 1)
assert.equal(preparation.reconciliationItems[0].packageAssignment, 'Website Hosting Modernization & Migration')
assert.equal(preparation.reconciliationItems[0].approvalNeedsReconfirmation, true)
assert.equal(preparation.separateScopeItems.length, 0, 'stale separate scope is historical, not active')

const noop = () => undefined
const findingHtml = renderToStaticMarkup(<CustomerFindingReview state={changed} fixes={[changedSecure]} onReview={noop} onSaveRefinement={noop} onConfirmFinding={noop} />)
assert.match(findingHtml, /Operator disposition:<\/strong> Needs reconfirmation/)
assert.match(findingHtml, /Previous disposition: Approved/)
assert.match(findingHtml, /Confirm current wording/)
assert.match(findingHtml, /The supporting evidence changed since this wording was saved/)
assert.doesNotMatch(findingHtml, /Operator disposition:<\/strong> Approved for customer export/)

const packageHtml = renderToStaticMarkup(<PackagePreparationPanel state={changed} fixes={changedFindings} onSaveScope={noop} />)
assert.match(packageHtml, /Scope needing reconfirmation/)
assert.match(packageHtml, /Website Hosting Modernization &amp; Migration/)
assert.match(packageHtml, /finding decision must be reconfirmed in Review/)

let customerReviewHtml = renderToStaticMarkup(<CustomerReviewPanel state={changed} items={[]} fixes={changedFindings} onReview={noop} />)
assert.match(customerReviewHtml, /1 finding needs operator disposition reconfirmation/)
assert.doesNotMatch(customerReviewHtml, /Copy Customer Review JSON/)
const blockedJson = serializeCustomerVisibilityReview(buildCustomerVisibilityReviewExport(changed, [], changedFindings))
for (const forbidden of ['Legacy hosting details', 'pricing remain operator-only', 'evidenceKey', 'packageScopeOverrides', 'customerFindingDecisionSnapshots']) assert.equal(blockedJson.includes(forbidden), false)

// Reconfirm finding wording first; package scope remains historical until separately confirmed.
const findingReconfirmed = reconfirmCustomerFinding(changed, changedSecure)
assert.equal(isPresentedFinding(findingReconfirmed, changedSecure), true)
assert.equal(activeCustomerFindingRefinement(findingReconfirmed, changedSecure)?.recommendedAction, wording.recommendedAction)
preparation = derivePackagePreparation(findingReconfirmed, changedFindings)
assert.equal(preparation.reconciliationItems.length, 1)
assert.equal(preparation.reconciliationItems[0].canConfirmScope, true)
assert.equal(preparation.reconciliationItems[0].packageAssignment, 'Website Hosting Modernization & Migration')
assert.match(renderToStaticMarkup(<PackagePreparationPanel state={findingReconfirmed} fixes={changedFindings} onSaveScope={noop} />), /Confirm previous scope/)
customerReviewHtml = renderToStaticMarkup(<CustomerReviewPanel state={findingReconfirmed} items={[]} fixes={changedFindings} onReview={noop} />)
assert.match(customerReviewHtml, /1 finding needs package scope reconfirmation/)

const confirmedOverride = buildPackageScopeOverride(findingReconfirmed, changedSecure, {
  scopeClassification: preparation.reconciliationItems[0].scopeClassification,
  packageAssignment: preparation.reconciliationItems[0].packageAssignment,
  deliveryDescription: preparation.reconciliationItems[0].remediationAction,
  includedScope: preparation.reconciliationItems[0].includedScope,
  internalNote: preparation.reconciliationItems[0].internalScopeNote,
})!
const fullyReconciled = { ...findingReconfirmed, packageScopeOverrides: { ...findingReconfirmed.packageScopeOverrides, [secure.id]: confirmedOverride } }
preparation = derivePackagePreparation(fullyReconciled, changedFindings)
assert.equal(preparation.starterItems.length, 3)
assert.equal(preparation.separateScopeItems.length, 1)
assert.equal(preparation.reconciliationItems.length, 0)

// If the refreshed evidence removes a candidate, its snapshot-backed decision and scope remain visible until resolved.
const withoutSecure = [local, schema, description]
assert.equal(findingsNeedingReconciliation(changed, withoutSecure).some((item) => item.finding.id === secure.id && item.absentFromLatestScan), true)
const absentPreparation = derivePackagePreparation(changed, withoutSecure)
assert.equal(absentPreparation.reconciliationItems.some((item) => item.findingId === secure.id && item.findingAbsentFromLatestScan), true)
assert.match(renderToStaticMarkup(<PackagePreparationPanel state={changed} fixes={withoutSecure} onSaveScope={noop} />), /latest scan no longer produces this finding/)

console.log('Evidence refresh reconciliation PASS: material fingerprints, legacy compatibility, unchanged rescan retention, changed-evidence decision history, package reconfirmation, export blocking, and removed-finding visibility.')
