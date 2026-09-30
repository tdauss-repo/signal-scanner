import type { SearchDestinationObservation } from '../types/audit'
import type { WebsiteAuditResult } from '../types/websiteAudit'
import { normalizedWords } from './entityMatcher'
import { canonicalMetaProfileUrl, type MetaPlatform } from './metaPublicEvidence'

export interface SocialProfileDiscovery {
  platform: MetaPlatform
  profileUrl: string
  source: 'first_party_website' | 'search_evidence'
  sourceUrl?: string
  observedName?: string
}

const nameMatches = (expected: string, observed: string) => {
  const wanted = normalizedWords(expected)
  const actual = normalizedWords(observed)
  return Boolean(wanted && actual && (actual === wanted || actual.includes(wanted)))
}

/** Explicit links only. No handle or slug is ever constructed from a business name. */
export function discoverSocialProfile(
  platform: MetaPlatform,
  reviewedBusinessName: string,
  website: WebsiteAuditResult | null | undefined,
  observations: Record<string, Partial<Record<string, SearchDestinationObservation>>> | undefined,
): SocialProfileDiscovery | undefined {
  for (const value of website?.socialProfileLinks || []) {
    const profileUrl = canonicalMetaProfileUrl(platform, value)
    if (profileUrl) return { platform, profileUrl, source: 'first_party_website', sourceUrl: website?.fetchedUrl }
  }
  for (const destinations of Object.values(observations || {})) for (const observation of Object.values(destinations)) {
    if (!observation || observation.destination === platform) continue
    const assessment = observation.automation?.assessment
    if (!assessment?.automaticObservation || assessment.visibilityResult !== 'found' || assessment.operatorReviewRequired) continue
    for (const match of assessment.matches) {
      if (!nameMatches(reviewedBusinessName, match.candidate.fields.name || '')) continue
      for (const value of [match.candidate.resultUrl, match.candidate.fields.publicProfileUrl]) {
        const profileUrl = canonicalMetaProfileUrl(platform, value)
        if (profileUrl) return {
          platform, profileUrl, source: 'search_evidence', observedName: match.candidate.fields.name,
          sourceUrl: match.evidence[0]?.sourceUrl || observation.observedResultUrl,
        }
      }
    }
  }
  return undefined
}
