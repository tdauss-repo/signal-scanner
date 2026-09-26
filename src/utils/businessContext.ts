import type { BusinessProfile } from '../types/audit'

export type LocalBusinessModel = 'physical_location' | 'service_area' | 'generic'

const physicalCategories = /school|montessori|academy|childcare|daycare|restaurant|cafe|bakery|retail|store|clinic|dentist|medical|church|museum|venue|salon|barber|gym|studio class/i
const serviceCategories = /photograph|plumb|electric|roof|landscap|cleaning|contractor|repair|consult|mobile|delivery|home service/i

export const localBusinessModel = (profile: BusinessProfile): LocalBusinessModel => {
  const category = `${profile.primaryCategory} ${profile.secondaryCategories}`
  if (serviceCategories.test(category)) return 'service_area'
  if (physicalCategories.test(category)) return 'physical_location'
  if (profile.serviceArea.trim()) return 'service_area'
  if (profile.streetAddress.trim()) return 'physical_location'
  return 'generic'
}

export const customerBusinessNoun = (profile: BusinessProfile) => {
  const category = profile.primaryCategory.toLowerCase()
  if (/school|montessori|academy|childcare|daycare/.test(category)) return 'school'
  if (/restaurant|cafe|bakery/.test(category)) return 'restaurant'
  if (/photograph/.test(category)) return 'photography business'
  if (/clinic|dentist|medical/.test(category)) return 'practice'
  return 'business'
}
