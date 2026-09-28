import type { BusinessProfile, BusinessProfileState, SearchDestinationObservation } from '../types/audit'
import type { EntityField, EntityMatch, FieldComparison, SearchEntityAssessment } from '../types/entityMatch'
import { evidenceFingerprint } from './evidenceFingerprint'
import {
  GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS,
  effectiveGoogleAutomaticIdentityState,
  googleBrandBusinessIdentityKey,
} from './googleAcquisitionResilience'
import { normalizedEntityField } from './entityMatcher'
import { canonicalProfileUrlForDestination } from './searchVisibility'

export interface DerivedGoogleMapsVerification {
  version: 1
  provenance: 'derived_from_google_search'
  freshness: 'fresh' | 'recent'
  verifiedAt: string
  sourceRunId: string
  sourceCandidateId: string
  sourceType: 'knowledge_panel' | 'local_place'
  businessIdentityKey: string
  canonicalProfileUrl?: string
  placeIdentity?: string
  matchedSignals: FieldComparison[]
  evidenceKey: string
}

const additionalIdentityFields = new Set<EntityField>(['phone', 'address', 'streetAddress', 'website'])
const materialConflictFields = new Set<EntityField>([
  'name', 'phone', 'address', 'streetAddress', 'locality', 'region', 'postalCode', 'website',
])

const successfulAcquisitionTime = (observation: SearchDestinationObservation) => {
  const values = observation.automation?.captures
    .filter((capture) => capture.outcome === 'success' && !Number.isNaN(Date.parse(capture.acquiredAt)))
    .map((capture) => Date.parse(capture.acquiredAt)) || []
  return values.length ? new Date(Math.max(...values)).toISOString() : undefined
}

const normalizeGoogleMapsUrl = (value: string | undefined) => {
  const canonical = canonicalProfileUrlForDestination('Google Maps', value)
  if (!canonical) return undefined
  const url = new URL(canonical)
  url.hash = ''
  for (const parameter of ['authuser', 'entry', 'g_ep', 'ved', 'source', 'hl', 'gl']) url.searchParams.delete(parameter)
  return url.toString()
}

const materialSignal = (signal: FieldComparison) => ({
  field: signal.field,
  expected: normalizedEntityField(signal.field, signal.expected),
  observed: normalizedEntityField(signal.field, signal.observed),
})

const mapsEntityKey = (match: EntityMatch) => {
  const placeIdentity = match.candidate.fields.placeIdentity?.trim()
  const canonicalProfileUrl = normalizeGoogleMapsUrl(match.candidate.fields.publicProfileUrl)
  return placeIdentity ? `place:${placeIdentity}` : canonicalProfileUrl ? `url:${canonicalProfileUrl}` : ''
}

const plausibleMapsEntity = (match: EntityMatch) => {
  const sourceType = match.candidate.sourceType
  const matched = new Set(match.matchedFields.map((signal) => signal.field))
  return Boolean(
    (sourceType === 'knowledge_panel' || sourceType === 'local_place') &&
    mapsEntityKey(match) && matched.has('name'),
  )
}

const qualifyingMapsEntity = (match: EntityMatch) => {
  const matched = new Set(match.matchedFields.map((signal) => signal.field))
  return plausibleMapsEntity(match) &&
    [...additionalIdentityFields].some((field) => matched.has(field)) &&
    !match.conflictingFields.some((signal) => materialConflictFields.has(signal.field)) &&
    !match.ambiguityReasons.some((reason) => /multiple plausible|conflict/i.test(reason))
}

interface GoogleMapsDerivationSource {
  assessment: SearchEntityAssessment
  freshness: DerivedGoogleMapsVerification['freshness']
  verifiedAt: string
  sourceRunId: string
  businessIdentityKey: string
}

const derivationSource = (
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  now: number,
): GoogleMapsDerivationSource | undefined => {
  const state = effectiveGoogleAutomaticIdentityState(observation, { profile, profileState, now })
  const identityKey = googleBrandBusinessIdentityKey(profile, profileState)
  if (state === 'verified') {
    const automation = observation.automation
    const verifiedAt = successfulAcquisitionTime(observation)
    if (!automation?.assessment || automation.businessIdentityKey !== identityKey || !verifiedAt) return undefined
    const age = now - Date.parse(verifiedAt)
    if (age < 0 || age > GOOGLE_BRAND_EVIDENCE_FRESHNESS_MS) return undefined
    return { assessment: automation.assessment, freshness: 'fresh', verifiedAt, sourceRunId: automation.runId, businessIdentityKey: identityKey }
  }
  if (state === 'verified_recent') {
    const retained = observation.retainedGoogleVerification
    if (!retained?.automation.assessment || retained.businessIdentityKey !== identityKey) return undefined
    return {
      assessment: retained.automation.assessment,
      freshness: 'recent',
      verifiedAt: retained.verifiedAt,
      sourceRunId: retained.sourceRunId,
      businessIdentityKey: identityKey,
    }
  }
  return undefined
}

/**
 * Projects a Maps-presence fact from an already verified Google Search entity.
 * The Search assessment remains the sole raw evidence record.
 */
export function deriveGoogleMapsVerification(
  googleSearchObservation: SearchDestinationObservation | undefined,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
): DerivedGoogleMapsVerification | undefined {
  if (!googleSearchObservation || googleSearchObservation.destination !== 'Google Search' || !profile || !profileState) return undefined
  const source = derivationSource(googleSearchObservation, profile, profileState, now)
  if (!source || source.assessment.googleIdentityDecision?.decision !== 'verified' || source.assessment.googleIdentityDecision.conflictingSignals.length) return undefined

  const plausible = source.assessment.matches.filter(plausibleMapsEntity)
  const distinctEntities = new Set(plausible.map(mapsEntityKey))
  if (distinctEntities.size !== 1) return undefined
  const match = plausible.find(qualifyingMapsEntity)
  if (!match) return undefined

  const canonicalProfileUrl = normalizeGoogleMapsUrl(match.candidate.fields.publicProfileUrl)
  const placeIdentity = match.candidate.fields.placeIdentity?.trim()
  const matchedSignals = match.matchedFields.filter((signal) => signal.field === 'name' || additionalIdentityFields.has(signal.field))
  const material = {
    version: 'found-local-google-maps-derived-v1',
    businessIdentityKey: source.businessIdentityKey,
    sourceType: match.candidate.sourceType,
    canonicalProfileUrl,
    placeIdentity,
    matchedSignals: matchedSignals.map(materialSignal),
  }
  return {
    version: 1,
    provenance: 'derived_from_google_search',
    freshness: source.freshness,
    verifiedAt: source.verifiedAt,
    sourceRunId: source.sourceRunId,
    sourceCandidateId: match.candidate.id,
    sourceType: match.candidate.sourceType as 'knowledge_panel' | 'local_place',
    businessIdentityKey: source.businessIdentityKey,
    ...(canonicalProfileUrl ? { canonicalProfileUrl } : {}),
    ...(placeIdentity ? { placeIdentity } : {}),
    matchedSignals,
    evidenceKey: evidenceFingerprint(material),
  }
}

export function directGoogleMapsEvidenceConflicts(observation: SearchDestinationObservation) {
  if (observation.destination !== 'Google Maps') return false
  if (observation.overallResult === 'found_conflicting_information' && observation.reviewed) return true
  const assessment = observation.automation?.assessment
  if (!assessment || assessment.visibilityResult === 'unavailable') return false
  return assessment.blocker === 'identifier_conflict' || assessment.blocker === 'multiple_entities' ||
    assessment.matches.some((match) => match.conflictingFields.some((signal) => materialConflictFields.has(signal.field)))
}
