import assert from 'node:assert/strict'
import { buildAuditItems } from '../src/data/auditCatalog'
import { defaultProfile } from '../src/data/demoProfile'
import {
  applyCurrentCatalogMetadata,
  migrateSystemGeneratedFix,
} from '../src/utils/catalogMetadata'
import type { FixItem } from '../src/types/audit'

const items = buildAuditItems(defaultProfile).map(applyCurrentCatalogMetadata)
const apple = items.find((item) => item.id === 'listing-apple')
const schema = items.find((item) => item.id === 'website-schema')

assert.equal(apple?.label, 'Apple Maps / Apple business listing')
assert.equal(schema?.label, 'Structured business/entity data')

const legacyAppleFix: FixItem = {
  id: 'manual-core-listing-listing-apple',
  priority: 'Medium',
  area: 'Listings - Apple Business Connect / Apple Maps listing',
  issue: 'Apple Business Connect / Apple Maps listing cleanup',
  fix: 'Create or update Apple Business Connect so iPhone and Siri experiences have the correct source data.',
  status: 'partial',
}

const migrated = migrateSystemGeneratedFix(legacyAppleFix, items)
assert.equal(migrated.area, 'Listings - Apple Maps / Apple business listing')
assert.equal(migrated.issue, 'Apple Maps / Apple business listing cleanup')
assert.match(migrated.fix, /Apple Business/)

const operatorFix: FixItem = {
  ...legacyAppleFix,
  id: 'manual-operator-custom-1',
  issue: 'Operator custom wording',
  fix: 'Preserve this text.',
}
assert.deepEqual(migrateSystemGeneratedFix(operatorFix, items), operatorFix)

console.log('Catalog migration tests passed.')
