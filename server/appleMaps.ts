import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EntityField, EvidenceReference } from '../src/types/entityMatch.ts'
import { canonicalApplePlaceUrl } from '../src/utils/appleMapsPlace.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export { canonicalApplePlaceUrl } from '../src/utils/appleMapsPlace.ts'

export interface AppleMapsTransportResult {
  status: number
  finalUrl: string
  body: string
  location?: string
}

export interface AppleMapsServerApiTransportResult {
  status: number
  finalUrl: string
  body: string
}

export interface AppleMapsAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<AppleMapsTransportResult>
  timeoutMs?: number
  /** Server-only Apple Maps access token; never copied into captures or workspace state. */
  serverToken?: string
  serverApiTransport?: (url: URL, token: string, signal: AbortSignal) => Promise<AppleMapsServerApiTransportResult>
}

const appleMapsHost = (value: string) => value.replace(/^www\./, '').toLowerCase() === 'maps.apple.com'
const appleRedirectStatuses = new Set([301, 302, 303, 307, 308])
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const normalizedRedirectQuery = (value: string) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
const normalizedWords = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const comparable = (field: EntityField, value: string) => {
  if (field === 'phone') return value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  if (field === 'website') { try { return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
  if (field === 'publicProfileUrl') return canonicalApplePlaceUrl(value, value)
  const words = normalizedWords(value)
  if (field === 'address' || field === 'streetAddress') return words
    .replace(/\b(?:road|rd)\b/g, 'rd').replace(/\b(?:street|st)\b/g, 'st').replace(/\b(?:avenue|ave)\b/g, 'ave')
    .replace(/\b(?:boulevard|blvd)\b/g, 'blvd').replace(/\b(?:drive|dr)\b/g, 'dr').replace(/\b(?:lane|ln)\b/g, 'ln')
    .replace(/\s+(?:united states|usa|us)$/, '')
  return words
}
const safeUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(clean(value, 3000), base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const approvedApplePlaceTarget = (value: unknown, base: string) => {
  const resolved = safeUrl(value, base)
  if (!resolved) return undefined
  const url = new URL(resolved)
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'maps.apple.com' || url.pathname !== '/place') return undefined
  return url
}
const approvedAppleSearchTarget = (value: unknown, base: string, requestedQuery: string) => {
  const resolved = safeUrl(value, base)
  if (!resolved) return undefined
  const url = new URL(resolved)
  const redirectedQueries = url.searchParams.getAll('query')
  const redirectedQuery = redirectedQueries.length === 1 ? redirectedQueries[0].trim() : ''
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'maps.apple.com' || url.pathname !== '/search') return undefined
  if (!redirectedQuery || redirectedQuery.length > 500 || normalizedRedirectQuery(redirectedQuery) !== normalizedRedirectQuery(requestedQuery)) return undefined
  return url
}
const approvedAppleRedirectTarget = (value: unknown, base: string, requestedQuery: string) => {
  const place = approvedApplePlaceTarget(value, base)
  if (place) return { url: place, route: 'place' as const }
  const search = approvedAppleSearchTarget(value, base, requestedQuery)
  return search ? { url: search, route: 'search' as const } : undefined
}
const applePlaceUrl = canonicalApplePlaceUrl
const decodedAttribute = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
const htmlAttribute = (html: string, tagPattern: RegExp, attribute: string) => {
  const tag = html.match(tagPattern)?.[0] || ''
  return decodedAttribute(tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find(Boolean) || '')
}
const surfacedApplePlaceTargets = (html: string, base: string) => [...html.matchAll(/<(?:a|link)\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)]
  .slice(0, 200)
  .map((match) => approvedApplePlaceTarget(decodedAttribute(match[1] || match[2] || ''), base))
  .filter((value, index, all): value is URL => Boolean(value) && all.findIndex((candidate) => candidate?.href === value?.href) === index)
const reference = (sourceUrl: string, acquiredAt: string, locator: string, excerpt: string, provider = 'apple-maps-native-fetch'): EvidenceReference => ({
  sourceUrl, acquiredAt, provider, method: 'server_fetch', locator, excerpt: excerpt.slice(0, 2500),
})

/** A server-issued public /place target is structured acquisition evidence even when its SPA body is sparse. */
export function normalizeAppleMapsRedirectCandidate(value: string, acquiredAt: string, locator = 'redirect-place-url'): BusinessResultCandidate | undefined {
  const target = approvedApplePlaceTarget(value, value)
  if (!target) return undefined
  const canonicalProfileUrl = canonicalApplePlaceUrl(target.href, target.href)
  const name = clean(target.searchParams.get('name'), 300)
  const address = clean(target.searchParams.get('address'), 500)
  const placeIdentity = clean(target.searchParams.get('place-id') || target.searchParams.get('mapitemguid') || target.searchParams.get('id'), 1000)
  if (!name && !address && !placeIdentity) return undefined
  const fields: BusinessResultCandidate['fields'] = { publicProfileUrl: canonicalProfileUrl }
  if (name) fields.name = name
  if (address) fields.address = address
  if (placeIdentity) fields.placeIdentity = placeIdentity
  return {
    id: 'apple-maps-redirect-place', kind: 'structured_entity', sourceType: 'local_place', resultUrl: canonicalProfileUrl, fields,
    evidence: [reference(target.href, acquiredAt, locator, JSON.stringify({ name, address, placeIdentityPresent: Boolean(placeIdentity), coordinatePresent: target.searchParams.has('coordinate') }))],
  }
}

const addressFields = (value: unknown) => {
  if (typeof value === 'string') return { address: clean(value, 500) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const address = value as Record<string, unknown>
  const fields: Partial<Record<EntityField, string>> = {}
  const streetAddress = clean(address.streetAddress || address.fullThoroughfare || address.addressLine || (Array.isArray(address.addressLines) ? address.addressLines.join(' ') : ''), 300)
  const locality = clean(address.addressLocality || address.locality || address.city, 120)
  const region = clean(address.addressRegion || address.administrativeAreaCode || address.administrativeArea || address.state, 80)
  const postalCode = clean(address.postalCode || address.postCode || address.zip, 40)
  const formatted = clean(address.formattedAddress || address.fullAddress, 500)
  if (streetAddress) fields.streetAddress = streetAddress
  if (locality) fields.locality = locality
  if (region) fields.region = region
  if (postalCode) fields.postalCode = postalCode
  if (formatted) fields.address = formatted
  return fields
}

const officialApplePlaceUrl = (placeIdentity: string) => {
  if (!placeIdentity) return ''
  const url = new URL('https://maps.apple.com/place')
  url.searchParams.set('place-id', placeIdentity)
  return url.href
}

/** Normalize only fields asserted by Apple's authenticated Maps Server API. */
export function normalizeAppleMapsServerCandidates(body: string, sourceUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  let payload: unknown
  try { payload = JSON.parse(body) } catch { return [] }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const results = Array.isArray((payload as Record<string, unknown>).results) ? (payload as { results: unknown[] }).results : []
  return results.slice(0, 25).flatMap((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const place = value as Record<string, unknown>
    const name = clean(place.name, 300)
    const placeIdentity = clean(place.id, 1000)
    if (!name) return []
    const fields: BusinessResultCandidate['fields'] = { name }
    const structured = addressFields(place.structuredAddress)
    Object.assign(fields, structured)
    const formattedAddressLines = Array.isArray(place.formattedAddressLines)
      ? place.formattedAddressLines.map((line) => clean(line, 300)).filter(Boolean) : []
    if (formattedAddressLines.length) fields.address = formattedAddressLines.join(', ')
    const phone = clean(place.telephone, 80)
    if (phone) fields.phone = phone
    const websites = (Array.isArray(place.urls) ? place.urls : [place.url, place.website])
      .map((url) => safeUrl(url, sourceUrl))
      .filter((url) => url && !appleMapsHost(new URL(url).hostname))
    if (websites[0]) fields.website = websites[0]
    const category = clean(place.poiCategory || place.category, 200)
    if (category) fields.category = category
    const profileUrl = officialApplePlaceUrl(placeIdentity)
    if (placeIdentity) fields.placeIdentity = placeIdentity
    if (profileUrl) fields.publicProfileUrl = profileUrl
    if (!(fields.address || fields.streetAddress || fields.phone || fields.website || fields.placeIdentity)) return []
    return [{
      id: `apple-maps-server-place-${index + 1}`,
      kind: 'structured_entity' as const,
      sourceType: 'local_place' as const,
      ...(profileUrl ? { resultUrl: profileUrl } : {}),
      fields,
      evidence: [reference(sourceUrl, acquiredAt, `maps-server-api.results[${index}]`, JSON.stringify(place), 'apple-maps-server-api')],
    }]
  })
}

export const appleMapsServerSearchUrl = (query: string) => {
  const url = new URL('https://maps-api.apple.com/v1/search')
  url.searchParams.set('q', query)
  url.searchParams.set('limitToCountries', 'US')
  url.searchParams.set('resultTypeFilter', 'Poi')
  url.searchParams.set('lang', 'en-US')
  return url
}

function structuredJsonBlocks(html: string) {
  const blocks: Array<{ value: unknown; locator: string }> = []
  for (const [index, match] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].slice(0, 80).entries()) {
    const attributes = match[1]
    if (!/\btype\s*=\s*["']application\/(?:ld\+json|json)["']/i.test(attributes)) continue
    try { blocks.push({ value: JSON.parse(match[2]), locator: `structured-json[${index}]` }) } catch { /* malformed blocks are ignored, never guessed */ }
  }
  return blocks
}

/** Normalize only fields explicitly asserted by public Apple place/share data. */
export function normalizeAppleMapsCandidates(html: string, finalUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  const candidates: BusinessResultCandidate[] = []
  const seen = new Set<string>()
  const append = (node: Record<string, unknown>, locator: string) => {
    const fields: BusinessResultCandidate['fields'] = {}
    const assertedTypes = [node['@type'], node.type].flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string')
    const typedPlace = assertedTypes.some((value) => /(?:business|organization|place|school|store|restaurant)/i.test(value))
    const name = clean(node.name || node.displayName, 300)
    const phone = clean(node.telephone || node.phone || node.phoneNumber, 80)
    const categoryValue = node.category || node.categoryName || node.type
    const category = Array.isArray(categoryValue) ? clean(categoryValue.join(', '), 200) : clean(categoryValue, 200)
    const address = addressFields(node.address || node.locationAddress || node.formattedAddress)
    const assertedOwnerUrls = [node.url, node['@id'], node.website]
      .map((value) => safeUrl(value, finalUrl))
      .filter(Boolean)
    const appleApplicationOwner = assertedTypes.some((value) => /^Organization$/i.test(value)) &&
      /^(?:apple|apple inc)$/i.test(normalizedWords(name)) &&
      !phone && !Object.keys(address).length &&
      (/(?:^|\.)parentOrganization(?:\.|$)/i.test(locator) || assertedOwnerUrls.some((value) => {
        const hostname = new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
        return hostname === 'apple.com' || hostname === 'maps.apple.com'
      }))
    // Apple Maps' application shell describes Apple as its parent/page-owner
    // organization. That host metadata is not a searched place candidate.
    if (appleApplicationOwner) return
    Object.assign(fields, address)
    if (name) fields.name = name
    if (phone) fields.phone = phone
    if (category) fields.category = category
    const profileUrl = [node.placeUrl, node.shareUrl, node.mapsUrl, node.url, node['@id']]
      .map((value) => applePlaceUrl(value, finalUrl)).find(Boolean) || ''
    const website = [node.website, node.businessWebsite, node.url]
      .map((value) => safeUrl(value, finalUrl)).find((value) => value && !appleMapsHost(new URL(value).hostname)) || ''
    const explicitPlaceIdentity = clean(node.placeId || node.placeID || node.mapItemId || node.mapItemIdentifier, 1000)
    const placeIdentity = explicitPlaceIdentity || (typedPlace ? clean(node.muid || node.id || node['@id'], 1000) : '')
    if (!typedPlace && !explicitPlaceIdentity && !profileUrl) return
    if (website) fields.website = website
    if (profileUrl) fields.publicProfileUrl = profileUrl
    if (placeIdentity || profileUrl) fields.placeIdentity = placeIdentity || profileUrl
    if (!name || !(phone || fields.address || fields.streetAddress || website || profileUrl || placeIdentity)) return
    const key = JSON.stringify([name, phone, fields.address, fields.streetAddress, website, profileUrl, placeIdentity])
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({
      id: `apple-maps-place-${candidates.length + 1}`,
      kind: 'structured_entity',
      sourceType: 'local_place',
      ...(profileUrl ? { resultUrl: profileUrl } : {}),
      fields,
      evidence: [reference(finalUrl, acquiredAt, locator, JSON.stringify(node))],
    })
  }
  let budget = 2500
  const visit = (value: unknown, locator: string, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 14 || budget-- <= 0) return
    if (Array.isArray(value)) { value.slice(0, 200).forEach((item, index) => visit(item, `${locator}[${index}]`, depth + 1)); return }
    const node = value as Record<string, unknown>
    append(node, locator)
    Object.entries(node).slice(0, 100).forEach(([key, child]) => visit(child, `${locator}.${key}`, depth + 1))
  }
  for (const block of structuredJsonBlocks(html)) visit(block.value, block.locator, 0)

  const canonicalTag = /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i
  const ogUrlTag = /<meta\b[^>]*\bproperty\s*=\s*["']og:url["'][^>]*>/i
  const assertedCanonical = htmlAttribute(html, canonicalTag, 'href') || htmlAttribute(html, ogUrlTag, 'content')
  const canonical = assertedCanonical ? applePlaceUrl(assertedCanonical, finalUrl) : ''
  if (canonical) {
    const url = new URL(canonical)
    const address = url.searchParams.get('address') || ''
    const name = url.searchParams.get('name') || ''
    const placeIdentity = url.searchParams.get('place-id') || url.searchParams.get('mapitemguid') || url.searchParams.get('id') || ''
    append({ name, address, placeId: placeIdentity, placeUrl: canonical }, 'canonical-place-url')
  }
  const explicitPlaceUrls = surfacedApplePlaceTargets(html, finalUrl).map((url) => applePlaceUrl(url.href, finalUrl)).filter(Boolean)
  for (const [index, placeUrl] of explicitPlaceUrls.entries()) {
    const candidate = normalizeAppleMapsRedirectCandidate(placeUrl, acquiredAt, `public-place-link[${index}]`)
    if (!candidate) continue
    const key = JSON.stringify([candidate.fields.name, candidate.fields.address, candidate.fields.publicProfileUrl, candidate.fields.placeIdentity])
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ ...candidate, id: `apple-maps-place-link-${index + 1}` })
  }
  return candidates.slice(0, 50)
}

const sameApplePlace = (left: BusinessResultCandidate, right: BusinessResultCandidate) => {
  const leftIdentity = left.fields.placeIdentity || ''
  const rightIdentity = right.fields.placeIdentity || ''
  if (leftIdentity && rightIdentity) return leftIdentity === rightIdentity
  const leftProfile = canonicalApplePlaceUrl(left.fields.publicProfileUrl || left.resultUrl, left.resultUrl || 'https://maps.apple.com/')
  const rightProfile = canonicalApplePlaceUrl(right.fields.publicProfileUrl || right.resultUrl, right.resultUrl || 'https://maps.apple.com/')
  if (leftProfile && rightProfile) return leftProfile === rightProfile
  return Boolean(left.fields.name && right.fields.name && left.fields.address && right.fields.address &&
    comparable('name', left.fields.name) === comparable('name', right.fields.name) &&
    comparable('address', left.fields.address) === comparable('address', right.fields.address))
}

const mergeApplePlaceEvidence = (redirect: BusinessResultCandidate, enrichment: BusinessResultCandidate[]) => {
  const merged: BusinessResultCandidate = structuredClone(redirect)
  const conflicts: BusinessResultCandidate[] = []
  for (const candidate of enrichment.filter((item) => sameApplePlace(redirect, item))) {
    const conflictingOverlap = (Object.keys(candidate.fields) as EntityField[]).some((field) => {
      const left = merged.fields[field]
      const right = candidate.fields[field]
      return Boolean(left && right && !['category', 'publicProfileUrl'].includes(field) && comparable(field, left) !== comparable(field, right))
    })
    if (conflictingOverlap) { conflicts.push(candidate); continue }
    merged.fields = { ...candidate.fields, ...merged.fields }
    merged.evidence.push(...candidate.evidence)
  }
  return [merged, ...conflicts]
}

export const appleMapsRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<AppleMapsTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', appleMapsRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body, location: response.headers.get('location') || undefined }
}
const defaultServerApiTransport = async (url: URL, token: string, signal: AbortSignal): Promise<AppleMapsServerApiTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', {
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    authorization: `Bearer ${token}`,
  }, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body }
}

const blockedPage = (status: number, html: string) => [401, 403, 429].includes(status) ||
  /<title[^>]*>[^<]*(?:access denied|forbidden|verify you are human|captcha)/i.test(html)
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  return 'acquisition_failure'
}

/** One bounded public Apple Maps page/share request; no scripts or private APIs. */
async function acquireAppleMapsRequest(value: string, options: AppleMapsAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'apple-maps-native-fetch', checkedDestination: 'Apple Maps',
    method: 'server_fetch', outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [],
  }
  try {
    const url = publicUrl(value)
    const rootQueries = url.searchParams.getAll('q')
    const searchQueries = url.searchParams.getAll('query')
    const requestedQuery = clean(
      url.pathname === '/search' && searchQueries.length === 1 ? searchQueries[0]
        : url.pathname === '/' && rootQueries.length === 1 ? rootQueries[0]
          : '',
      500,
    )
    const supportedSearchRequest = Boolean(requestedQuery && (url.pathname === '/' || url.pathname === '/search'))
    const supportedPlaceRequest = Boolean(approvedApplePlaceTarget(url.href, url.href))
    if (url.protocol !== 'https:' || !appleMapsHost(url.hostname) || (!supportedSearchRequest && !supportedPlaceRequest)) {
      throw new Error('Apple Maps acquisition requires a public Apple Maps search or place URL.')
    }
    const signal = AbortSignal.timeout(options.timeoutMs ?? 12_000)
    const serverToken = options.serverToken?.trim()
    if (serverToken && supportedSearchRequest) {
      const serverUrl = appleMapsServerSearchUrl(requestedQuery)
      try {
        await (options.verifyDns || checkPublicDns)(serverUrl)
        const serverResult = await (options.serverApiTransport || defaultServerApiTransport)(serverUrl, serverToken, signal)
        const serverFinal = publicUrl(serverResult.finalUrl || serverUrl.href)
        if (serverFinal.protocol === 'https:' && serverFinal.hostname.toLowerCase() === 'maps-api.apple.com' && serverFinal.pathname === '/v1/search' && serverResult.status >= 200 && serverResult.status < 300) {
          const candidates = normalizeAppleMapsServerCandidates(serverResult.body, serverFinal.href, acquiredAt)
          if (candidates.length) return {
            ...base,
            provider: 'apple-maps-server-api',
            finalUrl: serverFinal.href,
            acquiredAt: new Date().toISOString(),
            statusCode: serverResult.status,
            outcome: 'success',
            confidence: 'captured',
            normalizedSearchCandidates: candidates,
            resultRegionInspected: true,
            blocker: 'none',
            notes: ['Apple Maps official Server API returned bounded structured place results.'],
          }
        }
      } catch {
        // Optional structured acquisition failed closed into the existing public URL path.
      }
    }
    await (options.verifyDns || checkPublicDns)(url)
    const transport = options.transport || defaultTransport
    const initial = await transport(url, signal)
    const initialStatusCode = initial.status
    let result = initial
    let final = publicUrl(initial.finalUrl)
    let redirectUrl = ''
    let redirectAccepted = false
    let redirectRoute: 'place' | 'search' | undefined
    let redirectCandidate: BusinessResultCandidate | undefined
    let finalRequestState: NonNullable<AcquisitionResult['finalRequestState']> = 'not_requested'

    if (appleRedirectStatuses.has(initial.status)) {
      if (!initial.location) return { ...base, initialStatusCode, statusCode: initial.status, redirectAccepted: false, finalRequestState, outcome: 'unavailable', blocker: 'redirect_missing_location', error: 'Apple Maps returned a redirect without a public Location target.', notes: ['No redirect was followed. This is not evidence that the business is absent.'] }
      const approved = approvedAppleRedirectTarget(initial.location, url.href, requestedQuery)
      if (!approved) return { ...base, initialStatusCode, statusCode: initial.status, redirectUrl: safeUrl(initial.location, url.href) || undefined, redirectAccepted: false, finalRequestState, outcome: 'unavailable', blocker: 'redirect_not_allowed', error: 'Apple Maps returned an unsupported or unsafe redirect target.', notes: ['No redirect was followed. This is not evidence that the business is absent.'] }
      const target = approved.url
      redirectRoute = approved.route
      redirectUrl = target.href
      redirectAccepted = true
      redirectCandidate = redirectRoute === 'place' ? normalizeAppleMapsRedirectCandidate(target.href, acquiredAt) : undefined
      final = target
      try {
        result = await transport(target, signal)
      } catch {
        if (!redirectCandidate) throw new Error('Apple Maps place enrichment request failed.')
        return { ...base, redirectUrl, finalUrl: target.href, initialStatusCode, statusCode: initial.status, redirectAccepted, finalRequestState: 'unavailable', outcome: 'success', confidence: 'captured', normalizedSearchCandidates: [redirectCandidate], resultRegionInspected: true, blocker: 'none', notes: ['Public Apple Maps place redirect evidence captured; final page enrichment was unavailable.'] }
      }
      if (appleRedirectStatuses.has(result.status)) return { ...base, redirectUrl, finalUrl: target.href, initialStatusCode, statusCode: result.status, redirectAccepted, finalRequestState: 'unavailable', outcome: 'unavailable', blocker: 'redirect_limit', normalizedSearchCandidates: redirectCandidate ? [redirectCandidate] : undefined, error: 'Apple Maps returned a second redirect; the one-hop acquisition limit stopped the request.', notes: ['The second redirect was not followed. This is not evidence that the business is absent.'] }
      const returnedFinal = publicUrl(result.finalUrl || target.href)
      const returnedRouteAccepted = redirectRoute === 'place'
        ? Boolean(approvedApplePlaceTarget(returnedFinal.href, target.href))
        : Boolean(approvedAppleSearchTarget(returnedFinal.href, target.href, requestedQuery))
      if (!returnedRouteAccepted) return { ...base, redirectUrl, finalUrl: result.finalUrl, initialStatusCode, statusCode: result.status, redirectAccepted, finalRequestState: 'unavailable', outcome: 'unavailable', blocker: 'redirect_not_allowed', error: 'Apple Maps public resolution returned an unsupported or unsafe route.', notes: ['The unsupported target was not used as evidence. This is not evidence that the business is absent.'] }
      final = returnedFinal
    }

    let common = { initialStatusCode, statusCode: result.status, ...(redirectUrl ? { redirectUrl } : {}), finalUrl: final.href, redirectAccepted }
    if (!appleMapsHost(final.hostname) || final.protocol !== 'https:') return { ...base, ...common, finalRequestState: 'unavailable', outcome: 'unavailable', blocker: 'redirect_not_allowed', error: 'Apple Maps resolved outside the approved public host.', notes: ['The external target was not acquired. This is not evidence that the business is absent.'] }
    if (blockedPage(result.status, result.body)) return { ...base, ...common, finalRequestState: 'restricted', outcome: 'blocked', blocker: 'access_blocked', normalizedSearchCandidates: redirectCandidate ? [redirectCandidate] : undefined, error: 'Apple Maps restricted the bounded public request.', notes: ['No access restriction was bypassed. This is not evidence that the business is absent.'] }
    if (result.status < 200 || result.status >= 300) {
      if (redirectCandidate) return { ...base, ...common, finalRequestState: 'unavailable', outcome: 'success', confidence: 'captured', normalizedSearchCandidates: [redirectCandidate], resultRegionInspected: true, blocker: 'none', notes: [`Public Apple Maps place redirect evidence captured; final page enrichment returned HTTP ${result.status}.`] }
      return { ...base, ...common, finalRequestState: 'unavailable', outcome: 'unavailable', blocker: result.status >= 500 ? 'http_5xx' : 'http_error', error: `Apple Maps returned HTTP ${result.status}.`, notes: ['The request did not produce usable public evidence. This is not evidence that the business is absent.'] }
    }
    const enrichment = normalizeAppleMapsCandidates(result.body, final.href, acquiredAt)
    let candidates = redirectCandidate ? mergeApplePlaceEvidence(redirectCandidate, enrichment) : enrichment
    const usableIdentity = candidates.some((candidate) => candidate.fields.name && (candidate.fields.address || candidate.fields.streetAddress || candidate.fields.phone || candidate.fields.website))
    const surfacedPlaceTargets = supportedSearchRequest && !usableIdentity ? surfacedApplePlaceTargets(result.body, final.href) : []
    let surfacedPlaceFollowed = false
    if (surfacedPlaceTargets.length === 1) {
      const placeTarget = surfacedPlaceTargets[0]
      try {
        await (options.verifyDns || checkPublicDns)(placeTarget)
        const placeResult = await transport(placeTarget, signal)
        const placeFinal = publicUrl(placeResult.finalUrl || placeTarget.href)
        if (!appleRedirectStatuses.has(placeResult.status) && placeResult.status >= 200 && placeResult.status < 300 && approvedApplePlaceTarget(placeFinal.href, placeTarget.href)) {
          const placeSeed = normalizeAppleMapsRedirectCandidate(placeTarget.href, acquiredAt, 'search-surfaced-place-url')
          const placeEnrichment = normalizeAppleMapsCandidates(placeResult.body, placeFinal.href, acquiredAt)
          const placeCandidates = placeSeed ? mergeApplePlaceEvidence(placeSeed, placeEnrichment) : placeEnrichment
          if (placeCandidates.length) {
            candidates = placeCandidates
            final = placeFinal
            result = placeResult
            finalRequestState = placeEnrichment.length ? 'success' : 'shell'
            surfacedPlaceFollowed = true
            common = { ...common, statusCode: result.status, finalUrl: final.href }
          }
        }
      } catch {
        // The public search evidence remains authoritative; no additional follow is attempted.
      }
    }
    if (finalRequestState === 'not_requested') finalRequestState = enrichment.length ? 'success' : 'shell'
    if (!candidates.length && redirectRoute === 'search') return { ...base, ...common, acquiredAt: new Date().toISOString(), finalRequestState, outcome: 'success', confidence: 'captured', resultRegionInspected: true, blocker: 'none', notes: ['Apple Maps completed the public business search, but the response exposed no supported structured place record. Assisted verification remains available.'] }
    if (!candidates.length) return { ...base, ...common, finalRequestState, outcome: 'unavailable', blocker: 'missing_result_region', error: 'Apple Maps returned no supported public place structure.', notes: ['The public response did not expose a structured place record. Assisted verification remains available.'] }
    return { ...base, ...common, acquiredAt: new Date().toISOString(), finalRequestState, outcome: 'success', confidence: 'captured', html: result.body, normalizedSearchCandidates: candidates, resultRegionInspected: true, blocker: 'none', notes: [surfacedPlaceFollowed
      ? 'One public Apple Maps place target surfaced by the search response was resolved and normalized.'
      : redirectCandidate ? 'Public Apple Maps place resolution captured; final public metadata was evaluated as optional enrichment.' : 'Bounded public Apple Maps place evidence captured.'] }
  } catch (error) {
    const blocker = failureBlocker(error)
    return { ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['Apple Maps native acquisition could not complete. This is not evidence that the business is absent.'] }
  }
}

/**
 * Adds bounded, credential-free diagnostics around the native acquisition.
 * The bearer token is consumed only by acquireAppleMapsRequest and is never
 * copied into this metadata or any persisted capture.
 */
export async function acquireAppleMaps(value: string, options: AppleMapsAcquisitionOptions = {}): Promise<AcquisitionResult> {
  let supportedPlaceRequest = false
  let supportedSearchRequest = false
  try {
    const url = publicUrl(value)
    supportedPlaceRequest = Boolean(approvedApplePlaceTarget(url.href, url.href))
    supportedSearchRequest = Boolean(
      (url.pathname === '/' && url.searchParams.getAll('q').length === 1 && url.searchParams.get('q')?.trim()) ||
      (url.pathname === '/search' && url.searchParams.getAll('query').length === 1 && url.searchParams.get('query')?.trim()),
    )
  } catch {
    // The core request returns the existing sanitized invalid-request result.
  }
  const serverApiConfigured = Boolean(options.serverToken?.trim())
  const capture = await acquireAppleMapsRequest(value, options)
  let finalIsPlace = false
  try { finalIsPlace = new URL(capture.finalUrl || capture.redirectUrl || '').pathname === '/place' } catch { /* empty */ }
  return {
    ...capture,
    appleMapsResolution: {
      publicPlaceResolutionAttempted: supportedPlaceRequest || finalIsPlace || capture.notes.some((note) => /place target|place resolution/i.test(note)),
      serverApiConfigured,
      serverApiAttempted: serverApiConfigured && supportedSearchRequest,
      anonymousSearchAttempted: supportedSearchRequest && capture.provider !== 'apple-maps-server-api',
      returnedCandidateCount: capture.normalizedSearchCandidates?.length || 0,
    },
  }
}
