import type { AcquisitionResult } from '../types/acquisition'
import type { BusinessProfile, BusinessProfileState, SearchDestination } from '../types/audit'
import type { BusinessResultCandidate, EntityField, EvidenceReference, SearchEntityAssessment, SearchQueryMode } from '../types/entityMatch'
import { assessBusinessCandidates, reviewedProfileValue } from './entityMatcher'
import { host, isChallenge, pageText } from './presenceExtraction'
import { isBusinessEntityType, parseJsonLdBlocks, structuredEntityAddress, textValue, walkStructuredData } from './structuredEntities'

const decode = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ').replace(/&#(\d+);/g, (_, number) => Number(number) <= 0x10ffff ? String.fromCodePoint(Number(number)) : '').replace(/\s+/g, ' ').trim()
const attributes = (text: string) => Object.fromEntries([...text.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? '')]))
const safeUrl = (value: string, base: string) => { try { const url = new URL(value, base); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' } }
const redirectTargetKeys = ['url', 'q', 'adurl', 'u', 'target', 'dest', 'destination', 'redirect', 'redirect_url', 'uddg']
const isUnresolvedRedirectWrapper = (value: string, capture: AcquisitionResult) => {
  try {
    const url = new URL(value)
    return host(url.href) === host(capture.finalUrl || capture.requestedUrl) && redirectTargetKeys.some((key) => url.searchParams.has(key))
  } catch { return false }
}
/** Resolve only an explicit embedded HTTP(S) target from a result link; never navigate it. */
const resultUrl = (value: string, capture: AcquisitionResult) => {
  const base = capture.finalUrl || capture.requestedUrl
  const direct = safeUrl(value, base)
  if (!direct) return ''
  const wrapper = new URL(direct)
  if (host(wrapper.href) !== host(base)) return wrapper.href
  for (const key of redirectTargetKeys) {
    const target = wrapper.searchParams.get(key)
    const resolved = target && safeUrl(target, base)
    if (resolved && host(resolved) !== host(base)) return resolved
  }
  return wrapper.href
}
const displayedResultUrl = (values: string[], capture: AcquisitionResult) => {
  const captureHost = host(capture.finalUrl || capture.requestedUrl)
  const websites = new Map<string, string>()
  for (const value of values) {
    for (const match of value.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:\/[^\s<>]*)?/gi)) {
      if (match.index && value[match.index - 1] === '@') continue
      const token = match[0].replace(/[),.;:'"!?\]}]+$/g, '')
      const url = safeUrl(/^https?:\/\//i.test(token) ? token : `https://${token}`, capture.finalUrl || capture.requestedUrl)
      const websiteHost = host(url)
      if (url && websiteHost && websiteHost !== captureHost) websites.set(websiteHost, url)
    }
  }
  return websites.size === 1 ? [...websites.values()][0] : ''
}
const reference = (capture: AcquisitionResult, locator: string, excerpt: string): EvidenceReference => ({ sourceUrl: capture.finalUrl || capture.requestedUrl, acquiredAt: capture.acquiredAt, method: capture.method, provider: capture.provider, locator, excerpt: excerpt.slice(0, 2500) })
export interface SearchResultExtractor { id: string; extract(capture: AcquisitionResult): BusinessResultCandidate[] }

/** Structured provider candidates use the same matcher contract as DOM-derived candidates. */
export const normalizedProviderResultExtractor: SearchResultExtractor = {
  id: 'normalized-provider-results-v1',
  extract(capture) { return capture.normalizedSearchCandidates || [] },
}

export const jsonLdResultExtractor: SearchResultExtractor = {
  id: 'jsonld-entity-v1',
  extract(capture) {
    const nodes = walkStructuredData(parseJsonLdBlocks(capture.html || '').blocks)
    return nodes.filter((entry) => entry.types.some(isBusinessEntityType)).slice(0, 50).map(({ node, types, path }) => {
      const address = structuredEntityAddress(node, nodes)
      const fields: BusinessResultCandidate['fields'] = {}
      const mapping = { name: node.name, phone: node.telephone, website: node.url, streetAddress: address.streetAddress, locality: address.addressLocality, region: address.addressRegion, postalCode: address.postalCode, category: node.category, placeIdentity: node['@id'] }
      for (const [key, value] of Object.entries(mapping)) if (textValue(value)) fields[key as EntityField] = textValue(value)
      if (typeof node.address === 'string') fields.address = node.address
      if (fields.website) {
        const url = safeUrl(fields.website, capture.finalUrl || capture.requestedUrl)
        if (!url) delete fields.website
        else if (host(url) === host(capture.requestedUrl)) { fields.publicProfileUrl = url; delete fields.website }
        else fields.website = url
      }
      return { id: `${capture.requestedUrl}#${path}`, kind: 'structured_entity' as const, fields, schemaTypes: types, evidence: [reference(capture, path, JSON.stringify(node)), ...(Object.keys(address).length ? [reference(capture, `${path}.address / explicit location.address reference`, JSON.stringify(address))] : [])] }
    }).filter((candidate) => Object.keys(candidate.fields).length)
  },
}

interface Element { tag: string; attrs: Record<string, string>; children: Element[]; text: string; parent?: Element }
/** Small bounded semantic tokenizer, not a browser layout parser. Scripts, styles, comments and explicit hidden subtrees are excluded. */
function semanticTree(html: string) {
  const root: Element = { tag: 'root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  let count = 0
  for (const match of source.matchAll(/<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/gi)) {
    if (++count > 16000) break
    const token = match[0]
    if (!token.startsWith('<')) { stack.at(-1)!.text += ` ${decode(token)}`; continue }
    const tag = token.match(/^<\/?([\w-]+)/)?.[1].toLowerCase() || ''
    if (token.startsWith('</')) {
      const index = stack.findLastIndex((element) => element.tag === tag)
      if (index > 0) stack.length = index
      continue
    }
    const element: Element = { tag, attrs: attributes(token), children: [], text: '', parent: stack.at(-1) }
    if (/\bhidden(?:\s|=|>)/i.test(token)) element.attrs.hidden = 'true'
    element.parent!.children.push(element)
    if (!['area', 'base', 'br', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr'].includes(tag) && !token.endsWith('/>') && stack.length < 100) stack.push(element)
  }
  return root
}
const hidden = (element: Element) => element.attrs.hidden === 'true' || element.attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(element.attrs.style || '')
const descendants = (element: Element): Element[] => hidden(element) ? [] : [element, ...element.children.flatMap(descendants)]
const content = (element: Element): string => hidden(element) ? '' : decode(`${element.text} ${element.children.map(content).join(' ')}`)
const value = (element: Element) => element.attrs.content || element.attrs.href || element.attrs.src || content(element)
const semanticFields: Record<string, EntityField> = { name: 'name', telephone: 'phone', streetAddress: 'streetAddress', addressLocality: 'locality', addressRegion: 'region', postalCode: 'postalCode', category: 'category' }

export const semanticResultExtractor: SearchResultExtractor = {
  id: 'semantic-public-card-v1',
  extract(capture) {
    const root = semanticTree(capture.html || '')
    const elements = descendants(root)
    const scopes = elements.filter((element) => /schema.org\/(LocalBusiness|Organization|School|[A-Za-z]*Business|Store|Restaurant|Place)/i.test(element.attrs.itemtype || '') || ['article', 'li'].includes(element.tag) || ['article', 'listitem'].includes(element.attrs.role)).slice(0, 100)
    const scopeContents = scopes.map((scope) => new Set(descendants(scope)))
    const candidates: BusinessResultCandidate[] = []
    for (const [index, scope] of scopes.entries()) {
      // Never borrow contact/location values from another nested result or entity.
      const nodes = descendants(scope).filter((node) => {
        for (let parent = node.parent; parent && parent !== scope; parent = parent.parent) if (scopes.includes(parent) || (parent.attrs.itemtype && !/PostalAddress/.test(parent.attrs.itemtype))) return false
        return node === scope || (!scopes.includes(node) && (!node.attrs.itemtype || /PostalAddress/.test(node.attrs.itemtype)))
      })
      const fields: BusinessResultCandidate['fields'] = {}
      let resultDestination = ''
      const assertedBusinessEntity = /schema.org\/(LocalBusiness|Organization|School|[A-Za-z]*Business|Store|Restaurant|Place)/i.test(scope.attrs.itemtype || '')
      for (const node of nodes) {
        const property = node.attrs.itemprop
        if (property && semanticFields[property]) fields[semanticFields[property]] = value(node)
        if (property === 'url') {
          const url = safeUrl(value(node), capture.requestedUrl)
          if (assertedBusinessEntity) fields.website = url
          else resultDestination = url
        }
        if (node.tag === 'address' && !fields.streetAddress) fields.address = content(node)
        if (node.attrs.href?.startsWith('tel:')) fields.phone = decode(node.attrs.href.slice(4))
      }
      const heading = nodes.find((node) => ['h1', 'h2', 'h3'].includes(node.tag))
      const namedLink = nodes.find((node) => node.tag === 'a' && node.attrs.href && content(node) && /^https?:/i.test(resultUrl(node.attrs.href || '', capture)))
      if (!fields.name && heading) fields.name = content(heading)
      if (!fields.name && namedLink) fields.name = content(namedLink)
      if (namedLink) {
        const url = resultUrl(namedLink.attrs.href || '', capture)
        if (host(url) === host(capture.requestedUrl)) {
          if (!isUnresolvedRedirectWrapper(url, capture)) fields.publicProfileUrl = url
        } else if (!resultDestination) resultDestination = url
      }
      const displayed = displayedResultUrl([namedLink ? content(namedLink) : '', content(scope)], capture)
      if (!resultDestination && displayed) resultDestination = displayed
      if (fields.website) fields.website = safeUrl(fields.website, capture.requestedUrl)
      if (fields.name) candidates.push({ id: `${capture.requestedUrl}#card-${index}`, kind: 'semantic_card', ...(resultDestination ? { resultUrl: resultDestination } : {}), fields, evidence: [reference(capture, `semantic-card[${index}]`, content(scope))] })
    }
    // Direct semantic links provide partial name/domain evidence, never a complete entity by themselves.
    for (const [index, link] of elements.filter((element) => element.tag === 'a').slice(0, 300).entries()) {
      const url = resultUrl(link.attrs.href || '', capture)
      const name = content(link) || link.attrs['aria-label'] || ''
      if (!url || !name || name.length > 200 || !/^https?:/i.test(link.attrs.href || '')) continue
      if (link.parent && scopeContents.some((nodes) => nodes.has(link))) continue
      if (host(url) === host(capture.requestedUrl) && !/\/maps\/place\//i.test(url)) continue
      const fields: BusinessResultCandidate['fields'] = { name }
      if (host(url) === host(capture.requestedUrl)) { fields.publicProfileUrl = url; fields.placeIdentity = url }
      candidates.push({ id: `${capture.requestedUrl}#link-${index}`, kind: 'result_link', ...(host(url) !== host(capture.requestedUrl) ? { resultUrl: url } : {}), fields, evidence: [reference(capture, `a[${index}]`, `${name} — ${url}`)] })
    }
    return candidates.slice(0, 100)
  },
}

/** Google-style public place detail semantics are isolated here, never inferred from screen position or seed values. */
export const publicPlaceCardExtractor: SearchResultExtractor = {
  id: 'public-place-details-v1',
  extract(capture) {
    const elements = descendants(semanticTree(capture.html || ''))
    const main = elements.filter((element) => element.attrs.role === 'main' || element.tag === 'main')
    return main.flatMap((scope, index) => {
      const nodes = descendants(scope)
      const headings = nodes.filter((node) => node.tag === 'h1')
      if (headings.length !== 1) return []
      const fields: BusinessResultCandidate['fields'] = { name: content(headings[0]) }
      for (const node of nodes) {
        const id = node.attrs['data-item-id'] || ''
        const label = node.attrs['aria-label'] || content(node)
        if (id === 'address') fields.address = label.replace(/^address:\s*/i, '')
        if (id.startsWith('phone:')) fields.phone = label.replace(/^phone:\s*/i, '')
        if (id === 'authority' && node.attrs.href) fields.website = safeUrl(node.attrs.href, capture.requestedUrl)
      }
      if (!fields.phone && !fields.website && !fields.address) return []
      if (/\/maps\/place\//.test(capture.finalUrl || capture.requestedUrl)) fields.publicProfileUrl = capture.finalUrl || capture.requestedUrl
      return [{ id: `${capture.requestedUrl}#place-${index}`, kind: 'semantic_card' as const, fields, evidence: [reference(capture, `main[${index}] public place attributes`, content(scope))] }]
    })
  },
}

/** Uses the bounded semantic regions captured from a normal rendered page. */
export const renderedResultExtractor: SearchResultExtractor = {
  id: 'rendered-result-regions-v1',
  extract(capture) {
    return (capture.renderedResultEvidence?.candidates || []).slice(0, 80).flatMap((observed, index) => {
      const fields: BusinessResultCandidate['fields'] = { name: observed.name }
      const links = observed.links.map((item) => ({ ...item, resolved: resultUrl(item.url, capture) }))
      const link = links
        .find((item) => item.resolved && host(item.resolved) !== host(capture.finalUrl || capture.requestedUrl))
      let resultDestination = link?.resolved || ''
      const displayed = displayedResultUrl([...(observed.displayedUrls || []), ...observed.links.map((item) => item.text), observed.excerpt], capture)
      if (!resultDestination && displayed) resultDestination = displayed
      if (observed.phones[0]) fields.phone = observed.phones[0]
      if (!resultDestination && !fields.phone) return []
      const evidence = [reference(capture, observed.locator, `${observed.excerpt}\n${observed.links.map((item) => `${item.text} — ${item.url}`).join('\n')}`)]
      if (displayed && !link) evidence.push(reference(capture, `${observed.locator} displayed destination`, `${(observed.displayedUrls || []).join(' | ')} ${observed.links.map((item) => item.text).join(' | ')}`.trim() || observed.excerpt))
      return [{ id: `${capture.requestedUrl}#rendered-result-${index}`, kind: 'semantic_card' as const, ...(resultDestination ? { resultUrl: resultDestination } : {}), fields,
        evidence }]
    })
  },
}
export const searchResultExtractors: SearchResultExtractor[] = [normalizedProviderResultExtractor, jsonLdResultExtractor, semanticResultExtractor, publicPlaceCardExtractor, renderedResultExtractor]

export function assessSearchCapture(capture: AcquisitionResult, profile: BusinessProfile, profileState: BusinessProfileState, destination: SearchDestination, queryMode: SearchQueryMode = 'discovery'): SearchEntityAssessment {
  const loginGate = /\/(?:accounts\/)?(?:login|signin)(?:[/?#]|$)/i.test(capture.finalUrl || capture.requestedUrl) || (/<title[^>]*>[^<]*(?:log in|sign in)/i.test(capture.html || '') && /<form[^>]*action=["'][^"']*(?:login|signin)/i.test(capture.html || ''))
  if (capture.outcome === 'blocked' || isChallenge(capture) || loginGate) return { matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable', operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: ['Public capture encountered an access restriction or challenge. Manual public review is required; no bypass was attempted.'], blocker: 'access_blocked', tier3Candidate: false }
  if (!['success', 'partial'].includes(capture.outcome)) return { matches: [], confidence: 'unavailable', automaticObservation: false, visibilityResult: 'unavailable', operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: [`Acquisition did not obtain a public page: ${capture.error || capture.outcome}. This is not evidence of absence.`], blocker: 'acquisition_failure', tier3Candidate: false }
  const candidates = searchResultExtractors.flatMap((extractor) => extractor.extract(capture))
  const assessment = assessBusinessCandidates(candidates, profile, profileState, queryMode)
  const resultRegionInspected = Boolean(capture.resultRegionInspected || capture.renderedResultEvidence?.resultRegionInspected || (candidates.length && /<(?:main|article)\b|role=["'](?:main|listitem)["']/i.test(capture.html || '')))
  assessment.resultRegionInspected = resultRegionInspected
  if (!assessment.matches.length && resultRegionInspected && reviewedProfileValue(profile, profileState, 'businessName')) {
    assessment.visibilityResult = 'not_found'
    assessment.operatorReviewRequired = false
    assessment.blocker = 'no_match'
    assessment.confidence = 'low'
    assessment.ambiguityReasons = ['A normal usable result region was inspected, but no candidate sufficiently matched the reviewed business identity.']
  }
  const interactive = /<button\b|role=["'](?:button|dialog)["']|\/maps\/place\//i.test(capture.html || '') && pageText(capture).length > 20
  if (!assessment.automaticObservation && assessment.visibilityResult !== 'not_found' && interactive && ['Google Maps', 'Apple Maps', 'Bing Search', 'Yelp', 'Facebook', 'Instagram'].includes(destination) && !['identifier_conflict', 'unreviewed_profile'].includes(assessment.blocker)) {
    assessment.tier3Candidate = true
    assessment.ambiguityReasons.push('The captured page contains public interactive controls/place links, but does not expose a uniquely matched complete record in this capture.')
    if (assessment.blocker === 'insufficient_identity') assessment.blocker = 'interactive_page'
  }
  return assessment
}
