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

/** Add the retained projection to an already-saved workspace without rescanning. */
export function recoverRetainedBingVerificationFromWorkspace(state: AuditState, now = Date.now()): AuditState {
  let observations = state.searchDestinationObservations
  let changed = false
  for (const [queryId, destinations] of Object.entries(state.searchDestinationObservations)) {
    const current = destinations['Bing Search']
    if (!current || !bingRefreshCanRetainRecentVerification(current) || current.operatorVerification?.outcome === 'found_correction_needed') continue
    if (retainedBingAutomaticVerificationIsCurrent(current.retainedBingVerification, state.profile, state.businessProfile, now)) continue
    const source = retainedBingSourceFromVisibilityRuns(state, `${queryId}:Bing Search`, state.profile)
    if (!source) continue
    const retained = buildRetainedBingAutomaticVerification(
      source.observation,
      state.profile,
      state.businessProfile,
      source.sourceProfileReviewKey,
    )
    if (!retainedBingAutomaticVerificationIsCurrent(retained, state.profile, state.businessProfile, now)) continue
    if (!changed) observations = { ...observations }
    observations[queryId] = { ...destinations, 'Bing Search': { ...current, retainedBingVerification: retained } }
    changed = true
  }
  return changed ? { ...state, searchDestinationObservations: observations } : state
}
