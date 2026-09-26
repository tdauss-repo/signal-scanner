import type { AuditState, FixItem, PackageScopeClassification, PackageScopeOverride } from '../types/audit'
import { customerReviewKey, effectiveCustomerFinding, hasStaleCustomerFindingApproval, historicalCustomerFindingWording, isPresentedFinding, matchesCustomerReviewKey } from './customerScan'
import { effectivePackageFit, sortSalesActions } from './salesReadiness'

export type PackageAssignment = string
export type PackageScopeInput = Omit<PackageScopeOverride, 'evidenceKey'>

export interface PackagePreparationItem {
  findingId: string
  finding: string
  priority: FixItem['priority']
  remediationAction: string
  packageFit: NonNullable<FixItem['salesPackageFit']>
  scopeClassification: PackageScopeClassification
  packageAssignment: PackageAssignment
  includedScope: string
  internalScopeNote: string
  overridden: boolean
  staleOverride: boolean
  approvalNeedsReconfirmation?: boolean
  canConfirmScope?: boolean
  findingAbsentFromLatestScan?: boolean
}

export interface PackagePreparation {
  approvedFindings: FixItem[]
  items: PackagePreparationItem[]
  confirmedItems: PackagePreparationItem[]
  reconciliationItems: PackagePreparationItem[]
  starterItems: PackagePreparationItem[]
  separateScopeItems: PackagePreparationItem[]
  customerActionItems: PackagePreparationItem[]
  notIncludedItems: PackagePreparationItem[]
  recommendedPackage: 'Starter Visibility Cleanup' | null
}

const classificationFor = (fix: FixItem): PackageScopeClassification => {
  const fit = effectivePackageFit(fix)
  if (fit === 'starter') return 'starter'
  if (fit === 'owner_action') return 'customer_action'
  if (fit === 'later') return 'separate'
  return 'not_included'
}

const assignmentFor = (classification: PackageScopeClassification): PackageAssignment =>
  classification === 'starter' ? 'Starter Visibility Cleanup'
    : classification === 'separate' ? 'Custom / separate project' : 'None'

const fitFor = (classification: PackageScopeClassification): NonNullable<FixItem['salesPackageFit']> =>
  classification === 'starter' ? 'starter'
    : classification === 'separate' ? 'later'
      : classification === 'customer_action' ? 'owner_action' : 'excluded'

/** One default scope label per approved finding; no neutral review state can add work. */
export const packageScopeForFinding = (fix: FixItem) => {
  const text = `${fix.id} ${fix.issue} ${fix.fix}`.toLowerCase()
  if (/https|secure|certificate|connection/.test(text)) return 'Secure website setup'
  if (/meta|search description|homepage description/.test(text)) return 'Search description cleanup'
  if (/schema|structured|machine-readable|business identity/.test(text)) return 'Business identity / structured data cleanup'
  return fix.intelligence?.customer.recommendation?.trim() || fix.fix.trim()
}

export const defaultPackageScope = (fix: FixItem): PackageScopeInput => {
  const scopeClassification = classificationFor(fix)
  return {
    scopeClassification,
    packageAssignment: assignmentFor(scopeClassification),
    deliveryDescription: fix.intelligence?.customer.recommendation || fix.fix,
    includedScope: packageScopeForFinding(fix),
    internalNote: '',
  }
}

export const activePackageScopeOverride = (state: AuditState, fix: FixItem) => {
  if (!isPresentedFinding(state, fix)) return undefined
  const override = state.packageScopeOverrides?.[fix.id]
  return override && matchesCustomerReviewKey(override.evidenceKey, state, fix) ? override : undefined
}

export const hasStalePackageScopeOverride = (state: AuditState, fix: FixItem) => {
  const override = state.packageScopeOverrides?.[fix.id]
  return Boolean(override && !matchesCustomerReviewKey(override.evidenceKey, state, fix))
}

export const buildPackageScopeOverride = (state: AuditState, fix: FixItem, input: PackageScopeInput): PackageScopeOverride | null => {
  if (!isPresentedFinding(state, fix)) return null
  const defaults = defaultPackageScope(effectiveCustomerFinding(state, fix))
  const scopeClassification = input.scopeClassification
  const requestedAssignment = input.packageAssignment.trim()
  const packageAssignment = scopeClassification === 'starter' ? 'Starter Visibility Cleanup'
    : scopeClassification === 'separate' && requestedAssignment && !['None', 'Starter Visibility Cleanup'].includes(requestedAssignment) ? requestedAssignment
      : scopeClassification === 'separate' ? 'Custom / separate project' : 'None'
  return {
    evidenceKey: customerReviewKey(state, fix),
    scopeClassification,
    packageAssignment,
    deliveryDescription: input.deliveryDescription.trim() || defaults.deliveryDescription,
    includedScope: input.includedScope.trim() || defaults.includedScope,
    ...(input.internalNote?.trim() ? { internalNote: input.internalNote.trim() } : {}),
  }
}

const packageItem = (state: AuditState, sourceFix: FixItem): PackagePreparationItem => {
  const fix = effectiveCustomerFinding(state, sourceFix)
  const defaults = defaultPackageScope(fix)
  const override = activePackageScopeOverride(state, sourceFix)
  const scope = override || defaults
  return {
    findingId: fix.id,
    finding: fix.intelligence?.customer.title || fix.issue,
    priority: fix.priority,
    remediationAction: scope.deliveryDescription,
    packageFit: fitFor(scope.scopeClassification),
    scopeClassification: scope.scopeClassification,
    packageAssignment: scope.packageAssignment,
    includedScope: scope.includedScope,
    internalScopeNote: override?.internalNote || '',
    overridden: Boolean(override),
    staleOverride: hasStalePackageScopeOverride(state, sourceFix),
  }
}

const reconciliationItem = (state: AuditState, sourceFix: FixItem, findingAbsentFromLatestScan = false): PackagePreparationItem => {
  const wording = historicalCustomerFindingWording(state, sourceFix)
  const previous = state.packageScopeOverrides?.[sourceFix.id]
  const defaults = defaultPackageScope({ ...sourceFix, issue: wording.title, priority: wording.priority, fix: wording.recommendedAction, whyItMatters: wording.summary })
  const scope = previous || defaults
  const approvalNeedsReconfirmation = findingAbsentFromLatestScan || hasStaleCustomerFindingApproval(state, sourceFix)
  return {
    findingId: sourceFix.id,
    finding: wording.title,
    priority: wording.priority,
    remediationAction: scope.deliveryDescription,
    packageFit: fitFor(scope.scopeClassification),
    scopeClassification: scope.scopeClassification,
    packageAssignment: scope.packageAssignment,
    includedScope: scope.includedScope,
    internalScopeNote: previous?.internalNote || '',
    overridden: Boolean(previous),
    staleOverride: Boolean(previous),
    approvalNeedsReconfirmation,
    canConfirmScope: !approvalNeedsReconfirmation && isPresentedFinding(state, sourceFix),
    findingAbsentFromLatestScan,
  }
}

/**
 * Creates operator package scope from explicit customer-finding approvals only.
 * Candidate, dismissed, stale approvals, neutral, and provider-failure states cannot enter.
 */
export function derivePackagePreparation(state: AuditState, fixes: FixItem[]): PackagePreparation {
  const approvedSourceFindings = sortSalesActions([...new Map(
    fixes.filter((fix) => isPresentedFinding(state, fix)).map((fix) => [fix.id, fix]),
  ).values()])
  const approvedFindings = approvedSourceFindings.map((fix) => ({ ...effectiveCustomerFinding(state, fix), reviewed: true }))
  const items = approvedSourceFindings.map((fix) => packageItem(state, fix))
  const activeItems = items.filter((item) => !item.staleOverride)
  const reconciliationSource = fixes.filter((fix) => hasStaleCustomerFindingApproval(state, fix) || isPresentedFinding(state, fix) && hasStalePackageScopeOverride(state, fix))
  const currentIds = new Set(fixes.map((fix) => fix.id))
  const absentApproved = Object.entries(state.customerFindingDecisionSnapshots || {})
    .filter(([id, snapshot]) => !currentIds.has(id) && snapshot.disposition === 'approved' && Boolean(state.customerFindingReviews?.[id]))
    .map(([, snapshot]) => snapshot.finding)
  const reconciliationItems = [
    ...sortSalesActions(reconciliationSource).map((fix) => reconciliationItem(state, fix)),
    ...sortSalesActions(absentApproved).map((fix) => reconciliationItem(state, fix, true)),
  ]
  const starterItems = activeItems.filter((item) => item.scopeClassification === 'starter')
  const separateScopeItems = activeItems.filter((item) => item.scopeClassification === 'separate')
  const customerActionItems = activeItems.filter((item) => item.scopeClassification === 'customer_action')
  const notIncludedItems = activeItems.filter((item) => item.scopeClassification === 'not_included')
  return {
    approvedFindings,
    items,
    confirmedItems: activeItems,
    reconciliationItems,
    starterItems,
    separateScopeItems,
    customerActionItems,
    notIncludedItems,
    recommendedPackage: starterItems.length ? 'Starter Visibility Cleanup' : null,
  }
}
