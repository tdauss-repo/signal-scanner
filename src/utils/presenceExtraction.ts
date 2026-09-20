import type { AcquisitionResult } from '../types/acquisition'
import type { BusinessProfile, CorroborationRecord, SearchDestination, SearchVisibilityObservedResultType } from '../types/audit'

const clean = (value: string) => value.replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
const norm = (value: string) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '')
export const host = (value: string) => { try { return new URL(value).hostname.replace(/^www\./, '') } catch { return '' } }
export const pageText = (capture: AcquisitionResult) => clean(capture.visibleText || (capture.html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' '))
export const isChallenge = (capture: AcquisitionResult) => /verify (?:that )?you are human|unusual traffic|enable javascript and cookies|access denied|sign in to continue|log in to continue|before you continue to google/i.test(pageText(capture))
const attr = (tag: string, name: string) => clean(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '')

/** Evidence of a link is not evidence of rank, listing ownership or absence. */
export function interpretPresence(capture: AcquisitionResult, profile: BusinessProfile, destination: SearchDestination) {
  const text = pageText(capture)
  const usable = ['success', 'partial'].includes(capture.outcome) && !isChallenge(capture)
  const nameAt = profile.businessName ? text.toLowerCase().indexOf(profile.businessName.toLowerCase()) : -1
  const types: SearchVisibilityObservedResultType[] = []
  const references: string[] = []
  if (usable && !['Google Maps', 'Apple Maps'].includes(destination)) {
    const html = (capture.html || '').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const label = clean(match[2].replace(/<[^>]*>/g, ' '))
      const href = attr(match[1], 'href')
      // Only explicit direct links with identifying labels. Redirect wrappers stay unclassified.
      if (!profile.businessName || !label.toLowerCase().includes(profile.businessName.toLowerCase()) || !/^https?:\/\//i.test(href)) continue
      const targetHost = host(href)
      if (!targetHost || targetHost === host(capture.requestedUrl)) continue
      let type: SearchVisibilityObservedResultType | undefined
      if (targetHost === host(profile.website)) type = 'official_website'
      else if (['Google Search', 'Bing Search', 'DuckDuckGo'].includes(destination)) {
        if (['google.com', 'bing.com', 'duckduckgo.com'].includes(targetHost)) continue
        type = ['facebook.com', 'instagram.com'].includes(targetHost) ? 'social_profile' : targetHost === 'yelp.com' ? 'directory_listing' : 'third_party_mention'
      }
      if (type) { types.push(type); references.push(`Captured link (${type}): ${label} — ${href}`) }
    }
  }
  const identities = usable ? structuredIdentityExtractor.extract(capture, profile).filter((record) => record['Website URL'] || record.Phone || record['Address/service area']) : []
  if (identities.length) {
    if (['Google Maps', 'Apple Maps'].includes(destination)) types.push('local_business_profile')
    else if (destination === 'Yelp') types.push('directory_listing')
    else if (['Facebook', 'Instagram'].includes(destination)) types.push('social_profile')
    references.push(`Captured structured business record candidate: ${JSON.stringify(identities).slice(0, 2000)}`)
  }
  const evidence = references.length ? [...references.slice(0, 8), text.slice(Math.max(0, nameAt - 100), Math.max(0, nameAt - 100) + 1600)].join('\n') : ''
  return { types: [...new Set(types)], evidence, interpreted: types.length > 0 }
}

export type IdentityRecord = Partial<Record<CorroborationRecord['field'], string>>
export interface IdentityExtractor { extract(capture: AcquisitionResult, profile: BusinessProfile): IdentityRecord[] }

/** Generic extractor boundary. Match an explicit entity; never attach all page phones/addresses to it. */
export const structuredIdentityExtractor: IdentityExtractor = {
  extract(capture, profile) {
    if (!['success', 'partial'].includes(capture.outcome) || isChallenge(capture)) return []
    const records: IdentityRecord[] = []
    const visit = (value: unknown, depth = 0) => {
      if (depth > 12 || !value || typeof value !== 'object') return
      if (Array.isArray(value)) { value.slice(0, 200).forEach((v) => visit(v, depth + 1)); return }
      const obj = value as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name : ''
      const url = typeof obj.url === 'string' ? obj.url : ''
      const type = String(obj['@type'] || '')
      if (/Organization|LocalBusiness|School|Store|Service|Place|Business|Restaurant|Medical|Lodging/i.test(type) &&
        ((name && norm(name) === norm(profile.businessName)) || (host(url) && host(url) === host(profile.website)))) {
        const record: IdentityRecord = {}
        if (name) record['Business name'] = clean(name)
        if (url && /^https?:\/\//i.test(url)) record['Website URL'] = url
        if (typeof obj.telephone === 'string') record.Phone = clean(obj.telephone)
        if (obj.address && typeof obj.address === 'object') {
          const address = obj.address as Record<string, unknown>
          const parts = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'].map((key) => address[key]).filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
          if (parts.length) record['Address/service area'] = parts.join(', ')
        }
        records.push(record)
      }
      Object.values(obj).slice(0, 200).forEach((v) => visit(v, depth + 1))
    }
    for (const block of (capture.html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try { visit(JSON.parse(block[1])) } catch { /* Invalid structured data supplies no identity facts. */ }
    }
    // A directory's exact visible business-name mention is a candidate, not a complete listing.
    if (!records.length && profile.businessName && !['google.com', 'bing.com', 'maps.apple.com', 'duckduckgo.com', 'yelp.com', 'facebook.com', 'instagram.com'].includes(host(capture.requestedUrl))) {
      const text = pageText(capture)
      const index = text.toLowerCase().indexOf(profile.businessName.toLowerCase())
      if (index >= 0) records.push({ 'Business name': text.slice(index, index + profile.businessName.length) })
    }
    return records
  },
}

export function compareIdentity(capture: AcquisitionResult, profile: BusinessProfile, extractor: IdentityExtractor = structuredIdentityExtractor): CorroborationRecord[] {
  const expected: IdentityRecord = { 'Business name': profile.businessName, Phone: profile.phone, 'Website URL': profile.website,
    'Address/service area': profile.streetAddress ? [profile.streetAddress, profile.city, profile.state, profile.zip].filter(Boolean).join(', ') : '' }
  return extractor.extract(capture, profile).flatMap((record, index) => Object.entries(record).map(([key, observedValue]) => {
    const field = key as CorroborationRecord['field']
    const expectedValue = expected[field] || ''
    const normalized = (value: string) => field === 'Website URL' ? value.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : field === 'Phone' ? value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') : norm(value)
    return { id: `scan-identity-${capture.requestedUrl}-${index}-${field}`, destination: host(capture.requestedUrl), field, observedValue: observedValue!, expectedValue,
      sourceUrl: capture.finalUrl || capture.requestedUrl, sourceEvidence: `${capture.method} / ${capture.provider}: observed ${field}: ${observedValue}. Identity association and differences require operator review.`,
      recordedAt: capture.acquiredAt, confidence: 'scanner_detected_public_page' as const,
      result: !expectedValue ? 'Owner confirmation needed' as const : normalized(expectedValue) === normalized(observedValue!) ? 'Match' as const : field === 'Address/service area' ? 'Owner confirmation needed' as const : 'Conflict' as const,
      provenance: 'automated_acquisition' as const, notes: '', reviewed: false }
  }))
}
