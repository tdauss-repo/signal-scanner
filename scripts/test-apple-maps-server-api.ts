import assert from 'node:assert/strict'
import { acquireAppleMaps, appleMapsServerSearchUrl, normalizeAppleMapsServerCandidates, type AppleMapsTransportResult } from '../server/appleMaps.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { publicPresenceUrl } from '../src/utils/searchVisibility.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const acquiredAt = '2026-10-05T16:00:00.000Z'
const query = 'Montessori Center of Downriver Southgate MI'
const searchUrl = publicPresenceUrl('Apple Maps', query)
const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver', primaryCategory: 'Preschool', streetAddress: '15575 Northline Road',
  city: 'Southgate', state: 'MI', zip: '48195', phone: '734-282-6465', website: 'https://montessoridownriver.com/',
})
const reviewedFields: BusinessProfileField[] = ['businessName', 'primaryCategory', 'streetAddress', 'city', 'state', 'zip', 'phone', 'website']
const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(reviewedFields.map((field) => [field, {
  value: profile[field], source: 'fixture review', confidence: 'high', status: 'operator_reviewed', recordedAt: acquiredAt,
}])) as BusinessProfileState['values'] }
const place = {
  id: 'I-MONTESSORI-DOWNRIVER',
  name: 'Montessori Center of Downriver',
  formattedAddressLines: ['15575 Northline Rd', 'Southgate, MI 48195', 'United States'],
  structuredAddress: { fullThoroughfare: '15575 Northline Rd', locality: 'Southgate', administrativeAreaCode: 'MI', postCode: '48195' },
  telephone: '+17342826465',
  urls: ['https://montessoridownriver.com/'],
  poiCategory: 'School',
}
const apiBody = JSON.stringify({ results: [place] })

const normalized = normalizeAppleMapsServerCandidates(apiBody, appleMapsServerSearchUrl(query).href, acquiredAt)
assert.equal(normalized.length, 1)
assert.deepEqual(normalized[0].fields, {
  name: profile.businessName,
  streetAddress: '15575 Northline Rd',
  locality: 'Southgate',
  region: 'MI',
  postalCode: '48195',
  address: '15575 Northline Rd, Southgate, MI 48195, United States',
  phone: '+17342826465',
  website: 'https://montessoridownriver.com/',
  category: 'School',
  placeIdentity: 'I-MONTESSORI-DOWNRIVER',
  publicProfileUrl: 'https://maps.apple.com/place?place-id=I-MONTESSORI-DOWNRIVER',
})

let serverCalls = 0
let publicCalls = 0
let receivedToken = ''
const configured = await acquireAppleMaps(searchUrl, {
  serverToken: 'fixture-secret-token',
  verifyDns: async () => undefined,
  serverApiTransport: async (url, token) => {
    serverCalls += 1
    receivedToken = token
    assert.equal(url.origin, 'https://maps-api.apple.com')
    assert.equal(url.pathname, '/v1/search')
    assert.equal(url.searchParams.get('q'), query)
    assert.equal(url.searchParams.get('limitToCountries'), 'US')
    assert.equal(url.searchParams.get('resultTypeFilter'), 'Poi')
    assert.equal(url.searchParams.get('lang'), 'en-US')
    return { status: 200, finalUrl: url.href, body: apiBody }
  },
  transport: async () => { publicCalls += 1; throw new Error('public fallback should not run') },
})
assert.equal(serverCalls, 1, 'configured Apple acquisition makes one bounded structured search')
assert.equal(publicCalls, 0, 'usable official structured results are preferred over the public shell')
assert.equal(receivedToken, 'fixture-secret-token')
assert.equal(configured.provider, 'apple-maps-server-api')
assert.equal(configured.outcome, 'success')
assert.equal(JSON.stringify(configured).includes('fixture-secret-token'), false, 'Apple credentials never enter persisted capture data')
const verified = assessSearchCapture(configured, profile, profileState, 'Apple Maps', 'brand')
assert.equal(verified.automaticObservation, true, 'official structured name and identity fields satisfy the unchanged strong matcher')
assert.deepEqual(new Set(verified.selected?.matchedFields.map((item) => item.field)), new Set(['name', 'streetAddress', 'locality', 'region', 'postalCode', 'phone', 'website', 'address']))

const wrongBody = JSON.stringify({ results: [{ ...place, id: 'I-WRONG', formattedAddressLines: ['900 Other Rd', 'Taylor, MI 48180', 'United States'], structuredAddress: { fullThoroughfare: '900 Other Rd', locality: 'Taylor', administrativeAreaCode: 'MI', postCode: '48180' }, telephone: '+13135550100', urls: ['https://different.example/'] }] })
const wrong = await acquireAppleMaps(searchUrl, {
  serverToken: 'fixture-secret-token', verifyDns: async () => undefined,
  serverApiTransport: async (url) => ({ status: 200, finalUrl: url.href, body: wrongBody }),
  transport: async () => { throw new Error('public fallback should not run for structured results') },
})
const wrongAssessment = assessSearchCapture(wrong, profile, profileState, 'Apple Maps', 'brand')
assert.equal(wrongAssessment.automaticObservation, false, 'a wrong Apple place never verifies')
assert.equal(wrongAssessment.blocker, 'identifier_conflict')

const redirectedSearch = `https://maps.apple.com/search?query=${encodeURIComponent(query)}`
const shellResponses: AppleMapsTransportResult[] = [
  { status: 301, finalUrl: searchUrl, body: '', location: redirectedSearch },
  { status: 200, finalUrl: redirectedSearch, body: '<html><main>Apple Maps</main></html>' },
]
let shellCalls = 0
const missingCredentials = await acquireAppleMaps(searchUrl, {
  verifyDns: async () => undefined,
  serverApiTransport: async () => { throw new Error('server API must not run without credentials') },
  transport: async () => shellResponses[shellCalls++],
})
assert.equal(shellCalls, 2)
assert.equal(missingCredentials.provider, 'apple-maps-native-fetch')
assert.equal(missingCredentials.outcome, 'success')
assert.equal(missingCredentials.finalRequestState, 'shell')
assert.equal(assessSearchCapture(missingCredentials, profile, profileState, 'Apple Maps', 'brand').automaticObservation, false, 'missing credentials remains neutral and non-failing')

let fallbackCalls = 0
const configuredFallback = await acquireAppleMaps(searchUrl, {
  serverToken: 'expired-fixture-token', verifyDns: async () => undefined,
  serverApiTransport: async (url) => ({ status: 401, finalUrl: url.href, body: '{"message":"Unauthorized"}' }),
  transport: async () => shellResponses[fallbackCalls++],
})
assert.equal(fallbackCalls, 2, 'an unavailable official API falls back to the existing bounded public path')
assert.equal(configuredFallback.provider, 'apple-maps-native-fetch')
assert.equal(configuredFallback.finalRequestState, 'shell')

console.log('Apple Maps Server API PASS: optional server-only credentials, bounded official search, strong/wrong identity behavior, secret exclusion, and public-shell fallback.')
