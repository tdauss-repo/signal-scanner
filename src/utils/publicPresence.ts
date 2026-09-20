import { matchesEvidenceFingerprint } from './evidenceFingerprint'
import type { DirectoryAuditRow, DirectoryAuditState, SearchDestination, SearchDestinationObservation } from '../types/audit'
import { emptyDirectoryRow } from './directorySuggestions'
import { buildSearchVisibilityQueries, primarySearchDestinations } from './searchVisibility'
import { operatorAssistedEvidenceIsCurrent } from './operatorAssistedSearch'

const profileNameForDestination: Partial<Record<SearchDestination, string>> = {
  'Google Maps': 'Google Business Profile',
  'Apple Maps': 'Apple Business Connect / Apple Maps',
  'Bing Search': 'Bing Places',
  Yelp: 'Yelp', Facebook: 'Facebook', Instagram: 'Instagram',
}

const observedProfile = (observation: SearchDestinationObservation) =>
  Boolean(profileNameForDestination[observation.destination]) &&
  observation.overallResult !== 'manual_review_needed' &&
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
  const strong = results.includes('found_prominently') || results.includes('found_match')
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

/** Attempt coverage is independent of finding quality and Action Plan review. Both query families count. */
export function summarizePublicPresence(state: import('../types/audit').AuditState) {
  const latest = state.visibilityRuns?.filter((run) => matchesEvidenceFingerprint(run.profileKey, state.profile)).at(-1)
  const records = new Map<string, { attempted: boolean; evidence: boolean; automatic: boolean; needsReview: boolean; reviewed: boolean }>()
  const queries = buildSearchVisibilityQueries(state.profile, state.businessProfile, { includeLocationDiagnostic: true })
  for (const query of queries) for (const [destination, observation] of Object.entries(state.searchDestinationObservations[query.id] || {})) {
    if (!observation || observation.query !== query.query) continue
    const automated = observation.automation
    const assisted = operatorAssistedEvidenceIsCurrent(observation, state.profile, state.businessProfile)
    const attempted = Boolean(automated || observation.observedAt || observation.evidenceNotes.trim() || !['not_checked'].includes(observation.overallResult))
    const evidence = Boolean(automated?.evidence || observation.operatorAssisted?.rawText || observation.evidenceNotes.trim())
    const sourceRun = state.visibilityRuns?.find((run) => run.id === automated?.runId)
    const currentProfileEvidence = matchesEvidenceFingerprint(sourceRun?.profileKey, state.profile) && (!sourceRun?.profileReviewKey || matchesEvidenceFingerprint(sourceRun.profileReviewKey, state.businessProfile))
    const automatic = Boolean(automated?.automaticObservation && observation.provenance === 'automated_acquisition' && currentProfileEvidence)
    const normalizedReview = automated?.assessment?.operatorReviewRequired
    const needsReview = assisted && observation.operatorAssisted?.assessment.operatorReviewRequired === false ? false : observation.provenance === 'automated_acquisition' && typeof normalizedReview === 'boolean'
      ? normalizedReview : attempted && !observation.reviewed && !automatic
    records.set(`${query.id}:${destination}`, { attempted, evidence, automatic, reviewed: observation.reviewed, needsReview })
  }
  for (const check of latest?.checks.filter((check) => check.area === 'SearchMaps') || []) {
    const previous = records.get(check.id)
    const attempted = Boolean(check.startedAt) || Boolean(previous?.attempted)
    const automatic = previous ? previous.automatic : Boolean(check.assessment?.automaticObservation && matchesEvidenceFingerprint(latest?.profileReviewKey, state.businessProfile))
    const normalizedReview = check.assessment?.operatorReviewRequired
    records.set(check.id, { attempted, evidence: check.evidenceCaptured || Boolean(previous?.evidence), automatic,
      reviewed: Boolean(previous?.reviewed), needsReview: previous?.needsReview ?? (typeof normalizedReview === 'boolean' ? normalizedReview : attempted && !automatic) })
  }
  const all = [...records.values()]
  const attempted = all.filter((record) => record.attempted).length
  const evidence = all.filter((record) => record.evidence).length
  const automatic = all.filter((record) => record.automatic).length
  const reviewed = all.filter((record) => record.reviewed).length
  const reviewRequired = all.filter((record) => record.needsReview).length
  return { attempted, evidence, automatic, reviewed, reviewRequired, total: all.length,
    label: reviewRequired ? 'Needs review' : attempted ? evidence ? 'Evidence observed' : 'Attempted — evidence unavailable' : 'Not tested' }
}
