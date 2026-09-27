import type { AcquisitionMethod } from './acquisition.js'

export type EntityField = 'name' | 'streetAddress' | 'locality' | 'region' | 'postalCode' | 'address' | 'phone' | 'website' | 'category' | 'placeIdentity' | 'publicProfileUrl'
export interface EvidenceReference {
  sourceUrl: string
  acquiredAt: string
  method: AcquisitionMethod
  provider: string
  locator: string
  excerpt: string
}
export interface BusinessResultCandidate {
  id: string
  kind: 'structured_entity' | 'semantic_card' | 'result_link'
  /** Provider-normalized result shape. Retained as provenance; it is not an identity signal by itself. */
  sourceType?: 'organic' | 'knowledge_panel' | 'local_place'
  /** Destination of the search result card. This may be a publisher/listing page and is not itself a business identity claim. */
  resultUrl?: string
  fields: Partial<Record<EntityField, string>>
  schemaTypes?: string[]
  evidence: EvidenceReference[]
}
export interface FieldComparison { field: EntityField; expected: string; observed: string }
export interface EntityMatch {
  candidate: BusinessResultCandidate
  matchedFields: FieldComparison[]
  conflictingFields: FieldComparison[]
  missingFields: EntityField[]
  unreviewedProfileFields: EntityField[]
  confidence: 'high' | 'medium' | 'low'
  automaticObservation: boolean
  ambiguityReasons: string[]
  evidence: EvidenceReference[]
}
export type SearchQueryMode = 'brand' | 'location' | 'discovery'
export interface GoogleIdentityDecision {
  version: 1
  decision: 'verified' | 'review_required'
  matchedSignals: FieldComparison[]
  conflictingSignals: FieldComparison[]
  candidateIds: string[]
  sourceTypes: NonNullable<BusinessResultCandidate['sourceType']>[]
  rule: 'two_strong_identifiers_with_name_or_domain_no_conflict'
}
export interface SearchEntityAssessment {
  matches: EntityMatch[]
  selected?: EntityMatch
  confidence: 'high' | 'medium' | 'low' | 'unavailable'
  automaticObservation: boolean
  visibilityResult: 'found' | 'not_found' | 'review_required' | 'unavailable'
  operatorReviewRequired: boolean
  resultRegionInspected: boolean
  ambiguityReasons: string[]
  blocker: 'none' | 'no_match' | 'acquisition_failure' | 'access_blocked' | 'runtime_unavailable' | 'interactive_page' | 'insufficient_identity' | 'multiple_entities' | 'identifier_conflict' | 'unreviewed_profile'
  tier3Candidate: boolean
  /** Explainable Google-only aggregate identity decision. Raw acquired candidates remain unchanged. */
  googleIdentityDecision?: GoogleIdentityDecision
}
