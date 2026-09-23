import type { SearchDestination, SearchDestinationObservation } from '../types/audit'
import { publicPresenceUrl } from './searchVisibility'

export type SalesVisibilityState = 'verified_correct' | 'verified_correction_needed' | 'not_found' | 'manual_verification_needed' | 'profile_discovered'

export interface SalesVisibilityProjection {
  destination: SearchDestination
  state: SalesVisibilityState
  headline: string
  explanation: string
  identitySummary: string
  evidenceUrl: string
  nextAction: string
  customerFindingEligible: boolean
  starterPackageEligible: boolean
  deliveryResponsibility: 'Found Local can implement' | 'Found Local can assist/guide' | 'Customer/platform ownership required' | 'Manual verification required before recommendation'
  operatorReviewRequired: boolean
  technicalDetail: Record<string, unknown>
}

const labels: Record<SalesVisibilityState, string> = {
  verified_correct: 'Verified — looks correct',
  verified_correction_needed: 'Verified — needs correction',
  not_found: 'Not found',
  manual_verification_needed: 'Manual verification needed',
  profile_discovered: 'Profile discovered — verify details',
}

const discoveredUrl = (observation: SearchDestinationObservation) => observation.automation?.assessment?.matches
  .flatMap((match) => [match.candidate.fields.publicProfileUrl, match.candidate.resultUrl])
  .find((url): url is string => Boolean(url))

/** Customer-safe projection. Acquisition/matcher results remain the authority. */
export function projectSalesVisibility(observation: SearchDestinationObservation): SalesVisibilityProjection {
  const assessment = observation.automation?.assessment
  const technicalDetail = {
    provider: observation.automation?.captures.at(-1)?.provider,
    blocker: assessment?.blocker,
    confidence: assessment?.confidence,
    queryMode: observation.automation?.queryMode,
    inspectedUrl: observation.automation?.inspectedUrl,
    resultRegionInspected: assessment?.resultRegionInspected,
    provenance: observation.provenance,
    candidates: assessment?.matches,
  }
  const profileUrl = discoveredUrl(observation)
  const searchUrl = observation.automation?.inspectedUrl || publicPresenceUrl(observation.destination, observation.query)
  const automatedReview = assessment?.operatorReviewRequired === true
  const unavailable = assessment?.visibilityResult === 'unavailable' || automatedReview || observation.overallResult === 'manual_review_needed' || observation.overallResult === 'unable_to_verify' || observation.overallResult === 'not_checked'
  // Discovery is deliberately weaker than an automatic match: a platform URL
  // found in retained candidates is a useful review link, never verification.
  const profileDiscovered = Boolean(profileUrl && !assessment?.automaticObservation && assessment?.visibilityResult !== 'not_found')
  const conflicting = observation.overallResult === 'found_conflicting_information'
  const verified = Boolean(assessment?.automaticObservation && !automatedReview)
  const notFound = observation.overallResult === 'not_found' && assessment?.visibilityResult === 'not_found' && assessment.resultRegionInspected === true
  const state: SalesVisibilityState = profileDiscovered ? 'profile_discovered'
    : unavailable ? 'manual_verification_needed'
      : notFound ? 'not_found'
        : conflicting && verified ? 'verified_correction_needed'
          : verified || ['found_match', 'found_prominently'].includes(observation.overallResult) && observation.reviewed ? 'verified_correct'
            : 'manual_verification_needed'
  const evidenceUrl = state === 'profile_discovered' && profileUrl ? profileUrl : searchUrl
  const explanation = state === 'verified_correct' ? 'A matching business result was inspected and aligns with the reviewed business details.'
    : state === 'verified_correction_needed' ? 'A reviewed public result has a confirmed identity difference that should be corrected.'
      : state === 'not_found' ? 'A usable result region was inspected and no sufficient business match was found.'
        : state === 'profile_discovered' ? 'A likely public profile was discovered indirectly; its details have not yet been verified.'
          : 'This destination still needs an operator review. An unavailable or restricted check is not a business problem.'
  const nextAction = state === 'verified_correct' ? 'No action needed'
    : state === 'verified_correction_needed' ? 'Review the confirmed difference and propose the appropriate correction'
      : state === 'not_found' ? 'Confirm the absence, then assess practical listing remediation'
        : state === 'profile_discovered' ? 'Open profile and verify business details'
          : profileUrl ? 'Open profile and record the review outcome' : 'Open search and record the review outcome'
  return { destination: observation.destination, state, headline: labels[state], explanation,
    identitySummary: state === 'verified_correct' ? 'Business identity aligns with reviewed details' : state === 'verified_correction_needed' ? 'A reviewed identity difference was observed' : 'Identity still requires verification',
    evidenceUrl, nextAction, customerFindingEligible: state === 'verified_correction_needed' || state === 'not_found', starterPackageEligible: state === 'verified_correction_needed' || state === 'not_found',
    deliveryResponsibility: state === 'verified_correction_needed' ? 'Found Local can implement' : state === 'not_found' ? 'Found Local can assist/guide' : state === 'verified_correct' ? 'Customer/platform ownership required' : 'Manual verification required before recommendation',
    operatorReviewRequired: !['verified_correct', 'verified_correction_needed', 'not_found'].includes(state), technicalDetail }
}

export const salesVisibilityGroups = (observations: SearchDestinationObservation[]) => {
  const all = observations.map(projectSalesVisibility)
  return {
    lookingGood: all.filter((item) => item.state === 'verified_correct'),
    recommended: all.filter((item) => item.customerFindingEligible),
    stillToVerify: all.filter((item) => item.operatorReviewRequired),
  }
}

export interface SalesVisibilityRecord { queryId: string; observation: SearchDestinationObservation }

/**
 * Customer Scan rolls query evidence up intentionally. Brand proof is a
 * strength; an unresolved Bing location diagnostic is a separate review
 * question, while repeated manual fallbacks collapse to one destination.
 */
export function salesCockpitVisibility(records: SalesVisibilityRecord[]) {
  const projected = records.map(({ queryId, observation }) => ({ queryId, ...projectSalesVisibility(observation) }))
  const byDestination = new Map<SearchDestination, typeof projected>()
  for (const item of projected) byDestination.set(item.destination, [...(byDestination.get(item.destination) || []), item])
  const lookingGood: typeof projected = []
  const recommended: typeof projected = []
  const deeperReview: Array<typeof projected[number] & { displayDestination: string }> = []
  for (const [destination, entries] of byDestination) {
    const positive = entries.find((item) => item.state === 'verified_correct')
    const issue = entries.find((item) => item.customerFindingEligible)
    const unresolved = entries.filter((item) => item.operatorReviewRequired)
    if (positive) lookingGood.push(positive)
    if (issue && !positive) recommended.push(issue)
    // Only Bing's distinct location diagnostic accompanies a branded win.
    const reviewEntries = positive && destination === 'Bing Search'
      ? unresolved.filter((item) => item.queryId.includes('market')) : positive ? [] : unresolved
    const review = reviewEntries[0]
    if (review) deeperReview.push({ ...review, displayDestination: positive && destination === 'Bing Search' ? 'Bing location visibility' : destination })
  }
  return { lookingGood, recommended, deeperReview }
}
