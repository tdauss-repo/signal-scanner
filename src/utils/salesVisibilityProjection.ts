import type { BusinessProfile, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../types/audit'
import { brandPresenceVerificationIsStale, currentBrandPresenceVerification } from './brandPresenceVerification'
import { reviewedProfileValue } from './entityMatcher'
import { canonicalProfileUrlForDestination, publicPresenceUrl } from './searchVisibility'

export type SalesVisibilityState =
  | 'verified_correct' | 'verified_correction_needed' | 'not_found' | 'manual_verification_needed'
  | 'profile_discovered' | 'website_result_discovered' | 'verified_by_operator'
  | 'operator_correction_needed' | 'operator_not_found' | 'operator_unable_to_determine'
  | 'reconfirmation_needed' | 'conflicting_evidence'

export interface SalesVisibilityProjectionContext {
  profile?: BusinessProfile
  profileState?: BusinessProfileState
}

export interface SalesVisibilityProjection {
  destination: SearchDestination
  state: SalesVisibilityState
  headline: string
  explanation: string
  identitySummary: string
  actionUrl: string
  actionLabel: string
  nextAction: string
  customerFindingEligible: boolean
  starterPackageEligible: boolean
  deliveryResponsibility: 'Found Local can implement' | 'Found Local can assist/guide' | 'Customer/platform ownership required' | 'Manual verification required before recommendation'
  operatorReviewRequired: boolean
  automationSummary?: string
  knownProfileUrl?: string
  technicalDetail: Record<string, unknown>
}

export type GoogleAutomaticIdentityState = 'verified' | 'conflict' | 'verification_needed' | 'unavailable'

/**
 * Current Google automation is authoritative over retained compatibility
 * fields on the observation envelope. Those fields may describe an earlier
 * operator/manual state after a rescan has supplied a newer assessment.
 */
export function effectiveGoogleAutomaticIdentityState(
  observation: SearchDestinationObservation,
): GoogleAutomaticIdentityState | undefined {
  if (observation.destination !== 'Google Search') return undefined
  const assessment = observation.automation?.assessment
  if (!assessment) return undefined
  if (
    assessment.googleIdentityDecision?.decision === 'verified' &&
    assessment.automaticObservation === true &&
    assessment.operatorReviewRequired === false &&
    assessment.visibilityResult === 'found' &&
    assessment.blocker === 'none'
  ) return 'verified'
  const conflictBlocker = assessment.blocker === 'identifier_conflict' || assessment.blocker === 'multiple_entities'
  if (
    assessment.googleIdentityDecision?.decision === 'review_required' && (
      assessment.googleIdentityDecision.conflictingSignals.length > 0 ||
      conflictBlocker
    ) || !assessment.googleIdentityDecision && !assessment.automaticObservation && conflictBlocker
  ) return 'conflict'
  if (assessment.visibilityResult === 'unavailable') return 'unavailable'
  return 'verification_needed'
}

const labels: Record<SalesVisibilityState, string> = {
  verified_correct: 'Verified automatically',
  verified_correction_needed: 'Verified — needs correction',
  not_found: 'Not found',
  manual_verification_needed: 'Verification needed',
  profile_discovered: 'Profile discovered — verify details',
  website_result_discovered: 'Website result discovered — verify business identity',
  verified_by_operator: 'Verified by operator',
  operator_correction_needed: 'Correction needed',
  operator_not_found: 'Not found during operator review',
  operator_unable_to_determine: 'Unable to determine',
  reconfirmation_needed: 'Verification changed — reconfirmation needed',
  conflicting_evidence: 'Conflicting evidence — review needed',
}

/** Customer-safe interpretation. Raw acquisition and operator records remain separate. */
export function projectSalesVisibility(
  observation: SearchDestinationObservation,
  context: SalesVisibilityProjectionContext = {},
): SalesVisibilityProjection {
  const assessment = observation.automation?.assessment
  const selectedCandidate = assessment?.selected?.candidate || assessment?.matches[0]?.candidate
  const operatorVerification = currentBrandPresenceVerification(observation, context.profile, context.profileState)
  const staleOperatorVerification = brandPresenceVerificationIsStale(observation, context.profile, context.profileState)
  const technicalDetail = {
    provider: observation.automation?.captures.at(-1)?.provider,
    blocker: assessment?.blocker,
    confidence: assessment?.confidence,
    queryMode: observation.automation?.queryMode,
    inspectedUrl: observation.automation?.inspectedUrl,
    resultRegionInspected: assessment?.resultRegionInspected,
    provenance: observation.provenance,
    candidates: assessment?.matches,
    operatorVerification,
    staleOperatorVerification,
  }
  const acquiredProfileUrl = canonicalProfileUrlForDestination(
    observation.destination,
    observation.canonicalProfileUrl || selectedCandidate?.fields.publicProfileUrl,
  )
  const profileUrl = operatorVerification?.classifiedCanonicalProfileUrl || acquiredProfileUrl
  const observedResultUrl = observation.observedResultUrl || selectedCandidate?.resultUrl
  const verificationUrl = observation.verificationUrl || publicPresenceUrl(observation.destination, observation.query)
  const googleAutomaticState = effectiveGoogleAutomaticIdentityState(observation)
  const googleAutomaticVerified = googleAutomaticState === 'verified'
  const automatedReview = assessment?.operatorReviewRequired === true && !googleAutomaticVerified
  const googleConflict = googleAutomaticState === 'conflict'
  const unavailable = !googleAutomaticVerified && (assessment?.visibilityResult === 'unavailable' || automatedReview || observation.overallResult === 'manual_review_needed' || observation.overallResult === 'unable_to_verify' || observation.overallResult === 'not_checked')
  const profileDiscovered = Boolean(acquiredProfileUrl && !googleConflict && !assessment?.automaticObservation && !['not_found', 'unavailable'].includes(assessment?.visibilityResult || ''))
  const organicWebsiteResult = Boolean(
    observation.destination === 'Google Search' && observedResultUrl && !acquiredProfileUrl &&
    selectedCandidate?.kind === 'result_link' && selectedCandidate.fields.website &&
    !observation.reviewed && assessment?.visibilityResult !== 'not_found' && assessment?.googleIdentityDecision?.decision !== 'verified',
  )
  const conflicting = observation.overallResult === 'found_conflicting_information'
  const verified = googleAutomaticVerified || Boolean(assessment?.automaticObservation && !automatedReview && !organicWebsiteResult)
  const evidenceConflict = Boolean(operatorVerification && verified && (
    operatorVerification.outcome === 'found_correct' ? conflicting : true
  ))

  let state: SalesVisibilityState
  if (operatorVerification?.outcome === 'found_correct') state = 'verified_by_operator'
  else if (operatorVerification?.outcome === 'found_correction_needed') state = 'operator_correction_needed'
  else if (operatorVerification?.outcome === 'not_found') state = 'operator_not_found'
  else if (operatorVerification?.outcome === 'unable_to_determine') state = 'operator_unable_to_determine'
  else if (googleAutomaticVerified) state = 'verified_correct'
  else if (staleOperatorVerification) state = 'reconfirmation_needed'
  else if (googleConflict) state = 'conflicting_evidence'
  else if (profileDiscovered) state = 'profile_discovered'
  else if (organicWebsiteResult) state = 'website_result_discovered'
  else if (unavailable || assessment?.visibilityResult === 'not_found') state = 'manual_verification_needed'
  else if (conflicting && verified) state = 'verified_correction_needed'
  else if (verified || ['found_match', 'found_prominently'].includes(observation.overallResult) && observation.reviewed) state = 'verified_correct'
  else state = 'manual_verification_needed'

  const reviewedName = context.profile && context.profileState
    ? reviewedProfileValue(context.profile, context.profileState, 'businessName')
    : ''
  const baseExplanation = state === 'verified_correct' && observation.destination === 'Google Search'
    ? `Google Search shows business information that matches the reviewed details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'verified_correct' ? 'Automated evidence matched the reviewed business identity.'
    : state === 'verified_by_operator' ? 'The operator verified that the business identity shown at this destination matches the reviewed information.'
      : state === 'verified_correction_needed' ? 'A reviewed public result has a confirmed identity difference that should be corrected.'
        : state === 'operator_correction_needed' ? 'The operator found a destination result with business information that needs correction.'
          : state === 'operator_not_found' ? 'The operator checked this destination and did not find a matching business presence.'
            : state === 'operator_unable_to_determine' ? 'The operator attempted verification but could not determine a reliable result. The destination remains neutral.'
              : state === 'reconfirmation_needed' ? 'The business identity or material destination evidence changed after the prior operator review. Reconfirm it before using that decision.'
                : state === 'profile_discovered' ? 'A likely public profile was discovered indirectly; its details have not yet been verified.'
                  : state === 'website_result_discovered' ? 'Google returned a page from the business website, but the business information shown in search has not yet been verified.'
                    : state === 'conflicting_evidence' ? 'Acquired Google evidence contains identity details that conflict or identify multiple plausible entities. Operator review is required.'
                    : assessment?.visibilityResult === 'not_found' ? 'Automation did not find a sufficient match. This is not absence evidence; an operator must verify the destination.'
                      : 'This destination still needs an operator review. An unavailable or restricted check is not a business problem.'
  const explanation = evidenceConflict ? `${baseExplanation} This differs from the retained automated interpretation and should be reviewed.` : baseExplanation
  const nextAction = ['verified_correct', 'verified_by_operator'].includes(state) ? 'No action needed'
    : ['verified_correction_needed', 'operator_correction_needed'].includes(state) ? 'Review the confirmed difference and propose the appropriate correction'
      : state === 'operator_not_found' ? 'Review the observed absence before recommending listing work'
        : state === 'operator_unable_to_determine' ? `Revisit ${observation.destination} only when clearer evidence is available`
          : state === 'profile_discovered' ? `Open ${observation.destination} and verify business details`
            : state === 'website_result_discovered' ? 'Open Google Search and verify business details'
              : state === 'conflicting_evidence' ? 'Open Google Search and resolve the conflicting business details'
              : `Open ${observation.destination} and record the review outcome`
  const customerFindingEligible = ['verified_correction_needed', 'operator_correction_needed', 'operator_not_found'].includes(state)
  const operatorReviewRequired = !['verified_correct', 'verified_by_operator', 'verified_correction_needed', 'operator_correction_needed', 'operator_not_found'].includes(state)
  return {
    destination: observation.destination,
    state,
    headline: state === 'manual_verification_needed' && assessment?.visibilityResult === 'unavailable'
      ? 'Automated check unavailable — verification needed'
      : labels[state],
    explanation,
    identitySummary: state === 'verified_correct' && observation.destination === 'Google Search' ? 'Matches reviewed business details'
      : ['verified_correct', 'verified_by_operator'].includes(state) ? 'Business identity aligns with reviewed details'
      : ['verified_correction_needed', 'operator_correction_needed'].includes(state) ? 'A reviewed identity difference was observed'
        : state === 'operator_not_found' ? 'No matching presence was found during operator review'
          : state === 'conflicting_evidence' ? 'Conflicts with reviewed business details'
          : 'Still requires verification',
    actionUrl: verificationUrl,
    actionLabel: `Open ${observation.destination}`,
    nextAction,
    customerFindingEligible,
    starterPackageEligible: state === 'verified_correction_needed',
    deliveryResponsibility: state === 'verified_correction_needed' ? 'Found Local can implement'
      : ['operator_correction_needed', 'operator_not_found'].includes(state) ? 'Customer/platform ownership required'
        : ['verified_correct', 'verified_by_operator'].includes(state) ? 'Customer/platform ownership required'
          : 'Manual verification required before recommendation',
    operatorReviewRequired,
    ...(state === 'verified_correct' && observation.destination === 'Google Search' ? { automationSummary: 'Verified from acquired Google evidence' } : {}),
    ...(profileUrl ? { knownProfileUrl: profileUrl } : {}),
    technicalDetail: { ...technicalDetail, evidenceConflict },
  }
}

export const salesVisibilityGroups = (
  observations: SearchDestinationObservation[],
  context: SalesVisibilityProjectionContext = {},
) => {
  const all = observations.map((observation) => projectSalesVisibility(observation, context))
  return {
    lookingGood: all.filter((item) => ['verified_correct', 'verified_by_operator'].includes(item.state)),
    recommended: all.filter((item) => item.customerFindingEligible),
    stillToVerify: all.filter((item) => item.operatorReviewRequired),
  }
}

export interface SalesVisibilityRecord { queryId: string; observation: SearchDestinationObservation }

export function salesCockpitVisibility(
  records: SalesVisibilityRecord[],
  context: SalesVisibilityProjectionContext = {},
) {
  const projected = records.map(({ queryId, observation }) => ({ queryId, ...projectSalesVisibility(observation, context) }))
  const byDestination = new Map<SearchDestination, typeof projected>()
  for (const item of projected) byDestination.set(item.destination, [...(byDestination.get(item.destination) || []), item])
  const lookingGood: typeof projected = []
  const recommended: typeof projected = []
  const deeperReview: Array<typeof projected[number] & { displayDestination: string }> = []
  for (const [destination, entries] of byDestination) {
    const positive = entries.find((item) => ['verified_correct', 'verified_by_operator'].includes(item.state))
    const issue = entries.find((item) => item.customerFindingEligible)
    const unresolved = entries.filter((item) => item.operatorReviewRequired)
    if (positive) lookingGood.push(positive)
    if (issue && !positive) recommended.push(issue)
    const reviewEntries = positive && destination === 'Bing Search'
      ? unresolved.filter((item) => item.queryId.includes('market')) : positive ? [] : unresolved
    const review = reviewEntries[0]
    if (review) deeperReview.push({ ...review, displayDestination: positive && destination === 'Bing Search' ? 'Bing location visibility' : destination })
  }
  return { lookingGood, recommended, deeperReview }
}
