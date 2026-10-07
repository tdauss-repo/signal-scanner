import type { AcquisitionResult, BingReviewedIdentityInput } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate, EntityField } from '../src/types/entityMatch.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export interface BingSearchTransportResult {
  status: number
  finalUrl: string
  body: string
}

export interface BingSearchAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<BingSearchTransportResult>
  timeoutMs?: number
  allowSecondaryResolution?: boolean
  reviewedIdentity?: BingReviewedIdentityInput
}

type BingResolutionStep = NonNullable<AcquisitionResult['bingLocalResolution']>['steps'][number]

const bingHost = (value: string) => value.replace(/^www\./, '').toLowerCase() === 'bing.com'
const resultRegion = (html: string) => /<(?:main)\b|\bid=["']b_results["']|\bclass=["'][^"']*\bb_algo\b/i.test(html)
const blockedPage = (status: number, html: string) => [401, 403, 429].includes(status) ||
  /<title[^>]*>[^<]*(?:access denied|verify you are human|unusual traffic|captcha)/i.test(html)

export const bingSearchMarketContext = { country: 'us', language: 'en-us', market: 'en-US' } as const
export const bingSearchRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const
const marketUrl = (value: URL) => {
  const url = new URL(value.href)
  url.searchParams.set('cc', bingSearchMarketContext.country)
  url.searchParams.set('setlang', bingSearchMarketContext.language)
  url.searchParams.set('mkt', bingSearchMarketContext.market)
  return url
}

/** Microsoft's documented consumer Bing Maps business-search URL. */
export const bingMapsBusinessSearchUrl = (query: string) => {
  const url = new URL('https://www.bing.com/maps/default.aspx')
  url.searchParams.set('ss', `yp.${query.trim()}`)
  return url
}

const decodedAttribute = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const safeUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(decodedAttribute(clean(value, 3000)), base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : undefined
  } catch { return undefined }
}
const safeBingUrl = (value: unknown, base: string) => {
  const url = safeUrl(value, base)
  return url?.protocol === 'https:' && bingHost(url.hostname) ? url : undefined
}
const approvedBingResolutionTarget = (value: unknown, base: string) => {
  const url = safeBingUrl(value, base)
  if (!url) return undefined
  const mapsPlace = /\/maps\/place(?:[/?#]|$)/i.test(url.pathname)
  const mapsEntity = /^\/maps(?:[/?#]|$)/i.test(url.pathname) &&
    Boolean(url.searchParams.get('osid') || url.searchParams.get('cp') && url.searchParams.get('q'))
  const entityExplore = /^\/entityexplore(?:[/?#]|$)/i.test(url.pathname) &&
    Boolean(url.searchParams.get('q') && (url.searchParams.get('filters') || url.searchParams.get('osid')))
  return mapsPlace || mapsEntity || entityExplore ? url : undefined
}
const surfacedBingResolutionTarget = (html: string, base: string, candidates: BusinessResultCandidate[] = []) => {
  const values = [
    ...[...html.matchAll(/<(?:a|link)\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)].slice(0, 300).map((match) => match[1] || match[2] || ''),
    ...candidates.flatMap((candidate) => [candidate.fields.publicProfileUrl || '', candidate.resultUrl || '']),
  ]
  const targets = values.map((value) => approvedBingResolutionTarget(value, base)).filter((value): value is URL => Boolean(value))
  const unique = [...new Map(targets.map((url) => [url.href, url])).values()]
  return unique.length === 1 ? unique[0] : undefined
}
const plainText = (value: string) => decodedAttribute(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
const attributeValue = (value: string, attribute: string) => decodedAttribute(value.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find(Boolean) || '')
const evidence = (url: string, acquiredAt: string, locator: string, excerpt: string, provider = 'bing-local-maps-fetch') => ({
  sourceUrl: url, acquiredAt, provider, method: 'server_fetch' as const, locator, excerpt: excerpt.slice(0, 2500),
})

/** Explicit Bing local-card HTML only; ordinary organic snippets remain separate. */
export const normalizeBingLocalHtmlCandidates = (html: string, url: string, acquiredAt: string): BusinessResultCandidate[] => {
  const candidates: BusinessResultCandidate[] = []
  const scopes = [...html.matchAll(/<(section|div)\b([^>]*(?:\bb_entity(?:TP|Local|Business)\b|\bdata-entity(?:id|-id)\s*=)[^>]*)>([\s\S]*?)<\/\1>/gi)].slice(0, 20)
  for (const [index, match] of scopes.entries()) {
    const outerAttributes = match[2]
    const content = match[3]
    const fields: BusinessResultCandidate['fields'] = {}
    const heading = content.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] || ''
    if (heading) fields.name = plainText(heading)
    const category = content.match(/<[^>]*\bclass\s*=\s*(?:"[^"]*(?:b_entitySubTitle|category)[^"]*"|'[^']*(?:b_entitySubTitle|category)[^']*')[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i)?.[1]
    if (category) fields.category = plainText(category)
    const addressLabel = [...content.matchAll(/<[^>]+\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)]
      .map((item) => decodedAttribute(item[1] || item[2] || '')).find((item) => /^address\s*:/i.test(item))
    if (addressLabel) fields.address = addressLabel.replace(/^address\s*:\s*/i, '')
    const anchors = [...content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 50)
    let website = ''
    let mapUrl = ''
    for (const anchor of anchors) {
      const href = attributeValue(anchor[1], 'href')
      const label = attributeValue(anchor[1], 'aria-label') || plainText(anchor[2])
      if (/^tel:/i.test(href)) fields.phone = href.slice(4)
      else if (/^phone\s*:/i.test(label)) fields.phone = label.replace(/^phone\s*:\s*/i, '')
      const resolved = href ? safeBingUrl(href, url) : undefined
      if (resolved && (/^\/maps(?:[/?#]|$)/i.test(resolved.pathname) || /^\/entityexplore(?:[/?#]|$)/i.test(resolved.pathname))) mapUrl = resolved.href
      if (/^(?:website|official (?:site|website))$/i.test(label) && href) {
        const target = safeUrl(href, url)
        if (target && !bingHost(target.hostname)) website = target.href
      }
    }
    if (website) fields.website = website
    if (mapUrl) fields.publicProfileUrl = mapUrl
    const entityIdentity = attributeValue(outerAttributes, 'data-entityid') || attributeValue(outerAttributes, 'data-entity-id')
    if (entityIdentity || mapUrl) fields.placeIdentity = entityIdentity || mapUrl
    if (!fields.name || !(fields.phone || fields.address || fields.website || fields.publicProfileUrl || fields.placeIdentity)) continue
    candidates.push({
      id: `${url}#bing-local-html-${index}`, kind: 'semantic_card', sourceType: 'local_place', ...(website ? { resultUrl: website } : {}), fields,
      evidence: [evidence(url, acquiredAt, `bing-local-html[${index}]`, plainText(content))],
    })
  }
  return candidates
}

const addressFields = (value: unknown): BusinessResultCandidate['fields'] => {
  if (typeof value === 'string') return { address: clean(value, 500) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const address = value as Record<string, unknown>
  const fields: BusinessResultCandidate['fields'] = {}
  const mapping: Array<[EntityField, unknown]> = [
    ['streetAddress', address.streetAddress || address.addressLine],
    ['locality', address.addressLocality || address.locality],
    ['region', address.addressRegion || address.adminDistrict],
    ['postalCode', address.postalCode],
    ['address', address.formattedAddress],
  ]
  for (const [field, item] of mapping) if (clean(item, 500)) fields[field] = clean(item, 500)
  if (!fields.address) fields.address = [fields.streetAddress, fields.locality, fields.region, fields.postalCode].filter(Boolean).join(', ')
  return fields
}
const structuredJsonBlocks = (html: string) => [...html.matchAll(/<script\b[^>]*\btype\s*=\s*(?:"(?:application\/ld\+json|application\/json)"|'(?:application\/ld\+json|application\/json)')[^>]*>([\s\S]*?)<\/script>/gi)]
  .slice(0, 100)
  .flatMap((match, index) => { try { return [{ value: JSON.parse(match[1]), locator: `script-json[${index}]` }] } catch { return [] } })

/** Bounded public Bing Maps/bootstrap JSON; unrelated Bing application metadata is ignored. */
export const normalizeBingLocalStructuredCandidates = (html: string, url: string, acquiredAt: string): BusinessResultCandidate[] => {
  const candidates: BusinessResultCandidate[] = []
  const seen = new Set<string>()
  const append = (node: Record<string, unknown>, locator: string) => {
    const rawTypes = [node['@type'], node.__type, node.entityType, ...(Array.isArray((node.entityPresentationInfo as Record<string, unknown> | undefined)?.entityTypeHints)
      ? (node.entityPresentationInfo as { entityTypeHints: unknown[] }).entityTypeHints : [])].flat().map((item) => clean(item, 100))
    const typedLocal = rawTypes.some((item) => /(?:localbusiness|business|school|place|restaurant|store|hotel)/i.test(item))
    const locatedAsLocal = /(?:^|\.)(?:places?|businessesAtLocation|localSearch|localBusiness|entities?|searchResults?)(?:\[|\.|$)/i.test(locator)
    if (!typedLocal && !locatedAsLocal) return
    const fields: BusinessResultCandidate['fields'] = { ...addressFields(node.address || node.locationAddress) }
    const name = clean(node.name || node.displayName || node.title, 300)
    const phone = clean(node.telephone || node.PhoneNumber || node.phoneNumber || node.phone, 100)
    const category = clean(node.category || node.categoryName || node.poiCategory || node.entityType, 200)
    if (name) fields.name = name
    if (phone) fields.phone = phone
    if (category) fields.category = category
    const website = safeUrl(node.Website || node.website || node.businessWebsite || node.url, url)
    if (website && !bingHost(website.hostname)) fields.website = website.href
    const profile = approvedBingResolutionTarget(node.webSearchUrl || node.mapsUrl || node.entityUrl, url)
    if (profile) fields.publicProfileUrl = profile.href
    const rawId = clean(node.entityId || node.placeId || node.localSearchId || node.id, 500)
    if (rawId || profile) fields.placeIdentity = rawId || profile!.href
    if (!fields.name || !(fields.website || fields.phone || fields.address || fields.streetAddress || fields.publicProfileUrl || fields.placeIdentity)) return
    const key = JSON.stringify([fields.name, fields.website, fields.phone, fields.address, fields.streetAddress, fields.placeIdentity])
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({
      id: `${url}#bing-local-json-${candidates.length}`, kind: 'structured_entity', sourceType: 'local_place',
      ...(fields.website ? { resultUrl: fields.website } : {}), fields,
      evidence: [evidence(url, acquiredAt, locator, JSON.stringify(node))],
    })
  }
  let budget = 3000
  const visit = (value: unknown, locator: string, depth: number) => {
    if (!value || typeof value !== 'object' || budget-- <= 0 || depth > 14) return
    if (Array.isArray(value)) { value.slice(0, 200).forEach((item, index) => visit(item, `${locator}[${index}]`, depth + 1)); return }
    const node = value as Record<string, unknown>
    append(node, locator)
    Object.entries(node).slice(0, 100).forEach(([key, item]) => visit(item, `${locator}.${key}`, depth + 1))
  }
  structuredJsonBlocks(html).forEach((block) => visit(block.value, block.locator, 0))
  return candidates.slice(0, 50)
}

const normalizedCandidates = (html: string, url: string, acquiredAt: string) => {
  const combined = [...normalizeBingLocalHtmlCandidates(html, url, acquiredAt), ...normalizeBingLocalStructuredCandidates(html, url, acquiredAt)]
  const seen = new Set<string>()
  return combined.filter((candidate) => {
    const key = JSON.stringify(candidate.fields)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
/** Provider-local stop signal only; the shared extractor/matcher owns the final organic-result decision. */
const normalizeBingPrimaryOrganicCandidates = (html: string, url: string, acquiredAt: string): BusinessResultCandidate[] =>
  [...html.matchAll(/<li\b[^>]*\bclass\s*=\s*(?:"[^"]*\bb_algo\b[^"]*"|'[^']*\bb_algo\b[^']*')[^>]*>([\s\S]*?)<\/li>/gi)]
    .slice(0, 50)
    .flatMap((match, index) => {
      const anchor = match[1].match(/<h[1-3]\b[^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>[\s\S]*?<\/h[1-3]>/i)
      if (!anchor) return []
      const target = safeUrl(attributeValue(anchor[1], 'href'), url)
      const name = plainText(anchor[2])
      if (!target || bingHost(target.hostname) || !name) return []
      return [{
        id: `${url}#bing-primary-organic-${index}`, kind: 'result_link' as const, sourceType: 'organic' as const,
        resultUrl: target.href, fields: { name }, evidence: [evidence(url, acquiredAt, `bing-primary-organic[${index}]`, plainText(match[1]), 'bing-native-fetch')],
      }]
    })
const localIdentityIsAlreadyUsable = (candidates: BusinessResultCandidate[]) => candidates.some((candidate) => {
  const groups = [candidate.fields.name, candidate.fields.website || candidate.resultUrl, candidate.fields.phone, candidate.fields.address || candidate.fields.streetAddress].filter(Boolean)
  return groups.length >= 2 && Boolean(candidate.fields.name || candidate.fields.website || candidate.resultUrl)
})

const normalizedWords = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const normalizedDomain = (value: string) => { try { return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' } }
const normalizedPhone = (value: string) => value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
const normalizedAddress = (value: string) => normalizedWords(value)
  .replace(/\b(?:road|rd)\b/g, 'rd').replace(/\b(?:street|st)\b/g, 'st').replace(/\b(?:avenue|ave)\b/g, 'ave')
  .replace(/\b(?:boulevard|blvd)\b/g, 'blvd').replace(/\b(?:drive|dr)\b/g, 'dr')
/** Conservative provider gate only. The shared matcher remains the sole verification decision. */
const candidateIsStronglyAligned = (candidate: BusinessResultCandidate, identity: BingReviewedIdentityInput) => {
  const observed = candidate.fields
  const expectedAddress = [identity.streetAddress, identity.city, identity.state, identity.zip].filter(Boolean).join(' ')
  const comparisons = [
    ['name', normalizedWords(identity.businessName), normalizedWords(observed.name || '')],
    ['website', normalizedDomain(identity.website || ''), normalizedDomain(observed.website || candidate.resultUrl || '')],
    ['phone', normalizedPhone(identity.phone || ''), normalizedPhone(observed.phone || '')],
    ['address', normalizedAddress(expectedAddress), normalizedAddress(observed.address || [observed.streetAddress, observed.locality, observed.region, observed.postalCode].filter(Boolean).join(' '))],
  ] as const
  const asserted = comparisons.filter(([, expected, actual]) => expected && actual)
  if (asserted.some(([, expected, actual]) => expected !== actual && !expected.includes(actual) && !actual.includes(expected))) return false
  const matched = asserted.filter(([, expected, actual]) => expected === actual || expected.includes(actual) || actual.includes(expected)).map(([field]) => field)
  return matched.length >= 2 && (matched.includes('name') || matched.includes('website'))
}
const candidatesAreStronglyAligned = (candidates: BusinessResultCandidate[], identity: BingReviewedIdentityInput | undefined) =>
  Boolean(identity?.businessName && candidates.some((candidate) => candidateIsStronglyAligned(candidate, identity)))
const candidateIsMaterialConflict = (candidate: BusinessResultCandidate, identity: BingReviewedIdentityInput) => {
  const observedName = normalizedWords(candidate.fields.name || '')
  const expectedName = normalizedWords(identity.businessName)
  const claimsReviewedName = Boolean(observedName && expectedName &&
    (observedName === expectedName || observedName.startsWith(`${expectedName} `) || observedName.endsWith(` ${expectedName}`)))
  if (!claimsReviewedName) return false
  const observed = candidate.fields
  const expectedAddress = [identity.streetAddress, identity.city, identity.state, identity.zip].filter(Boolean).join(' ')
  const comparisons = [
    [normalizedDomain(identity.website || ''), normalizedDomain(observed.website || candidate.resultUrl || '')],
    [normalizedPhone(identity.phone || ''), normalizedPhone(observed.phone || '')],
    [normalizedAddress(expectedAddress), normalizedAddress(observed.address || [observed.streetAddress, observed.locality, observed.region, observed.postalCode].filter(Boolean).join(' '))],
  ] as const
  return comparisons.some(([expected, actual]) => expected && actual && expected !== actual && !expected.includes(actual) && !actual.includes(expected))
}
const candidatesContainMaterialConflict = (candidates: BusinessResultCandidate[], identity: BingReviewedIdentityInput | undefined) =>
  Boolean(identity?.businessName && candidates.some((candidate) => candidateIsMaterialConflict(candidate, identity)))

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<BingSearchTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', bingSearchRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body }
}
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  return 'acquisition_failure'
}
const withSteps = (capture: AcquisitionResult, steps: BingResolutionStep[]): AcquisitionResult => ({ ...capture, bingLocalResolution: { steps } })

/** Bing-only chain: Search, documented Maps business search after no-match, then at most one surfaced Bing-owned detail request. */
export async function acquireBingSearch(value: string, options: BingSearchAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  let primaryRequestedUrl = ''
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'bing-native-fetch', checkedDestination: 'Bing Search', method: 'server_fetch',
    outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [],
  }
  const steps: BingResolutionStep[] = []
  try {
    const cleanUrl = publicUrl(value)
    const query = cleanUrl.searchParams.get('q')?.trim() || ''
    if (!bingHost(cleanUrl.hostname) || cleanUrl.pathname !== '/search' || !query) throw new Error('Bing acquisition requires a clean Bing Search query URL.')
    const url = marketUrl(cleanUrl)
    primaryRequestedUrl = url.href
    await (options.verifyDns || checkPublicDns)(url)
    const transport = options.transport || defaultTransport
    const signal = AbortSignal.timeout(options.timeoutMs ?? 12_000)
    const result = await transport(url, signal)
    const final = publicUrl(result.finalUrl)
    const primaryStep = (outcome: BingResolutionStep['outcome'], blocker?: string, candidateCount = 0): BingResolutionStep => ({
      stage: 'search_primary', requestedUrl: url.href, finalUrl: final.href, statusCode: result.status, outcome, candidateCount, ...(blocker ? { blocker } : {}),
    })
    if (!bingHost(final.hostname)) return withSteps({ ...base, finalUrl: result.finalUrl, statusCode: result.status, blocker: 'redirect_not_allowed', error: 'Bing redirected outside the approved search host.', notes: ['The redirected target was not acquired. This is not evidence that the business is absent.'] }, [primaryStep('unavailable', 'redirect_not_allowed')])
    if (blockedPage(result.status, result.body)) return withSteps({ ...base, finalUrl: final.href, statusCode: result.status, outcome: 'blocked', blocker: 'access_blocked', error: 'Bing restricted the bounded public request.', notes: ['No challenge bypass was attempted. This is not evidence that the business is absent.'] }, [primaryStep('restricted', 'access_blocked')])
    if (result.status < 200 || result.status >= 300) return withSteps({ ...base, finalUrl: final.href, statusCode: result.status, blocker: result.status >= 500 ? 'http_5xx' : 'http_error', error: `Bing returned HTTP ${result.status}.`, notes: ['The request did not produce usable public evidence. This is not evidence that the business is absent.'] }, [primaryStep('unavailable', result.status >= 500 ? 'http_5xx' : 'http_error')])
    if (!result.body.trim()) return withSteps({ ...base, finalUrl: final.href, statusCode: result.status, outcome: 'partial', blocker: 'missing_result_region', error: 'Bing returned an empty response.', notes: ['No usable result region was captured. This is not evidence that the business is absent.'] }, [primaryStep('unavailable', 'missing_result_region')])
    const inspected = resultRegion(result.body)
    const primaryCandidates = normalizedCandidates(result.body, final.href, acquiredAt)
    const primaryOrganicCandidates = normalizeBingPrimaryOrganicCandidates(result.body, final.href, acquiredAt)
    const primary: AcquisitionResult = {
      ...base, finalUrl: final.href, acquiredAt: new Date().toISOString(), statusCode: result.status,
      outcome: inspected ? 'success' : 'partial', confidence: 'captured', html: result.body, resultRegionInspected: inspected,
      ...(primaryCandidates.length ? { normalizedSearchCandidates: primaryCandidates } : {}),
      blocker: inspected ? 'none' : 'missing_result_region',
      notes: inspected ? ['Bounded Bing public result region captured in a US-English market context.'] : ['HTML was captured, but a standard Bing result region was not established. No further automatic request was attempted.'],
    }
    steps.push(primaryStep('success', undefined, primaryCandidates.length))
    if (!inspected || options.allowSecondaryResolution === false ||
      candidatesAreStronglyAligned([...primaryCandidates, ...primaryOrganicCandidates], options.reviewedIdentity) ||
      candidatesContainMaterialConflict(primaryCandidates, options.reviewedIdentity) ||
      (!options.reviewedIdentity && localIdentityIsAlreadyUsable(primaryCandidates))) return withSteps(primary, steps)

    const mapsUrl = bingMapsBusinessSearchUrl(query)
    try {
      await (options.verifyDns || checkPublicDns)(mapsUrl)
      const maps = await transport(mapsUrl, signal)
      const mapsFinal = publicUrl(maps.finalUrl || mapsUrl.href)
      const mapsBase = { stage: 'maps_search' as const, requestedUrl: mapsUrl.href, finalUrl: mapsFinal.href, statusCode: maps.status }
      if (!bingHost(mapsFinal.hostname) || !/^\/maps(?:[/?#]|$)/i.test(mapsFinal.pathname)) {
        steps.push({ ...mapsBase, outcome: 'unavailable', candidateCount: 0, blocker: 'redirect_not_allowed' })
        return withSteps({ ...primary, notes: [...primary.notes, 'The Bing Maps business search returned an unsupported destination and was not used as evidence.'] }, steps)
      }
      if (blockedPage(maps.status, maps.body)) {
        steps.push({ ...mapsBase, outcome: 'restricted', candidateCount: 0, blocker: 'access_blocked' })
        return withSteps({ ...primary, notes: [...primary.notes, 'The bounded Bing Maps business search was restricted; no bypass was attempted.'] }, steps)
      }
      if (maps.status < 200 || maps.status >= 300 || !maps.body.trim()) {
        const blocker = maps.status >= 500 ? 'http_5xx' : 'http_error'
        steps.push({ ...mapsBase, outcome: 'unavailable', candidateCount: 0, blocker })
        return withSteps({ ...primary, notes: [...primary.notes, 'The bounded Bing Maps business search returned no usable public evidence.'] }, steps)
      }
      const mapsCandidates = normalizedCandidates(maps.body, mapsFinal.href, primary.acquiredAt)
      steps.push({ ...mapsBase, outcome: 'success', candidateCount: mapsCandidates.length, ...(mapsCandidates.length ? {} : { blocker: 'no_match' }) })
      const mapsCapture: AcquisitionResult = { ...primary, normalizedSearchCandidates: mapsCandidates, notes: [...primary.notes, mapsCandidates.length
        ? 'The documented Bing Maps business-search surface returned normalized local identity evidence.'
        : 'The documented Bing Maps business-search surface exposed no supported local business identity.'] }
      if (candidatesAreStronglyAligned(mapsCandidates, options.reviewedIdentity) || (!options.reviewedIdentity && localIdentityIsAlreadyUsable(mapsCandidates))) return withSteps(mapsCapture, steps)

      const detailTarget = surfacedBingResolutionTarget(maps.body, mapsFinal.href, mapsCandidates)
      if (!detailTarget) return withSteps(mapsCapture, steps)
      try {
        await (options.verifyDns || checkPublicDns)(detailTarget)
        const detail = await transport(detailTarget, signal)
        const detailFinal = publicUrl(detail.finalUrl || detailTarget.href)
        const detailBase = { stage: 'maps_detail' as const, requestedUrl: detailTarget.href, finalUrl: detailFinal.href, statusCode: detail.status }
        const secondaryBase = { owner: 'bing' as const, used: true, requestedUrl: detailTarget.href, finalUrl: detailFinal.href, statusCode: detail.status }
        if (!bingHost(detailFinal.hostname) || !approvedBingResolutionTarget(detailFinal.href, detailTarget.href)) {
          steps.push({ ...detailBase, outcome: 'unavailable', candidateCount: 0, blocker: 'redirect_not_allowed' })
          return withSteps({ ...mapsCapture, secondaryResolution: { ...secondaryBase, outcome: 'unavailable', blocker: 'redirect_not_allowed' }, notes: [...mapsCapture.notes, 'The surfaced Bing-owned detail target returned an unsupported destination.'] }, steps)
        }
        if (blockedPage(detail.status, detail.body)) {
          steps.push({ ...detailBase, outcome: 'restricted', candidateCount: 0, blocker: 'access_blocked' })
          return withSteps({ ...mapsCapture, secondaryResolution: { ...secondaryBase, outcome: 'restricted', blocker: 'access_blocked' }, notes: [...mapsCapture.notes, 'The single Bing-owned detail request was restricted; no bypass was attempted.'] }, steps)
        }
        if (detail.status < 200 || detail.status >= 300 || !detail.body.trim()) {
          const blocker = detail.status >= 500 ? 'http_5xx' : 'http_error'
          steps.push({ ...detailBase, outcome: 'unavailable', candidateCount: 0, blocker })
          return withSteps({ ...mapsCapture, secondaryResolution: { ...secondaryBase, outcome: 'unavailable', blocker }, notes: [...mapsCapture.notes, 'The single Bing-owned detail request returned no usable public evidence.'] }, steps)
        }
        const detailCandidates = normalizedCandidates(detail.body, detailFinal.href, primary.acquiredAt)
        steps.push({ ...detailBase, outcome: detailCandidates.length ? 'success' : 'unavailable', candidateCount: detailCandidates.length, ...(detailCandidates.length ? {} : { blocker: 'no_match' }) })
        return withSteps({
          ...mapsCapture, normalizedSearchCandidates: detailCandidates.length ? detailCandidates : mapsCandidates,
          secondaryResolution: { ...secondaryBase, outcome: detailCandidates.length ? 'success' : 'unavailable', blocker: detailCandidates.length ? 'none' : 'no_match' },
          notes: [...mapsCapture.notes, detailCandidates.length ? 'One Bing-owned entity detail surfaced by Maps was resolved and normalized.' : 'The single Bing-owned detail request exposed no supported identity record.'],
        }, steps)
      } catch (error) {
        const blocker = failureBlocker(error)
        steps.push({ stage: 'maps_detail', requestedUrl: detailTarget.href, outcome: 'unavailable', candidateCount: 0, blocker })
        return withSteps({ ...mapsCapture, secondaryResolution: { owner: 'bing', used: true, requestedUrl: detailTarget.href, outcome: 'unavailable', blocker }, notes: [...mapsCapture.notes, 'The single Bing-owned detail request was unavailable; no additional request was attempted.'] }, steps)
      }
    } catch (error) {
      const blocker = failureBlocker(error)
      steps.push({ stage: 'maps_search', requestedUrl: mapsUrl.href, outcome: 'unavailable', candidateCount: 0, blocker })
      return withSteps({ ...primary, notes: [...primary.notes, 'The bounded Bing Maps business search was unavailable. This is not evidence that the business is absent.'] }, steps)
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    if (!steps.length && primaryRequestedUrl) steps.push({ stage: 'search_primary', requestedUrl: primaryRequestedUrl, outcome: 'unavailable', candidateCount: 0, blocker })
    return withSteps({ ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['Bing native acquisition could not complete. This is not evidence that the business is absent.'] }, steps)
  }
}
