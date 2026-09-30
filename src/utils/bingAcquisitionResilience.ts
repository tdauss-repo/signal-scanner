import type {
  BusinessProfile,
  BusinessProfileState,
  RetainedBingAutomaticVerification,
  SearchDestinationObservation,
} from '../types/audit'
import {
  buildRetainedBrandAutomaticVerification,
  retainedBrandAutomaticVerificationIsCurrent,
} from './brandPresenceAcquisitionResilience'

export type BingAutomaticIdentityState = 'verified' | 'verified_recent' | 'conflict' | 'verification_needed' | 'unavailable'

export function bingObservationIsAutomaticallyVerified(observation: SearchDestinationObservation) {
  const assessment = observation.automation?.assessment
  return Boolean(
    observation.destination === 'Bing Search' &&
    observation.automation?.queryMode === 'brand' &&
    assessment?.bingIdentityDecision?.decision === 'verified' &&
    assessment.automaticObservation === true &&
    assessment.operatorReviewRequired === false &&
    assessment.visibilityResult === 'found' &&
    assessment.blocker === 'none',
  )
}

export function bingRefreshCanRetainRecentVerification(observation: SearchDestinationObservation) {
  const assessment = observation.automation?.assessment
  return Boolean(
    observation.destination === 'Bing Search' &&
    observation.automation?.queryMode === 'brand' && (
      assessment?.visibilityResult === 'unavailable' ||
      assessment?.visibilityResult === 'review_required' && assessment.blocker === 'no_match'
    ),
  )
}

export function buildRetainedBingAutomaticVerification(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  sourceProfileReviewKey?: string,
): RetainedBingAutomaticVerification | undefined {
  if (observation.operatorVerification?.outcome === 'found_correction_needed') return undefined
  return buildRetainedBrandAutomaticVerification(
    observation,
    profile,
    profileState,
    sourceProfileReviewKey,
    bingObservationIsAutomaticallyVerified,
  )
}

export function retainedBingAutomaticVerificationIsCurrent(
  retained: RetainedBingAutomaticVerification | undefined,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
) {
  return retainedBrandAutomaticVerificationIsCurrent(
    retained,
    'Bing Search',
    profile,
    profileState,
    bingObservationIsAutomaticallyVerified,
    now,
  )
}

export function effectiveBingAutomaticIdentityState(
  observation: SearchDestinationObservation,
  context: { profile?: BusinessProfile; profileState?: BusinessProfileState; now?: number } = {},
): BingAutomaticIdentityState | undefined {
  if (observation.destination !== 'Bing Search' || observation.automation?.queryMode !== 'brand') return undefined
  const assessment = observation.automation.assessment
  if (!assessment) return undefined
  if (observation.operatorVerification?.outcome === 'found_correction_needed') return 'verification_needed'
  if (bingObservationIsAutomaticallyVerified(observation)) return 'verified'
  const conflictBlocker = assessment.blocker === 'identifier_conflict' || assessment.blocker === 'multiple_entities'
  if (
    assessment.bingIdentityDecision?.decision === 'review_required' && (
      assessment.bingIdentityDecision.conflictingSignals.length > 0 || conflictBlocker
    ) || !assessment.bingIdentityDecision && !assessment.automaticObservation && conflictBlocker
  ) return 'conflict'
  if (bingRefreshCanRetainRecentVerification(observation)) {
    return retainedBingAutomaticVerificationIsCurrent(
      observation.retainedBingVerification,
      context.profile,
      context.profileState,
      context.now,
    ) ? 'verified_recent' : assessment.visibilityResult === 'unavailable' ? 'unavailable' : 'verification_needed'
  }
  return assessment.visibilityResult === 'unavailable' ? 'unavailable' : 'verification_needed'
}
