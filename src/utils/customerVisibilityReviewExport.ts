import type { AuditItem, AuditState, FixItem } from '../types/audit'
import { summarizeCustomerScan, type VisibilitySnapshotOverall } from './customerScan'
import { effectivePackageFit } from './salesReadiness'
import { derivePackagePreparation } from './packagePreparation'
import { reviewedBusinessProfile } from './businessProfileState'

export type CustomerVisibilityReviewAreaId = 'website' | 'search_maps' | 'business_information' | 'ai_discovery'
export type CustomerVisibilityReviewAreaState = 'good' | 'review' | 'issue'
export type CustomerVisibilityReviewOverallState = 'mostly_visible' | 'looking_strong' | 'improvements_recommended' | 'needs_attention' | 'not_fully_verified'

/**
 * The intentionally small, customer-safe contract consumed by Found Local
 * Sites. This is a whitelist projection: raw captures, providers, blockers,
 * evidence notes, confidence, and operator notes never cross this boundary.
 */
export interface CustomerVisibilityReviewExport {
  reviewVersion: '1.0'
  business: {
    name: string
    category: string
    city: string
    state: string
    website: string
    displayWebsite: string
    websitePreview: { headline: string; subheadline: string }
  }
  overall: { state: CustomerVisibilityReviewOverallState; headline: string; summary: string }
  scanAreas: Array<{ id: CustomerVisibilityReviewAreaId; name: string; state: CustomerVisibilityReviewAreaState; summary: string }>
  verifiedStrengths: Array<{ title: string; summary: string }>
  confirmedIssues: Array<{ id: string; title: string; label: string; summary: string; foundLocalAction: string }>
  needsReview: string[]
  recommendedPackage: { name: string; summary: string; included: string[]; cta: string }
}

const areaDefinitions: Array<{ id: CustomerVisibilityReviewAreaId; name: string }> = [
  { id: 'website', name: 'Website & Technical' },
  { id: 'search_maps', name: 'Search & Maps' },
  { id: 'business_information', name: 'Business Information' },
  { id: 'ai_discovery', name: 'AI Discovery' },
]

const displayWebsite = (website: string) => {
  try {
    const url = new URL(website)
    return `${url.hostname.replace(/^www\./i, '')}${url.pathname.replace(/\/$/, '')}` || url.hostname
  } catch { return website.replace(/^https?:\/\//i, '').replace(/\/$/, '') }
}

const overallStates: Record<VisibilitySnapshotOverall, CustomerVisibilityReviewOverallState> = {
  'Looking strong': 'looking_strong',
  'Mostly visible': 'mostly_visible',
  'Some improvements recommended': 'improvements_recommended',
  'Needs attention': 'needs_attention',
  'Not fully verified': 'not_fully_verified',
  'Not yet scanned': 'not_fully_verified',
  'Scan still being completed': 'not_fully_verified',
}
const overallState = (overall: VisibilitySnapshotOverall): CustomerVisibilityReviewOverallState => overallStates[overall]

const overallHeadline: Record<CustomerVisibilityReviewOverallState, string> = {
  looking_strong: 'Looking strong',
  mostly_visible: 'Mostly visible',
  improvements_recommended: 'A few improvements are recommended',
  needs_attention: 'Visibility needs attention',
  not_fully_verified: 'Not fully verified yet',
}

const issueArea = (fix: FixItem): CustomerVisibilityReviewAreaId => {
  if (fix.sourceArea === 'public_presence' || fix.sourceArea === 'profile_management') return 'search_maps'
  if (fix.sourceArea === 'entity_clarity' || fix.sourceArea === 'customer_question') return 'business_information'
  if (fix.sourceArea === 'ai_geo_readiness') return 'ai_discovery'
  if (fix.sourceArea === 'website') return 'website'
  const area = fix.area.toLowerCase()
  if (/listing|map|public presence|search/.test(area)) return 'search_maps'
  if (/entity|business information|profile/.test(area)) return 'business_information'
  if (/ai|machine/.test(area)) return 'ai_discovery'
  return 'website'
}

const safeIssue = (fix: FixItem) => ({
  id: fix.id,
  title: fix.intelligence?.customer.title || fix.issue,
  label: effectivePackageFit(fix) === 'starter' ? 'Starter Visibility Cleanup' : 'Reviewed visibility improvement',
  summary: fix.intelligence?.customer.found || fix.whyItMatters || 'A reviewed visibility issue was confirmed and is ready to address.',
  foundLocalAction: fix.intelligence?.customer.recommendation || fix.fix || 'Review and correct this confirmed issue with the agreed scope.',
})

const areaTitle: Record<CustomerVisibilityReviewAreaId, string> = {
  website: 'Website & Technical', search_maps: 'Search & Maps', business_information: 'Business Information', ai_discovery: 'AI Discovery',
}

/** Builds a presentation-only export from reviewed, explicitly approved findings. */
export function buildCustomerVisibilityReviewExport(state: AuditState, items: AuditItem[], fixes: FixItem[]): CustomerVisibilityReviewExport {
  const summary = summarizeCustomerScan(state, items, fixes)
  // `findings` is the existing presentation-approval gate. The sales cockpit's
  // candidate list remains useful in-product, but does not bypass approval here.
  const packagePreparation = derivePackagePreparation(state, fixes)
  const confirmedFixes = packagePreparation.approvedFindings
  const confirmedIssues = confirmedFixes.map(safeIssue)
  const needsReview = [...new Set(summary.cockpit.deeperReview.map((entry) => entry.displayDestination))]
  const areaIssues = new Map<CustomerVisibilityReviewAreaId, number>()
  for (const fix of confirmedFixes) {
    const area = issueArea(fix)
    areaIssues.set(area, (areaIssues.get(area) || 0) + 1)
  }
  const scanAreas = areaDefinitions.map((definition) => {
    const hasIssue = Boolean(areaIssues.get(definition.id))
    const area = summary.areas.find((entry) => entry.title === areaTitle[definition.id])
    const state: CustomerVisibilityReviewAreaState = hasIssue ? 'issue'
      : area?.snapshotStatus === 'Looking good' && !(definition.id === 'search_maps' && needsReview.length) ? 'good' : 'review'
    const areaSummary = state === 'issue' ? 'We found confirmed improvements worth addressing.'
      : state === 'review' ? 'A few details still need review before recommending changes.'
        : 'This area has verified strengths and no confirmed issues to address.'
    return { ...definition, state, summary: areaSummary }
  })
  const strengths = new Map<string, string>()
  for (const entry of summary.cockpit.lookingGood) strengths.set(entry.destination, entry.identitySummary)
  for (const item of items.filter((item) => state.checks[item.id] === 'pass').slice(0, 6)) {
    if (!strengths.has(item.label)) strengths.set(item.label, 'This reviewed check is looking good.')
  }
  const included = packagePreparation.starterItems.map((item) => item.includedScope)
  const hasStarterPackage = packagePreparation.recommendedPackage !== null
  const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
  const category = profile.primaryCategory || profile.secondaryCategories || 'Local business'
  const place = [profile.city || profile.localMarket, profile.state].filter(Boolean).join(', ')
  return {
    reviewVersion: '1.0',
    business: {
      name: profile.businessName || 'Business visibility review', category,
      city: profile.city || profile.localMarket || '', state: profile.state || '',
      website: profile.website || '', displayWebsite: displayWebsite(profile.website || ''),
      websitePreview: { headline: profile.businessName || 'Business visibility review', subheadline: place ? `${category} in ${place}` : category },
    },
    overall: { state: overallState(summary.snapshot.overall), headline: overallHeadline[overallState(summary.snapshot.overall)], summary: summary.snapshot.detail },
    scanAreas,
    verifiedStrengths: [...strengths].map(([title, strengthSummary]) => ({ title, summary: strengthSummary })),
    confirmedIssues,
    needsReview,
    recommendedPackage: hasStarterPackage ? {
      name: 'Starter Visibility Cleanup',
      summary: 'Found Local can address the approved visibility work and verify the agreed changes after implementation.',
      included,
      cta: 'Review Recommended Plan',
    } : {
      name: 'No package recommended yet',
      summary: 'More reviewed, evidence-backed work is needed before recommending a cleanup package.',
      included: [],
      cta: 'Review findings',
    },
  }
}

export const serializeCustomerVisibilityReview = (review: CustomerVisibilityReviewExport) => JSON.stringify(review, null, 2)

export const customerVisibilityReviewFilename = (review: CustomerVisibilityReviewExport, date = new Date()) => {
  const slug = review.business.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'business'
  const day = date.toISOString().slice(0, 10)
  return `found-local-customer-review-${slug}-${day}.json`
}
