import type {
  BusinessProfile,
  BusinessProfileState,
  RetainedGoogleAutomaticVerification,
  SearchDestinationObservation,
} from '../types/audit'
import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import { normalizedEntityField, reviewedProfileValue } from './entityMatcher'

export const GOOGLE_BRAND_EVIDENCE_FRESHNESS_DAYS = 7
export const GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS = GOOGLE_BRAND_EVIDENCE_FRESHNESS_DAYS * 24 * 60 * 60 * 1000

export type GoogleAutomaticIdentityState = 'verified' | 'verified_recent' | 'conflict' | 'verification_needed' | 'unavailable'

export function googleBrandBusinessIdentityKey(profile: BusinessProfile, profileState: BusinessProfileState) {
  const value = (field: keyof BusinessProfile) => reviewedProfileValue(profile, profileState, field)
  return evidenceFingerprint({
    version: 'found-local-google-brand-identity-v1',
    name: normalizedEntityField('name', value('businessName')),
    website: normalizedEntityField('website', value('website')),
    streetAddress: normalizedEntityField('streetAddress', value('streetAddress')),
    locality: normalizedEntityField('locality', value('city')),
    region: normalizedEntityField('region', value('state')),
    postalCode: normalizedEntityField('postalCode', value('zip')),
    phone: normalizedEntityField('phone', value('phone')),
  })
}

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
  if (!googleObservationIsAutomaticallyVerified(observation) || !observation.automation ||
    !observation.automation.captures.some((capture) => capture.outcome === 'success')) return undefined
  const identityKey = googleBrandBusinessIdentityKey(profile, profileState)
  const sourceIdentityMatches = observation.automation.businessIdentityKey
    ? observation.automation.businessIdentityKey === identityKey
    : Boolean(sourceProfileReviewKey && matchesEvidenceFingerprint(sourceProfileReviewKey, profileState))
  if (!sourceIdentityMatches) return undefined
  const verifiedAt = observation.observedAt || observation.automation.captures.findLast((capture) => capture.outcome === 'success')?.acquiredAt || ''
  if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) return undefined
  return {
    version: 1,
    provenance: 'retained_automatic_verification',
    businessIdentityKey: identityKey,
    verifiedAt: new Date(verifiedAt).toISOString(),
    sourceRunId: observation.automation.runId,
    ...(observation.observedResultUrl ? { observedResultUrl: observation.observedResultUrl } : {}),
    ...(observation.canonicalProfileUrl ? { canonicalProfileUrl: observation.canonicalProfileUrl } : {}),
    observedResultTypes: [...observation.observedResultTypes],
    evidenceNotes: observation.evidenceNotes,
    confidence: observation.confidence,
    evidenceKind: observation.evidenceKind,
    automation: structuredClone(observation.automation),
  }
}

export function retainedGoogleAutomaticVerificationIsCurrent(
  retained: RetainedGoogleAutomaticVerification | undefined,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
) {
  if (!retained || !profile || !profileState) return false
  const verifiedAt = Date.parse(retained.verifiedAt)
  const age = now - verifiedAt
  return Number.isFinite(verifiedAt) && age >= 0 && age <= GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS &&
    retained.businessIdentityKey === googleBrandBusinessIdentityKey(profile, profileState) &&
    retained.automation.captures.some((capture) => capture.outcome === 'success') &&
    googleObservationIsAutomaticallyVerified({
      destination: 'Google Search',
      query: '', verificationUrl: '', overallResult: 'found_match', observedResultTypes: retained.observedResultTypes,
      observedAt: retained.verifiedAt, confidence: retained.confidence, evidenceNotes: retained.evidenceNotes,
      evidenceKind: retained.evidenceKind, competitorsObserved: '', recommendedAction: '', provenance: 'automated_acquisition',
      reviewed: false, automation: retained.automation,
    })
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
