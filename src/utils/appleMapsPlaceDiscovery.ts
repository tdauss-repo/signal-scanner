import type { BusinessProfile, BusinessProfileState, SearchDestinationObservation } from '../types/audit'
import type { WebsiteAuditResult } from '../types/websiteAudit'
import { effectiveBrandPresenceAutomaticIdentityState } from './brandPresenceWorkspaceRetention'
import { evidenceFingerprint } from './evidenceFingerprint'
import { normalizedWords } from './entityMatcher'
import { parseApplePlaceUrl, type ApplePlaceUrlIdentity } from './appleMapsPlace'

export type ApplePlaceDiscoverySource = 'first_party_website' | 'verified_search_evidence' | 'verified_public_evidence'

export interface ApplePlaceDiscovery extends ApplePlaceUrlIdentity {
  source: ApplePlaceDiscoverySource
  sourceUrl?: string
  sourceDestination?: string
  observedName?: string
  evidenceKey: string
}

const nameMatches = (expected: string, observed: string) => {
  const wanted = normalizedWords(expected)
  const actual = normalizedWords(observed)
  return Boolean(wanted && actual && (actual === wanted || actual.includes(wanted) || wanted.includes(actual)))
}

const withProvenance = (
  identity: ApplePlaceUrlIdentity,
  provenance: Omit<ApplePlaceDiscovery, keyof ApplePlaceUrlIdentity | 'evidenceKey'>,
): ApplePlaceDiscovery => {
  const material = { ...identity, ...provenance }
  return { ...material, evidenceKey: evidenceFingerprint({ version: 'found-local-apple-place-discovery-v1', ...material }) }
}

const stringsInStructuredValue = (value: unknown) => {
  const found: string[] = []
  let budget = 2500
  const visit = (current: unknown, depth: number) => {
    if (budget-- <= 0 || depth > 12) return
    if (typeof current === 'string') { found.push(current); return }
    if (!current || typeof current !== 'object') return
    if (Array.isArray(current)) { current.slice(0, 100).forEach((item) => visit(item, depth + 1)); return }
    Object.values(current as Record<string, unknown>).slice(0, 100).forEach((item) => visit(item, depth + 1))
  }
  visit(value, 0)
  return found
}

/** Explicit URLs only: no Apple Place ID, slug, coordinate, or URL is constructed. */
export function discoverAppleMapsPlace(
  profile: BusinessProfile,
  profileState: BusinessProfileState,
  website: WebsiteAuditResult | null | undefined,
  observations: Record<string, Partial<Record<string, SearchDestinationObservation>>> | undefined,
  now = Date.now(),
): ApplePlaceDiscovery | undefined {
  const firstPartyValues = [
    ...(website?.socialProfileLinks || []),
    ...(website?.jsonLdSchemaBlocks || []).flatMap(stringsInStructuredValue),
  ]
  for (const value of firstPartyValues) {
    const identity = parseApplePlaceUrl(value)
    if (identity) return withProvenance(identity, { source: 'first_party_website', sourceUrl: website?.fetchedUrl })
  }

  for (const destinations of Object.values(observations || {})) for (const observation of Object.values(destinations)) {
    if (!observation || observation.destination === 'Apple Maps') continue
    const currentAssessment = observation.automation?.assessment
    const directlyVerified = Boolean(currentAssessment?.automaticObservation && currentAssessment.visibilityResult === 'found' &&
      !currentAssessment.operatorReviewRequired && currentAssessment.blocker === 'none')
    const effective = directlyVerified ? 'verified'
      : effectiveBrandPresenceAutomaticIdentityState(observation, { profile, profileState, now })
    if (effective !== 'verified' && effective !== 'verified_recent') continue
    const assessment = effective === 'verified_recent'
      ? observation.retainedBrandVerification?.assessment
      : currentAssessment
    const selected = assessment?.selected
    const nameAligned = nameMatches(profile.businessName, selected?.candidate.fields.name || '')
    const domainAligned = selected?.matchedFields.some((field) => field.field === 'website')
    if (!selected || (!nameAligned && !domainAligned)) continue
    const values = [
      selected.candidate.fields.publicProfileUrl,
      selected.candidate.resultUrl,
      observation.canonicalProfileUrl,
      observation.observedResultUrl,
    ]
    for (const value of values) {
      const identity = parseApplePlaceUrl(value)
      if (!identity) continue
      const source = ['Google Search', 'Bing Search', 'DuckDuckGo'].includes(observation.destination)
        ? 'verified_search_evidence' as const : 'verified_public_evidence' as const
      return withProvenance(identity, {
        source,
        sourceDestination: observation.destination,
        sourceUrl: selected.evidence[0]?.sourceUrl || observation.observedResultUrl,
        observedName: selected.candidate.fields.name,
      })
    }
  }
  return undefined
}
