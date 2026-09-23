import type { AuditState, FixItem } from '../types/audit'
import { effectiveCustomerFinding, isPresentedFinding } from './customerScan'
import { effectivePackageFit, isStarterEligible, sortSalesActions } from './salesReadiness'

export type PackageAssignment = 'Starter Visibility Cleanup' | 'Customer/platform ownership required' | 'Separate scoping required' | 'Not included'

export interface PackagePreparationItem {
  findingId: string
  finding: string
  priority: FixItem['priority']
  remediationAction: string
  packageFit: NonNullable<FixItem['salesPackageFit']>
  packageAssignment: PackageAssignment
  includedScope: string
}

export interface PackagePreparation {
  approvedFindings: FixItem[]
  starterItems: PackagePreparationItem[]
  separateScopeItems: PackagePreparationItem[]
  recommendedPackage: 'Starter Visibility Cleanup' | null
}

const assignmentFor = (fix: FixItem): PackageAssignment => {
  const fit = effectivePackageFit(fix)
  if (fit === 'starter') return 'Starter Visibility Cleanup'
  if (fit === 'owner_action') return 'Customer/platform ownership required'
  if (fit === 'later') return 'Separate scoping required'
  return 'Not included'
}

/** One scope label per approved finding; no neutral review state can add work. */
export const packageScopeForFinding = (fix: FixItem) => {
  const text = `${fix.id} ${fix.issue} ${fix.fix}`.toLowerCase()
  if (/https|secure|certificate|connection/.test(text)) return 'Secure website setup'
  if (/meta|search description|homepage description/.test(text)) return 'Search description cleanup'
  if (/schema|structured|machine-readable|business identity/.test(text)) return 'Business identity / structured data cleanup'
  return fix.intelligence?.customer.recommendation?.trim() || fix.fix.trim()
}

const packageItem = (fix: FixItem): PackagePreparationItem => ({
  findingId: fix.id,
  finding: fix.intelligence?.customer.title || fix.issue,
  priority: fix.priority,
  remediationAction: fix.intelligence?.customer.recommendation || fix.fix,
  packageFit: effectivePackageFit(fix),
  packageAssignment: assignmentFor(fix),
  includedScope: packageScopeForFinding(fix),
})

/**
 * Creates operator package scope from explicit customer-finding approvals only.
 * Candidate, dismissed, stale, neutral, and provider-failure states cannot enter.
 */
export function derivePackagePreparation(state: AuditState, fixes: FixItem[]): PackagePreparation {
  const approvedFindings = sortSalesActions([...new Map(
    fixes.filter((fix) => isPresentedFinding(state, fix)).map((fix) => [fix.id, { ...effectiveCustomerFinding(state, fix), reviewed: true }]),
  ).values()])
  const starterItems = approvedFindings.filter(isStarterEligible).map(packageItem)
  const starterIds = new Set(starterItems.map((item) => item.findingId))
  const separateScopeItems = approvedFindings.filter((fix) => !starterIds.has(fix.id)).map(packageItem)
  return {
    approvedFindings,
    starterItems,
    separateScopeItems,
    recommendedPackage: starterItems.length ? 'Starter Visibility Cleanup' : null,
  }
}
