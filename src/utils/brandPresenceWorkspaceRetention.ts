import type {
  AuditState,
  BrandPresenceRetainedKey,
  BusinessProfile,
  BusinessProfileField,
  BusinessProfileState,
  RetainedBrandAutomaticVerification,
  RetainedBrandPresenceDestination,
  RetainedBrandPresenceVerification,
  SearchDestinationObservation,
  SearchVisibilityObservedResultType,
} from '../types/audit'
import type { EntityField, GoogleIdentityDecision, SearchEntityAssessment } from '../types/entityMatch'
import type { VisibilityRun } from '../types/visibilityScan'
import { BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS, brandPresenceBusinessIdentityKey } from './brandPresenceAcquisitionResilience'
import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import { normalizedEntityField } from './entityMatcher'
import { defaultSearchDestinationObservation, verificationUrlFor } from './searchVisibility'
import { normalizeWorkspaceProfile } from './workspaceProfile'

export const retainedBrandPresenceDestinations: RetainedBrandPresenceDestination[] = [
  'Google Search', 'Google Maps', 'Bing Search', 'DuckDuckGo',
]

const retainedKeyByDestination: Record<RetainedBrandPresenceDestination, BrandPresenceRetainedKey> = {
  'Google Search': 'google_search',
  'Google Maps': 'google_maps',
  'Bing Search': 'bing_search',
  DuckDuckGo: 'duckduckgo',
}

export const brandPresenceRetainedKey = (destination: RetainedBrandPresenceDestination) => retainedKeyByDestination[destination]

export const isRetainedBrandPresenceDestination = (destination: string): destination is RetainedBrandPresenceDestination =>
  retainedBrandPresenceDestinations.includes(destination as RetainedBrandPresenceDestination)

const decisionForAssessment = (
  destination: RetainedBrandPresenceDestination,
  assessment: SearchEntityAssessment,
): GoogleIdentityDecision | undefined => {
  if (destination === 'Google Search') return assessment.googleIdentityDecision
  if (destination === 'Bing Search') return assessment.bingIdentityDecision
  if (destination === 'DuckDuckGo') return assessment.duckDuckGoIdentityDecision
  const selected = assessment.selected || assessment.matches[0]
  if (!selected) return undefined
  return {
    version: 1,
    decision: assessment.automaticObservation && assessment.visibilityResult === 'found' &&
      !assessment.operatorReviewRequired && assessment.blocker === 'none' ? 'verified' : 'review_required',
    matchedSignals: structuredClone(selected.matchedFields),
    conflictingSignals: structuredClone(selected.conflictingFields),
    candidateIds: [selected.candidate.id],
    sourceTypes: selected.candidate.sourceType ? [selected.candidate.sourceType] : [],
    rule: 'two_strong_identifiers_with_name_or_domain_no_conflict',
  }
}

export function brandPresenceObservationIsAutomaticallyVerified(observation: SearchDestinationObservation) {
  if (!isRetainedBrandPresenceDestination(observation.destination) || !observation.automation ||
    observation.automation.queryMode && observation.automation.queryMode !== 'brand') return false
  const assessment = observation.automation.assessment
  const decision = assessment && decisionForAssessment(observation.destination, assessment)
  return Boolean(
    assessment && decision?.decision === 'verified' && decision.conflictingSignals.length === 0 &&
    assessment.automaticObservation === true && assessment.operatorReviewRequired === false &&
    assessment.visibilityResult === 'found' && assessment.blocker === 'none',
  )
}

const materialConflictFields = new Set<EntityField>([
  'name', 'website', 'phone', 'address', 'streetAddress', 'locality', 'region', 'postalCode',
])
const identityMatchFields = new Set<EntityField>(['name', 'website', 'phone', 'address', 'streetAddress'])

const sameCanonicalEntity = (left: SearchEntityAssessment['matches'][number], right: SearchEntityAssessment['matches'][number]) => {
  const leftPlace = left.candidate.fields.placeIdentity?.trim()
  const rightPlace = right.candidate.fields.placeIdentity?.trim()
  if (leftPlace && rightPlace && leftPlace === rightPlace) return true
  const leftProfile = normalizedEntityField('publicProfileUrl', left.candidate.fields.publicProfileUrl || '')
  const rightProfile = normalizedEntityField('publicProfileUrl', right.candidate.fields.publicProfileUrl || '')
  return Boolean(leftProfile && rightProfile && leftProfile === rightProfile)
}

const canonicalEntityFieldsConflict = (left: SearchEntityAssessment['matches'][number], right: SearchEntityAssessment['matches'][number]) =>
  [...materialConflictFields].some((field) => {
    const leftValue = left.candidate.fields[field]
    const rightValue = right.candidate.fields[field]
    return Boolean(leftValue && rightValue && normalizedEntityField(field, leftValue) !== normalizedEntityField(field, rightValue))
  })

/**
 * Candidate-set ambiguity is not itself a contradiction. A hard conflict
 * requires a material mismatch on the selected reviewed identity, or two
 * representations of the same canonical entity that materially disagree.
 */
export function assessmentHasTrueMaterialIdentityConflict(assessment: SearchEntityAssessment | undefined) {
  if (!assessment) return false
  const decisions = [assessment.googleIdentityDecision, assessment.bingIdentityDecision, assessment.duckDuckGoIdentityDecision]
  if (decisions.some((decision) => decision?.conflictingSignals.some((signal) => materialConflictFields.has(signal.field)))) return true
  const selected = assessment.selected
  if (selected && selected.matchedFields.some((signal) => identityMatchFields.has(signal.field)) &&
    selected.conflictingFields.some((signal) => materialConflictFields.has(signal.field))) return true
  return assessment.matches.some((left, index) => assessment.matches.slice(index + 1).some((right) =>
    sameCanonicalEntity(left, right) && canonicalEntityFieldsConflict(left, right),
  ))
}

export function currentObservationInvalidatesRetainedVerification(observation: SearchDestinationObservation) {
  return observation.operatorVerification?.outcome === 'found_correction_needed' ||
    observation.operatorVerification?.outcome === 'not_found' ||
    observation.overallResult === 'found_conflicting_information' && observation.reviewed ||
    assessmentHasTrueMaterialIdentityConflict(observation.automation?.assessment)
}

export function brandPresenceRefreshCanRetainRecentVerification(observation: SearchDestinationObservation) {
  const assessment = observation.automation?.assessment
  return Boolean(
    isRetainedBrandPresenceDestination(observation.destination) &&
    observation.automation && (!observation.automation.queryMode || observation.automation.queryMode === 'brand') && assessment &&
    !brandPresenceObservationIsAutomaticallyVerified(observation) &&
    !currentObservationInvalidatesRetainedVerification(observation),
  )
}

const compactAssessment = (assessment: SearchEntityAssessment): SearchEntityAssessment => ({
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
})

export function buildRetainedBrandPresenceVerification(
  observation: SearchDestinationObservation,
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  sourceProfileReviewKey?: string,
): RetainedBrandPresenceVerification | undefined {
  if (!brandPresenceObservationIsAutomaticallyVerified(observation) || !isRetainedBrandPresenceDestination(observation.destination)) return undefined
  const automation = observation.automation!
  const assessment = automation.assessment!
  const identityDecision = decisionForAssessment(observation.destination, assessment)
  if (!identityDecision || !automation.captures.some((capture) => capture.outcome === 'success')) return undefined
  const businessIdentityKey = brandPresenceBusinessIdentityKey(profile, profileState)
  const sourceIdentityMatches = automation.businessIdentityKey
    ? automation.businessIdentityKey === businessIdentityKey
    : Boolean(sourceProfileReviewKey && matchesEvidenceFingerprint(sourceProfileReviewKey, profileState))
  if (!sourceIdentityMatches) return undefined
  const verifiedAt = observation.observedAt || automation.captures.findLast((capture) => capture.outcome === 'success')?.acquiredAt || ''
  if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) return undefined
  const material = {
    version: 1 as const,
    destination: observation.destination,
    provenance: 'retained_automatic_verification' as const,
    verificationState: 'automatic_verified' as const,
    verificationMethod: 'direct_automatic' as const,
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
    assessment: compactAssessment(assessment),
    identityDecision: structuredClone(identityDecision),
  }
  return { ...material, evidenceFingerprint: evidenceFingerprint(material) }
}

export function retainedBrandPresenceVerificationIsCurrent(
  retained: RetainedBrandPresenceVerification | undefined,
  destination: RetainedBrandPresenceDestination,
  profile: BusinessProfile | undefined,
  profileState: BusinessProfileState | undefined,
  now = Date.now(),
) {
  if (!retained || !profile || !profileState || !retained.assessment || !retained.identityDecision || !retained.evidenceFingerprint) return false
  const verifiedAt = Date.parse(retained.verifiedAt)
  const age = now - verifiedAt
  const { evidenceFingerprint: storedFingerprint, ...material } = retained
  return retained.destination === destination && retained.verificationState === 'automatic_verified' &&
    retained.verificationMethod === 'direct_automatic' && retained.queryMode === 'brand' &&
    retained.identityDecision.decision === 'verified' && retained.identityDecision.conflictingSignals.length === 0 &&
    retained.assessment.automaticObservation === true && retained.assessment.operatorReviewRequired === false &&
    retained.assessment.visibilityResult === 'found' && retained.assessment.blocker === 'none' &&
    Number.isFinite(verifiedAt) && age >= 0 && age <= BRAND_PRESENCE_EVIDENCE_FRESHNESS_MS &&
    retained.businessIdentityKey === brandPresenceBusinessIdentityKey(profile, profileState) &&
    storedFingerprint === evidenceFingerprint(material)
}

export type BrandPresenceAutomaticIdentityState = 'verified' | 'verified_recent' | 'conflict' | 'verification_needed' | 'unavailable'

export function effectiveBrandPresenceAutomaticIdentityState(
  observation: SearchDestinationObservation,
  context: { profile?: BusinessProfile; profileState?: BusinessProfileState; now?: number } = {},
): BrandPresenceAutomaticIdentityState | undefined {
  if (!isRetainedBrandPresenceDestination(observation.destination) || !observation.automation ||
    observation.automation.queryMode && observation.automation.queryMode !== 'brand') return undefined
  const assessment = observation.automation.assessment
  if (!assessment) return undefined
  if (brandPresenceObservationIsAutomaticallyVerified(observation)) return 'verified'
  if (currentObservationInvalidatesRetainedVerification(observation)) return 'conflict'
  if (brandPresenceRefreshCanRetainRecentVerification(observation) && retainedBrandPresenceVerificationIsCurrent(
    observation.retainedBrandVerification,
    observation.destination,
    context.profile,
    context.profileState,
    context.now,
  )) return 'verified_recent'
  return assessment.visibilityResult === 'unavailable' ? 'unavailable' : 'verification_needed'
}

const materialIdentityFields: BusinessProfileField[] = ['businessName', 'website', 'streetAddress', 'city', 'state', 'zip', 'phone']

const materialIdentityKeyFromRun = (run: VisibilityRun) => {
  try {
    const parsed = JSON.parse(run.profileKey) as Partial<BusinessProfile>
    if (!parsed || typeof parsed !== 'object') return undefined
    const profile = normalizeWorkspaceProfile(parsed)
    const profileState: BusinessProfileState = {
      schemaVersion: 1,
      values: Object.fromEntries(materialIdentityFields.map((field) => [field, {
        value: profile[field], source: 'persisted visibility run', status: 'operator_reviewed', confidence: 'high', recordedAt: run.startedAt,
      }])) as BusinessProfileState['values'],
    }
    return brandPresenceBusinessIdentityKey(profile, profileState)
  } catch {
    return undefined
  }
}

const runMatchesMaterialIdentity = (run: VisibilityRun, state: AuditState) => {
  const historicalIdentityKey = materialIdentityKeyFromRun(run)
  if (historicalIdentityKey) return historicalIdentityKey === brandPresenceBusinessIdentityKey(state.profile, state.businessProfile)
  return matchesEvidenceFingerprint(run.profileKey, state.profile) && Boolean(
    run.profileReviewKey && matchesEvidenceFingerprint(run.profileReviewKey, state.businessProfile),
  )
}

const observedTypesForAssessment = (assessment: SearchEntityAssessment): SearchVisibilityObservedResultType[] => {
  const selected = assessment.selected || assessment.matches[0]
  const types: SearchVisibilityObservedResultType[] = []
  if (selected?.matchedFields.some((field) => field.field === 'website')) types.push('official_website')
  else types.push('third_party_mention')
  for (const field of selected?.matchedFields || []) {
    if (field.field === 'name') types.push('business_name_correct')
    if (field.field === 'phone') types.push('phone_correct')
    if (field.field === 'website') types.push('website_correct')
    if (['streetAddress', 'address'].includes(field.field)) types.push('address_correct')
  }
  return [...new Set(types)]
}

const observationFromRun = (
  state: AuditState,
  run: VisibilityRun,
  destination: RetainedBrandPresenceDestination,
  checkId: string,
): SearchDestinationObservation | undefined => {
  const check = run.checks.find((candidate) => candidate.id === checkId && candidate.destination === destination && candidate.queryMode === 'brand')
  const assessment = check?.assessment
  if (!check || !assessment || !assessment.automaticObservation || assessment.operatorReviewRequired ||
    assessment.visibilityResult !== 'found' || assessment.blocker !== 'none' ||
    !check.captures.some((capture) => capture.outcome === 'success')) return undefined
  const selected = assessment.selected || assessment.matches[0]
  const observedAt = selected?.evidence[0]?.acquiredAt || check.captures.findLast((capture) => capture.outcome === 'success')?.acquiredAt || run.endedAt || run.startedAt
  const query = check.query || state.profile.businessName
  const evidence = assessment.matches.map((match) => JSON.stringify(match.candidate.fields)).join('\n').slice(0, 12000)
  return {
    ...defaultSearchDestinationObservation(destination, query),
    verificationUrl: verificationUrlFor(destination, query, state.profile, true),
    ...(selected?.candidate.resultUrl ? { observedResultUrl: selected.candidate.resultUrl } : {}),
    ...(selected?.candidate.fields.publicProfileUrl ? { canonicalProfileUrl: selected.candidate.fields.publicProfileUrl } : {}),
    overallResult: 'found_match', observedResultTypes: observedTypesForAssessment(assessment), observedAt,
    provenance: 'automated_acquisition', confidence: 'scanner_detected_public_page', evidenceNotes: evidence,
    evidenceKind: 'external_observation', reviewed: false,
    automation: {
      runId: run.id, queryMode: 'brand', state: check.state,
      inspectedUrl: check.url || verificationUrlFor(destination, query, state.profile, true),
      captures: check.captures, evidence, interpreted: true, automaticObservation: true,
      businessIdentityKey: brandPresenceBusinessIdentityKey(state.profile, state.businessProfile), assessment,
    },
  }
}

export function retainedBrandPresenceSourceFromVisibilityRuns(
  state: AuditState,
  checkId: string,
  destination: RetainedBrandPresenceDestination,
): SearchDestinationObservation | undefined {
  for (const run of [...(state.visibilityRuns || [])].reverse()) {
    if (!runMatchesMaterialIdentity(run, state)) continue
    const check = run.checks.find((candidate) => candidate.id === checkId && candidate.destination === destination && candidate.queryMode === 'brand')
    if (assessmentHasTrueMaterialIdentityConflict(check?.assessment)) return undefined
    const observation = observationFromRun(state, run, destination, checkId)
    if (observation) return observation
  }
  return undefined
}

const migrateLegacyGoogle = (
  legacy: RetainedBrandAutomaticVerification | undefined,
  state: AuditState,
): RetainedBrandPresenceVerification | undefined => {
  if (!legacy?.automation?.assessment) return undefined
  const observation: SearchDestinationObservation = {
    ...defaultSearchDestinationObservation('Google Search', state.profile.businessName),
    observedAt: legacy.verifiedAt, provenance: 'automated_acquisition', overallResult: 'found_match', reviewed: false,
    observedResultTypes: legacy.observedResultTypes, evidenceNotes: legacy.evidenceNotes,
    evidenceKind: legacy.evidenceKind, confidence: legacy.confidence,
    ...(legacy.observedResultUrl ? { observedResultUrl: legacy.observedResultUrl } : {}),
    ...(legacy.canonicalProfileUrl ? { canonicalProfileUrl: legacy.canonicalProfileUrl } : {}),
    automation: { ...legacy.automation, businessIdentityKey: legacy.businessIdentityKey },
  }
  return buildRetainedBrandPresenceVerification(observation, state.profile, state.businessProfile)
}

const migrateLegacyCompact = (
  legacy: RetainedBrandPresenceVerification | undefined,
  state: AuditState,
): RetainedBrandPresenceVerification | undefined => {
  if (!legacy || !isRetainedBrandPresenceDestination(legacy.destination)) return undefined
  const raw = legacy as RetainedBrandPresenceVerification & { verificationMethod?: 'direct_automatic' }
  if (raw.verificationMethod === 'direct_automatic') return raw
  const { evidenceFingerprint: stored, ...oldMaterial } = raw
  if (stored !== evidenceFingerprint(oldMaterial) || raw.businessIdentityKey !== brandPresenceBusinessIdentityKey(state.profile, state.businessProfile)) return undefined
  const material = { ...oldMaterial, verificationMethod: 'direct_automatic' as const }
  return { ...material, evidenceFingerprint: evidenceFingerprint(material) }
}

const laterTrueConflict = (
  state: AuditState,
  destination: RetainedBrandPresenceDestination,
  verifiedAt: string,
) => {
  const verifiedTime = Date.parse(verifiedAt)
  return (state.visibilityRuns || []).some((run) => {
    if (!runMatchesMaterialIdentity(run, state)) return false
    const runTime = Date.parse(run.endedAt || run.startedAt)
    return Number.isFinite(runTime) && runTime > verifiedTime && run.checks.some((check) =>
      check.destination === destination && check.queryMode === 'brand' && assessmentHasTrueMaterialIdentityConflict(check.assessment),
    )
  })
}

/** Pure save/load reconciliation. It performs no acquisition. */
export function recoverRetainedBrandPresenceFromWorkspace(
  state: AuditState,
  now = Date.now(),
  priorSavedWorkspace?: AuditState,
): AuditState {
  const retained: Partial<Record<BrandPresenceRetainedKey, RetainedBrandPresenceVerification>> = {}
  for (const destination of retainedBrandPresenceDestinations) {
    const candidate = state.brandPresenceLastKnownVerified?.[brandPresenceRetainedKey(destination)]
    if (retainedBrandPresenceVerificationIsCurrent(candidate, destination, state.profile, state.businessProfile, now)) {
      retained[brandPresenceRetainedKey(destination)] = candidate
    }
  }

  const legacyBing = migrateLegacyCompact(state.bingLastKnownVerified, state)
  if (legacyBing && retainedBrandPresenceVerificationIsCurrent(legacyBing, 'Bing Search', state.profile, state.businessProfile, now)) {
    retained.bing_search ||= legacyBing
  }

  for (const destinations of Object.values(state.searchDestinationObservations)) {
    for (const observation of Object.values(destinations)) {
      if (!observation || !isRetainedBrandPresenceDestination(observation.destination)) continue
      const legacy = observation.destination === 'Google Search'
        ? migrateLegacyGoogle(observation.retainedGoogleVerification, state)
        : observation.destination === 'Bing Search' ? migrateLegacyCompact(observation.retainedBingVerification, state) : undefined
      if (legacy && retainedBrandPresenceVerificationIsCurrent(legacy, observation.destination, state.profile, state.businessProfile, now)) {
        retained[brandPresenceRetainedKey(observation.destination)] ||= legacy
      }
    }
  }

  if (priorSavedWorkspace) {
    const prior = recoverRetainedBrandPresenceFromWorkspace(priorSavedWorkspace, now)
    for (const destination of retainedBrandPresenceDestinations) {
      const key = brandPresenceRetainedKey(destination)
      const candidate = prior.brandPresenceLastKnownVerified?.[key]
      if (!retained[key] && retainedBrandPresenceVerificationIsCurrent(candidate, destination, state.profile, state.businessProfile, now) &&
        !laterTrueConflict(state, destination, candidate!.verifiedAt)) retained[key] = candidate
    }
  }

  let observations = state.searchDestinationObservations
  let observationsChanged = false
  for (const [queryId, destinations] of Object.entries(state.searchDestinationObservations)) {
    for (const [destinationName, current] of Object.entries(destinations)) {
      if (!current || !isRetainedBrandPresenceDestination(destinationName) || !queryId.startsWith('search-brand-') ||
        current.automation?.queryMode && current.automation.queryMode !== 'brand') continue
      const destination = destinationName
      const key = brandPresenceRetainedKey(destination)
      if (currentObservationInvalidatesRetainedVerification(current)) delete retained[key]
      else if (brandPresenceObservationIsAutomaticallyVerified(current)) {
        const sourceRun = state.visibilityRuns?.find((run) => run.id === current.automation?.runId)
        const built = buildRetainedBrandPresenceVerification(current, state.profile, state.businessProfile, sourceRun?.profileReviewKey)
        if (retainedBrandPresenceVerificationIsCurrent(built, destination, state.profile, state.businessProfile, now)) retained[key] = built
      } else if (brandPresenceRefreshCanRetainRecentVerification(current) && !retained[key]) {
        const historical = retainedBrandPresenceSourceFromVisibilityRuns(state, `${queryId}:${destination}`, destination)
        const sourceRun = state.visibilityRuns?.find((run) => run.id === historical?.automation?.runId)
        const built = historical && buildRetainedBrandPresenceVerification(historical, state.profile, state.businessProfile, sourceRun?.profileReviewKey)
        if (retainedBrandPresenceVerificationIsCurrent(built, destination, state.profile, state.businessProfile, now)) retained[key] = built
      }

      const effective = brandPresenceRefreshCanRetainRecentVerification(current) &&
        retainedBrandPresenceVerificationIsCurrent(retained[key], destination, state.profile, state.businessProfile, now)
        ? retained[key] : undefined
      if (current.retainedBrandVerification !== effective || current.retainedGoogleVerification || current.retainedBingVerification) {
        if (!observationsChanged) observations = { ...observations }
        const normalized = { ...current }
        delete normalized.retainedBrandVerification
        delete normalized.retainedGoogleVerification
        delete normalized.retainedBingVerification
        observations[queryId] = {
          ...observations[queryId],
          [destination]: effective ? { ...normalized, retainedBrandVerification: effective } : normalized,
        }
        observationsChanged = true
      }
    }
  }

  const normalizedRetained = Object.keys(retained).length ? retained : undefined
  return {
    ...state,
    ...(observationsChanged ? { searchDestinationObservations: observations } : {}),
    brandPresenceLastKnownVerified: normalizedRetained,
    bingLastKnownVerified: undefined,
  }
}
