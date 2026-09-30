import type {
  BusinessProfile,
  BusinessProfileState,
  RetainedGoogleAutomaticVerification,
  SearchDestinationObservation,
} from '../types/audit'
import {
  BRAND_PRESENCE_EVIDENCE_FRESHNESS_DAYS,
  BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS,
  brandPresenceBusinessIdentityKey,
  buildRetainedBrandAutomaticVerification,
  retainedBrandAutomaticVerificationIsCurrent,
} from './brandPresenceAcquisitionResilience'

export const GOOGLE_BRAND_EVIDENCE_FRESHNESS_DAYS = BRAND_PRESENCE_EVIDENCE_FRESHNESS_DAYS
export const GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS = BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS

export type GoogleAutomaticIdentityState = 'verified' | 'verified_recent' | 'conflict' | 'verification_needed' | 'unavailable'

export const googleBrandBusinessIdentityKey = brandPresenceBusinessIdentityKey

export function googleObservationIsAutomaticallyVerified(observation: SearchDestinationObservation) {
  const assessment = observation.automation?.assessment
  return Boolean(
    observation.destination === 'Google Search' &&
    assessment?.googleIdentityDecision?.decision === 'verified' &&
    assessment.automaticObservation === true &&
    assessment.operatorReviewRequired === false &&
    assessment.visibilityResult === 'found' &&
    assessment.blocker === 'none',
  )
}

export function buildRetainedGoogleAutomaticVerification(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  sourceProfileReviewKey?: string,
): RetainedGoogleAutomaticVerification | undefined {
  return buildRetainedBrandAutomaticVerification(
    observation,
    profile,
    profileState,
    sourceProfileReviewKey,
    googleObservationIsAutomaticallyVerified,
  )
}

export function retainedGoogleAutomaticVerificationIsCurrent(
  retained: RetainedGoogleAutomaticVerification | undefined,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
) {
  return retainedBrandAutomaticVerificationIsCurrent(
    retained,
    'Google Search',
    profile,
    profileState,
    googleObservationIsAutomaticallyVerified,
    now,
  )
}

export function effectiveGoogleAutomaticIdentityState(
  observation: SearchDestinationObservation,
  context: { profile?: BusinessProfile; profileState?: BusinessProfileState; now?: number } = {},
): GoogleAutomaticIdentityState | undefined {
  if (observation.destination !== 'Google Search') return undefined
  const assessment = observation.automation?.assessment
  if (!assessment) return undefined
  if (googleObservationIsAutomaticallyVerified(observation)) return 'verified'
  const conflictBlocker = assessment.blocker === 'identifier_conflict' || assessment.blocker === 'multiple_entities'
  if (
    assessment.googleIdentityDecision?.decision === 'review_required' && (
      assessment.googleIdentityDecision.conflictingSignals.length > 0 || conflictBlocker
    ) || !assessment.googleIdentityDecision && !assessment.automaticObservation && conflictBlocker
  ) return 'conflict'
  if (assessment.visibilityResult === 'unavailable') {
    return retainedGoogleAutomaticVerificationIsCurrent(
      observation.retainedGoogleVerification,
      context.profile,
      context.profileState,
      context.now,
    ) ? 'verified_recent' : 'unavailable'
  }
  return 'verification_needed'
}
