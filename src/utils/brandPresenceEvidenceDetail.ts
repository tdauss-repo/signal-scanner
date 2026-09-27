import type { SearchDestinationObservation } from '../types/audit'
import type { SalesVisibilityProjection } from './salesVisibilityProjection'

export interface BrandPresenceEvidenceSummary {
  acquisition: string
  result: string
  observedResultUrl?: string
  knownProfileUrl?: string
  observedAt?: string
  source: string
  automationState?: string
  interpretation?: string
  reason?: string
  nextStep?: string
  verificationUrl: string
  verificationLabel: string
  identityEvidence?: Array<{ label: string; result: string }>
  decision?: string
}

const unavailable = (observation: SearchDestinationObservation) =>
  observation.automation?.assessment?.visibilityResult === 'unavailable' ||
  ['failed'].includes(observation.automation?.state || '')

const automationStateLabel = (observation: SearchDestinationObservation) => {
  if (!observation.automation) return undefined
  if (unavailable(observation)) return 'Unavailable'
  if (['evidence_captured', 'checked_clear', 'needs_attention'].includes(observation.automation.state)) return 'Completed'
  if (['awaiting_review', 'interactive_review_required'].includes(observation.automation.state)) return 'Review required'
  if (observation.automation.state === 'scanning') return 'In progress'
  if (observation.automation.state === 'queued') return 'Queued'
  return 'Not completed'
}

const resultLabel = (observation: SearchDestinationObservation, sales: SalesVisibilityProjection) => {
  if (unavailable(observation)) return 'No verified result'
  if (sales.state === 'website_result_discovered') return 'Website result discovered'
  if (sales.state === 'profile_discovered') return 'Profile candidate discovered'
  if (['verified_correct', 'verified_by_operator'].includes(sales.state)) return 'Business identity verified'
  if (['verified_correction_needed', 'operator_correction_needed'].includes(sales.state)) return 'Business information needs correction'
  if (sales.state === 'operator_not_found') return 'Not found during operator review'
  if (sales.state === 'operator_unable_to_determine') return 'Unable to determine'
  if (sales.state === 'reconfirmation_needed') return 'Prior verification needs reconfirmation'
  if (observation.observedResultUrl) {
    return ['Google Maps', 'Apple Maps', 'Yelp', 'Facebook', 'Instagram'].includes(observation.destination)
      ? 'Profile candidate discovered'
      : 'Search result discovered'
  }
  return 'No verified result'
}

const identityLabel = (field: string) => ({
  name: 'Name', website: 'Website', address: 'Address', streetAddress: 'Address', phone: 'Phone',
  locality: 'City', region: 'State', postalCode: 'ZIP',
}[field] || field)

const automaticIdentityEvidence = (observation: SearchDestinationObservation) => {
  const decision = observation.automation?.assessment?.googleIdentityDecision
  if (!decision) return undefined
  return [
    ...decision.matchedSignals.map((signal) => ({ label: identityLabel(signal.field), result: signal.field === 'name' ? 'Matches' : `Matches ${signal.observed}` })),
    ...decision.conflictingSignals.map((signal) => ({ label: identityLabel(signal.field), result: `Conflicts: observed ${signal.observed}; reviewed ${signal.expected}` })),
  ]
}

/** Decision-relevant operator summary projected from the retained evidence. */
export function brandPresenceEvidenceSummary(
  observation: SearchDestinationObservation,
  sales: SalesVisibilityProjection,
): BrandPresenceEvidenceSummary {
  const failed = unavailable(observation)
  const acquisition = failed ? 'Automated check unavailable'
    : observation.operatorAssisted ? 'Operator-assisted evidence'
      : observation.automation ? 'Automated evidence'
        : observation.operatorVerification ? 'Operator verification'
          : 'Manual evidence'
  const identityEvidence = automaticIdentityEvidence(observation)
  return {
    acquisition,
    result: resultLabel(observation, sales),
    ...(observation.observedResultUrl ? { observedResultUrl: observation.observedResultUrl } : {}),
    ...(sales.knownProfileUrl ? { knownProfileUrl: sales.knownProfileUrl } : {}),
    ...(observation.observedAt ? { observedAt: observation.observedAt } : {}),
    source: observation.destination,
    ...(automationStateLabel(observation) ? { automationState: automationStateLabel(observation) } : {}),
    ...(!failed ? { interpretation: sales.explanation } : {
      reason: 'Provider could not complete this check.',
      nextStep: 'Use assisted verification.',
    }),
    verificationUrl: observation.verificationUrl,
    verificationLabel: `${observation.destination} verification query`,
    ...(identityEvidence?.length ? { identityEvidence } : {}),
    ...(observation.automation?.assessment?.googleIdentityDecision ? {
      decision: observation.automation.assessment.googleIdentityDecision.decision === 'verified' ? 'Verified automatically' : 'Assisted verification required',
    } : {}),
  }
}

/**
 * Diagnostic projection of the same workspace record. Nothing is copied into
 * persistence; serialization happens only after the operator opens the nested
 * technical disclosure.
 */
export function brandPresenceTechnicalEvidence(observation: SearchDestinationObservation) {
  return {
    destination: observation.destination,
    query: observation.query,
    provenance: observation.provenance,
    evidenceKind: observation.evidenceKind,
    confidence: observation.confidence,
    observedAt: observation.observedAt,
    verificationUrl: observation.verificationUrl,
    observedResultUrl: observation.observedResultUrl,
    canonicalProfileUrl: observation.canonicalProfileUrl,
    automation: observation.automation,
    operatorAssisted: observation.operatorAssisted,
    operatorVerification: observation.operatorVerification,
  }
}

export const serializeBrandPresenceTechnicalEvidence = (observation: SearchDestinationObservation) =>
  JSON.stringify(brandPresenceTechnicalEvidence(observation), null, 2)

/** Full href is retained separately; labels omit query/hash and bound long paths. */
export function shortEvidenceUrl(value: string, maxLength = 100) {
  try {
    const url = new URL(value)
    const label = `${url.hostname.replace(/^www\./i, '')}${url.pathname === '/' ? '' : url.pathname}`
    return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label
  } catch {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
  }
}
