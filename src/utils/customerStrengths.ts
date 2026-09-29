import type { AuditItem, AuditState, CustomerStrengthPresentation, SearchDestinationObservation } from '../types/audit'
import type { EntityMatch } from '../types/entityMatch'
import { reviewedBusinessProfile } from './businessProfileState'
import { customerBusinessNoun, localBusinessModel } from './businessContext'
import { evidenceFingerprint } from './evidenceFingerprint'
import { effectiveGoogleAutomaticIdentityState } from './googleAcquisitionResilience'
import { salesCockpitVisibility } from './salesVisibilityProjection'
import type { SalesVisibilityProjection } from './salesVisibilityProjection'

export interface CustomerStrengthCandidate {
  id: string
  source: 'search_destination' | 'website_check'
  sourceTitle: string
  evidenceSummary: string
  defaultTitle: string
  defaultSummary: string
  evidenceKey: string
}

export interface EffectiveCustomerStrength {
  id: string
  title: string
  summary: string
  wordingSource: 'generated' | 'operator_refined'
}

export interface CustomerStrengthReviewItem extends CustomerStrengthCandidate {
  included: boolean
  title: string
  summary: string
  state: 'included_generated' | 'included_refined' | 'hidden' | 'needs_reconfirmation'
  previous?: CustomerStrengthPresentation
}

export interface CustomerStrengthInput {
  included: boolean
  title?: string
  summary?: string
}

const materialEntityMatch = (match: EntityMatch) => ({
  candidate: {
    kind: match.candidate.kind,
    sourceType: match.candidate.sourceType,
    resultUrl: match.candidate.resultUrl,
    fields: match.candidate.fields,
    schemaTypes: match.candidate.schemaTypes,
  },
  matchedFields: match.matchedFields,
  conflictingFields: match.conflictingFields,
  missingFields: match.missingFields,
  unreviewedProfileFields: match.unreviewedProfileFields,
  confidence: match.confidence,
  automaticObservation: match.automaticObservation,
  ambiguityReasons: match.ambiguityReasons,
})

const materialSearchEvidence = (
  state: AuditState,
  queryId: string,
  observation: SearchDestinationObservation,
  projection?: SalesVisibilityProjection,
) => {
  const derivedMaps = projection?.derivedGoogleMapsVerification
  if (derivedMaps) {
    const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
    return {
      version: 'found-local-material-strength-v1',
      source: 'search_destination',
      id: 'search:Google Maps',
      profile: { businessName: profile.businessName },
      queryId,
      destination: 'Google Maps',
      derivedEvidenceKey: derivedMaps.evidenceKey,
      provenance: derivedMaps.provenance,
    }
  }
  const retained = effectiveGoogleAutomaticIdentityState(observation, { profile: state.profile, profileState: state.businessProfile }) === 'verified_recent'
    ? observation.retainedGoogleVerification : undefined
  const assessment = retained?.automation.assessment || observation.automation?.assessment
  const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
  return {
    version: 'found-local-material-strength-v1',
    source: 'search_destination',
    id: `search:${observation.destination}`,
    profile: { businessName: profile.businessName },
    queryId,
    destination: observation.destination,
    query: observation.query,
    overallResult: retained ? 'found_match' : observation.overallResult,
    observedResultTypes: retained?.observedResultTypes || observation.observedResultTypes,
    evidenceNotes: retained?.evidenceNotes || observation.evidenceNotes,
    evidenceKind: retained?.evidenceKind || observation.evidenceKind,
    confidence: retained?.confidence || observation.confidence,
    reviewed: retained ? false : observation.reviewed,
    operatorVerification: !retained && observation.operatorVerification ? {
      evidenceKey: observation.operatorVerification.evidenceKey,
      outcome: observation.operatorVerification.outcome,
      mismatches: observation.operatorVerification.mismatches,
      operatorObservedUrl: observation.operatorVerification.operatorObservedUrl,
      classifiedCanonicalProfileUrl: observation.operatorVerification.classifiedCanonicalProfileUrl,
      provenance: observation.operatorVerification.provenance,
    } : undefined,
    queryMode: retained?.automation.queryMode || observation.automation?.queryMode,
    assessment: assessment ? {
      visibilityResult: assessment.visibilityResult,
      automaticObservation: assessment.automaticObservation,
      operatorReviewRequired: assessment.operatorReviewRequired,
      resultRegionInspected: assessment.resultRegionInspected,
      confidence: assessment.confidence,
      blocker: assessment.blocker,
      ambiguityReasons: assessment.ambiguityReasons,
      googleIdentityDecision: assessment.googleIdentityDecision,
      bingIdentityDecision: assessment.bingIdentityDecision,
      selected: assessment.selected ? materialEntityMatch(assessment.selected) : undefined,
      matches: assessment.matches.map(materialEntityMatch),
    } : undefined,
  }
}

const websiteDefaultWording = (state: AuditState, item: AuditItem) => {
  const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
  if (item.id === 'website-faq') {
    const noun = customerBusinessNoun(profile)
    const detail = noun === 'school' ? 'FAQ and program information that helps families understand the school'
      : localBusinessModel(profile) === 'service_area' ? `FAQ and service information that helps customers understand the ${noun}`
        : `FAQ and offering information that helps customers understand the ${noun}`
    return { title: 'Helpful website content', summary: `The website includes useful ${detail}.` }
  }
  if (item.id === 'website-sitemap-robots') return {
    title: 'Search accessibility',
    summary: 'The website includes the basic files search engines use to discover and access its pages.',
  }
  return { title: item.label, summary: 'This reviewed check is looking good.' }
}

const materialWebsiteEvidence = (state: AuditState, item: AuditItem) => {
  const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
  const wordingUsesBusinessType = item.id === 'website-faq'
  return {
    version: 'found-local-material-strength-v1',
    source: 'website_check',
    id: `check:${item.id}`,
    item: { id: item.id, area: item.area, label: item.label, description: item.description },
    result: state.checks[item.id],
    evidenceSummary: state.notes[item.id] || '',
    evidenceConfidence: state.evidenceConfidence[item.id],
    businessContext: wordingUsesBusinessType ? {
      primaryCategory: profile.primaryCategory,
      secondaryCategories: profile.secondaryCategories,
      serviceArea: profile.serviceArea,
      streetAddress: profile.streetAddress,
    } : undefined,
  }
}

/** Generates the complete current positive-evidence set once for Review and export consumers. */
export function customerStrengthCandidates(state: AuditState, items: AuditItem[]): CustomerStrengthCandidate[] {
  const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
  const records = Object.entries(state.searchDestinationObservations).flatMap(([queryId, destinations]) =>
    Object.values(destinations).filter((observation): observation is SearchDestinationObservation => Boolean(observation)).map((observation) => ({ queryId, observation })),
  )
  const searchStrengths = salesCockpitVisibility(records, { profile: state.profile, profileState: state.businessProfile }).lookingGood.map((entry) => {
    const observation = state.searchDestinationObservations[entry.queryId]?.[entry.destination]
    if (!observation) throw new Error(`Missing current strength evidence for ${entry.destination}`)
    const material = materialSearchEvidence(state, entry.queryId, observation, entry)
    return {
      id: `search:${entry.destination}`,
      source: 'search_destination' as const,
      sourceTitle: entry.destination,
      evidenceSummary: entry.explanation,
      defaultTitle: entry.destination,
      defaultSummary: entry.destination === 'Google Maps'
        ? `We verified that ${profile.businessName || 'the business'} has a Google Maps business profile matching the reviewed business information.`
        : entry.destination === 'Apple Maps'
          ? `We verified that ${profile.businessName || 'the business'} has an Apple Maps listing matching the reviewed business information.`
        : `We verified that the business identity shown in ${entry.destination} matches the reviewed information${profile.businessName ? ` for ${profile.businessName}` : ''}.`,
      evidenceKey: evidenceFingerprint(material),
    }
  })
  const websiteStrengths = items.filter((item) => state.checks[item.id] === 'pass').slice(0, 6).map((item) => {
    const defaults = websiteDefaultWording(state, item)
    return {
      id: `check:${item.id}`,
      source: 'website_check' as const,
      sourceTitle: item.label,
      evidenceSummary: state.notes[item.id] || item.description,
      defaultTitle: defaults.title,
      defaultSummary: defaults.summary,
      evidenceKey: evidenceFingerprint(materialWebsiteEvidence(state, item)),
    }
  })
  return [...searchStrengths, ...websiteStrengths]
}

export const customerStrengthStateIsCurrent = (candidate: CustomerStrengthCandidate, presentation: CustomerStrengthPresentation | undefined) =>
  Boolean(presentation && presentation.evidenceKey === candidate.evidenceKey)

export function customerStrengthReviewItems(state: AuditState, items: AuditItem[]): CustomerStrengthReviewItem[] {
  return customerStrengthCandidates(state, items).map((candidate) => {
    const previous = state.customerStrengthPresentations?.[candidate.id]
    if (previous && !customerStrengthStateIsCurrent(candidate, previous)) return {
      ...candidate,
      included: false,
      title: candidate.defaultTitle,
      summary: candidate.defaultSummary,
      state: 'needs_reconfirmation' as const,
      previous,
    }
    const included = previous?.included ?? true
    const title = previous?.title || candidate.defaultTitle
    const summary = previous?.summary || candidate.defaultSummary
    const refined = Boolean(previous?.title || previous?.summary)
    return {
      ...candidate, included, title, summary, previous,
      state: included ? refined ? 'included_refined' as const : 'included_generated' as const : 'hidden' as const,
    }
  })
}

/** The sole customer-safe strength projection used by Customer Review, QA text, and JSON. */
export function effectiveCustomerStrengths(state: AuditState, items: AuditItem[]): EffectiveCustomerStrength[] {
  return customerStrengthReviewItems(state, items)
    .filter((item) => item.included && item.state !== 'needs_reconfirmation')
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      wordingSource: item.state === 'included_refined' ? 'operator_refined' : 'generated',
    }))
}

export const buildCustomerStrengthPresentation = (
  candidate: CustomerStrengthCandidate,
  input: CustomerStrengthInput,
): CustomerStrengthPresentation => {
  const title = input.title?.trim()
  const summary = input.summary?.trim()
  return {
    evidenceKey: candidate.evidenceKey,
    included: input.included,
    ...(title && title !== candidate.defaultTitle ? { title } : {}),
    ...(summary && summary !== candidate.defaultSummary ? { summary } : {}),
  }
}
