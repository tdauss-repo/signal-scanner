import type { AIAnswerPlatform, AIAnswerTestState, BusinessProfile } from '../types/audit'

/** Counts only reviewed manual AI Presence observations, never readiness. */
export const reviewedAIPresenceCount = (
  tests: Record<AIAnswerPlatform, AIAnswerTestState>,
) =>
  Object.values(tests).filter((test) =>
    test.observations.some(
      (observation) =>
        observation.operatorReviewed &&
        observation.evidenceMode === 'consumer_observation',
    ),
  ).length

export const reviewedAIPresenceObservationCount = (
  tests: Record<AIAnswerPlatform, AIAnswerTestState>,
) =>
  Object.values(tests).flatMap((test) => test.observations).filter(
    (observation) =>
      observation.operatorReviewed &&
      observation.evidenceMode === 'consumer_observation',
  ).length

export interface AIVisibilityEvidenceSummary {
  statusLabel:
    | 'AI Presence not tested'
    | 'Reviewed manual AI Presence evidence'
    | 'AI/GEO readiness assessed'
    | 'AI/GEO readiness unable to verify'
  reviewedObservationCount: number
  recordedObservationCount: number
}

export const summarizeAIVisibilityEvidence = (
  tests: Record<AIAnswerPlatform, AIAnswerTestState>,
  profile: BusinessProfile,
): AIVisibilityEvidenceSummary => {
  const reviewedObservationCount = reviewedAIPresenceObservationCount(tests)
  const recordedObservationCount = Object.values(tests).reduce(
    (count, test) => count + test.observations.length,
    0,
  )
  if (reviewedObservationCount) {
    return { statusLabel: 'Reviewed manual AI Presence evidence', reviewedObservationCount, recordedObservationCount }
  }
  const hasReadinessFacts = Boolean(
    profile.businessName || profile.website || profile.primaryCategory || profile.primaryServices,
  )
  return {
    statusLabel: hasReadinessFacts
      ? 'AI/GEO readiness assessed'
      : recordedObservationCount
        ? 'AI Presence not tested'
        : 'AI/GEO readiness unable to verify',
    reviewedObservationCount,
    recordedObservationCount,
  }
}
