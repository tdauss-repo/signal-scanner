import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PackagePreparationPanel } from '../src/components/PackagePreparationPanel.tsx'
import type { AuditItem, AuditState, FixItem, PackageCommercialPricing, SearchDestination, SearchDestinationObservation } from '../src/types/audit.ts'
import { buildBrandPresenceVerification } from '../src/utils/brandPresenceVerification.ts'
import { buildCustomerFindingRefinement, customerReviewKey, defaultCustomerFindingWording, isPresentedFinding } from '../src/utils/customerScan.ts'
import {
  buildCustomerVisibilityReviewExport,
  customerVisibilityReviewFilename,
  customerVisibilityReviewQaText,
  serializeCustomerVisibilityReview,
} from '../src/utils/customerVisibilityReviewExport.ts'
import { activePackageScopeOverride, buildPackageScopeOverride, derivePackagePreparation } from '../src/utils/packagePreparation.ts'
import {
  buildPackageCommercialPricing,
  deriveEffectivePackageOffers,
  formatPriceDisplay,
  formatUsdCents,
  initialProjectTotal,
  normalizePackagePricingState,
  packagePricingIsComplete,
  parseUsdAmount,
} from '../src/utils/packagePricing.ts'
import { normalizeSalesReadiness } from '../src/utils/salesReadiness.ts'
import { defaultSearchDestinationObservation } from '../src/utils/searchVisibility.ts'
import { normalizeWebsiteAuditWorkspaceState } from '../src/utils/websiteAuditState.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

Object.assign(globalThis, { React })

const profile = normalizeWorkspaceProfile({
  businessName: 'Montessori Center of Downriver',
  primaryCategory: 'Montessori school',
  city: 'Southgate',
  state: 'MI',
  website: 'http://www.montessoridownriver.com/',
})

const makeState = (): AuditState => ({
  profile,
  businessProfile: { schemaVersion: 1, values: {} },
  checks: {}, notes: {}, evidenceConfidence: {}, lastUpdated: '', reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined), selectedAIPlatform: 'Gemini', aiAnswerTests: {} as AuditState['aiAnswerTests'],
  searchVisibilityTests: {}, searchDestinationObservations: {}, voicePromptTests: {}, voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] }, manualFixes: [], salesReadiness: normalizeSalesReadiness(undefined, profile),
})

const finding = (id: string, issue: string, action: string): FixItem => ({
  id, area: 'Website', sourceArea: id === 'website-schema' ? 'ai_geo_readiness' : 'website', priority: 'Medium', status: 'fail', reviewed: true,
  issue, fix: action, whyItMatters: `${issue} matters locally.`, evidenceSummary: `Evidence for ${issue}.`, verificationMethod: `Verify ${issue}.`, salesPackageFit: 'starter',
})

const hosting = finding('website-hosting', 'Modernize website hosting', 'Move the website to modern hosting.')
const location = finding('website-location', 'Make your location clearer on the homepage', 'Clarify the school’s Southgate and Downriver context.')
const identity = finding('website-schema', 'Help search and AI understand your school', 'Add clear school identity information.')
const description = finding('website-description', 'Improve the homepage search description', 'Improve the homepage search description.')
location.priority = 'High'
description.priority = 'Low'
location.impact = 'high'
identity.impact = 'medium'
description.impact = 'low'
const fixes = [hosting, location, identity, description]

const state = makeState()
for (const fix of fixes) state.customerFindingReviews = { ...state.customerFindingReviews, [fix.id]: customerReviewKey(state, fix) }

const strengthItems: AuditItem[] = [
  ['website-faq', 'Helpful website content'],
  ['website-sitemap-robots', 'Search accessibility'],
  ['website-contact', 'Clear contact information'],
  ['website-mobile', 'Mobile-friendly website'],
  ['website-navigation', 'Clear website navigation'],
  ['website-programs', 'Program information'],
].map(([id, label]) => ({ id, area: 'website', label, description: `${label} was verified.`, weight: 1, access: 'public', evidenceLinks: [], fix: '' }))
for (const item of strengthItems) {
  state.checks[item.id] = 'pass'
  state.notes[item.id] = `${item.label} was verified for the accepted review.`
  state.evidenceConfidence[item.id] = 'operator_observation'
}
const verifiedSearchObservation = (destination: SearchDestination): SearchDestinationObservation => {
  const observation = {
    ...defaultSearchDestinationObservation(destination, profile.businessName),
    overallResult: 'found_match' as const,
    reviewed: true,
    evidenceNotes: `${destination} matched the reviewed business information.`,
  }
  const verification = buildBrandPresenceVerification(observation, state.profile, state.businessProfile, {
    outcome: 'found_correct',
    reviewedAt: '2026-10-11T16:00:00.000Z',
  })
  assert(verification.ok)
  return { ...observation, operatorVerification: verification.verification }
}
state.searchDestinationObservations = {
  'search-brand-canonical': Object.fromEntries(
    (['Google Search', 'Google Maps', 'Bing Search'] as const).map((destination) => [destination, verifiedSearchObservation(destination)]),
  ),
}

const override = (fix: FixItem, scopeClassification: 'starter' | 'separate' | 'customer_action' | 'not_included', packageAssignment: string, includedScope: string) => {
  const built = buildPackageScopeOverride(state, fix, {
    scopeClassification,
    packageAssignment,
    deliveryDescription: fix.fix,
    includedScope,
    internalNote: '',
  })
  assert(built)
  return built
}

state.packageScopeOverrides = {
  [hosting.id]: override(hosting, 'separate', 'Hosting Modernization & Migration', 'Website hosting modernization and full site migration'),
  [location.id]: override(location, 'starter', 'Starter Visibility Cleanup', 'Homepage location and local identity improvement'),
  [identity.id]: override(identity, 'starter', 'Starter Visibility Cleanup', 'Search and AI business identity improvement'),
  [description.id]: override(description, 'starter', 'Starter Visibility Cleanup', 'Homepage search description cleanup'),
}

let offers = deriveEffectivePackageOffers(state, fixes)
const starter = offers.find((offer) => offer.scopeClassification === 'starter')!
const separate = offers.find((offer) => offer.scopeClassification === 'separate')!

const pricing = (offer: typeof starter, oneTimeAmount: string, recurringAmount = '', recurringBillingType: 'monthly' | 'annual' | 'custom' = 'monthly', internalPricingNote = '') => {
  const result = buildPackageCommercialPricing(offer, {
    oneTimeAmount,
    recurringAmount,
    recurringBillingType,
    customerPricingNote: '',
    internalPricingNote,
  })
  assert.deepEqual(result.errors, [])
  assert(result.pricing)
  return result.pricing
}

const starterPricing = pricing(starter, '499', '', 'monthly', 'Mary legacy customer; consider a discount after migration.')
const separatePricing = pricing(separate, '349')
state.packagePricing = {
  version: 1,
  currency: 'USD',
  packages: { [starter.key]: starterPricing, [separate.key]: separatePricing },
}

// Package and separate-scope terms persist independently in integer cents.
const reopened = JSON.parse(JSON.stringify(state)) as AuditState
assert.equal(reopened.packagePricing?.packages[starter.key].oneTimePrice?.amountCents, 49900)
assert.equal(reopened.packagePricing?.packages[separate.key].oneTimePrice?.amountCents, 34900)
assert.equal(normalizePackagePricingState(reopened.packagePricing)?.packages[starter.key].oneTimePrice?.currency, 'USD')

// Monthly, annual, and custom billing types are bounded optional recurring terms.
assert.equal(pricing(starter, '499', '29', 'monthly').recurringPrice?.billingType, 'monthly')
assert.equal(pricing(starter, '499', '299', 'annual').recurringPrice?.billingType, 'annual')
assert.equal(pricing(starter, '499', '25', 'custom').recurringPrice?.billingType, 'custom')
const recurringPersistence = JSON.parse(JSON.stringify(pricing(starter, '499', '299', 'annual'))) as PackageCommercialPricing
assert.equal(recurringPersistence.recurringPrice?.amountCents, 29900)
assert.equal(recurringPersistence.recurringPrice?.billingType, 'annual')

offers = deriveEffectivePackageOffers(state, fixes)
assert.equal(packagePricingIsComplete(offers), true)
assert.equal(initialProjectTotal(offers)?.amountCents, 84800, 'one Starter price plus one selected separate-scope price produces the initial total')
assert.equal(offers.find((offer) => offer.scopeClassification === 'starter')?.included.length, 3, 'Starter findings are included without multiplying the package price')

// Recurring charges never enter the initial one-time total.
const recurringState = structuredClone(state)
recurringState.packagePricing!.packages[starter.key] = pricing(starter, '499', '29', 'monthly')
assert.equal(initialProjectTotal(deriveEffectivePackageOffers(recurringState, fixes))?.amountCents, 84800)
const recurringReview = buildCustomerVisibilityReviewExport(recurringState, [], fixes)
assert.equal(recurringReview.pricingSummary?.recurringCharges?.[0].price.display, '$29/month')
assert.equal(recurringReview.pricingSummary?.initialTotal?.display, '$848 one-time')

// Mary acceptance fixture: exact customer-safe package structure and no invented recurring line.
const review = buildCustomerVisibilityReviewExport(state, strengthItems, fixes)
const json = serializeCustomerVisibilityReview(review)
const qa = customerVisibilityReviewQaText(review, true)
assert.equal(review.reviewVersion, '1.0')
assert.equal(review.verifiedStrengths.length, 9)
assert.equal(review.confirmedIssues.length, 4)
assert.deepEqual(review.confirmedIssues.map((issue) => issue.id), [location.id, identity.id, description.id, hosting.id])
assert.deepEqual(review.needsReview, [])
assert.deepEqual(Object.keys(review), [
  'reviewVersion', 'business', 'overall', 'scanAreas', 'verifiedStrengths', 'confirmedIssues', 'needsReview',
  'recommendedPackage', 'additionalRecommendedWork', 'pricingSummary',
])
assert.deepEqual(Object.keys(review.business), ['name', 'category', 'city', 'state', 'website', 'displayWebsite', 'websitePreview'])
assert.deepEqual(Object.keys(review.business.websitePreview), ['headline', 'subheadline'])
assert.equal(review.business.websitePreview.imageUrl, undefined, 'the additive screenshot field remains optional and is not fabricated')
for (const issue of review.confirmedIssues) {
  assert.deepEqual(Object.keys(issue), ['id', 'title', 'label', 'summary', 'foundLocalAction'])
  assert.equal('streetSignalAction' in issue, false, 'the v1 foundLocalAction compatibility field is retained')
}
assert.equal(customerVisibilityReviewFilename(review, new Date('2026-10-11T16:00:00.000Z')), 'street-and-signal-customer-review-montessori-center-of-downriver-2026-10-11.json')
assert.deepEqual(JSON.parse(json), review, 'the full accepted v1 review structure survives JSON serialization')
assert.deepEqual(review.recommendedPackage.included, [
  'Homepage location and local identity improvement',
  'Search and AI business identity improvement',
  'Homepage search description cleanup',
])
assert.equal(review.recommendedPackage.price?.display, '$499 one-time')
assert.deepEqual(review.additionalRecommendedWork, [{
  name: 'Hosting Modernization & Migration',
  price: { amount: 349, currency: 'USD', billing: 'one_time', display: '$349 one-time' },
  included: ['Website hosting modernization and full site migration'],
}])
assert.equal(review.pricingSummary?.initialTotal?.amount, 848)
assert.equal(review.pricingSummary?.initialTotal?.display, '$848 one-time')
assert.equal(review.pricingSummary?.recurringCharges, undefined)
for (const line of ['Starter Visibility Cleanup — $499 one-time', 'Hosting Modernization & Migration — $349 one-time', 'Total proposed initial work:', '$848 one-time']) assert(qa.includes(line), `${line} must be shared by customer QA and JSON pricing`)
assert.equal(qa.includes('Recurring:'), false, 'unset recurring pricing renders no recurring line')
assert.equal(json.includes('amountCents'), false, 'customer JSON uses customer-safe dollar amounts, not internal cents')

// Internal notes never cross either customer boundary.
assert.equal(qa.includes('Mary legacy customer'), false)
assert.equal(json.includes('Mary legacy customer'), false)
assert.equal(json.includes('internalPricingNote'), false)

const notedState = structuredClone(state)
const notedTerms = buildPackageCommercialPricing(starter, {
  oneTimeAmount: '499', recurringAmount: '', recurringBillingType: 'monthly',
  customerPricingNote: 'One-time implementation price.',
  internalPricingNote: 'Operator-only discount consideration.',
}).pricing!
notedState.packagePricing!.packages[starter.key] = notedTerms
const notedReview = buildCustomerVisibilityReviewExport(notedState, [], fixes)
const notedQa = customerVisibilityReviewQaText(notedReview, true)
assert.equal(notedReview.recommendedPackage.pricingNote, 'One-time implementation price.')
assert(notedQa.includes('One-time implementation price.'))
assert.equal(serializeCustomerVisibilityReview(notedReview).includes('Operator-only discount consideration.'), false)
assert.deepEqual(notedReview.recommendedPackage.included, review.recommendedPackage.included, 'changing pricingNote does not rewrite Included scope')
assert.equal(notedReview.confirmedIssues.find((issue) => issue.id === location.id)?.foundLocalAction,
  review.confirmedIssues.find((issue) => issue.id === location.id)?.foundLocalAction,
  'changing pricingNote does not rewrite the Review action')

const includedEdited = structuredClone(notedState)
includedEdited.packageScopeOverrides![location.id] = buildPackageScopeOverride(includedEdited, location, {
  ...includedEdited.packageScopeOverrides![location.id],
  scopeClassification: 'starter',
  packageAssignment: 'Starter Visibility Cleanup',
  includedScope: 'Updated homepage location inclusion',
})!
const includedEditedReview = buildCustomerVisibilityReviewExport(includedEdited, [], fixes)
assert(includedEditedReview.recommendedPackage.included.includes('Updated homepage location inclusion'))
assert.equal(includedEditedReview.recommendedPackage.pricingNote, 'One-time implementation price.', 'changing Included scope does not rewrite pricingNote')
assert.equal(includedEditedReview.confirmedIssues.find((issue) => issue.id === location.id)?.foundLocalAction,
  notedReview.confirmedIssues.find((issue) => issue.id === location.id)?.foundLocalAction,
  'changing Included scope does not rewrite the customer action')

const actionEdited = structuredClone(notedState)
const actionDefaults = defaultCustomerFindingWording(location, actionEdited)
const changedAction = 'Add clear Southgate and Downriver location context to the homepage and make the school’s public address easier to find and verify.'
actionEdited.customerFindingRefinements = { ...actionEdited.customerFindingRefinements,
  [location.id]: buildCustomerFindingRefinement(actionEdited, location, { ...actionDefaults, recommendedAction: changedAction })!,
}
actionEdited.customerFindingReviews![location.id] = customerReviewKey(actionEdited, location)
assert.equal(actionEdited.packageScopeOverrides![location.id].includedScope, 'Homepage location and local identity improvement', 'changing the customer action does not rewrite stored Included scope')
assert.equal(actionEdited.packagePricing!.packages[starter.key].customerPricingNote, 'One-time implementation price.', 'changing the customer action does not rewrite stored pricingNote')
actionEdited.packageScopeOverrides![location.id] = buildPackageScopeOverride(actionEdited, location, {
  ...actionEdited.packageScopeOverrides![location.id],
  scopeClassification: 'starter',
  packageAssignment: 'Starter Visibility Cleanup',
})!
const actionEditedReview = buildCustomerVisibilityReviewExport(actionEdited, [], fixes)
assert.equal(actionEditedReview.confirmedIssues.find((issue) => issue.id === location.id)?.foundLocalAction, changedAction)
assert(actionEditedReview.recommendedPackage.included.includes('Homepage location and local identity improvement'), 'changing the customer action does not rewrite Included scope')
assert.equal(actionEditedReview.recommendedPackage.pricingNote, 'One-time implementation price.', 'changing the customer action does not rewrite pricingNote')

// Editing either price deterministically updates the total.
const starterEdited = structuredClone(state)
starterEdited.packagePricing!.packages[starter.key] = pricing(starter, '549')
assert.equal(initialProjectTotal(deriveEffectivePackageOffers(starterEdited, fixes))?.amountCents, 89800)
const separateEdited = structuredClone(state)
separateEdited.packagePricing!.packages[separate.key] = pricing(separate, '399')
assert.equal(initialProjectTotal(deriveEffectivePackageOffers(separateEdited, fixes))?.amountCents, 89800)

// Removing separate scope removes its contribution but retains its keyed terms for restoration.
const excluded = structuredClone(state)
excluded.packageScopeOverrides![hosting.id] = override(hosting, 'not_included', 'None', 'Website hosting modernization and full site migration')
let excludedOffers = deriveEffectivePackageOffers(excluded, fixes)
assert.equal(excludedOffers.some((offer) => offer.scopeClassification === 'separate'), false)
assert.equal(initialProjectTotal(excludedOffers)?.amountCents, 49900)
assert.equal(excluded.packagePricing?.packages[separate.key].oneTimePrice?.amountCents, 34900)
excluded.packageScopeOverrides![hosting.id] = state.packageScopeOverrides![hosting.id]
excludedOffers = deriveEffectivePackageOffers(excluded, fixes)
assert.equal(excludedOffers.find((offer) => offer.key === separate.key)?.pricing?.oneTimePrice?.amountCents, 34900)

// Customer/third-party and not-included findings never create priced offers.
assert.equal(derivePackagePreparation(excluded, fixes).notIncludedItems.length, 0, 'restored state returns hosting to separate scope')
const notIncluded = structuredClone(state)
notIncluded.packageScopeOverrides![hosting.id] = override(hosting, 'not_included', 'None', 'No customer offer')
assert.equal(deriveEffectivePackageOffers(notIncluded, fixes).length, 1)
const customerAction = structuredClone(state)
customerAction.packageScopeOverrides![hosting.id] = override(hosting, 'customer_action', 'None', 'Customer-managed hosting')
assert.equal(deriveEffectivePackageOffers(customerAction, fixes).length, 1)

// Historical workspaces remain valid, blank pricing emits no fake zero, and readiness stays a warning concern.
const historical = structuredClone(state)
delete historical.packagePricing
const historicalReview = buildCustomerVisibilityReviewExport(historical, [], fixes)
const historicalJson = serializeCustomerVisibilityReview(historicalReview)
assert.equal(historicalReview.recommendedPackage.price, undefined)
assert.equal(historicalReview.pricingSummary, undefined)
assert.equal(historicalJson.includes('$0'), false)
assert.equal(normalizePackagePricingState(undefined), undefined)

// Pricing edits do not alter finding approval or active delivery scope identity.
const approvalBefore = structuredClone(state.customerFindingReviews)
const scopeBefore = activePackageScopeOverride(state, hosting)
const pricingOnlyEdit = structuredClone(state)
pricingOnlyEdit.packagePricing!.packages[starter.key] = pricing(starter, '549')
assert.deepEqual(pricingOnlyEdit.customerFindingReviews, approvalBefore)
assert.equal(isPresentedFinding(pricingOnlyEdit, hosting), true)
assert.deepEqual(activePackageScopeOverride(pricingOnlyEdit, hosting), scopeBefore)

// Existing evidence reconciliation remains authoritative and pricing cannot reactivate stale scope.
const refreshedHosting = { ...hosting, evidenceSummary: 'Materially refreshed hosting evidence.' }
const refreshed = structuredClone(state)
refreshed.customerFindingReviews![hosting.id] = customerReviewKey(refreshed, refreshedHosting)
assert.equal(activePackageScopeOverride(refreshed, refreshedHosting), undefined)
assert.equal(deriveEffectivePackageOffers(refreshed, [refreshedHosting, location, identity, description]).some((offer) => offer.scopeClassification === 'separate'), false)

// Shared money behavior is deterministic and rejects malformed, negative, or unsupported state.
assert.equal(formatUsdCents(49900), '$499')
assert.equal(formatUsdCents(49950), '$499.50')
assert.equal(formatUsdCents(0), '$0')
assert.equal(formatPriceDisplay({ amountCents: 29900, currency: 'USD', billingType: 'annual' }), '$299/year')
assert.deepEqual(parseUsdAmount('499'), { state: 'valid', amountCents: 49900 })
assert.deepEqual(parseUsdAmount('499.00'), { state: 'valid', amountCents: 49900 })
for (const invalid of ['-1', 'NaN', '4.999', '$499', '1,000']) assert.equal(parseUsdAmount(invalid).state, 'invalid')
const unsupported = normalizePackagePricingState({ version: 1, currency: 'EUR', packages: {} })
assert.equal(unsupported, undefined)

// The operator UI exposes bounded commercial controls without customer-specific defaults.
const html = renderToStaticMarkup(<PackagePreparationPanel state={state} fixes={fixes} />)
for (const control of ['Package Pricing', 'One-time price', 'Recurring price', 'Monthly', 'Annual', 'Customer-facing pricing note (optional)', 'Internal pricing note', 'Save pricing', 'Initial project total: $848 one-time']) assert(html.includes(control), `${control} must appear in Package Preparation`)
assert(html.includes('Package inclusions come from the Included scope fields above.'), 'commercial offer points the operator to package inclusions above')
assert(html.includes('Optional commercial or pricing context shown to the customer. Package inclusions are edited above.'), 'pricing note helper distinguishes commercial context from package inclusion copy')
assert(html.includes('Customer-facing package inclusion'), 'Included scope explains its customer-facing package role')
assert.equal(html.includes('Mary legacy customer'), true, 'operator-only pricing notes remain visible to the operator')
const historicalHtml = renderToStaticMarkup(<PackagePreparationPanel state={historical} fixes={fixes} />)
assert(historicalHtml.includes('Pricing not entered'))

console.log('Package pricing PASS: cents persistence, package and separate pricing, optional recurring terms, totals, editing/restoration, customer-safe text/JSON, legacy compatibility, reconciliation isolation, validation, and Mary acceptance fixture.')
