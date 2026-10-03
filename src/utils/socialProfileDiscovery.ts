import type { SearchDestinationObservation } from '../types/audit'
import type { WebsiteAuditResult } from '../types/websiteAudit'
import { evidenceFingerprint } from './evidenceFingerprint'
import { normalizedWords } from './entityMatcher'
import { canonicalMetaProfileUrl, type MetaPlatform } from './metaPublicEvidence'

export interface SocialProfileDiscovery {
  platform: MetaPlatform
  profileUrl: string
  source: 'first_party_website' | 'search_evidence' | 'reviewed_business_profile'
  sourceUrl?: string
  observedName?: string
  /** Stable material identity of the explicit discovery evidence; timestamps and provider details are excluded. */
  evidenceKey: string
}

const nameMatches = (expected: string, observed: string) => {
  const wanted = normalizedWords(expected)
  const actual = normalizedWords(observed)
  return Boolean(wanted && actual && (actual === wanted || actual.includes(wanted)))
}

const discovery = (value: Omit<SocialProfileDiscovery, 'evidenceKey'>): SocialProfileDiscovery => ({
  ...value,
  evidenceKey: evidenceFingerprint({
    version: 'found-local-social-profile-discovery-v1',
    platform: value.platform,
    profileUrl: value.profileUrl,
    source: value.source,
    sourceUrl: value.sourceUrl,
    observedName: value.observedName,
  }),
})

/** Explicit links only. No handle or slug is ever constructed from a business name. */
export function discoverSocialProfile(
  platform: MetaPlatform,
  reviewedBusinessName: string,
  website: WebsiteAuditResult | null | undefined,
  observations: Record<string, Partial<Record<string, SearchDestinationObservation>>> | undefined,
  reviewedSocialUrls: string[] = [],
): SocialProfileDiscovery | undefined {
  for (const value of website?.socialProfileLinks || []) {
    const profileUrl = canonicalMetaProfileUrl(platform, value)
    if (profileUrl) return discovery({ platform, profileUrl, source: 'first_party_website', sourceUrl: website?.fetchedUrl })
  }
  for (const destinations of Object.values(observations || {})) for (const observation of Object.values(destinations)) {
    if (!observation || observation.destination === platform) continue
    const assessment = observation.automation?.assessment
    if (!assessment?.automaticObservation || assessment.visibilityResult !== 'found' || assessment.operatorReviewRequired) continue
    for (const match of assessment.matches) {
      if (!nameMatches(reviewedBusinessName, match.candidate.fields.name || '')) continue
      for (const value of [match.candidate.resultUrl, match.candidate.fields.publicProfileUrl]) {
        const profileUrl = canonicalMetaProfileUrl(platform, value)
        if (profileUrl) return discovery({
          platform, profileUrl, source: 'search_evidence', observedName: match.candidate.fields.name,
          sourceUrl: match.evidence[0]?.sourceUrl || observation.observedResultUrl,
        })
      }
    }
  }
  for (const value of reviewedSocialUrls) {
    const profileUrl = canonicalMetaProfileUrl(platform, value)
    if (profileUrl) return discovery({ platform, profileUrl, source: 'reviewed_business_profile' })
  }
  return undefined
}
