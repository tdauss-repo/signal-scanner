import type {
  AuditState,
  BusinessProfile,
  BusinessProfileField,
  BusinessProfileState,
  SearchDestinationObservation,
  SearchVisibilityObservedResultType,
} from '../types/audit'
import type { VisibilityRun } from '../types/visibilityScan'
import {
  bingObservationIsAutomaticallyVerified,
  bingRefreshCanRetainRecentVerification,
  buildRetainedBingAutomaticVerification,
  retainedBingAutomaticVerificationIsCurrent,
} from './bingAcquisitionResilience'
import { brandPresenceBusinessIdentityKey } from './brandPresenceAcquisitionResilience'
import { matchesEvidenceFingerprint } from './evidenceFingerprint'
import { defaultSearchDestinationObservation, verificationUrlFor } from './searchVisibility'
import { normalizeWorkspaceProfile } from './workspaceProfile'

export interface RetainedBingSource {
  observation: SearchDestinationObservation
  sourceProfileReviewKey?: string
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
        value: profile[field],
        source: 'persisted visibility run',
        status: 'operator_reviewed',
        confidence: 'high',
        recordedAt: run.startedAt,
      }])) as BusinessProfileState['values'],
    }
    return brandPresenceBusinessIdentityKey(profile, profileState)
  } catch {
    return undefined
  }
}

const runMatchesMaterialIdentity = (run: VisibilityRun, state: AuditState, profile: BusinessProfile) => {
  const currentIdentityKey = brandPresenceBusinessIdentityKey(profile, state.businessProfile)
  const historicalIdentityKey = materialIdentityKeyFromRun(run)
  if (historicalIdentityKey) return historicalIdentityKey === currentIdentityKey
  return matchesEvidenceFingerprint(run.profileKey, profile) && Boolean(
    run.profileReviewKey && matchesEvidenceFingerprint(run.profileReviewKey, state.businessProfile),
  )
}

/**
 * Recover a verified Bing source from the complete persisted run history.
 * Full workspace/profile fingerprints include non-identity metadata, so saved
 * history is compared using the same bounded name/domain/address/phone identity
 * used by the retained-evidence contract.
 */
export function retainedBingSourceFromVisibilityRuns(
  state: AuditState,
  checkId: string,
  profile: BusinessProfile,
): RetainedBingSource | undefined {
  const currentIdentityKey = brandPresenceBusinessIdentityKey(profile, state.businessProfile)
  for (const historicalRun of [...(state.visibilityRuns || [])].reverse()) {
    if (!runMatchesMaterialIdentity(historicalRun, state, profile)) continue
    const historicalCheck = historicalRun.checks.find((check) => check.id === checkId && check.destination === 'Bing Search' && check.queryMode === 'brand')
    const assessment = historicalCheck?.assessment
    const conflictBlocker = assessment?.blocker === 'identifier_conflict' || assessment?.blocker === 'multiple_entities'
    if (assessment && (conflictBlocker || assessment.bingIdentityDecision?.conflictingSignals.length)) return undefined
    if (!historicalCheck || !assessment || !assessment.automaticObservation || assessment.operatorReviewRequired ||
      assessment.bingIdentityDecision?.decision !== 'verified' || assessment.visibilityResult !== 'found' || assessment.blocker !== 'none' ||
      !historicalCheck.captures.some((capture) => capture.outcome === 'success')) continue
    const selected = assessment.selected
    const evidence = assessment.matches.map((match) => `${JSON.stringify(match.candidate.fields)}\n${match.evidence.map((reference) => `${reference.sourceUrl} (${reference.locator}): ${reference.excerpt}`).join('\n')}`).join('\n').slice(0, 12000)
    const observedResultTypes: SearchVisibilityObservedResultType[] = []
    if (selected?.matchedFields.some((field) => field.field === 'website')) observedResultTypes.push('official_website')
    else observedResultTypes.push('third_party_mention')
    for (const field of selected?.matchedFields || []) {
      if (field.field === 'name') observedResultTypes.push('business_name_correct')
      if (field.field === 'phone') observedResultTypes.push('phone_correct')
      if (field.field === 'website') observedResultTypes.push('website_correct')
      if (['streetAddress', 'address'].includes(field.field)) observedResultTypes.push('address_correct')
    }
    const observedAt = selected?.evidence[0]?.acquiredAt || historicalCheck.captures.findLast((capture) => capture.outcome === 'success')?.acquiredAt || historicalRun.endedAt || historicalRun.startedAt
    const query = historicalCheck.query || profile.businessName
    const observation: SearchDestinationObservation = {
      ...defaultSearchDestinationObservation('Bing Search', query),
      verificationUrl: verificationUrlFor('Bing Search', query, profile, true),
      ...(selected?.candidate.resultUrl ? { observedResultUrl: selected.candidate.resultUrl } : {}),
      ...(selected?.candidate.fields.publicProfileUrl ? { canonicalProfileUrl: selected.candidate.fields.publicProfileUrl } : {}),
      overallResult: 'found_match',
      observedResultTypes: [...new Set(observedResultTypes)],
      observedAt,
      provenance: 'automated_acquisition',
      confidence: 'scanner_detected_public_page',
      evidenceNotes: evidence,
      evidenceKind: 'external_observation',
      reviewed: false,
      automation: {
        runId: historicalRun.id,
        queryMode: 'brand',
        state: historicalCheck.state,
        inspectedUrl: historicalCheck.url || verificationUrlFor('Bing Search', query, profile, true),
        captures: historicalCheck.captures,
        evidence,
        interpreted: true,
        automaticObservation: true,
        businessIdentityKey: currentIdentityKey,
        assessment,
      },
    }
    return { observation, sourceProfileReviewKey: historicalRun.profileReviewKey }
  }
  return undefined
}

const currentBingInvalidatesRetention = (observation: SearchDestinationObservation) => {
  const assessment = observation.automation?.assessment
  const conflictBlocker = assessment?.blocker === 'identifier_conflict' || assessment?.blocker === 'multiple_entities'
  return observation.operatorVerification?.outcome === 'found_correction_needed' ||
    observation.operatorVerification?.outcome === 'not_found' ||
    Boolean(conflictBlocker || assessment?.bingIdentityDecision?.conflictingSignals.length)
}

const hasLaterBingConflict = (state: AuditState, verifiedAt: string) => {
  const verifiedTime = Date.parse(verifiedAt)
  return (state.visibilityRuns || []).some((run) => {
    if (!runMatchesMaterialIdentity(run, state, state.profile)) return false
    const runTime = Date.parse(run.endedAt || run.startedAt)
    if (!Number.isFinite(runTime) || runTime <= verifiedTime) return false
    return run.checks.some((check) => {
      if (check.destination !== 'Bing Search' || check.queryMode !== 'brand') return false
      const assessment = check.assessment
      return assessment?.blocker === 'identifier_conflict' || assessment?.blocker === 'multiple_entities' ||
        Boolean(assessment?.bingIdentityDecision?.conflictingSignals.length)
    })
  })
}

const retainedFromObservation = (
  state: AuditState,
  observation: SearchDestinationObservation,
  sourceProfileReviewKey?: string,
) => {
  const direct = buildRetainedBingAutomaticVerification(
    observation,
    state.profile,
    state.businessProfile,
    sourceProfileReviewKey,
  )
  if (direct) return direct
  const sourceRun = state.visibilityRuns?.find((run) => run.id === observation.automation?.runId)
  if (!sourceRun || !runMatchesMaterialIdentity(sourceRun, state, state.profile)) return undefined
  return buildRetainedBingAutomaticVerification({
    ...observation,
    automation: observation.automation ? {
      ...observation.automation,
      businessIdentityKey: brandPresenceBusinessIdentityKey(state.profile, state.businessProfile),
    } : undefined,
  }, state.profile, state.businessProfile, sourceProfileReviewKey)
}

/**
 * Reconcile the bounded workspace-level Bing fact and the current observation.
 * Visibility-run history is consulted only to migrate compatible older saves.
 * This function is pure and performs no acquisition.
 */
export function recoverRetainedBingVerificationFromWorkspace(
  state: AuditState,
  now = Date.now(),
  priorSavedWorkspace?: AuditState,
): AuditState {
  let observations = state.searchDestinationObservations
  let changed = false
  let lastKnownVerified = retainedBingAutomaticVerificationIsCurrent(
    state.bingLastKnownVerified,
    state.profile,
    state.businessProfile,
    now,
  ) ? state.bingLastKnownVerified : undefined
  if (!lastKnownVerified && priorSavedWorkspace) {
    const recoveredPrior = recoverRetainedBingVerificationFromWorkspace(priorSavedWorkspace, now)
    const priorCandidate = retainedBingAutomaticVerificationIsCurrent(
      recoveredPrior.bingLastKnownVerified,
      state.profile,
      state.businessProfile,
      now,
    ) ? recoveredPrior.bingLastKnownVerified : undefined
    lastKnownVerified = priorCandidate && !hasLaterBingConflict(state, priorCandidate.verifiedAt)
      ? priorCandidate : undefined
  }

  for (const [queryId, destinations] of Object.entries(state.searchDestinationObservations)) {
    const current = destinations['Bing Search']
    if (!current || current.automation?.queryMode !== 'brand') continue

    if (currentBingInvalidatesRetention(current)) {
      lastKnownVerified = undefined
      if (current.retainedBingVerification) {
        if (!changed) observations = { ...observations }
        const withoutRetained = { ...current }
        delete withoutRetained.retainedBingVerification
        observations[queryId] = { ...destinations, 'Bing Search': withoutRetained }
        changed = true
      }
      continue
    }

    if (bingObservationIsAutomaticallyVerified(current)) {
      const sourceRun = state.visibilityRuns?.find((run) => run.id === current.automation?.runId)
      const retained = retainedFromObservation(state, current, sourceRun?.profileReviewKey)
      if (retainedBingAutomaticVerificationIsCurrent(retained, state.profile, state.businessProfile, now)) {
        lastKnownVerified = retained
      }
      if (current.retainedBingVerification) {
        if (!changed) observations = { ...observations }
        const withoutRetained = { ...current }
        delete withoutRetained.retainedBingVerification
        observations[queryId] = { ...destinations, 'Bing Search': withoutRetained }
        changed = true
      }
      continue
    }

    if (!bingRefreshCanRetainRecentVerification(current)) continue
    const embedded = retainedBingAutomaticVerificationIsCurrent(
      current.retainedBingVerification,
      state.profile,
      state.businessProfile,
      now,
    ) ? current.retainedBingVerification : undefined
    let retained = lastKnownVerified || embedded
    if (!retained) {
      const source = retainedBingSourceFromVisibilityRuns(state, `${queryId}:Bing Search`, state.profile)
      retained = source ? retainedFromObservation(state, source.observation, source.sourceProfileReviewKey) : undefined
    }
    if (!retainedBingAutomaticVerificationIsCurrent(retained, state.profile, state.businessProfile, now)) retained = undefined
    lastKnownVerified = retained
    if (current.retainedBingVerification !== retained) {
      if (!changed) observations = { ...observations }
      const withoutRetained = { ...current }
      delete withoutRetained.retainedBingVerification
      observations[queryId] = {
        ...destinations,
        'Bing Search': retained ? { ...withoutRetained, retainedBingVerification: retained } : withoutRetained,
      }
      changed = true
    }
  }

  if (state.bingLastKnownVerified !== lastKnownVerified) changed = true
  return changed ? {
    ...state,
    searchDestinationObservations: observations,
    ...(lastKnownVerified ? { bingLastKnownVerified: lastKnownVerified } : { bingLastKnownVerified: undefined }),
  } : state
}
