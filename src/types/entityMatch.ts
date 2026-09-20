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
}
