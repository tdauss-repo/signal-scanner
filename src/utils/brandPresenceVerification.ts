import type {
  AuditState,
  BrandPresenceMismatch,
  BrandPresenceOperatorVerification,
  BrandPresenceVerificationOutcome,
  BusinessProfile,
  BusinessProfileState,
  FixItem,
  SearchDestinationObservation,
} from '../types/audit'
import type { EntityMatch } from '../types/entityMatch'
import { evidenceFingerprint } from './evidenceFingerprint'
import { reviewedProfileValue } from './entityMatcher'
import { canonicalProfileUrlForDestination } from './searchVisibility'

export interface ExpectedBrandPresenceIdentity {
  businessName: string
  categories: string[]
  streetAddress: string
  locality: string
  phone: string
  website: string
}

export const brandPresenceMismatchLabels: Record<BrandPresenceMismatch, string> = {
  business_name: 'Business name',
  address: 'Address',
  phone: 'Phone',
  website: 'Website',
  category: 'Category / business type',
  duplicate_conflicting_listing: 'Duplicate / conflicting listing',
  other: 'Other',
}

export const brandPresenceOutcomeLabels: Record<BrandPresenceVerificationOutcome, string> = {
  found_correct: 'Found — looks correct',
  found_correction_needed: 'Found — correction needed',
  not_found: 'Not found',
  unable_to_determine: 'Unable to determine',
}

const splitList = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)

/** Only current operator-reviewed/owner-confirmed Business Profile facts are shown. */
export function expectedBrandPresenceIdentity(
  profile: BusinessProfile,
  profileState: BusinessProfileState,
): ExpectedBrandPresenceIdentity {
  const value = (field: Parameters<typeof reviewedProfileValue>[2]) => reviewedProfileValue(profile, profileState, field)
  const categories = [value('primaryCategory'), ...splitList(value('secondaryCategories'))]
    .filter((item, index, all) => item && all.indexOf(item) === index)
  return {
    businessName: value('businessName'),
    categories,
    streetAddress: value('streetAddress'),
    locality: [value('city'), value('state')].filter(Boolean).join(', ') + (value('zip') ? ` ${value('zip')}` : ''),
    phone: value('phone'),
    website: value('website'),
  }
}

const materialMatch = (match: EntityMatch) => ({
  candidate: {
    kind: match.candidate.kind,
    sourceType: match.candidate.sourceType,
    resultUrl: match.candidate.resultUrl,
    fields: match.candidate.fields,
    schemaTypes: match.candidate.schemaTypes,
  },
  matchedFields: match.matchedFields,
  conflictingFields: match.conflictingFields,
  missingFields: match.missingFields,
  unreviewedProfileFields: match.unreviewedProfileFields,
  confidence: match.confidence,
  automaticObservation: match.automaticObservation,
  ambiguityReasons: match.ambiguityReasons,
})

/**
 * Material identity excludes runs, times, providers, captures and inspected
 * request URLs. Those facts remain in raw acquisition evidence but do not make
 * a human decision stale by themselves.
 */
export function brandPresenceVerificationEvidenceKey(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
) {
  const assessment = observation.automation?.assessment
  return evidenceFingerprint({
    version: 'found-local-brand-presence-review-v1',
    destination: observation.destination,
    query: observation.query,
    observedResultUrl: observation.observedResultUrl,
    canonicalProfileUrl: observation.canonicalProfileUrl,
    observedResultTypes: observation.observedResultTypes,
    evidenceKind: observation.evidenceKind,
    identity: expectedBrandPresenceIdentity(profile, profileState),
    automation: assessment?.automaticObservation ? {
      queryMode: observation.automation?.queryMode,
      visibilityResult: assessment.visibilityResult,
      automaticObservation: assessment.automaticObservation,
      operatorReviewRequired: assessment.operatorReviewRequired,
      resultRegionInspected: assessment.resultRegionInspected,
      confidence: assessment.confidence,
      blocker: assessment.blocker,
      ambiguityReasons: assessment.ambiguityReasons,
      googleIdentityDecision: assessment.googleIdentityDecision,
      selected: assessment.selected ? materialMatch(assessment.selected) : undefined,
      matches: assessment.matches.map(materialMatch),
    } : !assessment ? {
      overallResult: observation.overallResult,
      confidence: observation.confidence,
    } : undefined,
  })
}

const publicHttpUrl = (value: string) => {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

export interface BrandPresenceVerificationInput {
  outcome: BrandPresenceVerificationOutcome
  mismatches?: BrandPresenceMismatch[]
  operatorObservedUrl?: string
  note?: string
  reviewedAt?: string
}

export type BrandPresenceVerificationBuildResult =
  | { ok: true; verification: BrandPresenceOperatorVerification }
  | { ok: false; error: string }

export function buildBrandPresenceVerification(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  input: BrandPresenceVerificationInput,
): BrandPresenceVerificationBuildResult {
  const note = input.note?.trim() || ''
  const mismatches = Array.from(new Set(input.mismatches || []))
  if (input.outcome === 'found_correction_needed' && !mismatches.length && !note) {
    return { ok: false, error: 'Select at least one mismatch or add a short operator note.' }
  }
  if (mismatches.includes('other') && !note) {
    return { ok: false, error: 'Add a short note describing the other mismatch.' }
  }
  const suppliedUrl = input.operatorObservedUrl?.trim() || ''
  const operatorObservedUrl = publicHttpUrl(suppliedUrl)
  if (suppliedUrl && !operatorObservedUrl) return { ok: false, error: 'Observed URL must be a public http or https URL.' }
  const reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : new Date()
  const safeReviewedAt = Number.isNaN(reviewedAt.getTime()) ? new Date().toISOString() : reviewedAt.toISOString()
  const classifiedCanonicalProfileUrl = operatorObservedUrl
    ? canonicalProfileUrlForDestination(observation.destination, operatorObservedUrl)
    : undefined
  return { ok: true, verification: {
    version: 1,
    destination: observation.destination,
    evidenceKey: brandPresenceVerificationEvidenceKey(observation, profile, profileState),
    outcome: input.outcome,
    reviewedAt: safeReviewedAt,
    provenance: 'operator_verified',
    ...(operatorObservedUrl ? { operatorObservedUrl } : {}),
    ...(classifiedCanonicalProfileUrl ? { classifiedCanonicalProfileUrl } : {}),
    mismatches,
    note,
  } }
}

export function currentBrandPresenceVerification(
  observation: SearchDestinationObservation,
  profile?: BusinessProfile,
  profileState?: BusinessProfileState,
) {
  const verification = observation.operatorVerification
  if (!verification || !profile || !profileState || verification.destination !== observation.destination || verification.provenance !== 'operator_verified') return undefined
  return verification.evidenceKey === brandPresenceVerificationEvidenceKey(observation, profile, profileState) ? verification : undefined
}

export function brandPresenceVerificationIsStale(
  observation: SearchDestinationObservation,
  profile?: BusinessProfile,
  profileState?: BusinessProfileState,
) {
  return Boolean(observation.operatorVerification && !currentBrandPresenceVerification(observation, profile, profileState))
}

const findingId = (queryId: string, destination: string) =>
  `brand-presence:${queryId}:${destination.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

/** Current negative operator decisions become Review candidates, never approvals. */
export function deriveBrandPresenceFindings(state: AuditState): FixItem[] {
  return Object.entries(state.searchDestinationObservations).flatMap(([queryId, destinations]) =>
    Object.values(destinations).flatMap((observation) => {
      if (!observation) return []
      const verification = currentBrandPresenceVerification(observation, state.profile, state.businessProfile)
      if (!verification || !['found_correction_needed', 'not_found'].includes(verification.outcome)) return []
      const correction = verification.outcome === 'found_correction_needed'
      const mismatchLabels = verification.mismatches.map((item) => brandPresenceMismatchLabels[item])
      const detail = mismatchLabels.length ? mismatchLabels.join(', ') : 'business information'
      const issue = correction
        ? `${observation.destination} business information may need correction`
        : `${observation.destination} presence was not found during operator verification`
      const whyItMatters = correction
        ? `The ${observation.destination} result reviewed for the business differs from the reviewed business information for: ${detail}.`
        : `An operator checked ${observation.destination} for the reviewed business and did not find a matching presence.`
      return [{
        id: findingId(queryId, observation.destination),
        priority: 'Medium',
        area: 'Public Presence',
        issue,
        fix: correction
          ? `Review and correct the identified ${observation.destination} business information.`
          : `Confirm whether a suitable ${observation.destination} presence should be created or claimed.`,
        status: correction ? 'partial' : 'fail',
        evidenceNote: [
          `Operator verification: ${verification.outcome}.`,
          mismatchLabels.length ? `Mismatches: ${mismatchLabels.join(', ')}.` : '',
          verification.operatorObservedUrl ? `Observed URL: ${verification.operatorObservedUrl}` : '',
          verification.note ? `Operator note: ${verification.note}` : '',
        ].filter(Boolean).join(' '),
        evidenceConfidence: 'operator_observation',
        evidenceSummary: whyItMatters,
        evidenceSources: verification.operatorObservedUrl ? [verification.operatorObservedUrl] : [],
        salesConfidence: 'confirmed',
        impact: 'medium',
        salesEffort: 'medium',
        salesPackageFit: 'owner_action',
        dependencies: ['Business owner or platform account access may be required.'],
        verificationMethod: `Recheck ${observation.destination} against the reviewed Business Profile after the change.`,
        sourceArea: 'public_presence',
        platform: observation.destination,
        whyItMatters,
        reviewed: false,
      } satisfies FixItem]
    }),
  )
}
