import { evidenceFingerprint } from './evidenceFingerprint'
import type { BusinessProfile } from '../types/audit'
import type { ScanArea, ScanState, VisibilityRun } from '../types/visibilityScan'

export const scanProfileKey = (profile: BusinessProfile) => evidenceFingerprint(profile)
export const scanStateLabel: Record<ScanState, string> = {
  queued: 'Queued', scanning: 'Scan in progress', evidence_captured: 'Evidence captured — awaiting review', awaiting_review: 'Evidence captured — awaiting review',
  interactive_review_required: 'Needs a closer review', checked_clear: 'Looking good', needs_attention: 'Needs attention', failed: 'Check could not complete', not_checked: 'Not checked',
}
export function scanAreaState(run: VisibilityRun, area: ScanArea): ScanState {
  const checks = run.checks.filter((check) => check.area === area)
  for (const status of ['scanning', 'queued', 'interactive_review_required', 'failed', 'awaiting_review', 'evidence_captured', 'needs_attention'] as ScanState[]) {
    if (checks.some((check) => check.state === status)) return status
  }
  return checks.length && checks.every((check) => check.state === 'checked_clear') ? 'checked_clear' : 'not_checked'
}

export function restoreVisibilityRuns(runs: VisibilityRun[] | undefined): VisibilityRun[] | undefined {
  return runs?.map((run) => run.endedAt ? run : { ...run, interrupted: true, checks: run.checks.map((check) =>
    check.state === 'scanning' ? { ...check, state: 'interactive_review_required' as const, error: 'Run interrupted before an acquisition outcome was recorded.' }
      : check.state === 'queued' ? { ...check, state: 'not_checked' as const } : check),
  })
}
