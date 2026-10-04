import type { AuditState, BusinessProfile, SearchDestinationObservation } from '../types/audit'
import {
  recoverRetainedBrandPresenceFromWorkspace,
  retainedBrandPresenceSourceFromVisibilityRuns,
} from './brandPresenceWorkspaceRetention'

/** Legacy compatibility shape retained for existing callers during migration. */
export interface RetainedBingSource {
  observation: SearchDestinationObservation
  sourceProfileReviewKey?: string
}

export function retainedBingSourceFromVisibilityRuns(
  state: AuditState,
  checkId: string,
  profile: BusinessProfile,
): RetainedBingSource | undefined {
  void profile
  const observation = retainedBrandPresenceSourceFromVisibilityRuns(state, checkId, 'Bing Search')
  if (!observation) return undefined
  const sourceRun = state.visibilityRuns?.find((run) => run.id === observation.automation?.runId)
  return { observation, sourceProfileReviewKey: sourceRun?.profileReviewKey }
}

/** Backward-compatible entry point; the implementation is now shared. */
export const recoverRetainedBingVerificationFromWorkspace = recoverRetainedBrandPresenceFromWorkspace
