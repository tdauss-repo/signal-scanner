import type { DirectoryAuditRow, DirectoryAuditState, SearchDestination, SearchDestinationObservation } from '../types/audit'
import { emptyDirectoryRow } from './directorySuggestions'
import { primarySearchDestinations } from './searchVisibility'

const profileNameForDestination: Partial<Record<SearchDestination, string>> = {
  'Google Maps': 'Google Business Profile',
  'Apple Maps': 'Apple Business Connect / Apple Maps',
  'Bing Search': 'Bing Places',
  Yelp: 'Yelp', Facebook: 'Facebook', Instagram: 'Instagram',
}

const observedProfile = (observation: SearchDestinationObservation) =>
  Boolean(profileNameForDestination[observation.destination]) &&
  observation.overallResult !== 'not_checked' &&
  observation.overallResult !== 'not_found' &&
  observation.overallResult !== 'unable_to_verify'

const listingResultFor = (observation: SearchDestinationObservation): DirectoryAuditRow['listingResult'] =>
  observation.overallResult === 'found_prominently' ? 'found_accurate'
    : observation.overallResult === 'found_conflicting_information' ? 'found_inaccurate'
      : 'found_incomplete'

/** Idempotently projects public profile evidence without making owner-access claims. */
export const projectPublicObservationToProfiles = (
  state: DirectoryAuditState,
  businessId: string,
  observation: SearchDestinationObservation,
): DirectoryAuditState => {
  if (!observedProfile(observation)) return state
  const directoryName = profileNameForDestination[observation.destination]!
  const existing = state.activeRows.find((row) => row.businessId === businessId && row.directoryName === directoryName)
  const evidence = `${observation.destination}: ${observation.evidenceNotes || observation.overallResult}`
  const update = (row: DirectoryAuditRow): DirectoryAuditRow => ({
    ...row,
    directoryType: ['Facebook', 'Instagram'].includes(directoryName) ? 'Social/profile site' : directoryName === 'Yelp' ? 'Review site' : 'Local directory',
    listingResult: row.ownerAdminAccessStatus === 'Confirmed with owner' && row.listingResult !== 'not_checked' ? row.listingResult : listingResultFor(observation),
    directoryStatus: row.ownerAdminAccessStatus === 'Confirmed with owner' && row.directoryStatus !== 'not_checked' ? row.directoryStatus : listingResultFor(observation),
    listingFound: 'pass',
    lastCheckedAt: observation.observedAt || row.lastCheckedAt,
    evidenceConfidence: observation.confidence,
    publicEvidenceNotes: row.publicEvidenceNotes.includes(evidence) ? row.publicEvidenceNotes : [row.publicEvidenceNotes, evidence].filter(Boolean).join('\n'),
    evidenceNotes: row.evidenceNotes.includes(evidence) ? row.evidenceNotes : [row.evidenceNotes, evidence].filter(Boolean).join('\n'),
    ownerAdminAccessStatus: row.ownerAdminAccessStatus || 'Unverified - public listing only',
    ownerAccessStatus: row.ownerAccessStatus || 'Unverified - public listing only',
  })
  if (existing) return { ...state, activeRows: state.activeRows.map((row) => row.id === existing.id ? update(row) : row) }
  const row = update({ ...emptyDirectoryRow(businessId), id: `${businessId}-public-${observation.destination.toLowerCase().replace(/\W+/g, '-')}`, directoryName })
  return { ...state, activeRows: [...state.activeRows, row] }
}

export const publicPresenceCoverage = (
  observations: Record<string, Partial<Record<SearchDestination, SearchDestinationObservation>>>,
  queryIds: string[],
) => {
  const primary = queryIds.flatMap((queryId) => primarySearchDestinations.map((destination) => observations[queryId]?.[destination]))
  const completed = primary.filter((item) => item && item.overallResult !== 'not_checked' && item.overallResult !== 'manual_review_needed').length
  return { completed, total: primary.length }
}

export const publicPresenceQualityLabel = (
  observations: Record<string, Partial<Record<SearchDestination, SearchDestinationObservation>>>,
  queryIds: string[],
) => {
  const primary = queryIds.flatMap((queryId) => primarySearchDestinations.map((destination) => observations[queryId]?.[destination]).filter(Boolean) as SearchDestinationObservation[])
  const results = primary.map((item) => item.overallResult)
  if (results.includes('found_conflicting_information')) return 'Conflicting'
  const strong = results.includes('found_prominently')
  const weak = results.some((result) => ['found_weak', 'found_directory_only', 'not_found'].includes(result))
  if (strong && weak) return 'Mixed'
  if (strong) return 'Strong'
  if (results.every((result) => result === 'not_found')) return 'Weak'
  return 'Weak'
}

export const supportingPublicPresenceReviewedCount = (
  observations: Record<string, Partial<Record<SearchDestination, SearchDestinationObservation>>>,
  queryId: string | undefined,
) => queryId ? Object.values(observations[queryId] ?? {}).filter((item) =>
  Boolean(item?.reviewed) && !primarySearchDestinations.includes(item!.destination),
).length : 0
