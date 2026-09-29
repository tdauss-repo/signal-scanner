import type { SearchDestinationObservation } from '../types/audit'
import type { SalesVisibilityProjection } from './salesVisibilityProjection'

export interface BrandPresenceEvidenceSummary {
  acquisition: string
  result: string
  observedResultUrl?: string
  knownProfileUrl?: string
  observedAt?: string
  lastVerifiedAt?: string
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

const acquisitionFailureReason = (observation: SearchDestinationObservation) => {
  const capture = observation.automation?.captures.at(-1)
  const blocker = capture?.blocker || observation.automation?.assessment?.blocker || ''
  const error = capture?.error || ''
  if (blocker === 'provider_timeout' || /timed out|TimeoutError/i.test(error)) return 'Provider timeout.'
  if (blocker === 'authentication_failure') return 'Provider authentication unavailable.'
  if (blocker === 'zone_configuration_error' || blocker === 'configuration_missing') return 'Provider configuration unavailable.'
  if (blocker === 'network_failure') return 'Provider network request failed.'
  if (blocker === 'capacity_busy') return 'A dedicated acquisition for this destination is already in progress.'
  if (blocker === 'bing_acquisition_not_configured') return 'Dedicated Bing acquisition is not configured.'
  if (blocker === 'runtime_exception') return 'Acquisition server could not complete the request.'
  if (blocker === 'http_5xx' || blocker === 'embedded_5xx') return 'Provider service returned an error.'
  if (blocker === 'http_error') return capture?.statusCode ? `Provider request returned HTTP ${capture.statusCode}.` : 'Provider request returned an error.'
  if (['malformed_response', 'structurally_insufficient'].includes(blocker)) return 'Provider response could not be parsed into usable evidence.'
  if (blocker === 'missing_result_region' || blocker === 'provider_failure') return 'Provider returned no usable response.'
  if (['provider_captcha', 'google_sorry', 'captcha_or_challenge', 'access_failure', 'access_blocked'].includes(blocker)) return 'Provider access was restricted.'
  if (blocker === 'acquisition_failure') return 'Acquisition server unavailable.'
  return 'Provider could not complete this check.'
}

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
  if (sales.derivedGoogleMapsVerification) return sales.state === 'verified_recent'
    ? 'Maps business identity verified from recent Google evidence'
    : 'Maps business identity verified'
  if (sales.state === 'verified_recent') return 'Business identity verified from recent evidence'
  if (unavailable(observation)) return 'No verified result'
  if (sales.state === 'website_result_discovered') return 'Website result discovered'
  if (sales.state === 'profile_discovered') return 'Profile candidate discovered'
  if (['verified_correct', 'verified_recent', 'verified_by_operator'].includes(sales.state)) return 'Business identity verified'
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

const automaticIdentityEvidence = (observation: SearchDestinationObservation, sales: SalesVisibilityProjection) => {
  if (sales.derivedGoogleMapsVerification) return sales.derivedGoogleMapsVerification.matchedSignals.map((signal) => ({
    label: identityLabel(signal.field),
    result: signal.field === 'name' ? 'Matches' : `Matches ${signal.observed}`,
  }))
  const decision = observation.automation?.assessment?.googleIdentityDecision
    || observation.automation?.assessment?.bingIdentityDecision
    || observation.retainedGoogleVerification?.automation.assessment?.googleIdentityDecision
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
  const retained = sales.state === 'verified_recent' ? observation.retainedGoogleVerification : undefined
  const derived = sales.derivedGoogleMapsVerification
  const acquisition = derived?.freshness === 'recent' ? 'Recent derived evidence retained'
    : derived ? 'Derived automated evidence'
    : retained ? 'Recent automated evidence retained'
    : failed ? 'Automated check unavailable'
    : observation.operatorAssisted ? 'Operator-assisted evidence'
      : observation.automation ? 'Automated evidence'
        : observation.operatorVerification ? 'Operator verification'
          : 'Manual evidence'
  const identityEvidence = automaticIdentityEvidence(observation, sales)
  return {
    acquisition,
    result: resultLabel(observation, sales),
    ...(observation.observedResultUrl || retained?.observedResultUrl ? { observedResultUrl: observation.observedResultUrl || retained?.observedResultUrl } : {}),
    ...(sales.knownProfileUrl ? { knownProfileUrl: sales.knownProfileUrl } : {}),
    ...(derived?.freshness === 'fresh' ? { observedAt: derived.verifiedAt }
      : observation.observedAt ? { observedAt: observation.observedAt } : {}),
    ...(derived?.freshness === 'recent' ? { lastVerifiedAt: derived.verifiedAt }
      : retained?.verifiedAt ? { lastVerifiedAt: retained.verifiedAt } : {}),
    source: derived ? 'Google Search knowledge panel' : observation.destination,
    ...(derived?.freshness === 'fresh' ? { automationState: 'Completed' }
      : automationStateLabel(observation) ? { automationState: automationStateLabel(observation) } : {}),
    ...(!failed || retained || derived ? { interpretation: sales.explanation } : {
      reason: acquisitionFailureReason(observation),
      nextStep: 'Use assisted verification.',
    }),
    ...(failed && (retained || derived) ? {
      reason: acquisitionFailureReason(observation),
    } : {}),
    verificationUrl: observation.verificationUrl,
    verificationLabel: `${observation.destination} verification query`,
    ...(identityEvidence?.length ? { identityEvidence } : {}),
    ...(derived ? { decision: derived.freshness === 'recent' ? 'Verified from recent evidence' : 'Verified automatically' }
      : retained ? { decision: 'Verified from recent evidence' }
      : observation.automation?.assessment?.googleIdentityDecision || observation.automation?.assessment?.bingIdentityDecision ? {
        decision: (observation.automation.assessment.googleIdentityDecision || observation.automation.assessment.bingIdentityDecision)?.decision === 'verified' ? 'Verified automatically' : 'Assisted verification required',
      } : {}),
  }
}

/**
 * Diagnostic projection of the same workspace record. Nothing is copied into
 * persistence; serialization happens only after the operator opens the nested
 * technical disclosure.
 */
export function brandPresenceTechnicalEvidence(observation: SearchDestinationObservation, sales?: SalesVisibilityProjection) {
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
    retainedGoogleVerification: observation.retainedGoogleVerification,
    derivedGoogleMapsVerification: sales?.derivedGoogleMapsVerification,
    operatorAssisted: observation.operatorAssisted,
    operatorVerification: observation.operatorVerification,
  }
}

export const serializeBrandPresenceTechnicalEvidence = (observation: SearchDestinationObservation, sales?: SalesVisibilityProjection) =>
  JSON.stringify(brandPresenceTechnicalEvidence(observation, sales), null, 2)

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
