import type {
  BusinessProfile,
  BusinessProfileField,
  BusinessProfileState,
  BusinessProfileValue,
} from '../types/audit'
import { blankProfile, normalizeWorkspaceProfile } from './workspaceProfile'

export const businessProfileFields: BusinessProfileField[] = [
  'businessName',
  'website',
  'streetAddress',
  'city',
  'state',
  'zip',
  'phone',
  'knownListingUrl',
  'operatorNote',
  'phoneNumbers',
  'contactStructureNote',
  'primaryCategory',
  'secondaryCategories',
  'industryTags',
  'localMarket',
  'existingDirectoryUrls',
  'serviceArea',
  'primaryServices',
  'targetLocation',
  'keywords',
]

const hasValue = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : Boolean(String(value ?? '').trim())

const isProfileValue = (value: unknown): value is BusinessProfileValue =>
  Boolean(value) &&
  typeof value === 'object' &&
  value !== null &&
  'value' in value &&
  'status' in value

/** Adds provenance to legacy flat profile fields without discarding any data. */
export const normalizeBusinessProfileState = (
  profile: BusinessProfile,
  saved: Partial<BusinessProfileState> | undefined,
  recordedAt: string,
): BusinessProfileState => {
  const values: BusinessProfileState['values'] = {}
  const savedValues = saved?.values ?? {}

  businessProfileFields.forEach((field) => {
    const savedValue = savedValues[field]
    if (isProfileValue(savedValue)) {
      values[field] = {
        ...savedValue,
        source: savedValue.source || 'legacy_imported',
        confidence: savedValue.confidence ?? 'low',
        status: savedValue.status ?? 'legacy_imported',
        recordedAt: savedValue.recordedAt ?? recordedAt,
      }
      return
    }

    const value = profile[field]
    if (hasValue(value)) {
      values[field] = {
        value,
        source: 'legacy_imported',
        recordedAt,
        confidence: 'low',
        status: 'legacy_imported',
      }
    }
  })

  return { schemaVersion: 1, values }
}

/** Records explicit operator edits while leaving untouched confirmed facts intact. */
export const recordOperatorProfileChanges = (
  previous: BusinessProfile,
  next: BusinessProfile,
  current: BusinessProfileState,
  recordedAt: string,
): BusinessProfileState => {
  const values = { ...current.values }
  businessProfileFields.forEach((field) => {
    if (JSON.stringify(previous[field]) === JSON.stringify(next[field])) return

    if (!hasValue(next[field])) {
      delete values[field]
      return
    }

    values[field] = {
      value: next[field],
      source: 'operator_entered',
      recordedAt,
      confidence: 'high',
      status: 'operator_reviewed',
    }
  })
  return { schemaVersion: 1, values }
}

/** Future research can merge candidates through this guard without replacing owner facts. */
export const preserveOwnerConfirmedValues = (
  current: BusinessProfileState,
  researched: BusinessProfileState,
): BusinessProfileState => {
  const values = { ...researched.values }
  businessProfileFields.forEach((field) => {
    if (current.values[field]?.status === 'owner_confirmed') {
      values[field] = current.values[field]
    }
  })
  return { schemaVersion: 1, values }
}

const authoritativeStatuses = new Set(['operator_reviewed', 'owner_confirmed'])

/**
 * Projects the current reviewed identity without letting stale compatibility
 * fields from a different business override reviewed facts. If the reviewed
 * business name conflicts with the flat profile, unreviewed flat fields are
 * discarded rather than carried across workspaces.
 */
export const reviewedBusinessProfile = (
  profile: BusinessProfile,
  state: BusinessProfileState,
): BusinessProfile => {
  const normalized = normalizeWorkspaceProfile(profile)
  const reviewedName = state.values.businessName
  const identityConflict = reviewedName && authoritativeStatuses.has(reviewedName.status) &&
    String(reviewedName.value).trim() !== normalized.businessName.trim()
  const projected = { ...(identityConflict ? blankProfile : normalized) }
  businessProfileFields.forEach((field) => {
    const fact = state.values[field]
    if (!fact || !authoritativeStatuses.has(fact.status)) return
    ;(projected[field] as unknown) = structuredClone(fact.value) as never
  })
  return normalizeWorkspaceProfile(projected)
}
