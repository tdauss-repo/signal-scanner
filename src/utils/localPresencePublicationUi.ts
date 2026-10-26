import type {
  AuditState,
  CustomerLocalPresencePlatform,
  CustomerLocalPresencePublication,
} from '../types/audit'
import {
  customerLocalPresencePublicationIsCurrent,
  type CustomerLocalPresenceCandidate,
  type CustomerLocalPresencePublicationInput,
} from './customerLocalPresence'

export interface LocalPresencePublicationSummary {
  reviewedAddresses: number
  platformPresences: number
  profileLinks: number
  relatedFindings: number
}

const emptyDraft = (): CustomerLocalPresencePublicationInput => ({
  includeAddress: false,
  listings: {},
  relatedFindingIds: [],
})

export function localPresencePublicationDraft(
  publication: CustomerLocalPresencePublication | undefined,
): CustomerLocalPresencePublicationInput {
  if (!publication) return emptyDraft()
  return {
    includeAddress: publication.includeAddress,
    listings: Object.fromEntries(
      Object.entries(publication.listings).map(([platform, decision]) => [platform, {
        include: decision?.status === 'approved',
        includeProfileUrl: decision?.includeProfileUrl === true,
      }]),
    ),
    relatedFindingIds: [...publication.relatedFindingIds],
  }
}

const draftSignature = (draft: CustomerLocalPresencePublicationInput) => JSON.stringify({
  includeAddress: draft.includeAddress,
  listings: Object.entries(draft.listings)
    .map(([platform, selection]) => [platform, {
      include: selection?.include === true,
      includeProfileUrl: selection?.includeProfileUrl === true,
    }])
    .sort(([left], [right]) => String(left).localeCompare(String(right))),
  relatedFindingIds: [...new Set(draft.relatedFindingIds)].sort(),
})

export const localPresencePublicationHasUnsavedChanges = (
  publication: CustomerLocalPresencePublication | undefined,
  draft: CustomerLocalPresencePublicationInput,
) => draftSignature(localPresencePublicationDraft(publication)) !== draftSignature(draft)

export function summarizeLocalPresencePublication(
  candidate: CustomerLocalPresenceCandidate,
  draft: CustomerLocalPresencePublicationInput,
  approvedFindingIds: Iterable<string>,
): LocalPresencePublicationSummary {
  const approvedIds = new Set(approvedFindingIds)
  const eligibleListings = new Map(candidate.listings.map((listing) => [listing.platform, listing]))
  let platformPresences = 0
  let profileLinks = 0
  for (const [platform, selection] of Object.entries(draft.listings)) {
    const listing = eligibleListings.get(platform as CustomerLocalPresencePlatform)
    if (!listing || !selection?.include) continue
    platformPresences += 1
    if (selection.includeProfileUrl && listing.profileUrl) profileLinks += 1
  }
  return {
    reviewedAddresses: draft.includeAddress ? 1 : 0,
    platformPresences,
    profileLinks,
    relatedFindings: [...new Set(draft.relatedFindingIds)].filter((id) => approvedIds.has(id)).length,
  }
}

export function localPresencePublicationNeedsReconfirmation(
  state: AuditState,
  candidate: CustomerLocalPresenceCandidate,
) {
  const publication = state.customerLocalPresencePublication
  if (!publication) return false
  if (!customerLocalPresencePublicationIsCurrent(state, candidate)) return true
  return Object.entries(publication.listings).some(([platform, decision]) => {
    if (!decision) return false
    const listing = candidate.listings.find((item) => item.platform === platform)
    return !listing || listing.evidenceKey !== decision.evidenceKey
  })
}
