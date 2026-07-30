import type { AuditItem, FixItem } from '../types/audit'

interface CanonicalAuditMetadata {
  label?: string
  description?: string
  fix?: string
}

const canonicalAuditMetadata: Record<string, CanonicalAuditMetadata> = {
  'listing-apple': {
    label: 'Apple Maps / Apple business listing',
    description:
      'Owner access unverified - confirm during onboarding. Public checks use generated links only. Guided listings verification for whether Apple Maps shows the correct public business details.',
    fix: 'Review or update the business in Apple Business so Apple Maps and Siri have accurate, owner-approved location and business information. Confirm owner access during onboarding; delegated partner access may be used when available.',
  },
  'website-schema': {
    label: 'Structured business/entity data',
    description:
      'Authorized website scan. Test for JSON-LD structured data that accurately identifies the organization or business using an entity-appropriate schema type.',
    fix: 'Add or improve valid structured data using an entity-appropriate schema type and only public facts supported by the website and approved business profile. Avoid forcing a generic LocalBusiness/ProfessionalService type when a more accurate entity type applies.',
  },
}

export const applyCurrentCatalogMetadata = (item: AuditItem): AuditItem => {
  const metadata = canonicalAuditMetadata[item.id]
  return metadata ? { ...item, ...metadata } : item
}

const systemManualFixSourceId = (fixId: string) => {
  const coreListingPrefix = 'manual-core-listing-'
  if (fixId.startsWith(coreListingPrefix)) {
    return fixId.slice(coreListingPrefix.length)
  }
  return null
}

export const migrateSystemGeneratedFix = (
  fix: FixItem,
  currentItems: AuditItem[],
): FixItem => {
  const sourceId = systemManualFixSourceId(fix.id)
  if (!sourceId) return fix

  const currentItem = currentItems.find((item) => item.id === sourceId)
  if (!currentItem) return fix

  return {
    ...fix,
    area: `Listings - ${currentItem.label}`,
    issue: `${currentItem.label} cleanup`,
    fix: currentItem.fix,
  }
}
