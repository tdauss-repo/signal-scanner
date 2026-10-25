import { evidenceFingerprint } from './evidenceFingerprint'
import type { BusinessProfile } from '../types/audit'
import type { ScanArea, ScanState, VisibilityRun, VisibilityRunStatus } from '../types/visibilityScan'

export const scanProfileKey = (profile: BusinessProfile) => evidenceFingerprint(profile)
export const visibilityRunStatus = (run: VisibilityRun | undefined): VisibilityRunStatus | 'idle' => {
  if (!run) return 'idle'
  if (run.status) return run.status
  if (!run.endedAt) return 'running'
  return run.checks.some((check) => ['failed', 'interactive_review_required', 'not_checked'].includes(check.state))
    ? 'completed_with_review' : 'completed'
}
export const visibilityRunIsTerminal = (run: VisibilityRun | undefined) => {
  const status = visibilityRunStatus(run)
  return status !== 'idle' && status !== 'running'
}
export const formatVisibilityRunDuration = (elapsedMs: number | undefined) => {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 'Not recorded'
  const totalSeconds = Math.round(elapsedMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m ${totalSeconds % 60}s`
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`
}
export const visibilityRunDurationLabel = (run: VisibilityRun | undefined, active = false) =>
  run && (active || visibilityRunStatus(run) === 'running') ? 'In progress' : formatVisibilityRunDuration(run?.elapsedMs)
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
  return runs?.map((run) => {
    const elapsedMs = typeof run.elapsedMs === 'number' && Number.isFinite(run.elapsedMs) && run.elapsedMs >= 0
      ? Math.round(run.elapsedMs) : undefined
    if (run.endedAt) return { ...run, elapsedMs, status: visibilityRunStatus(run) === 'running' ? 'completed_with_review' : visibilityRunStatus(run) as VisibilityRunStatus }
    const endedAt = run.checks.map((check) => check.endedAt).filter(Boolean).at(-1) || run.startedAt
    return { ...run, elapsedMs: undefined, endedAt, status: 'failed', interrupted: true, failure: run.failure || 'Run interrupted before all acquisition work reached a terminal state.', checks: run.checks.map((check) =>
      check.state === 'scanning' ? { ...check, endedAt: check.endedAt || endedAt, state: 'interactive_review_required' as const, error: 'Run interrupted before an acquisition outcome was recorded.' }
        : check.state === 'queued' ? { ...check, state: 'not_checked' as const, error: 'This check did not begin before the scan was interrupted.' } : check)
    }
  })
}
