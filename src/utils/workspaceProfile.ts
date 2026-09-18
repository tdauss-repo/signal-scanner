import type { BusinessProfile } from '../types/audit'

export const blankProfile: BusinessProfile = {
  businessName: '', website: '', streetAddress: '', city: '', state: '', zip: '',
  phone: '', knownListingUrl: '', operatorNote: '', phoneNumbers: [], contactStructureNote: '',
  primaryCategory: '', secondaryCategories: '', industryTags: '', localMarket: '',
  existingDirectoryUrls: '', serviceArea: '', primaryServices: '', targetLocation: '', keywords: '',
}

/** A partial saved business never inherits the demo business's phone, services, or market. */
export const normalizeWorkspaceProfile = (profile: Partial<BusinessProfile>): BusinessProfile => ({
  ...blankProfile,
  ...profile,
  city: profile.city ?? profile.localMarket?.split(',')[0]?.trim() ?? '',
  state: profile.state ?? profile.localMarket?.split(',')[1]?.trim() ?? '',
  phoneNumbers: (profile.phoneNumbers ?? []).map((record, index) => ({
    ...record,
    id: record.id || `phone-${index}-${(record.label || 'contact').replace(/\W+/g, '-').toLowerCase()}-${(record.number || 'new').replace(/\W+/g, '').toLowerCase()}`,
  })),
})
