import assert from 'node:assert/strict'
import { defaultProfile } from '../src/data/demoProfile.ts'
import type { BusinessProfile, BusinessProfileState } from '../src/types/audit.ts'
import {
  normalizeBusinessProfileState,
  preserveOwnerConfirmedValues,
  recordOperatorProfileChanges,
} from '../src/utils/businessProfileState.ts'
import { buildWebsiteUrlVariants } from '../server/websiteAudit.ts'

const timestamp = '2026-07-31T12:00:00.000Z'
const legacyProfile: BusinessProfile = {
  ...defaultProfile,
  businessName: 'Legacy Plumbing',
  website: 'legacy-plumbing.example',
  primaryCategory: 'Plumber',
  primaryServices: 'Drain cleaning, water heater repair',
  existingDirectoryUrls: 'https://example.test/listing',
  serviceArea: 'Toledo, OH',
  keywords: 'plumber Toledo',
}

// Legacy saved-scan loading: advanced flat fields gain provenance rather than disappearing.
const normalizedLegacy = normalizeBusinessProfileState(legacyProfile, undefined, timestamp)
assert.equal(normalizedLegacy.values.primaryCategory?.value, 'Plumber')
assert.equal(normalizedLegacy.values.primaryCategory?.status, 'legacy_imported')
assert.equal(normalizedLegacy.values.existingDirectoryUrls?.value, 'https://example.test/listing')

// Simplified seed persistence records an operator edit and retains its seed value.
const seedProfile = { ...legacyProfile, city: 'Perrysburg', zip: '43551', operatorNote: 'Known referral.' }
const seeded = recordOperatorProfileChanges(legacyProfile, seedProfile, normalizedLegacy, timestamp)
assert.equal(seeded.values.city?.value, 'Perrysburg')
assert.equal(seeded.values.city?.source, 'operator_entered')
assert.equal(seeded.values.city?.status, 'operator_reviewed')

// Saved-scan/export/import data is plain JSON and normalizes without losing old or new fields.
const exported = JSON.stringify({ profile: seedProfile, businessProfile: seeded })
const imported = JSON.parse(exported) as { profile: BusinessProfile; businessProfile: BusinessProfileState }
const roundTripped = normalizeBusinessProfileState(imported.profile, imported.businessProfile, timestamp)
assert.equal(roundTripped.values.primaryServices?.value, legacyProfile.primaryServices)
assert.equal(roundTripped.values.operatorNote?.value, 'Known referral.')
assert.deepEqual(imported.profile.phoneNumbers, legacyProfile.phoneNumbers)

// Research candidates must never replace owner-confirmed facts.
const ownerConfirmed: BusinessProfileState = {
  schemaVersion: 1,
  values: {
    primaryCategory: {
      value: 'Owner-confirmed plumber',
      source: 'owner interview',
      recordedAt: timestamp,
      confidence: 'high',
      status: 'owner_confirmed',
    },
  },
}
const researchCandidate: BusinessProfileState = {
  schemaVersion: 1,
  values: {
    primaryCategory: {
      value: 'Research candidate category',
      source: 'website scan',
      observedAt: timestamp,
      confidence: 'medium',
      status: 'observed',
    },
  },
}
assert.equal(
  preserveOwnerConfirmedValues(ownerConfirmed, researchCandidate).values.primaryCategory?.value,
  'Owner-confirmed plumber',
)

// Existing website address normalization remains unchanged by the profile split.
assert.deepEqual(buildWebsiteUrlVariants('legacy-plumbing.example').map(String), [
  'https://legacy-plumbing.example/',
  'http://legacy-plumbing.example/',
  'https://www.legacy-plumbing.example/',
  'http://www.legacy-plumbing.example/',
])

console.log('Profile separation migration and compatibility checks passed.')
