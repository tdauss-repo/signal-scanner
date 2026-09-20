import type { BusinessProfile, BusinessProfileField, BusinessProfileState } from '../types/audit'
import type { BusinessResultCandidate, EntityField, EntityMatch, SearchEntityAssessment, SearchQueryMode } from '../types/entityMatch'

export const normalizedWords = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const regions = 'AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|DC:District of Columbia'.split('|').map((entry) => entry.split(':'))
export const normalizedEntityField = (field: EntityField, value: string) => {
  if (field === 'phone') return value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  if (field === 'website') { try { return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
  if (field === 'publicProfileUrl') { try { const url = new URL(value); return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${url.search}`.toLowerCase() } catch { return '' } }
  let words = normalizedWords(value)
  if (field === 'region') return regions.find(([abbr, name]) => [abbr.toLowerCase(), name.toLowerCase()].includes(words))?.[0].toLowerCase() || words
  if (field === 'streetAddress' || field === 'address') {
    words = words.replace(/^(?:street )?address\s+/, '')
    const addressTokens: Record<string, string> = {
      street: 'st', st: 'st', road: 'rd', rd: 'rd', avenue: 'ave', ave: 'ave', boulevard: 'blvd', blvd: 'blvd',
      drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct', parkway: 'pkwy', pkwy: 'pkwy',
      highway: 'hwy', hwy: 'hwy', suite: 'ste', ste: 'ste',
    }
    return words.replace(/\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|parkway|pkwy|highway|hwy|suite|ste)\b/g, (token) => addressTokens[token])
  }
  return words
}
const fieldMap: Partial<Record<EntityField, BusinessProfileField>> = { name: 'businessName', streetAddress: 'streetAddress', locality: 'city', region: 'state', postalCode: 'zip', phone: 'phone', website: 'website', category: 'primaryCategory', publicProfileUrl: 'knownListingUrl' }
/** A reviewed value must still equal the active profile value. Legacy/inferred values cannot authorize a high match. */
export function reviewedProfileValue(profile: BusinessProfile, state: BusinessProfileState, field: BusinessProfileField) {
  const record = state.values[field]
  return record && ['operator_reviewed', 'owner_confirmed'].includes(record.status) && JSON.stringify(record.value) === JSON.stringify(profile[field]) ? String(record.value || '') : ''
}
const strongNameMatch = (expected: string, observed: string) => {
  const wanted = normalizedWords(expected)
  const actual = normalizedWords(observed)
  return Boolean(wanted && actual && (actual === wanted || actual.startsWith(`${wanted} `) || actual.endsWith(` ${wanted}`)))
}
export function matchBusinessCandidate(candidate: BusinessResultCandidate, profile: BusinessProfile, profileState: BusinessProfileState, queryMode: SearchQueryMode = 'discovery'): EntityMatch {
  const matchedFields: EntityMatch['matchedFields'] = []
  const conflictingFields: EntityMatch['conflictingFields'] = []
  const missingFields: EntityField[] = []
  const unreviewedProfileFields: EntityField[] = []
  for (const [key, profileField] of Object.entries(fieldMap)) {
    const field = key as EntityField
    const observed = candidate.fields[field]
    let expected = reviewedProfileValue(profile, profileState, profileField)
    if (field === 'phone') {
      const contactRecord = profileState.values.phoneNumbers
      const contactsReviewed = contactRecord && ['operator_reviewed', 'owner_confirmed'].includes(contactRecord.status) && JSON.stringify(contactRecord.value) === JSON.stringify(profile.phoneNumbers)
      const allowed = [expected, ...(contactsReviewed ? profile.phoneNumbers.filter((record) => record.isValidPublicContact).map((record) => record.number) : [])].filter(Boolean)
      expected = allowed.find((value) => observed && normalizedEntityField('phone', value) === normalizedEntityField('phone', observed)) || expected || allowed[0] || ''
    }
    if (!observed) missingFields.push(field)
    if (!expected) { unreviewedProfileFields.push(field); continue }
    if (!observed) continue
    const comparison = { field, expected, observed }
    if (field === 'name' ? strongNameMatch(expected, observed) : normalizedEntityField(field, expected) === normalizedEntityField(field, observed)) matchedFields.push(comparison)
    else if (field !== 'category' && field !== 'publicProfileUrl') conflictingFields.push(comparison)
  }
  if (candidate.fields.address) {
    const parts = (['streetAddress', 'city', 'state', 'zip'] as const).map((field) => reviewedProfileValue(profile, profileState, field))
    if (parts.every(Boolean)) {
      const expected = parts.join(', ')
      if (normalizedEntityField('address', expected) === normalizedEntityField('address', candidate.fields.address)) matchedFields.push({ field: 'address', expected, observed: candidate.fields.address })
      else conflictingFields.push({ field: 'address', expected, observed: candidate.fields.address })
    } else unreviewedProfileFields.push('address')
  }
  const matched = new Set(matchedFields.map((item) => item.field))
  const location = matched.has('address') || (matched.has('locality') && (reviewedProfileValue(profile, profileState, 'streetAddress') ? matched.has('streetAddress') : matched.has('region') || matched.has('postalCode')))
  const support = matched.has('phone') || matched.has('website')
  const high = matched.has('name') && (queryMode === 'brand' ? support || location : location && support) && !conflictingFields.length
  const ambiguityReasons: string[] = []
  if (conflictingFields.length) ambiguityReasons.push(`Observed identifiers differ from reviewed profile: ${conflictingFields.map((item) => item.field).join(', ')}.`)
  if (!matched.has('name')) ambiguityReasons.push('A matching reviewed business name is not established.')
  if (!location && queryMode !== 'brand') ambiguityReasons.push('Matching reviewed address/location evidence is insufficient.')
  if (!support && !(queryMode === 'brand' && location)) ambiguityReasons.push('A matching reviewed phone or website domain is not established.')
  if (unreviewedProfileFields.some((field) => candidate.fields[field])) ambiguityReasons.push(`Profile confirmation is missing for observed fields: ${unreviewedProfileFields.filter((field) => candidate.fields[field]).join(', ')}.`)
  return { candidate, matchedFields, conflictingFields, missingFields, unreviewedProfileFields, confidence: high ? 'high' : matched.has('name') || support ? 'medium' : 'low', automaticObservation: high, ambiguityReasons, evidence: candidate.evidence }
}
export function assessBusinessCandidates(candidates: BusinessResultCandidate[], profile: BusinessProfile, profileState: BusinessProfileState, queryMode: SearchQueryMode = 'discovery'): SearchEntityAssessment {
  const profileWebsite = normalizedEntityField('website', profile.website)
  // A result destination becomes business-website evidence only when it resolves to the reviewed profile's domain.
  // Other destinations remain publisher/listing provenance and are never treated as conflicting official websites by themselves.
  const identityCandidates = candidates.map((candidate) => candidate.resultUrl && profileWebsite && normalizedEntityField('website', candidate.resultUrl) === profileWebsite && !candidate.fields.website
    ? { ...candidate, fields: { ...candidate.fields, website: candidate.resultUrl } } : candidate)
  // Select relevance using the provisional seed; confidence still uses only reviewed facts.
  const name = normalizedWords(profile.businessName)
  const relevant = identityCandidates.filter((candidate) => {
    const observed = normalizedWords(candidate.fields.name || '')
    const overlap = name.split(' ').filter((token) => token.length > 2 && observed.split(' ').includes(token)).length
    return (observed && name && (observed === name || observed.includes(name) || name.includes(observed) || overlap >= 2)) ||
      (candidate.fields.website && normalizedEntityField('website', candidate.fields.website) === normalizedEntityField('website', profile.website)) ||
      (candidate.fields.phone && profile.phone && normalizedEntityField('phone', candidate.fields.phone) === normalizedEntityField('phone', profile.phone))
  })
  const matches = relevant.map((candidate) => matchBusinessCandidate(candidate, profile, profileState, queryMode))
  const ranked = [...matches].sort((a, b) => Number(b.automaticObservation) - Number(a.automaticObservation) || b.matchedFields.length - a.matchedFields.length)
  const selected = ranked[0]
  const selectedStrongIdentity = Boolean(['brand', 'location'].includes(queryMode) && selected?.automaticObservation)
  // Repeated captures of the same identity may coalesce, but distinct location/identifier candidates may not.
  const sameIdentity = (left: EntityMatch, right: EntityMatch) => {
    const fields: EntityField[] = ['name', 'streetAddress', 'locality', 'region', 'postalCode', 'address', 'phone', 'website', 'placeIdentity']
    const common = fields.filter((field) => left.candidate.fields[field] && right.candidate.fields[field])
    const reviewedName = reviewedProfileValue(profile, profileState, 'businessName')
    const reviewedWebsite = normalizedEntityField('website', reviewedProfileValue(profile, profileState, 'website'))
    const leftWebsite = normalizedEntityField('website', left.candidate.fields.website || '')
    const rightWebsite = normalizedEntityField('website', right.candidate.fields.website || '')
    if (reviewedName && reviewedWebsite && leftWebsite === reviewedWebsite && rightWebsite === reviewedWebsite &&
      strongNameMatch(reviewedName, left.candidate.fields.name || '') && strongNameMatch(reviewedName, right.candidate.fields.name || '')) {
      return common.filter((field) => !['name', 'website'].includes(field)).every((field) => normalizedEntityField(field, left.candidate.fields[field]!) === normalizedEntityField(field, right.candidate.fields[field]!))
    }
    return common.some((field) => ['name', 'phone', 'website'].includes(field)) && common.every((field) => field === 'name'
      ? strongNameMatch(left.candidate.fields.name!, right.candidate.fields.name!) || strongNameMatch(right.candidate.fields.name!, left.candidate.fields.name!)
      : normalizedEntityField(field, left.candidate.fields[field]!) === normalizedEntityField(field, right.candidate.fields[field]!))
  }
  const reviewedName = reviewedProfileValue(profile, profileState, 'businessName')
  const significantNameTokens = (value: string) => normalizedWords(value).split(' ').filter((token) => token.length > 2 && !['and', 'the'].includes(token))
  const claimsReviewedIdentity = (match: EntityMatch) => {
    const observedName = match.candidate.fields.name || ''
    const expectedTokens = significantNameTokens(reviewedName)
    const observedTokens = significantNameTokens(observedName)
    const shared = expectedTokens.filter((token) => observedTokens.includes(token)).length
    const similarName = Boolean(reviewedName && observedName && (
      strongNameMatch(reviewedName, observedName)
      || strongNameMatch(observedName, reviewedName)
      || (expectedTokens.length > 0 && shared / expectedTokens.length >= 0.8 && shared / Math.max(observedTokens.length, 1) >= 0.5)
    ))
    const matched = new Set(match.matchedFields.map((field) => field.field))
    const matchedLocation = matched.has('address') || (matched.has('streetAddress') && matched.has('locality'))
    return similarName || matched.has('website') || matched.has('phone') || matchedLocation
  }
  const conflictsWithSelectedIdentity = (match: EntityMatch) => {
    if (!selected) return false
    const comparable: EntityField[] = ['website', 'phone', 'streetAddress', 'address', 'locality', 'region', 'postalCode', 'placeIdentity']
    return comparable.some((field) => selected.candidate.fields[field] && match.candidate.fields[field]
      && normalizedEntityField(field, selected.candidate.fields[field]!) !== normalizedEntityField(field, match.candidate.fields[field]!))
  }
  const genuineConflict = (match: EntityMatch) => {
    if (match === selected) return false
    // A normal SERP may contain unrelated businesses. Only a record that
    // plausibly claims the reviewed identity can compete with a strong match.
    if (!claimsReviewedIdentity(match)) return false
    const fields = match.candidate.fields
    const strongIdentifierConflict = match.conflictingFields.some((item) => ['website', 'phone', 'streetAddress', 'address', 'locality', 'region', 'postalCode'].includes(item.field))
    if (strongIdentifierConflict) return true
    if (conflictsWithSelectedIdentity(match)) return true
    if (sameIdentity(selected!, match)) return false
    // Search-result/publisher URL is provenance, not an independent business identifier.
    // A title variation needs an asserted identity field before it can compete with a verified official-domain Brand match.
    const differentNamedEntity = match.conflictingFields.some((item) => item.field === 'name') && Boolean(fields.website || fields.phone || fields.streetAddress || fields.address || fields.locality || fields.region || fields.postalCode || fields.placeIdentity)
    return differentNamedEntity
  }
  const multiple = Boolean(selected && (selectedStrongIdentity ? matches.some(genuineConflict) : matches.some((match) => !sameIdentity(selected, match))))
  const conflictingEvidence = selectedStrongIdentity ? matches.some(genuineConflict) : matches.some((match) => match.conflictingFields.length)
  const reasons = [...(selected?.ambiguityReasons || ['No identifiable business result was extracted.']), ...(multiple ? ['Multiple plausible business records require disambiguation; fields were not combined across candidates.'] : []), ...(conflictingEvidence && !selected?.conflictingFields.length ? ['Another plausible result representation conflicts with reviewed profile fields.'] : [])]
  const automaticObservation = Boolean(selected?.automaticObservation && !multiple && !conflictingEvidence)
  return { matches, selected, confidence: automaticObservation ? 'high' : selected ? selected.confidence === 'high' ? 'medium' : selected.confidence : 'unavailable', automaticObservation,
    visibilityResult: automaticObservation ? 'found' : 'review_required', operatorReviewRequired: !automaticObservation, resultRegionInspected: false,
    ambiguityReasons: automaticObservation ? [] : reasons, blocker: automaticObservation ? 'none' : multiple ? 'multiple_entities' : conflictingEvidence ? 'identifier_conflict' : selected?.unreviewedProfileFields.some((field) => selected.candidate.fields[field]) ? 'unreviewed_profile' : 'insufficient_identity', tier3Candidate: false }
}
