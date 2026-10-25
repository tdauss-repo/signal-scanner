import type { BusinessProfile, BusinessProfileState, SearchDestination, SearchDestinationObservation } from '../types/audit'
import { brandPresenceVerificationIsStale, currentBrandPresenceVerification } from './brandPresenceVerification'
import { reviewedProfileValue } from './entityMatcher'
import { effectiveGoogleAutomaticIdentityState } from './googleAcquisitionResilience'
import { effectiveBingAutomaticIdentityState } from './bingAcquisitionResilience'
import { effectiveBrandPresenceAutomaticIdentityState } from './brandPresenceWorkspaceRetention'
import {
  deriveGoogleMapsVerification,
  type DerivedGoogleMapsVerification,
} from './googleMapsDerivedVerification'
import { canonicalProfileUrlForDestination, publicPresenceUrl } from './searchVisibility'

export { effectiveGoogleAutomaticIdentityState } from './googleAcquisitionResilience'
export type { GoogleAutomaticIdentityState } from './googleAcquisitionResilience'
export { effectiveBingAutomaticIdentityState } from './bingAcquisitionResilience'
export type { BingAutomaticIdentityState } from './bingAcquisitionResilience'

export type SalesVisibilityState =
  | 'verified_correct' | 'verified_correction_needed' | 'not_found' | 'manual_verification_needed'
  | 'profile_discovered' | 'website_result_discovered' | 'verified_by_operator'
  | 'operator_correction_needed' | 'operator_not_found' | 'operator_unable_to_determine'
  | 'reconfirmation_needed' | 'conflicting_evidence' | 'verified_recent'

export interface SalesVisibilityProjectionContext {
  profile?: BusinessProfile
  profileState?: BusinessProfileState
  now?: number
  /** Same-query Search evidence used only for bounded Google Maps derivation. */
  googleSearchObservation?: SearchDestinationObservation
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
  deliveryResponsibility: 'Street & Signal can implement' | 'Street & Signal can assist/guide' | 'Customer/platform ownership required' | 'Manual verification required before recommendation'
  operatorReviewRequired: boolean
  automationSummary?: string
  evidenceSourceSummary?: string
  /** Effective acquired/derived canonical profile; operator links remain separately classified. */
  canonicalProfileUrl?: string
  knownProfileUrl?: string
  derivedGoogleMapsVerification?: DerivedGoogleMapsVerification
  technicalDetail: Record<string, unknown>
}

const labels: Record<SalesVisibilityState, string> = {
  verified_correct: 'Verified automatically',
  verified_recent: 'Verified from recent evidence',
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
  const googleAutomaticState = effectiveGoogleAutomaticIdentityState(observation, context)
  const bingAutomaticState = effectiveBingAutomaticIdentityState(observation, context)
  const retainedAutomaticState = effectiveBrandPresenceAutomaticIdentityState(observation, context)
  const candidateDerivedGoogleMapsVerification = observation.destination === 'Google Maps'
    ? deriveGoogleMapsVerification(context.googleSearchObservation, context.profile, context.profileState, context.now)
    : undefined
  const directMapsVerified = observation.destination === 'Google Maps' && retainedAutomaticState === 'verified'
  const directMapsRecentVerified = observation.destination === 'Google Maps' && retainedAutomaticState === 'verified_recent'
  const directMapsConflict = observation.destination === 'Google Maps' && retainedAutomaticState === 'conflict'
  const derivedGoogleMapsVerification = directMapsVerified || directMapsRecentVerified || directMapsConflict
    ? undefined : candidateDerivedGoogleMapsVerification
  const retainedVerification = retainedAutomaticState === 'verified_recent' ? observation.retainedBrandVerification : undefined
  const effectiveAssessment = retainedVerification?.assessment || assessment
  const selectedCandidate = effectiveAssessment?.selected?.candidate || effectiveAssessment?.matches[0]?.candidate
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
    retainedBrandVerification: retainedVerification,
    derivedGoogleMapsVerification,
  }
  const acquiredProfileUrl = canonicalProfileUrlForDestination(
    observation.destination,
    observation.destination === 'Google Maps' && derivedGoogleMapsVerification && !assessment?.automaticObservation
      ? derivedGoogleMapsVerification.canonicalProfileUrl
      : observation.canonicalProfileUrl || retainedVerification?.canonicalProfileUrl ||
        derivedGoogleMapsVerification?.canonicalProfileUrl || selectedCandidate?.fields.publicProfileUrl,
  )
  const profileUrl = operatorVerification?.classifiedCanonicalProfileUrl || acquiredProfileUrl
  const observedResultUrl = observation.observedResultUrl || retainedVerification?.observedResultUrl || selectedCandidate?.resultUrl
  const verificationUrl = observation.verificationUrl || publicPresenceUrl(observation.destination, observation.query)
  const googleAutomaticVerified = googleAutomaticState === 'verified'
  const googleRecentVerified = googleAutomaticState === 'verified_recent'
  const bingAutomaticVerified = bingAutomaticState === 'verified'
  const bingRecentVerified = bingAutomaticState === 'verified_recent'
  const bingConflict = bingAutomaticState === 'conflict'
  const duckDuckGoAutomaticVerified = observation.destination === 'DuckDuckGo' && retainedAutomaticState === 'verified'
  const duckDuckGoRecentVerified = observation.destination === 'DuckDuckGo' && retainedAutomaticState === 'verified_recent'
  const duckDuckGoConflict = observation.destination === 'DuckDuckGo' && retainedAutomaticState === 'conflict'
  const yelpAutomaticVerified = Boolean(
    observation.destination === 'Yelp' && assessment?.yelpIdentityDecision?.decision === 'verified' &&
    assessment.automaticObservation && !assessment.operatorReviewRequired &&
    assessment.visibilityResult === 'found' && assessment.blocker === 'none',
  )
  const yelpConflict = Boolean(
    observation.destination === 'Yelp' && assessment?.yelpIdentityDecision?.decision === 'review_required' &&
    (assessment.yelpIdentityDecision.conflictingSignals.length || ['identifier_conflict', 'multiple_entities'].includes(assessment.blocker)),
  )
  const facebookAutomaticVerified = Boolean(
    observation.destination === 'Facebook' && assessment?.facebookIdentityDecision?.decision === 'verified' &&
    assessment.automaticObservation && !assessment.operatorReviewRequired &&
    assessment.visibilityResult === 'found' && assessment.blocker === 'none',
  )
  const facebookConflict = Boolean(
    observation.destination === 'Facebook' && assessment?.facebookIdentityDecision?.decision === 'review_required' &&
    (assessment.facebookIdentityDecision.conflictingSignals.length || ['identifier_conflict', 'multiple_entities'].includes(assessment.blocker)),
  )
  const instagramAutomaticVerified = Boolean(
    observation.destination === 'Instagram' && assessment?.instagramIdentityDecision?.decision === 'verified' &&
    assessment.automaticObservation && !assessment.operatorReviewRequired &&
    assessment.visibilityResult === 'found' && assessment.blocker === 'none',
  )
  const instagramConflict = Boolean(
    observation.destination === 'Instagram' && assessment?.instagramIdentityDecision?.decision === 'review_required' &&
    (assessment.instagramIdentityDecision.conflictingSignals.length || ['identifier_conflict', 'multiple_entities'].includes(assessment.blocker)),
  )
  const metaProfileDiscovery = observation.automation?.captures.find((capture) => capture.profileDiscovery)?.profileDiscovery
  const appleAutomaticVerified = Boolean(
    observation.destination === 'Apple Maps' && assessment?.automaticObservation &&
    assessment.visibilityResult === 'found' && !assessment.operatorReviewRequired && assessment.blocker === 'none',
  )
  const appleConflict = Boolean(
    observation.destination === 'Apple Maps' && ['identifier_conflict', 'multiple_entities'].includes(assessment?.blocker || ''),
  )
  const appleSearchShellOnly = Boolean(observation.destination === 'Apple Maps' &&
    observation.automation?.captures.some((capture) => capture.outcome === 'success' && capture.resultRegionInspected &&
      capture.finalRequestState === 'shell' && capture.redirectAccepted && (() => {
        try { return new URL(capture.redirectUrl || '').pathname === '/search' } catch { return false }
      })()))
  const automatedReview = assessment?.operatorReviewRequired === true && !googleAutomaticVerified && !googleRecentVerified && !bingAutomaticVerified && !bingRecentVerified && !directMapsVerified && !directMapsRecentVerified && !appleAutomaticVerified && !duckDuckGoAutomaticVerified && !duckDuckGoRecentVerified && !yelpAutomaticVerified && !facebookAutomaticVerified && !instagramAutomaticVerified
  const googleConflict = googleAutomaticState === 'conflict'
  const unavailable = !googleAutomaticVerified && !googleRecentVerified && !bingAutomaticVerified && !bingRecentVerified && !directMapsVerified && !directMapsRecentVerified && !appleAutomaticVerified && !duckDuckGoAutomaticVerified && !duckDuckGoRecentVerified && !yelpAutomaticVerified && !facebookAutomaticVerified && !instagramAutomaticVerified && (assessment?.visibilityResult === 'unavailable' || automatedReview || observation.overallResult === 'manual_review_needed' || observation.overallResult === 'unable_to_verify' || observation.overallResult === 'not_checked')
  const profileDiscovered = Boolean(acquiredProfileUrl && !googleConflict && !assessment?.automaticObservation && (
    metaProfileDiscovery || !['not_found', 'unavailable'].includes(assessment?.visibilityResult || '')
  ))
  const organicWebsiteResult = Boolean(
    observation.destination === 'Google Search' && observedResultUrl && !acquiredProfileUrl &&
    selectedCandidate?.kind === 'result_link' && selectedCandidate.fields.website &&
    !observation.reviewed && assessment?.visibilityResult !== 'not_found' && assessment?.googleIdentityDecision?.decision !== 'verified',
  )
  const conflicting = observation.overallResult === 'found_conflicting_information'
  const verified = googleAutomaticVerified || googleRecentVerified || bingAutomaticVerified || bingRecentVerified || directMapsVerified || directMapsRecentVerified || appleAutomaticVerified || duckDuckGoAutomaticVerified || duckDuckGoRecentVerified || yelpAutomaticVerified || facebookAutomaticVerified || instagramAutomaticVerified || Boolean(derivedGoogleMapsVerification) || Boolean(assessment?.automaticObservation && !automatedReview && !organicWebsiteResult)
  const evidenceConflict = Boolean(operatorVerification && verified && (
    operatorVerification.outcome === 'found_correct' ? conflicting : true
  ))

  let state: SalesVisibilityState
  if (operatorVerification?.outcome === 'found_correct') state = 'verified_by_operator'
  else if (operatorVerification?.outcome === 'found_correction_needed') state = 'operator_correction_needed'
  else if (operatorVerification?.outcome === 'not_found') state = 'operator_not_found'
  else if (operatorVerification?.outcome === 'unable_to_determine') state = 'operator_unable_to_determine'
  else if (googleAutomaticVerified) state = 'verified_correct'
  else if (googleRecentVerified) state = 'verified_recent'
  else if (bingAutomaticVerified) state = 'verified_correct'
  else if (bingRecentVerified) state = 'verified_recent'
  else if (directMapsVerified) state = 'verified_correct'
  else if (directMapsRecentVerified) state = 'verified_recent'
  else if (appleAutomaticVerified) state = 'verified_correct'
  else if (duckDuckGoAutomaticVerified) state = 'verified_correct'
  else if (duckDuckGoRecentVerified) state = 'verified_recent'
  else if (yelpAutomaticVerified) state = 'verified_correct'
  else if (facebookAutomaticVerified) state = 'verified_correct'
  else if (instagramAutomaticVerified) state = 'verified_correct'
  else if (directMapsConflict) state = 'conflicting_evidence'
  else if (derivedGoogleMapsVerification?.freshness === 'fresh') state = 'verified_correct'
  else if (derivedGoogleMapsVerification?.freshness === 'recent') state = 'verified_recent'
  else if (staleOperatorVerification) state = 'reconfirmation_needed'
  else if (googleConflict) state = 'conflicting_evidence'
  else if (bingConflict) state = 'conflicting_evidence'
  else if (appleConflict) state = 'conflicting_evidence'
  else if (duckDuckGoConflict) state = 'conflicting_evidence'
  else if (yelpConflict) state = 'conflicting_evidence'
  else if (facebookConflict) state = 'conflicting_evidence'
  else if (instagramConflict) state = 'conflicting_evidence'
  else if (profileDiscovered) state = 'profile_discovered'
  else if (organicWebsiteResult) state = 'website_result_discovered'
  else if (unavailable || assessment?.visibilityResult === 'not_found') state = 'manual_verification_needed'
  else if (conflicting && verified) state = 'verified_correction_needed'
  else if (verified || ['found_match', 'found_prominently'].includes(observation.overallResult) && observation.reviewed) state = 'verified_correct'
  else state = 'manual_verification_needed'

  const reviewedName = context.profile && context.profileState
    ? reviewedProfileValue(context.profile, context.profileState, 'businessName')
    : ''
  const baseExplanation = derivedGoogleMapsVerification && state === 'verified_correct'
    ? `Google returned a Maps business profile that matches the reviewed business identity${reviewedName ? ` for ${reviewedName}` : ''}.`
    : derivedGoogleMapsVerification && state === 'verified_recent'
      ? `A recent Google Search check verified a Maps business profile matching the reviewed business identity${reviewedName ? ` for ${reviewedName}` : ''}. The current automated refresh was unavailable.`
    : state === 'verified_correct' && observation.destination === 'Google Search'
    ? `Google Search shows business information that matches the reviewed details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'verified_correct' && observation.destination === 'Bing Search'
      ? `Bing Search shows business information that matches the reviewed business details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'verified_correct' && observation.destination === 'Apple Maps'
      ? `Apple Maps shows a business listing that matches the reviewed business details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'verified_correct' && observation.destination === 'DuckDuckGo'
      ? `DuckDuckGo shows business information that matches the reviewed business details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'verified_correct' && observation.destination === 'Yelp'
      ? `Yelp shows a business listing that matches the reviewed business details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'verified_correct' && observation.destination === 'Facebook'
      ? `Facebook shows a business presence that matches the reviewed business details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'verified_correct' && observation.destination === 'Instagram'
      ? `Instagram shows a business presence that matches the reviewed business details${reviewedName ? ` for ${reviewedName}` : ''}.`
    : state === 'manual_verification_needed' && appleSearchShellOnly
      ? 'Apple Maps responded to the public business search, but the automated check could not access enough structured place information to verify the listing.'
    : state === 'verified_recent'
      ? `A recent ${observation.destination} check verified the business identity${reviewedName ? ` for ${reviewedName}` : ''}. ${assessment?.blocker === 'no_match'
        ? 'The latest automated refresh did not return enough matching information to reconfirm it.'
        : assessment?.visibilityResult === 'unavailable' ? 'The current automated refresh was unavailable.'
          : 'The latest automated refresh was inconclusive.'}`
    : state === 'verified_correct' ? 'Automated evidence matched the reviewed business identity.'
    : state === 'verified_by_operator' ? 'The operator verified that the business identity shown at this destination matches the reviewed information.'
      : state === 'verified_correction_needed' ? 'A reviewed public result has a confirmed identity difference that should be corrected.'
        : state === 'operator_correction_needed' ? 'The operator found a destination result with business information that needs correction.'
          : state === 'operator_not_found' ? 'The operator checked this destination and did not find a matching business presence.'
            : state === 'operator_unable_to_determine' ? 'The operator attempted verification but could not determine a reliable result. The destination remains neutral.'
              : state === 'reconfirmation_needed' ? 'The business identity or material destination evidence changed after the prior operator review. Reconfirm it before using that decision.'
                : state === 'profile_discovered' && observation.destination === 'Facebook'
                  ? 'A Facebook page URL associated with the business was discovered, but the automated check could not verify the current page details.'
                  : state === 'profile_discovered' && observation.destination === 'Instagram'
                    ? 'An Instagram profile associated with the business was discovered, but the automated check could not verify enough public profile details to confirm the business identity.'
                  : state === 'profile_discovered' ? 'A likely public profile was discovered indirectly; its details have not yet been verified.'
                  : state === 'website_result_discovered' ? 'Google returned a page from the business website, but the business information shown in search has not yet been verified.'
                    : state === 'conflicting_evidence' ? `${observation.destination} evidence contains identity details that conflict or identify multiple plausible entities. Operator review is required.`
                    : assessment?.visibilityResult === 'not_found' ? 'Automation did not find a sufficient match. This is not absence evidence; an operator must verify the destination.'
                      : 'This destination still needs an operator review. An unavailable or restricted check is not a business problem.'
  const explanation = evidenceConflict ? `${baseExplanation} This differs from the retained automated interpretation and should be reviewed.` : baseExplanation
  const nextAction = ['verified_correct', 'verified_recent', 'verified_by_operator'].includes(state) ? 'No action needed'
    : ['verified_correction_needed', 'operator_correction_needed'].includes(state) ? 'Review the confirmed difference and propose the appropriate correction'
      : state === 'operator_not_found' ? 'Review the observed absence before recommending listing work'
        : state === 'operator_unable_to_determine' ? `Revisit ${observation.destination} only when clearer evidence is available`
          : state === 'profile_discovered' && ['Facebook', 'Instagram'].includes(observation.destination) ? `Open ${observation.destination} profile and verify business details`
            : state === 'profile_discovered' ? `Open ${observation.destination} and verify business details`
            : state === 'website_result_discovered' ? 'Open Google Search and verify business details'
              : state === 'conflicting_evidence' ? `Open ${observation.destination} and resolve the conflicting business details`
              : `Open ${observation.destination} and record the review outcome`
  const customerFindingEligible = ['verified_correction_needed', 'operator_correction_needed', 'operator_not_found'].includes(state)
  const operatorReviewRequired = !['verified_correct', 'verified_recent', 'verified_by_operator', 'verified_correction_needed', 'operator_correction_needed', 'operator_not_found'].includes(state)
  return {
    destination: observation.destination,
    state,
    headline: state === 'profile_discovered' && ['Facebook', 'Instagram'].includes(observation.destination)
      ? 'Profile discovered — verification needed'
      : state === 'manual_verification_needed' && assessment?.visibilityResult === 'unavailable'
      ? 'Automated check unavailable — verification needed'
      : labels[state],
    explanation,
    identitySummary: state === 'verified_recent'
      ? 'Matches reviewed business details from recent verified evidence'
      : state === 'verified_correct' && ['Google Search', 'Google Maps', 'Bing Search', 'Apple Maps', 'DuckDuckGo', 'Yelp', 'Facebook', 'Instagram'].includes(observation.destination) ? 'Matches reviewed business details'
      : ['verified_correct', 'verified_recent', 'verified_by_operator'].includes(state) ? 'Business identity aligns with reviewed details'
      : ['verified_correction_needed', 'operator_correction_needed'].includes(state) ? 'A reviewed identity difference was observed'
        : state === 'operator_not_found' ? 'No matching presence was found during operator review'
          : state === 'conflicting_evidence' ? 'Conflicts with reviewed business details'
          : 'Still requires verification',
    actionUrl: verificationUrl,
    actionLabel: `Open ${observation.destination}`,
    nextAction,
    customerFindingEligible,
    starterPackageEligible: state === 'verified_correction_needed',
    deliveryResponsibility: state === 'verified_correction_needed' ? 'Street & Signal can implement'
      : ['operator_correction_needed', 'operator_not_found'].includes(state) ? 'Customer/platform ownership required'
        : ['verified_correct', 'verified_recent', 'verified_by_operator'].includes(state) ? 'Customer/platform ownership required'
          : 'Manual verification required before recommendation',
    operatorReviewRequired,
    ...(state === 'verified_correct' && observation.destination === 'Google Search' ? { automationSummary: 'Verified from acquired Google evidence' } : {}),
    ...(state === 'verified_correct' && observation.destination === 'Bing Search' && bingAutomaticVerified ? { automationSummary: 'Verified from acquired Bing evidence' } : {}),
    ...(state === 'verified_recent' && retainedVerification ? {
      automationSummary: `Recent verified ${observation.destination} evidence retained; latest refresh ${assessment?.blocker === 'no_match' ? 'inconclusive' : 'unavailable or inconclusive'}`,
    } : {}),
    ...(state === 'verified_correct' && observation.destination === 'Apple Maps' && appleAutomaticVerified ? { automationSummary: 'Verified from acquired Apple Maps evidence' } : {}),
    ...(state === 'verified_correct' && observation.destination === 'DuckDuckGo' && duckDuckGoAutomaticVerified ? { automationSummary: 'Verified from acquired DuckDuckGo evidence' } : {}),
    ...(state === 'verified_correct' && observation.destination === 'Yelp' && yelpAutomaticVerified ? { automationSummary: 'Verified from acquired Yelp evidence' } : {}),
    ...(state === 'verified_correct' && observation.destination === 'Facebook' && facebookAutomaticVerified ? { automationSummary: 'Verified from acquired Facebook evidence' } : {}),
    ...(state === 'verified_correct' && observation.destination === 'Instagram' && instagramAutomaticVerified ? { automationSummary: 'Verified from acquired Instagram evidence' } : {}),
    ...(state === 'profile_discovered' && metaProfileDiscovery ? {
      evidenceSourceSummary: metaProfileDiscovery.source === 'first_party_website' ? 'First-party business website link'
        : metaProfileDiscovery.source === 'search_evidence' ? 'Verified search evidence' : 'Reviewed business profile metadata',
    } : {}),
    ...(state === 'verified_correct' && observation.destination !== 'Google Search' && !derivedGoogleMapsVerification && directMapsVerified
      ? { automationSummary: `Verified from acquired ${observation.destination} evidence` } : {}),
    ...(derivedGoogleMapsVerification?.freshness === 'fresh' ? {
      automationSummary: 'Verified from acquired Google business-profile evidence',
      evidenceSourceSummary: 'Google business profile discovered during automated Google Search verification',
    } : {}),
    ...(derivedGoogleMapsVerification?.freshness === 'recent' ? {
      automationSummary: 'Recent Google business-profile evidence retained; latest refresh unavailable',
      evidenceSourceSummary: 'Recent Google Search knowledge-panel evidence',
    } : {}),
    ...(acquiredProfileUrl ? { canonicalProfileUrl: acquiredProfileUrl } : {}),
    ...(profileUrl ? { knownProfileUrl: profileUrl } : {}),
    ...(derivedGoogleMapsVerification ? { derivedGoogleMapsVerification } : {}),
    technicalDetail: { ...technicalDetail, evidenceConflict },
  }
}

export const salesVisibilityGroups = (
  observations: SearchDestinationObservation[],
  context: SalesVisibilityProjectionContext = {},
) => {
  const googleSearchObservation = observations.find((observation) => observation.destination === 'Google Search')
  const all = observations.map((observation) => projectSalesVisibility(observation, { ...context, googleSearchObservation }))
  return {
    lookingGood: all.filter((item) => ['verified_correct', 'verified_recent', 'verified_by_operator'].includes(item.state)),
    recommended: all.filter((item) => item.customerFindingEligible),
    stillToVerify: all.filter((item) => item.operatorReviewRequired),
  }
}

export interface SalesVisibilityRecord { queryId: string; observation: SearchDestinationObservation }

export function salesCockpitVisibility(
  records: SalesVisibilityRecord[],
  context: SalesVisibilityProjectionContext = {},
) {
  const googleSearchByQuery = new Map(records
    .filter(({ observation }) => observation.destination === 'Google Search')
    .map(({ queryId, observation }) => [queryId, observation]))
  const projected = records.map(({ queryId, observation }) => ({
    queryId,
    ...projectSalesVisibility(observation, { ...context, googleSearchObservation: googleSearchByQuery.get(queryId) }),
  }))
  const byDestination = new Map<SearchDestination, typeof projected>()
  for (const item of projected) byDestination.set(item.destination, [...(byDestination.get(item.destination) || []), item])
  const lookingGood: typeof projected = []
  const recommended: typeof projected = []
  const deeperReview: Array<typeof projected[number] & { displayDestination: string }> = []
  for (const [destination, entries] of byDestination) {
    const positive = entries.find((item) => ['verified_correct', 'verified_recent', 'verified_by_operator'].includes(item.state))
    const issue = entries.find((item) => item.customerFindingEligible)
    const unresolved = entries.filter((item) => item.operatorReviewRequired)
    if (positive) lookingGood.push(positive)
    if (issue && !positive) recommended.push(issue)
    // Brand Presence positives and unresolved destination counts are independent
    // from Location Diagnostic and Core Local Discovery query outcomes.
    const reviewEntries = positive ? [] : unresolved.filter((item) => item.queryId === 'search-brand-canonical')
    const review = reviewEntries[0]
    if (review) deeperReview.push({ ...review, displayDestination: destination })
  }
  return { lookingGood, recommended, deeperReview }
}
