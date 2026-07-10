import type { BusinessProfile, DirectoryAuditRow } from '../types/audit'
import type { PublicPageCheckResponse } from '../types/publicPageCheck'

const validProfilePhoneNumbers = (profile: BusinessProfile) =>
  (profile.phoneNumbers ?? []).filter(
    (record) => record.isValidPublicContact && record.number.trim(),
  )

export const runPublicPageCheck = async (
  profile: BusinessProfile,
  row: DirectoryAuditRow,
) => {
  const response = await fetch('/api/check-public-directory-page', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      listingUrl: row.listingUrl,
      businessName: profile.businessName,
      website: profile.website,
      phone: profile.phone,
      phoneNumbers: validProfilePhoneNumbers(profile).map(
        (record) => record.number,
      ),
      contactStructureNote: profile.contactStructureNote,
      localMarket: profile.localMarket,
      serviceArea: profile.serviceArea,
      primaryCategory: profile.primaryCategory,
      secondaryCategories: profile.secondaryCategories,
      industryTags: profile.industryTags,
      primaryServices: profile.primaryServices,
      targetLocation: profile.targetLocation,
    }),
  })

  const payload = (await response.json()) as PublicPageCheckResponse | {
    error: string
  }
  if (!response.ok) {
    throw new Error(
      'error' in payload ? payload.error : 'Public page check failed.',
    )
  }

  return payload as PublicPageCheckResponse
}
