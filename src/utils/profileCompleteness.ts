import type { AuditState, BusinessProfileField } from '../types/audit'
import { localBusinessModel } from './businessContext'
import { reviewedBusinessProfile } from './businessProfileState'

export interface ProfileCompletenessItem {
  id: string
  label: string
  state: 'reviewed' | 'needs_review' | 'missing'
  value: string
}

const hasValue = (value: unknown) => Array.isArray(value) ? value.length > 0 : Boolean(String(value ?? '').trim())
const display = (value: unknown) => Array.isArray(value) ? `${value.length} recorded` : String(value ?? '').trim()

export function profileCompleteness(state: AuditState) {
  const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
  const model = localBusinessModel(profile)
  const fields: Array<{ id: string; label: string; keys: BusinessProfileField[]; value: () => unknown }> = [
    { id: 'name', label: 'Business name', keys: ['businessName'], value: () => profile.businessName },
    { id: 'category', label: 'Primary category / business type', keys: ['primaryCategory'], value: () => profile.primaryCategory },
    { id: 'website', label: 'Website', keys: ['website'], value: () => profile.website },
    { id: 'phone', label: 'Primary contact', keys: ['phone', 'phoneNumbers'], value: () => profile.phone || profile.phoneNumbers.find((phone) => phone.isValidPublicContact)?.number },
    { id: 'services', label: model === 'physical_location' ? 'Services / programs' : 'Primary services', keys: ['primaryServices'], value: () => profile.primaryServices },
    { id: 'market', label: model === 'physical_location' ? 'City and state' : 'Local market / service area', keys: ['city', 'state', 'localMarket', 'serviceArea'], value: () => model === 'physical_location' ? [profile.city, profile.state].filter(Boolean).join(', ') : profile.serviceArea || profile.localMarket || [profile.city, profile.state].filter(Boolean).join(', ') },
  ]
  if (model === 'physical_location') fields.splice(4, 0, { id: 'address', label: 'Physical address', keys: ['streetAddress', 'zip'], value: () => [profile.streetAddress, profile.zip].filter(Boolean).join(' ') })
  const items: ProfileCompletenessItem[] = fields.map((field) => {
    const value = field.value()
    if (!hasValue(value)) return { id: field.id, label: field.label, state: 'missing', value: '' }
    const reviewed = field.keys.some((key) => ['operator_reviewed', 'owner_confirmed'].includes(state.businessProfile.values[key]?.status || ''))
    return { id: field.id, label: field.label, state: reviewed ? 'reviewed' : 'needs_review', value: display(value) }
  })
  const missing = items.filter((item) => item.state === 'missing')
  const needsReview = items.filter((item) => item.state === 'needs_review')
  return { profile, model, items, missing, needsReview, readyToScan: Boolean(profile.businessName.trim() && profile.website.trim()) }
}

export const profileProjectionWarnings = (state: AuditState) => {
  const warnings: string[] = []
  const reviewed = reviewedBusinessProfile(state.profile, state.businessProfile)
  for (const field of ['businessName', 'primaryCategory', 'city', 'state', 'website', 'phone'] as const) {
    const fact = state.businessProfile.values[field]
    if (fact && ['operator_reviewed', 'owner_confirmed'].includes(fact.status) && JSON.stringify(state.profile[field]) !== JSON.stringify(reviewed[field])) {
      warnings.push(`${field} differs from the flat workspace value; the reviewed fact will be used for customer output.`)
    }
  }
  return warnings
}
