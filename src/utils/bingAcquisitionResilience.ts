import type {
  BusinessProfile,
  BusinessProfileState,
  RetainedBrandPresenceVerification,
  SearchDestinationObservation,
} from '../types/audit'
import {
  brandPresenceObservationIsAutomaticallyVerified,
  brandPresenceRefreshCanRetainRecentVerification,
  buildRetainedBrandPresenceVerification,
  effectiveBrandPresenceAutomaticIdentityState,
  retainedBrandPresenceVerificationIsCurrent,
  type BrandPresenceAutomaticIdentityState,
} from './brandPresenceWorkspaceRetention'

export type BingAutomaticIdentityState = BrandPresenceAutomaticIdentityState

export function bingObservationIsAutomaticallyVerified(observation: SearchDestinationObservation) {
  return observation.destination === 'Bing Search' && brandPresenceObservationIsAutomaticallyVerified(observation)
}

export function bingRefreshCanRetainRecentVerification(observation: SearchDestinationObservation) {
  return observation.destination === 'Bing Search' && brandPresenceRefreshCanRetainRecentVerification(observation)
}

export function buildRetainedBingAutomaticVerification(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  sourceProfileReviewKey?: string,
): RetainedBrandPresenceVerification | undefined {
  return buildRetainedBrandPresenceVerification(observation, profile, profileState, sourceProfileReviewKey)
}

export function retainedBingAutomaticVerificationIsCurrent(
  retained: RetainedBrandPresenceVerification | undefined,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
) {
  return retainedBrandPresenceVerificationIsCurrent(retained, 'Bing Search', profile, profileState, now)
}

export function effectiveBingAutomaticIdentityState(
  observation: SearchDestinationObservation,
  context: { profile?: BusinessProfile; profileState?: BusinessProfileState; now?: number } = {},
): BingAutomaticIdentityState | undefined {
  return observation.destination === 'Bing Search'
    ? effectiveBrandPresenceAutomaticIdentityState(observation, context) : undefined
}
