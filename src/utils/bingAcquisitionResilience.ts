import type {
  BusinessProfile,
  BusinessProfileState,
  RetainedBingAutomaticVerification,
  SearchDestinationObservation,
} from '../types/audit'
import {
  BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS,
  brandPresenceBusinessIdentityKey,
} from './brandPresenceAcquisitionResilience'
import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'

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
  const automation = observation.automation
  const assessment = automation?.assessment
  const identityDecision = assessment?.bingIdentityDecision
  if (!automation || !assessment || !identityDecision || !bingObservationIsAutomaticallyVerified(observation) ||
    !automation.captures.some((capture) => capture.outcome === 'success')) return undefined
  const businessIdentityKey = brandPresenceBusinessIdentityKey(profile, profileState)
  const sourceIdentityMatches = automation.businessIdentityKey
    ? automation.businessIdentityKey === businessIdentityKey
    : Boolean(sourceProfileReviewKey && matchesEvidenceFingerprint(sourceProfileReviewKey, profileState))
  if (!sourceIdentityMatches) return undefined
  const verifiedAt = observation.observedAt || automation.captures.findLast((capture) => capture.outcome === 'success')?.acquiredAt || ''
  if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) return undefined
  const compactAssessment = {
    ...structuredClone(assessment),
    matches: assessment.matches.slice(0, 20).map((match) => ({
      ...structuredClone(match),
      candidate: { ...structuredClone(match.candidate), evidence: [] },
      evidence: [],
    })),
    ...(assessment.selected ? {
      selected: {
        ...structuredClone(assessment.selected),
        candidate: { ...structuredClone(assessment.selected.candidate), evidence: [] },
        evidence: [],
      },
    } : {}),
  }
  const material = {
    version: 1 as const,
    destination: 'Bing Search' as const,
    provenance: 'retained_automatic_verification' as const,
    verificationState: 'automatic_verified' as const,
    businessIdentityKey,
    verifiedAt: new Date(verifiedAt).toISOString(),
    sourceRunId: automation.runId,
    ...(observation.observedResultUrl ? { observedResultUrl: observation.observedResultUrl } : {}),
    ...(observation.canonicalProfileUrl ? { canonicalProfileUrl: observation.canonicalProfileUrl } : {}),
    observedResultTypes: [...observation.observedResultTypes],
    evidenceNotes: observation.evidenceNotes.slice(0, 12000),
    confidence: observation.confidence,
    evidenceKind: observation.evidenceKind,
    queryMode: 'brand' as const,
    assessment: compactAssessment,
    identityDecision: structuredClone(identityDecision),
  }
  return { ...material, evidenceFingerprint: evidenceFingerprint(material) }
}

export function retainedBingAutomaticVerificationIsCurrent(
  retained: RetainedBingAutomaticVerification | undefined,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
) {
  if (!retained || !profile || !profileState) return false
  if (!('identityDecision' in retained) || !retained.identityDecision || !('assessment' in retained) ||
    !retained.assessment || !('evidenceFingerprint' in retained)) return false
  const verifiedAt = Date.parse(retained.verifiedAt)
  const age = now - verifiedAt
  const { evidenceFingerprint: storedFingerprint, ...material } = retained
  return retained.destination === 'Bing Search' &&
    retained.verificationState === 'automatic_verified' &&
    retained.queryMode === 'brand' &&
    retained.identityDecision.decision === 'verified' &&
    retained.identityDecision.conflictingSignals.length === 0 &&
    retained.assessment.automaticObservation === true &&
    retained.assessment.operatorReviewRequired === false &&
    retained.assessment.visibilityResult === 'found' &&
    retained.assessment.blocker === 'none' &&
    Number.isFinite(verifiedAt) && age >= 0 && age <= BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS &&
    retained.businessIdentityKey === brandPresenceBusinessIdentityKey(profile, profileState) &&
    storedFingerprint === evidenceFingerprint(material)
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
