import type {
  BusinessProfile,
  BusinessProfileState,
  RetainedBrandAutomaticVerification,
  SearchDestination,
  SearchDestinationObservation,
} from '../types/audit'
import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import { normalizedEntityField, reviewedProfileValue } from './entityMatcher'

export const BRAND_PRESENCE_EVIDENCE_FRESHNESS_DAYS = 7
export const BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS = BRAND_PRESENCE_EVIDENCE_FRESHNESS_DAYS * 24 * 60 * 60 * 1000

/**
 * Shared material identity key for retained Brand Presence evidence. The
 * fingerprint version intentionally remains unchanged for saved Google
 * workspace compatibility.
 */
export function brandPresenceBusinessIdentityKey(profile: BusinessProfile, profileState: BusinessProfileState) {
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

export function buildRetainedBrandAutomaticVerification(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  sourceProfileReviewKey: string | undefined,
  isAutomaticallyVerified: (observation: SearchDestinationObservation) => boolean,
): RetainedBrandAutomaticVerification | undefined {
  if (!isAutomaticallyVerified(observation) || !observation.automation ||
    !observation.automation.captures.some((capture) => capture.outcome === 'success')) return undefined
  const identityKey = brandPresenceBusinessIdentityKey(profile, profileState)
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

export function retainedBrandAutomaticVerificationIsCurrent(
  retained: RetainedBrandAutomaticVerification | undefined,
  destination: SearchDestination,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  isAutomaticallyVerified: (observation: SearchDestinationObservation) => boolean,
  now = Date.now(),
) {
  if (!retained || !profile || !profileState) return false
  const verifiedAt = Date.parse(retained.verifiedAt)
  const age = now - verifiedAt
  if (!Number.isFinite(verifiedAt) || age < 0 || age > BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS ||
    retained.businessIdentityKey !== brandPresenceBusinessIdentityKey(profile, profileState) ||
    !retained.automation.captures.some((capture) => capture.outcome === 'success')) return false
  return isAutomaticallyVerified({
    destination,
    query: '',
    verificationUrl: '',
    overallResult: 'found_match',
    observedResultTypes: retained.observedResultTypes,
    observedAt: retained.verifiedAt,
    confidence: retained.confidence,
    evidenceNotes: retained.evidenceNotes,
    evidenceKind: retained.evidenceKind,
    competitorsObserved: '',
    recommendedAction: '',
    provenance: 'automated_acquisition',
    reviewed: false,
    automation: retained.automation,
  })
}
