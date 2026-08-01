import type {
  CheckStatus,
  EvidenceConfidence,
  SearchDestination,
  SearchDestinationObservation,
} from '../types/audit'

const primaryDestinations: SearchDestination[] = [
  'Google Search',
  'Google Maps',
  'Bing Search',
]

export type SearchAggregateKind =
  | 'strong'
  | 'mixed'
  | 'weak_or_absent'
  | 'conflicting_information'
  | 'unable_to_verify'

export interface SearchDestinationAggregate {
  kind: SearchAggregateKind
  status: CheckStatus
  priority: 'High' | 'Medium' | 'Low'
  recommendation: string
  observations: SearchDestinationObservation[]
  primaryObservations: SearchDestinationObservation[]
  evidenceConfidence: EvidenceConfidence
}

const sorted = (items: SearchDestinationObservation[]) =>
  [...items].sort((a, b) => a.destination.localeCompare(b.destination))

// Search conclusions are intentionally conservative. These tiers translate the
// existing evidence-provenance vocabulary without replacing it in saved scans.
const confidenceRank: Record<EvidenceConfidence, number> = {
  owner_confirmed: 4,
  public_page_observed: 3,
  scanner_detected_public_page: 3,
  operator_provided_page_text: 3,
  operator_observation: 3,
  public_search_observed: 3,
  ai_answer_response: 2,
  derived_readiness_signal: 2,
  manual_needs_confirmation: 2,
}

const conservativePrimaryConfidence = (
  observations: SearchDestinationObservation[],
): EvidenceConfidence =>
  [...observations].sort(
    (a, b) => confidenceRank[a.confidence] - confidenceRank[b.confidence],
  )[0].confidence

export const aggregateReviewedSearchObservations = (
  observations: Array<SearchDestinationObservation | undefined>,
): SearchDestinationAggregate | null => {
  const reviewed = sorted(
    observations.filter(
      (item): item is SearchDestinationObservation => Boolean(item?.reviewed),
    ),
  )
  if (!reviewed.length) return null

  const primary = reviewed.filter((item) =>
    primaryDestinations.includes(item.destination),
  )
  // Supporting destinations stay visible in evidence, but cannot create or
  // weaken a primary Search conclusion on their own.
  if (!primary.length) return null

  const results = primary.map((item) => item.overallResult)
  const evidenceConfidence = conservativePrimaryConfidence(primary)
  const hasConflict = results.includes('found_conflicting_information')
  const hasStrong = results.includes('found_prominently')
  const hasWeak = results.some((result) =>
    ['found_weak', 'found_directory_only', 'not_found'].includes(result),
  )

  if (hasConflict) {
    return {
      kind: 'conflicting_information', status: 'partial', priority: 'High',
      recommendation: 'Correct inconsistent business information in the reviewed destinations, then verify the website, listings, and source data agree.',
      observations: reviewed, primaryObservations: primary, evidenceConfidence,
    }
  }
  if (hasStrong && hasWeak) {
    return {
      kind: 'mixed', status: 'partial', priority: 'Medium',
      recommendation: 'Use the destination-specific evidence below to correct or verify weaker sources. Strong results in one destination do not confirm the others.',
      observations: reviewed, primaryObservations: primary, evidenceConfidence,
    }
  }
  if (hasStrong) {
    return {
      kind: 'strong', status: 'pass', priority: 'Low',
      recommendation: 'Maintain the reviewed source signals and monitor destination-specific changes. Untested destinations are not treated as failures.',
      observations: reviewed, primaryObservations: primary, evidenceConfidence,
    }
  }
  if (hasWeak) {
    return {
      kind: 'weak_or_absent', status: results.every((result) => result === 'not_found') ? 'fail' : 'partial', priority: 'High',
      recommendation: 'Strengthen discovery visibility through accurate listings, category/service/location content, citations, and destination-specific verification.',
      observations: reviewed, primaryObservations: primary, evidenceConfidence,
    }
  }
  return {
    kind: 'unable_to_verify', status: 'unknown', priority: 'Low',
    recommendation: 'No conclusive reviewed destination result is available. Verify the recorded destinations before planning corrective work.',
    observations: reviewed, primaryObservations: primary, evidenceConfidence,
  }
}
