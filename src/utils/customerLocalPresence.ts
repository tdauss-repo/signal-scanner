import type {
  AuditState,
  BusinessProfileField,
  CustomerLocalPresencePlatform,
  CustomerLocalPresencePublication,
  SearchDestinationObservation,
} from '../types/audit'
import { brandPresenceVerificationEvidenceKey, currentBrandPresenceVerification } from './brandPresenceVerification'
import { evidenceFingerprint } from './evidenceFingerprint'
import { projectSalesVisibility } from './salesVisibilityProjection'
import { canonicalProfileUrlForDestination } from './searchVisibility'

const platforms: CustomerLocalPresencePlatform[] = ['Google Maps', 'Apple Maps', 'Yelp', 'Facebook', 'Instagram']
const reviewedStatuses = new Set(['operator_reviewed', 'owner_confirmed'])

export interface CustomerLocalPresenceVerification {
  source: string
  verifiedAt?: string
}

export interface CustomerLocalPresenceAddressCandidate {
  evidenceKey: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  display: string
  verification: { status: 'reviewed'; source: string; reviewedAt?: string }
}

export interface CustomerLocalPresenceListingCandidate {
  platform: CustomerLocalPresencePlatform
  evidenceKey: string
  status: 'verified' | 'verified_recent'
  profileUrl?: string
  verification: CustomerLocalPresenceVerification
}

export interface CustomerLocalPresenceCandidate {
  id: 'primary'
  label: string
  evidenceKey: string
  address: CustomerLocalPresenceAddressCandidate
  listings: CustomerLocalPresenceListingCandidate[]
}

export interface CustomerLocalPresencePublicationInput {
  includeAddress: boolean
  listings: Partial<Record<CustomerLocalPresencePlatform, { include: boolean; includeProfileUrl: boolean }>>
  relatedFindingIds: string[]
}

export interface CustomerLocalPresenceExport {
  locations: Array<{
    id: string
    label: string
    address?: {
      streetAddress: string
      city: string
      state: string
      postalCode?: string
      display: string
      verification: { status: 'reviewed'; source: string; reviewedAt?: string }
    }
    listings?: Array<{
      platform: CustomerLocalPresencePlatform
      status: 'verified' | 'verified_recent'
      profileUrl?: string
      verification: CustomerLocalPresenceVerification
    }>
    relatedFindingIds?: string[]
  }>
}

const safeDate = (value: string | undefined) => {
  if (!value || Number.isNaN(Date.parse(value))) return undefined
  return new Date(value).toISOString()
}

const latestDate = (values: Array<string | undefined>) => {
  const valid = values.map(safeDate).filter((value): value is string => Boolean(value))
  return valid.sort((left, right) => right.localeCompare(left))[0]
}

const safeCanonicalProfileUrl = (platform: CustomerLocalPresencePlatform, value: string | undefined) => {
  const canonical = canonicalProfileUrlForDestination(platform, value)
  if (!canonical) return undefined
  try {
    const url = new URL(canonical)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch {
    return undefined
  }
}

const reviewedFact = (state: AuditState, field: BusinessProfileField) => {
  const fact = state.businessProfile.values[field]
  return fact && reviewedStatuses.has(fact.status) && String(fact.value ?? '').trim() ? fact : undefined
}

const addressCandidate = (state: AuditState): CustomerLocalPresenceCandidate | undefined => {
  const name = reviewedFact(state, 'businessName')
  const streetAddress = reviewedFact(state, 'streetAddress')
  const city = reviewedFact(state, 'city')
  const region = reviewedFact(state, 'state')
  if (!name || !streetAddress || !city || !region) return undefined
  const postalCode = reviewedFact(state, 'zip')
  const label = String(name.value).trim()
  const address = {
    streetAddress: String(streetAddress.value).trim(),
    city: String(city.value).trim(),
    state: String(region.value).trim(),
    postalCode: postalCode ? String(postalCode.value).trim() : '',
  }
  const facts = [name, streetAddress, city, region, postalCode].filter(Boolean)
  const reviewedAt = latestDate(facts.flatMap((fact) => [fact?.observedAt, fact?.recordedAt]))
  const source = facts.every((fact) => fact?.status === 'owner_confirmed')
    ? 'Owner-confirmed business profile'
    : 'Operator-reviewed business profile'
  const locationEvidenceKey = evidenceFingerprint({
    version: 'street-signal-customer-location-v1',
    id: 'primary',
    label,
    address,
  })
  const addressEvidenceKey = evidenceFingerprint({
    version: 'street-signal-customer-address-v1',
    locationEvidenceKey,
    address,
  })
  return {
    id: 'primary',
    label,
    evidenceKey: locationEvidenceKey,
    address: {
      evidenceKey: addressEvidenceKey,
      ...address,
      display: [address.streetAddress, [address.city, address.state].filter(Boolean).join(', '), address.postalCode]
        .filter(Boolean).join(', '),
      verification: { status: 'reviewed', source, ...(reviewedAt ? { reviewedAt } : {}) },
    },
    listings: [],
  }
}

const successfulObservationTime = (observation: SearchDestinationObservation) => latestDate([
  observation.observedAt,
  ...(observation.automation?.captures
    .filter((capture) => capture.outcome === 'success')
    .map((capture) => capture.acquiredAt) || []),
])

const listingCandidates = (state: AuditState): CustomerLocalPresenceListingCandidate[] => {
  const destinations = state.searchDestinationObservations['search-brand-canonical'] || {}
  const googleSearchObservation = destinations['Google Search']
  return platforms.flatMap((platform) => {
    const observation = destinations[platform]
    if (!observation) return []
    const projection = projectSalesVisibility(observation, {
      profile: state.profile,
      profileState: state.businessProfile,
      googleSearchObservation,
    })
    if (!['verified_correct', 'verified_recent', 'verified_by_operator'].includes(projection.state)) return []
    const operatorVerification = currentBrandPresenceVerification(observation, state.profile, state.businessProfile)
    const retained = projection.state === 'verified_recent' ? observation.retainedBrandVerification : undefined
    const derived = projection.derivedGoogleMapsVerification
    const profileUrl = safeCanonicalProfileUrl(platform, projection.knownProfileUrl)
    const materialEvidenceKey = operatorVerification?.evidenceKey
      || derived?.evidenceKey
      || retained?.evidenceFingerprint
      || brandPresenceVerificationEvidenceKey(observation, state.profile, state.businessProfile)
    const evidenceKey = evidenceFingerprint({
      version: 'street-signal-customer-listing-v1',
      platform,
      state: projection.state,
      profileUrl,
      materialEvidenceKey,
    })
    const verifiedAt = operatorVerification?.reviewedAt
      || derived?.verifiedAt
      || retained?.verifiedAt
      || successfulObservationTime(observation)
    const source = operatorVerification
      ? 'Operator-verified platform listing'
      : derived
        ? 'Verified Google business-profile evidence'
        : retained
          ? 'Recent retained identity verification'
          : 'Automated business-identity match'
    return [{
      platform,
      evidenceKey,
      status: projection.state === 'verified_recent' ? 'verified_recent' as const : 'verified' as const,
      ...(profileUrl ? { profileUrl } : {}),
      verification: { source, ...(safeDate(verifiedAt) ? { verifiedAt: safeDate(verifiedAt) } : {}) },
    }]
  })
}

/** Current review candidates. Nothing here is customer-published without a separate decision. */
export function customerLocalPresenceCandidate(state: AuditState): CustomerLocalPresenceCandidate | undefined {
  const candidate = addressCandidate(state)
  if (!candidate) return undefined
  return { ...candidate, listings: listingCandidates(state) }
}

export const customerLocalPresencePublicationIsCurrent = (
  state: AuditState,
  candidate = customerLocalPresenceCandidate(state),
) => Boolean(candidate && state.customerLocalPresencePublication?.status === 'approved' &&
  state.customerLocalPresencePublication.locationId === candidate.id &&
  state.customerLocalPresencePublication.locationEvidenceKey === candidate.evidenceKey)

export function buildCustomerLocalPresencePublication(
  state: AuditState,
  input: CustomerLocalPresencePublicationInput,
  approvedAt = new Date().toISOString(),
): CustomerLocalPresencePublication | undefined {
  const candidate = customerLocalPresenceCandidate(state)
  if (!candidate) return undefined
  const safeApprovedAt = safeDate(approvedAt) || new Date().toISOString()
  const listings: CustomerLocalPresencePublication['listings'] = {}
  for (const listing of candidate.listings) {
    const selection = input.listings[listing.platform]
    if (!selection?.include) continue
    listings[listing.platform] = {
      status: 'approved',
      evidenceKey: listing.evidenceKey,
      approvedAt: safeApprovedAt,
      includeProfileUrl: Boolean(selection.includeProfileUrl && listing.profileUrl),
    }
  }
  const relatedFindingIds = [...new Set(input.relatedFindingIds.map((id) => id.trim()).filter(Boolean))]
  if (!input.includeAddress && !Object.keys(listings).length) return undefined
  return {
    version: 1,
    status: 'approved',
    locationId: candidate.id,
    locationEvidenceKey: candidate.evidenceKey,
    approvedAt: safeApprovedAt,
    includeAddress: input.includeAddress,
    listings,
    relatedFindingIds,
  }
}

export function normalizeCustomerLocalPresencePublication(value: unknown): CustomerLocalPresencePublication | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Partial<CustomerLocalPresencePublication>
  if (record.version !== 1 || record.status !== 'approved' || record.locationId !== 'primary' ||
    typeof record.locationEvidenceKey !== 'string' || !record.locationEvidenceKey) return undefined
  const approvedAt = safeDate(record.approvedAt)
  if (!approvedAt) return undefined
  const listings: CustomerLocalPresencePublication['listings'] = {}
  if (record.listings && typeof record.listings === 'object' && !Array.isArray(record.listings)) {
    for (const platform of platforms) {
      const listing = record.listings[platform]
      if (!listing || listing.status !== 'approved' || typeof listing.evidenceKey !== 'string' || !listing.evidenceKey) continue
      listings[platform] = {
        status: 'approved',
        evidenceKey: listing.evidenceKey,
        approvedAt: safeDate(listing.approvedAt) || approvedAt,
        includeProfileUrl: listing.includeProfileUrl === true,
      }
    }
  }
  return {
    version: 1,
    status: 'approved',
    locationId: 'primary',
    locationEvidenceKey: record.locationEvidenceKey,
    approvedAt,
    includeAddress: record.includeAddress === true,
    listings,
    relatedFindingIds: Array.isArray(record.relatedFindingIds)
      ? [...new Set(record.relatedFindingIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map((id) => id.trim()))]
      : [],
  }
}

/** Sole customer-safe local-presence projection. Internal evidence keys never leave this function. */
export function projectCustomerLocalPresence(
  state: AuditState,
  approvedFindingIds: Iterable<string>,
): CustomerLocalPresenceExport | undefined {
  const candidate = customerLocalPresenceCandidate(state)
  const publication = state.customerLocalPresencePublication
  if (!candidate || !publication || !customerLocalPresencePublicationIsCurrent(state, candidate)) return undefined
  const approvedIds = new Set(approvedFindingIds)
  const listings = candidate.listings.flatMap((listing) => {
    const decision = publication.listings[listing.platform]
    if (!decision || decision.status !== 'approved' || decision.evidenceKey !== listing.evidenceKey) return []
    return [{
      platform: listing.platform,
      status: listing.status,
      ...(decision.includeProfileUrl && listing.profileUrl ? { profileUrl: listing.profileUrl } : {}),
      verification: listing.verification,
    }]
  })
  const relatedFindingIds = publication.relatedFindingIds.filter((id) => approvedIds.has(id))
  const address = publication.includeAddress ? {
    streetAddress: candidate.address.streetAddress,
    city: candidate.address.city,
    state: candidate.address.state,
    ...(candidate.address.postalCode ? { postalCode: candidate.address.postalCode } : {}),
    display: candidate.address.display,
    verification: candidate.address.verification,
  } : undefined
  if (!address && !listings.length) return undefined
  return {
    locations: [{
      id: candidate.id,
      label: candidate.label,
      ...(address ? { address } : {}),
      ...(listings.length ? { listings } : {}),
      ...(relatedFindingIds.length ? { relatedFindingIds } : {}),
    }],
  }
}
