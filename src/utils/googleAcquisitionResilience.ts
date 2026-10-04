import type {
  BusinessProfile,
  BusinessProfileState,
  RetainedBrandPresenceVerification,
  SearchDestinationObservation,
} from '../types/audit'
import {
  BRAND_PRESENCE_EVIDENCE_FRESHNESS_DAYS,
  BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS,
  brandPresenceBusinessIdentityKey,
} from './brandPresenceAcquisitionResilience'
import {
  brandPresenceObservationIsAutomaticallyVerified,
  buildRetainedBrandPresenceVerification,
  effectiveBrandPresenceAutomaticIdentityState,
  retainedBrandPresenceVerificationIsCurrent,
  type BrandPresenceAutomaticIdentityState,
} from './brandPresenceWorkspaceRetention'

export const GOOGLE_BRAND_EVIDENCE_FRESHNESS_DAYS = BRAND_PRESENCE_EVIDENCE_FRESHNESS_DAYS
export const GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS = BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS

export type GoogleAutomaticIdentityState = BrandPresenceAutomaticIdentityState

export const googleBrandBusinessIdentityKey = brandPresenceBusinessIdentityKey

export function googleObservationIsAutomaticallyVerified(observation: SearchDestinationObservation) {
  return observation.destination === 'Google Search' && brandPresenceObservationIsAutomaticallyVerified(observation)
}

export function buildRetainedGoogleAutomaticVerification(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  sourceProfileReviewKey?: string,
): RetainedBrandPresenceVerification | undefined {
  return buildRetainedBrandPresenceVerification(observation, profile, profileState, sourceProfileReviewKey)
}

export function retainedGoogleAutomaticVerificationIsCurrent(
  retained: RetainedBrandPresenceVerification | undefined,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
) {
  return retainedBrandPresenceVerificationIsCurrent(retained, 'Google Search', profile, profileState, now)
}

export function effectiveGoogleAutomaticIdentityState(
  observation: SearchDestinationObservation,
  context: { profile?: BusinessProfile; profileState?: BusinessProfileState; now?: number } = {},
): GoogleAutomaticIdentityState | undefined {
  return observation.destination === 'Google Search'
    ? effectiveBrandPresenceAutomaticIdentityState(observation, context) : undefined
}
