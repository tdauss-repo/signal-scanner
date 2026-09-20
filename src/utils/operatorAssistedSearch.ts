import type { BusinessProfile, BusinessProfileState, SearchDestinationObservation, SearchVisibilityObservedResultType } from '../types/audit'
import type { BusinessResultCandidate, EntityField, EvidenceReference, SearchEntityAssessment } from '../types/entityMatch'
import type { OperatorAssistedBrowserEvidence } from '../types/operatorAssistedSearch'
import { assessBusinessCandidates } from './entityMatcher'
import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import { defaultSearchDestinationObservation, normalizeSearchDestinationObservation, resultTypesForDestination } from './searchVisibility'

const clean = (value: string) => value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim()
const normalized = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const domainPattern = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>]*)?/gi
const phonePattern = /(?:\+?1[ .()-]*)?(?:\(?\d{3}\)?[ .-]*)\d{3}[ .-]*\d{4}\b/
const streetPattern = /^\s*(\d{1,8}\s+.+?\b(?:st(?:reet)?|rd|road|ave(?:nue)?|blvd|boulevard|dr(?:ive)?|ln|lane|ct|court|hwy|highway|pkwy|parkway|way|pl|place)\.?)(?:\s*,.*)?$/i
const localityPattern = /^\s*([A-Za-z][A-Za-z .'-]{1,80})\s*,\s*([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$/
const ignoredDomains = new Set(['google.com', 'gstatic.com', 'googleusercontent.com'])
const host = (value: string) => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const website = (value: string) => {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).href } catch { return '' }
}
const reference = (sourceUrl: string, observedAt: string, index: number, excerpt: string): EvidenceReference => ({
  sourceUrl, acquiredAt: observedAt, method: 'browser_assisted', provider: 'operator-assisted-browser',
  locator: `pasted visible result block[${index}]`, excerpt: excerpt.slice(0, 2500),
})

function candidateFromBlock(block: string, index: number, profile: BusinessProfile, sourceUrl: string, observedAt: string): BusinessResultCandidate | undefined {
  const lines = block.split('\n').map(clean).filter(Boolean)
  const wantedName = normalized(profile.businessName)
  const name = lines.find((line) => {
    const value = normalized(line.replace(/^business(?: name)?\s*:\s*/i, ''))
    return wantedName && (value === wantedName || value.startsWith(`${wantedName} `) || value.endsWith(` ${wantedName}`))
  })?.replace(/^business(?: name)?\s*:\s*/i, '') || lines.find((line) => /^business(?: name)?\s*:/i.test(line))?.replace(/^business(?: name)?\s*:\s*/i, '')
  const domains = new Map<string, string>()
  for (const line of lines) for (const match of line.matchAll(domainPattern)) {
    if (match.index && line[match.index - 1] === '@') continue
    const parsed = website(match[0].replace(/[),.;:'"!?\]}]+$/g, ''))
    const domain = host(parsed)
    if (domain && !ignoredDomains.has(domain)) domains.set(domain, parsed)
  }
  const phone = lines.map((line) => line.match(phonePattern)?.[0] || '').find(Boolean) || ''
  const streetAddress = lines.map((line) => line.match(streetPattern)?.[1] || '').find(Boolean) || ''
  const locality = lines.map((line) => line.match(localityPattern)).find(Boolean)
  const category = lines.find((line) => /^category\s*:/i.test(line))?.replace(/^category\s*:\s*/i, '') || ''
  const fields: BusinessResultCandidate['fields'] = {}
  if (name) fields.name = name
  if (domains.size === 1) fields.website = [...domains.values()][0]
  if (phone) fields.phone = phone
  if (streetAddress) fields.streetAddress = streetAddress
  if (locality) { fields.locality = locality[1]; fields.region = locality[2]; if (locality[3]) fields.postalCode = locality[3] }
  if (category) fields.category = category
  if (!fields.name) return undefined
  return { id: `operator-assisted:${evidenceFingerprint({ sourceUrl, index, block })}`, kind: 'semantic_card', fields, evidence: [reference(sourceUrl, observedAt, index, block)] }
}

export interface ParsedOperatorAssistedObservation {
  rawText: string
  sourceUrl: string
  parsedAt: string
  candidates: BusinessResultCandidate[]
  assessment: SearchEntityAssessment
}

export function parseOperatorAssistedBrandObservation(rawText: string, sourceUrl: string, profile: BusinessProfile, profileState: BusinessProfileState, parsedAt = new Date().toISOString()): ParsedOperatorAssistedObservation {
  const bounded = rawText.slice(0, 12_000).replace(/\r/g, '')
  const blocks = bounded.split(/\n\s*\n+/).map(clean).filter(Boolean).slice(0, 20)
  const candidates = blocks.map((block, index) => candidateFromBlock(block, index, profile, sourceUrl, parsedAt)).filter((candidate): candidate is BusinessResultCandidate => Boolean(candidate))
  return { rawText: bounded, sourceUrl, parsedAt, candidates, assessment: assessBusinessCandidates(candidates, profile, profileState, 'brand') }
}

const resultTypes = (assessment: SearchEntityAssessment): SearchVisibilityObservedResultType[] => {
  const selected = assessment.selected
  if (!selected || !assessment.automaticObservation) return []
  const types: SearchVisibilityObservedResultType[] = ['business_name_correct']
  if (selected.matchedFields.some((field) => field.field === 'website')) types.push('official_website', 'website_correct')
  if (selected.matchedFields.some((field) => field.field === 'phone')) types.push('phone_correct')
  if (selected.matchedFields.some((field) => ['streetAddress', 'address'].includes(field.field))) types.push('address_correct')
  if (selected.matchedFields.some((field) => field.field === 'category')) types.push('category_correct')
  return types
}

export function acceptOperatorAssistedBrandObservation(previous: SearchDestinationObservation | undefined, parsed: ParsedOperatorAssistedObservation, profile: BusinessProfile, profileState: BusinessProfileState, acceptedAt = new Date().toISOString()): SearchDestinationObservation {
  const assessment = parsed.assessment
  const conflict = assessment.matches.some((match) => match.conflictingFields.length > 0)
  const evidence: OperatorAssistedBrowserEvidence = { version: 1, provenance: 'operator_assisted_browser', sourceUrl: parsed.sourceUrl, rawText: parsed.rawText,
    parsedAt: parsed.parsedAt, acceptedAt, evidenceKey: evidenceFingerprint(parsed.rawText), profileKey: evidenceFingerprint(profile), profileReviewKey: evidenceFingerprint(profileState), candidates: parsed.candidates, assessment }
  const fields = assessment.selected?.candidate.fields || {}
  const summary = [`Operator-assisted browser observation (${parsed.sourceUrl})`, `Parsed fields: ${JSON.stringify(fields)}`, ...assessment.ambiguityReasons].join('\n')
  return normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation('Google Search', previous?.query || profile.businessName), ...previous,
    destination: 'Google Search', query: previous?.query || profile.businessName, observedAt: acceptedAt, provenance: 'operator_assisted_browser',
    overallResult: assessment.automaticObservation ? 'found_match' : conflict ? 'found_conflicting_information' : 'manual_review_needed',
    observedResultTypes: resultTypes(assessment).filter((type) => resultTypesForDestination('Google Search').includes(type)),
    confidence: assessment.automaticObservation ? 'operator_provided_page_text' : 'manual_needs_confirmation', evidenceKind: 'external_observation', evidenceNotes: summary,
    reviewed: false, operatorAssisted: evidence })
}

export const operatorAssistedEvidenceIsCurrent = (observation: SearchDestinationObservation, profile: BusinessProfile, profileState: BusinessProfileState) => Boolean(
  observation.operatorAssisted && observation.operatorAssisted.evidenceKey === evidenceFingerprint(observation.operatorAssisted.rawText) &&
  matchesEvidenceFingerprint(observation.operatorAssisted.profileKey, profile) && matchesEvidenceFingerprint(observation.operatorAssisted.profileReviewKey, profileState),
)

export const operatorAssistedParsedFields = (parsed: ParsedOperatorAssistedObservation | OperatorAssistedBrowserEvidence): Partial<Record<EntityField, string>> => parsed.assessment.selected?.candidate.fields || parsed.candidates[0]?.fields || {}
