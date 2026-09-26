import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import { currentMachineReadability, summarizeMachineReadability } from './machineReadability'
import { scanAreaState, scanStateLabel, visibilityRunStatus } from './visibilityScanState'
import type { ScanArea, ScanState } from '../types/visibilityScan'
import type { AuditItem, AuditState, CustomerFindingRefinement, FixItem } from '../types/audit'
import { effectivePackageFit, isStarterEligible, sortSalesActions } from './salesReadiness'
import { primarySearchDestinations } from './searchVisibility'
import { salesCockpitVisibility } from './salesVisibilityProjection'
import { customerBusinessNoun, localBusinessModel } from './businessContext'
import { reviewedBusinessProfile } from './businessProfileState'

export const findingLifecycle = ['Detected', 'Evidence captured', 'Reviewed', 'Action proposed', 'Approved', 'Implemented', 'Re-scanned', 'Verified'] as const
export type CustomerView = 'Business' | 'Scan' | 'Review' | 'Package' | 'Customer Review' | 'Verification'
export type CustomerAreaStatus = (typeof scanStateLabel)[ScanState] | 'Looking good' | 'Needs attention' | 'Opportunities identified' | 'Confirmation needed' | 'Scan in progress' | 'Not reviewed / Not checked'
export type VisibilitySnapshotOverall = 'Looking strong' | 'Mostly visible' | 'Some improvements recommended' | 'Needs attention' | 'Not fully verified' | 'Not yet scanned' | 'Scan still being completed'
export type VisibilitySnapshotCategory = 'Looking good' | 'Some improvements' | 'Needs attention' | 'Not fully verified' | 'Not yet scanned'

/** Existing Starter eligibility stays intact; other groups also need evidence and a checkable action. */
export const canPresentFinding = (fix: FixItem) => {
  const fit = effectivePackageFit(fix)
  return !/^(website-h1|website-heading|website-homepage-clarity)$/.test(fix.id) && fit !== 'excluded' && fix.reviewed === true &&
    (fix.status === 'fail' || fix.status === 'partial') &&
    Boolean(fix.issue.trim() && fix.fix.trim() && (fix.evidenceSummary || fix.evidenceNote)?.trim() && fix.verificationMethod?.trim()) &&
    (fit !== 'starter' || isStarterEligible(fix))
}

/** Supporting observations stay available for explicit supplemental review, not initial selection. */
export const isSupportingCustomerFinding = (fix: FixItem) => ['website-mobile-conversion', 'website-social-links', 'website-title'].includes(fix.id)

/** A generated candidate may be reviewed, but is not thereby already reviewed. */
export const canReviewFinding = (fix: FixItem) => canPresentFinding(
  fix.intelligence ? { ...fix, reviewed: true } : fix,
)

const materialProfile = (state: AuditState) => {
  const profile = reviewedBusinessProfile(state.profile, state.businessProfile)
  return {
    businessName: profile.businessName, website: profile.website,
    streetAddress: profile.streetAddress, city: profile.city, state: profile.state, zip: profile.zip,
    phone: profile.phone, primaryCategory: profile.primaryCategory,
    secondaryCategories: profile.secondaryCategories, industryTags: profile.industryTags,
    localMarket: profile.localMarket, serviceArea: profile.serviceArea,
    primaryServices: profile.primaryServices, targetLocation: profile.targetLocation,
  }
}

const materialProvenance = (fix: FixItem) => {
  const provenance = fix.intelligence?.evidence.provenance
  if (!provenance) return undefined
  return {
    captureVersion: provenance.captureVersion,
    method: provenance.method,
    outcome: provenance.outcome,
    requestedUrl: provenance.requestedUrl,
    sourceUrl: provenance.sourceUrl,
    recordOrigin: provenance.recordOrigin,
  }
}

/** Finding-scoped evidence semantics. Scan IDs, timestamps, providers, request
 * attempts, lifecycle display state, and unrelated workspace evidence are
 * deliberately absent. Substantive observations, status, interpretation,
 * delivery assumptions, verification, and reviewed business context remain.
 */
const materialFinding = (fix: FixItem) => ({
  id: fix.id, priority: fix.priority, area: fix.area, sourceArea: fix.sourceArea,
  issue: fix.issue, fix: fix.fix, status: fix.status,
  evidenceNote: fix.evidenceNote, evidenceSummary: fix.evidenceSummary,
  evidenceSources: fix.evidenceSources, evidenceConfidence: fix.evidenceConfidence,
  salesConfidence: fix.salesConfidence, whyItMatters: fix.whyItMatters,
  salesPackageFit: fix.salesPackageFit, dependencies: fix.dependencies,
  verificationMethod: fix.verificationMethod,
  intelligence: fix.intelligence ? {
    ruleVersion: fix.intelligence.ruleVersion,
    checkId: fix.intelligence.checkId,
    condition: fix.intelligence.condition,
    evidence: {
      observations: fix.intelligence.evidence.observations,
      confidence: fix.intelligence.evidence.confidence,
      provenance: materialProvenance(fix),
    },
    customer: fix.intelligence.customer,
    delivery: fix.intelligence.delivery,
    verification: fix.intelligence.verification,
    remediation: fix.intelligence.remediation,
  } : undefined,
})

const materialEvidence = (state: AuditState, fix: FixItem) => ({ profile: materialProfile(state), finding: materialFinding(fix) })
const materialEvidenceVersion = 'found-local-material-finding-v2'

type ParsedDecisionKey = { material: unknown; refinement?: unknown; includesRefinement: boolean }

const legacyMaterialProfile = (profile: unknown, businessProfile: unknown) => {
  try {
    return materialProfile({ profile, businessProfile } as AuditState)
  } catch { return undefined }
}

const parseDecisionKey = (key: string | undefined, fixId: string): ParsedDecisionKey | undefined => {
  if (!key) return undefined
  try {
    const parsed = JSON.parse(key) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if (record.version === materialEvidenceVersion && record.material) {
        return { material: record.material, refinement: record.refinement, includesRefinement: 'refinement' in record }
      }
    }
    if (!Array.isArray(parsed)) return undefined
    const finding = [...parsed].reverse().find((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === fixId) as FixItem | undefined
    const profile = legacyMaterialProfile(parsed[0], parsed[1])
    if (!finding || !profile) return undefined
    const tail = parsed.at(-1)
    const refinement = tail && typeof tail === 'object' && 'customerRefinement' in tail
      ? (tail as { customerRefinement: unknown }).customerRefinement : undefined
    return {
      material: { profile, finding: materialFinding(finding) },
      refinement,
      includesRefinement: refinement !== undefined,
    }
  } catch { return undefined }
}

const refinementDecisionValue = (refinement: CustomerFindingRefinement | undefined) => refinement ? {
  title: refinement.title,
  priority: refinement.priority,
  summary: refinement.summary,
  recommendedAction: refinement.recommendedAction,
} : undefined

/** Stable, finding-scoped evidence identity shared by refinements and decisions. */
export const customerFindingEvidenceKey = (state: AuditState, fix: FixItem) =>
  evidenceFingerprint({ version: materialEvidenceVersion, material: materialEvidence(state, fix) })

export const matchesCustomerFindingEvidenceKey = (key: string | undefined, state: AuditState, fix: FixItem) => {
  const parsed = parseDecisionKey(key, fix.id)
  return Boolean(parsed && evidenceFingerprint(parsed.material) === evidenceFingerprint(materialEvidence(state, fix)))
}

export const activeCustomerFindingRefinement = (state: AuditState, fix: FixItem) => {
  const refinement = state.customerFindingRefinements?.[fix.id]
  return refinement && matchesCustomerFindingEvidenceKey(refinement.evidenceKey, state, fix) ? refinement : undefined
}

export const hasStaleCustomerFindingRefinement = (state: AuditState, fix: FixItem) => {
  const refinement = state.customerFindingRefinements?.[fix.id]
  return Boolean(refinement && !matchesCustomerFindingEvidenceKey(refinement.evidenceKey, state, fix))
}

export interface CustomerFindingWording {
  title: string
  priority: FixItem['priority']
  summary: string
  recommendedAction: string
}

export const defaultCustomerFindingWording = (fix: FixItem, state?: AuditState): CustomerFindingWording => {
  const profile = state ? reviewedBusinessProfile(state.profile, state.businessProfile) : undefined
  const model = profile ? localBusinessModel(profile) : 'generic'
  const noun = profile ? customerBusinessNoun(profile) : 'business'
  if (fix.id === 'website-local-content') return {
    title: model === 'service_area' ? 'Service-area clarity' : 'Homepage local identity clarity',
    priority: fix.priority,
    summary: fix.status === 'partial'
      ? `The homepage includes some local context, but it could connect the ${noun} more clearly to its primary location or community.`
      : `The homepage does not currently make the ${noun}'s primary location or market clear enough for nearby customers and search or AI systems.`,
    recommendedAction: model === 'physical_location'
      ? 'Found Local will clarify the physical location and community served and make the public address easier to verify.'
      : model === 'service_area'
        ? 'Found Local will clarify the cities and areas served using accurate, natural homepage language.'
        : 'Found Local will clarify the business location or local market using accurate homepage language.',
  }
  if (fix.id === 'website-service-pages') return {
    title: model === 'physical_location' ? 'Programs and offerings visibility' : 'Services visibility',
    priority: fix.priority,
    summary: fix.status === 'partial'
      ? `The website shows some ${model === 'physical_location' ? 'program or offering' : 'service'} information, but the path from the homepage could be clearer.`
      : `The homepage does not clearly show where customers can learn about the ${model === 'physical_location' ? 'programs or offerings' : 'services'} available. This does not prove that dedicated pages are missing.`,
    recommendedAction: `Found Local will review the existing ${model === 'physical_location' ? 'program or offering' : 'service'} pages and strengthen homepage links or summary wording where needed.`,
  }
  if (fix.id === 'website-schema') return {
    title: `Help search and AI understand your ${noun}`,
    priority: fix.priority,
    summary: `Search engines and AI tools can see parts of the website, but the site does not clearly connect the ${noun}'s name, location, contact details, and website. Clear business information helps these systems understand which local business the site represents and where it is located.`,
    recommendedAction: `Found Local will add clear business information so search engines and AI tools can better understand the ${noun}'s name, location, contact details, and website.`,
  }
  return {
    title: fix.intelligence?.customer.title || fix.issue,
    priority: fix.priority,
    summary: fix.intelligence?.customer.found || fix.whyItMatters || 'The website does not currently make this visibility detail clear enough for local customers.',
    recommendedAction: fix.intelligence?.customer.recommendation || fix.fix,
  }
}

export const effectiveCustomerFindingWording = (state: AuditState, fix: FixItem): CustomerFindingWording => {
  const defaults = defaultCustomerFindingWording(fix, state)
  const refinement = activeCustomerFindingRefinement(state, fix)
  return refinement ? {
    title: refinement.title || defaults.title,
    priority: refinement.priority || defaults.priority,
    summary: refinement.summary || defaults.summary,
    recommendedAction: refinement.recommendedAction || defaults.recommendedAction,
  } : defaults
}

/** Previous operator wording remains available for reconciliation but is not
 * treated as active until rebound to the current material evidence. */
export const historicalCustomerFindingWording = (state: AuditState, fix: FixItem): CustomerFindingWording => {
  const defaults = defaultCustomerFindingWording(fix, state)
  const refinement = state.customerFindingRefinements?.[fix.id]
  const snapshot = state.customerFindingDecisionSnapshots?.[fix.id]?.customerWording
  if (refinement) return {
    title: refinement.title || snapshot?.title || defaults.title,
    priority: refinement.priority || snapshot?.priority || defaults.priority,
    summary: refinement.summary || snapshot?.summary || defaults.summary,
    recommendedAction: refinement.recommendedAction || snapshot?.recommendedAction || defaults.recommendedAction,
  }
  return snapshot || defaults
}

export const buildCustomerFindingRefinement = (
  state: AuditState,
  fix: FixItem,
  wording: CustomerFindingWording,
): CustomerFindingRefinement | null => {
  const defaults = defaultCustomerFindingWording(fix, state)
  const title = wording.title.trim()
  const summary = wording.summary.trim()
  const recommendedAction = wording.recommendedAction.trim()
  const refinement: CustomerFindingRefinement = { evidenceKey: customerFindingEvidenceKey(state, fix) }
  if (title && title !== defaults.title) refinement.title = title
  if (wording.priority !== defaults.priority) refinement.priority = wording.priority
  if (summary && summary !== defaults.summary) refinement.summary = summary
  if (recommendedAction && recommendedAction !== defaults.recommendedAction) refinement.recommendedAction = recommendedAction
  return Object.keys(refinement).length > 1 ? refinement : null
}

/** Returns a presentation copy. Raw evidence and the source FixItem remain unchanged. */
export const effectiveCustomerFinding = (state: AuditState, fix: FixItem): FixItem => {
  const wording = effectiveCustomerFindingWording(state, fix)
  return {
    ...fix,
    issue: wording.title,
    priority: wording.priority,
    whyItMatters: wording.summary,
    fix: wording.recommendedAction,
    intelligence: fix.intelligence ? {
      ...fix.intelligence,
      customer: {
        ...fix.intelligence.customer,
        title: wording.title,
        found: wording.summary,
        why: wording.summary,
        recommendation: wording.recommendedAction,
      },
    } : undefined,
  }
}

/** Decision identity adds the current effective operator wording to the same
 * material evidence key. Legacy full-workspace keys are matched by extracting
 * their finding/profile semantics, so harmless timestamp-only rescans do not
 * force reconciliation after upgrade.
 */
export const customerReviewKey = (state: AuditState, fix: FixItem) => {
  const refinement = activeCustomerFindingRefinement(state, fix)
  return refinement
    ? evidenceFingerprint({ version: materialEvidenceVersion, material: materialEvidence(state, fix), refinement: refinementDecisionValue(refinement) })
    : customerFindingEvidenceKey(state, fix)
}

export const matchesCustomerReviewKey = (key: string | undefined, state: AuditState, fix: FixItem) => {
  const parsed = parseDecisionKey(key, fix.id)
  if (!parsed || evidenceFingerprint(parsed.material) !== evidenceFingerprint(materialEvidence(state, fix))) return false
  const activeRefinement = refinementDecisionValue(activeCustomerFindingRefinement(state, fix))
  if (!activeRefinement) return !parsed.includesRefinement
  return parsed.includesRefinement && evidenceFingerprint(refinementDecisionValue(parsed.refinement as CustomerFindingRefinement)) === evidenceFingerprint(activeRefinement)
}

export const isPresentedFinding = (state: AuditState, fix: FixItem) =>
  canReviewFinding(fix) && !hasStaleCustomerFindingRefinement(state, fix) &&
  matchesCustomerReviewKey(state.customerFindingReviews?.[fix.id], state, fix)

/** A dismissal is an explicit operator disposition, not the absence of approval.
 * It shares the approval fingerprint so changed evidence always returns a finding to review.
 */
export const isDismissedCustomerFinding = (state: AuditState, fix: FixItem) =>
  canReviewFinding(fix) && !hasStaleCustomerFindingRefinement(state, fix) && !isPresentedFinding(state, fix) &&
  matchesCustomerReviewKey(state.customerFindingDismissals?.[fix.id], state, fix)

export const hasStaleCustomerFindingApproval = (state: AuditState, fix: FixItem) =>
  Boolean(state.customerFindingReviews?.[fix.id] && !isPresentedFinding(state, fix))

export const hasStaleCustomerFindingDismissal = (state: AuditState, fix: FixItem) =>
  Boolean(state.customerFindingDismissals?.[fix.id] && !isDismissedCustomerFinding(state, fix))

export const previousCustomerFindingDisposition = (state: AuditState, fix: FixItem): 'approved' | 'dismissed' | undefined =>
  hasStaleCustomerFindingApproval(state, fix) ? 'approved'
    : hasStaleCustomerFindingDismissal(state, fix) ? 'dismissed' : undefined

export const findingNeedsReconfirmation = (state: AuditState, fix: FixItem) =>
  Boolean(previousCustomerFindingDisposition(state, fix) || hasStaleCustomerFindingRefinement(state, fix))

/** Atomically rebinds preserved wording and approval to the latest material evidence. */
export const reconfirmCustomerFinding = (state: AuditState, fix: FixItem): AuditState => {
  const wording = historicalCustomerFindingWording(state, fix)
  const refinements = { ...state.customerFindingRefinements }
  const refinement = buildCustomerFindingRefinement(state, fix, wording)
  if (refinement) refinements[fix.id] = refinement
  else delete refinements[fix.id]
  const withRefinement = { ...state, customerFindingRefinements: refinements }
  const key = customerReviewKey(withRefinement, fix)
  return {
    ...withRefinement,
    customerFindingReviews: { ...state.customerFindingReviews, [fix.id]: key },
    customerFindingDismissals: Object.fromEntries(Object.entries(state.customerFindingDismissals || {}).filter(([id]) => id !== fix.id)),
    customerFindingDecisionSnapshots: {
      ...state.customerFindingDecisionSnapshots,
      [fix.id]: { evidenceKey: key, disposition: 'approved', finding: structuredClone(fix), customerWording: wording },
    },
  }
}

export interface FindingReconciliation {
  finding: FixItem
  previousDisposition: 'approved' | 'dismissed'
  absentFromLatestScan: boolean
}

/** Includes materially changed current findings and snapshot-backed findings
 * that no longer appear in the latest candidate set. Historical decisions are
 * shown for operator resolution and never treated as current customer truth.
 */
export const findingsNeedingReconciliation = (state: AuditState, currentFixes: FixItem[]): FindingReconciliation[] => {
  const currentIds = new Set(currentFixes.map((fix) => fix.id))
  const reconciliations = currentFixes.flatMap((finding) => {
    const previousDisposition = previousCustomerFindingDisposition(state, finding)
    return previousDisposition ? [{ finding, previousDisposition, absentFromLatestScan: false }] : []
  })
  for (const [id, snapshot] of Object.entries(state.customerFindingDecisionSnapshots || {})) {
    if (currentIds.has(id)) continue
    const hasDecision = Boolean(state.customerFindingReviews?.[id] || state.customerFindingDismissals?.[id])
    if (hasDecision) reconciliations.push({ finding: snapshot.finding, previousDisposition: snapshot.disposition, absentFromLatestScan: true })
  }
  return reconciliations
}

export const customerFindingGroup = (fix: FixItem) => {
  const fit = effectivePackageFit(fix)
  return fit === 'starter' ? 'Found Local can help fix'
    : fit === 'owner_action' ? 'Customer confirmation / input needed'
      : 'Future / additional opportunity'
}

export interface CustomerArea {
  scanState?: ScanState
  title: string
  status: CustomerAreaStatus
  snapshotStatus?: VisibilitySnapshotCategory
  detail: string
}

const unreviewed: CustomerAreaStatus = 'Not reviewed / Not checked'
const needsReview = ['not_checked', 'manual_review_needed', 'unable_to_verify']

/** Pure projection of the active workspace. Never reads saved scans or changes acquisition/review state. */
export function summarizeCustomerScan(state: AuditState, items: AuditItem[], fixes: FixItem[], loading = false, scanError = false) {
  const website = items.filter((item) => item.area === 'website')
  const completed = website.filter((item) => ['pass', 'partial', 'fail'].includes(state.checks[item.id]))
  const good = completed.filter((item) => state.checks[item.id] === 'pass').length
  const queries = new Set(items.filter((item) => item.area === 'keywords').map((item) => item.id))
  const search = Object.entries(state.searchDestinationObservations)
    .filter(([id]) => queries.has(id))
    .flatMap(([, destinations]) => Object.values(destinations))
    .filter((observation) => observation?.reviewed && Boolean(observation.evidenceNotes?.trim()))
  const searchCompleted = search.filter((observation) => observation && !needsReview.includes(observation.overallResult))
  const primaryComplete = [...queries].every((queryId) => primarySearchDestinations.every((destination) => {
    const observation = state.searchDestinationObservations[queryId]?.[destination]
    return observation?.reviewed && observation.evidenceNotes.trim() && !needsReview.includes(observation.overallResult)
  }))
  const ai = Object.values(state.aiAnswerTests).flatMap((test) => test.observations)
    .filter((observation) => observation.operatorReviewed && observation.evidenceMode === 'consumer_observation' && Boolean(observation.rawResponse.trim() || observation.evidenceNotes.trim()))
  const entity = state.salesReadiness.entityClarity.filter((item) => item.reviewed && item.sourceEvidence.trim())
  const questions = state.salesReadiness.customerQuestions.filter((item) => item.reviewed && item.supportingEvidence.trim())
  const businessReviewed = entity.length + questions.length
  const confirmations = entity.filter((item) => ['Owner confirmation needed', 'Unable to verify'].includes(item.result)).length +
    questions.filter((item) => ['Owner confirmation needed', 'Unable to verify'].includes(item.status)).length
  const findings = sortSalesActions([...new Map(
    fixes.filter((fix) => isPresentedFinding(state, fix)).map((fix) => [fix.id, { ...fix, reviewed: true }]),
  ).values()])
  const confirmedIssues = sortSalesActions([...new Map(
    fixes.filter(canReviewFinding).map((fix) => [fix.id, fix]),
  ).values()])
  const knownFixes = confirmedIssues.filter((fix) => ['starter', 'owner_action'].includes(effectivePackageFit(fix)))
  const cockpitVisibility = salesCockpitVisibility(Object.entries(state.searchDestinationObservations).flatMap(([queryId, destinations]) => Object.values(destinations).filter(Boolean).map((observation) => ({ queryId, observation }))))
  const recommendedPlan = findings.some(isStarterEligible) ? 'Starter Visibility Cleanup' : null
  const websiteFailed = scanError || state.websiteAudit.latestAttempt?.ok === false
  const websiteStatus: CustomerAreaStatus = loading ? 'Scan in progress' : websiteFailed ? 'Confirmation needed'
    : completed.length === 0 ? unreviewed : good < completed.length ? 'Needs attention'
      : completed.length < website.length ? 'Confirmation needed' : 'Looking good'
  const areas: CustomerArea[] = [
    { title: 'Website & Technical', status: websiteStatus,
      detail: loading ? 'Checking the website. Findings require review.'
        : websiteFailed ? 'The latest website check could not complete. Any earlier results still need review.'
          : completed.length ? `${completed.length} of ${website.length} website checks have results. ${good} look good.`
            : 'Website content and technical signals have not been checked yet.' },
    { title: 'Search & Maps', status: search.length === 0 ? unreviewed
        : searchCompleted.length < search.length ? 'Confirmation needed'
          : searchCompleted.some((item) => !['found_match', 'found_prominently'].includes(item?.overallResult || '')) ? 'Opportunities identified' : !primaryComplete ? 'Confirmation needed' : 'Looking good',
      detail: searchCompleted.length ? `${searchCompleted.length} destination observations reviewed. This describes only the recorded searches, not overall search coverage.`
        : 'Search and map results need a separate, destination-by-destination review.' },
    { title: 'Business Information', status: businessReviewed === 0 ? unreviewed : confirmations ? 'Confirmation needed'
        : entity.some((item) => item.result !== 'Clear') || questions.some((item) => item.status !== 'Answered') ? 'Opportunities identified' : 'Looking good',
      detail: businessReviewed ? `${businessReviewed} identity and customer-question observations reviewed. Public-profile comparisons remain in the Workbench.`
        : 'Business identity, contact details, and customer questions await evidence review.' },
    { title: 'AI Discovery', status: ai.length === 0 ? unreviewed
        : ai.some((item) => item.factualAccuracy === 'unable_to_verify' || item.mentioned === 'unclear') ? 'Confirmation needed'
          : ai.some((item) => item.mentioned !== 'yes' || item.factualAccuracy !== 'accurate') ? 'Opportunities identified' : 'Looking good',
      detail: ai.length ? `${ai.length} manual AI observations reviewed. Results describe those observations only; future mentions are not guaranteed.`
        : 'No reviewed AI observations. A website scan does not check AI answers.' },
  ]
  // Keep the legacy status field compatible with saved callers; normalized state is canonical for Scan.
  areas.forEach((area, index) => {
    area.scanState = area.status === unreviewed ? 'not_checked' : area.status === 'Scan in progress' ? 'scanning'
      : index === 0 && websiteFailed ? 'failed' : area.status === 'Looking good' ? 'checked_clear'
        : ['Needs attention', 'Opportunities identified'].includes(area.status) ? 'needs_attention' : 'interactive_review_required'
  })
  const latestRun = state.visibilityRuns?.filter((run) => matchesEvidenceFingerprint(run.profileKey, state.profile)).at(-1)
  if (latestRun) {
    const keys: ScanArea[] = ['WebsiteTechnical', 'SearchMaps', 'BusinessInformation', 'AIDiscovery']
    const activeDetails = ['Checking website…', 'Checking public search presence…', 'Comparing public business information…', 'Checking how clearly the website describes your business…']
    areas.forEach((area, index) => {
      // Manual AI observations remain useful; this runner makes no AI execution claims.
      if (index === 3 && ai.length && !latestRun.machineReadability) return
      const projection = { ...latestRun, checks: latestRun.checks.map((check) => {
        const observation = check.queryId && check.destination ? state.searchDestinationObservations[check.queryId]?.[check.destination] : undefined
        const conclusiveAutomation = observation?.automation?.assessment && !observation.automation.assessment.operatorReviewRequired
        if (observation?.evidenceNotes.trim() && (observation.reviewed || conclusiveAutomation)) return { ...check, state: (['found_match', 'found_prominently'].includes(observation.overallResult) ? 'checked_clear' : needsReview.includes(observation.overallResult) ? 'interactive_review_required' : 'needs_attention') as ScanState }
        if (check.id === 'identity-comparison' && state.salesReadiness.consistencyObservations?.length && state.salesReadiness.consistencyObservations.every((record) => record.reviewed)) return { ...check, state: (state.salesReadiness.consistencyObservations.some((record) => record.result !== 'Match') ? 'needs_attention' : 'checked_clear') as ScanState }
        return check
      }) }
      let status = scanAreaState(projection, keys[index])
      if (!loading && !latestRun.endedAt && ['queued', 'scanning'].includes(status)) status = 'interactive_review_required'
      area.scanState = status
      area.status = scanStateLabel[status]
      const checks = latestRun.checks.filter((check) => check.area === keys[index])
      const captured = checks.filter((check) => check.evidenceCaptured).length
      area.detail = status === 'scanning' ? activeDetails[index]
        : status === 'queued' ? 'Waiting for the preceding scan work.'
          : status === 'not_checked' ? 'No automated evidence is available for this area. Manual review remains available.'
            : status === 'failed' ? 'This check could not complete. This is not a finding about the business.'
              : `${captured} checks captured evidence. ${checks.filter((check) => check.state === 'interactive_review_required').length} need a closer review. Findings require human review.`
    })
  }
  const machine = currentMachineReadability(state)
  if (state.machineReadability && !machine && !loading) {
    areas[3].scanState = 'interactive_review_required'
    areas[3].status = scanStateLabel.interactive_review_required
    areas[3].detail = 'Business or website evidence changed. Rerun website readability checks before using earlier conclusions. AI answer testing remains separate.'
  }
  if (machine?.status === 'evidence_captured' && !loading) {
    const readability = summarizeMachineReadability(state)
    areas[3].scanState = readability.scanState
    areas[3].status = readability.statusLabel
    areas[3].detail = `${readability.evidence} website readability checks have evidence. ${readability.evaluated} evaluated; ${readability.reviewRequired} need review; ${readability.unavailable} unavailable. Business descriptions and recommended improvements remain available for review. AI answer testing was not performed by this scan.`
  }
  areas.forEach((area) => {
    area.snapshotStatus = area.scanState === 'checked_clear' ? 'Looking good'
      : area.scanState === 'needs_attention' ? 'Needs attention'
        : area.scanState === 'not_checked' ? 'Not yet scanned'
          : area.scanState && ['queued', 'scanning', 'evidence_captured', 'awaiting_review', 'interactive_review_required', 'failed'].includes(area.scanState) ? 'Not fully verified'
            : area.status === 'Looking good' ? 'Looking good'
              : ['Needs attention'].includes(area.status) ? 'Needs attention'
                : area.status === 'Opportunities identified' ? 'Some improvements' : area.status === unreviewed ? 'Not yet scanned' : 'Not fully verified'
  })
  const latestChecks = latestRun?.checks || []
  const positiveSearch = Object.values(state.searchDestinationObservations).flatMap((destinations) => Object.values(destinations))
    .filter((observation) => observation && ['found_match', 'found_prominently'].includes(observation.overallResult)
      && (observation.reviewed || observation.automation?.runId === latestRun?.id)).length
  const machineGood = machine?.checks.filter((check) => check.result === 'observed').length || 0
  const goodSignals = good + positiveSearch + machineGood
  const areasStillToVerify = areas.filter((area) => ['Not fully verified', 'Not yet scanned'].includes(area.snapshotStatus!)).length
  const active = loading || latestChecks.some((check) => ['queued', 'scanning'].includes(check.state))
  const snapshotOverall: VisibilitySnapshotOverall = active ? 'Scan still being completed'
    : areas.some((area) => area.snapshotStatus === 'Needs attention') ? 'Needs attention'
      : findings.length || areas.some((area) => area.snapshotStatus === 'Some improvements') ? 'Some improvements recommended'
        : areas.every((area) => area.snapshotStatus === 'Looking good') ? 'Looking strong'
          : goodSignals > 0 ? 'Mostly visible' : latestRun ? 'Not fully verified' : 'Not yet scanned'
  const snapshotDetail = snapshotOverall === 'Looking strong' ? 'The completed checks show clear, consistent visibility across the areas reviewed.'
    : snapshotOverall === 'Mostly visible' ? 'Positive visibility signals were found, with some areas still to verify.'
      : snapshotOverall === 'Some improvements recommended' ? 'The review found useful improvements alongside the signals that are already working.'
        : snapshotOverall === 'Needs attention' ? 'The completed checks found supported visibility issues worth reviewing.'
          : snapshotOverall === 'Not yet scanned' ? 'Run a visibility scan to begin checking the business across its public presence.'
            : 'Some areas have not completed verification yet. Unavailable checks are not treated as business problems.'
  return {
    areas, findings, websiteCompleted: completed.length, websiteGood: good,
    confirmationCount: findings.filter((fix) => effectivePackageFit(fix) === 'owner_action').length,
    improvementCount: findings.filter((fix) => effectivePackageFit(fix) !== 'owner_action').length,
    awaitingReview: fixes.filter((fix) => fix.status !== 'pass' && !isPresentedFinding(state, fix)).length,
    cockpit: { confirmedIssues, knownFixes, deeperReview: cockpitVisibility.deeperReview, lookingGood: cockpitVisibility.lookingGood, searchRecommendations: cockpitVisibility.recommended, recommendedPlan },
    snapshot: { overall: snapshotOverall, detail: snapshotDetail, goodSignals, recommendedImprovements: findings.length, areasStillToVerify },
  }
}

export interface CustomerReviewReadiness {
  state: 'ready' | 'not_ready'
  candidateFindings: number
  approvedFindings: number
  dismissedFindings: number
  awaitingDisposition: number
  verifiedStrengths: number
  needsReview: number
  scanIncomplete: boolean
  message: string
}

/**
 * Readiness means the sanitized customer payload is useful and deliberately
 * approved; it is not a claim that every destination completed verification.
 * Unresolved acquisition remains visible and neutral rather than becoming a
 * finding or an all-scans-must-pass blocker.
 */
export function customerReviewReadiness(state: AuditState, summary: ReturnType<typeof summarizeCustomerScan>): CustomerReviewReadiness {
  const primaryCandidates = summary.cockpit.confirmedIssues.filter((fix) => !isSupportingCustomerFinding(fix))
  const candidateFindings = primaryCandidates.length
  const approvedFindings = primaryCandidates.filter((fix) => isPresentedFinding(state, fix)).length
  const dismissedFindings = primaryCandidates.filter((fix) => isDismissedCustomerFinding(state, fix)).length
  const awaitingDisposition = candidateFindings - approvedFindings - dismissedFindings
  const verifiedStrengths = summary.cockpit.lookingGood.length || summary.snapshot.goodSignals
  const needsReview = summary.cockpit.deeperReview.length
  const latestRun = state.visibilityRuns?.filter((run) => matchesEvidenceFingerprint(run.profileKey, state.profile)).at(-1)
  const scanIncomplete = visibilityRunStatus(latestRun) === 'running'
  const allCandidatesAdjudicated = awaitingDisposition === 0
  const ready = !scanIncomplete && allCandidatesAdjudicated && (approvedFindings > 0 || candidateFindings === 0 && verifiedStrengths > 0)
  const message = scanIncomplete
    ? 'The active visibility scan must reach a terminal state before customer export.'
    : !allCandidatesAdjudicated
    ? `${awaitingDisposition} primary candidate ${awaitingDisposition === 1 ? 'awaits' : 'await'} an operator decision before export.`
    : ready
    ? approvedFindings > 0
      ? 'Every primary candidate has been reviewed. Approved findings can be exported with verified strengths and clearly labeled areas still to review.'
      : 'The completed review contains verified strengths and no candidate issues awaiting approval.'
    : candidateFindings > 0
      ? 'No customer findings were approved. Complete enough evidence review to establish a verified strength or approve an appropriate customer finding.'
      : 'Complete enough evidence review to establish a verified strength or an approved customer finding.'
  return { state: ready ? 'ready' : 'not_ready', candidateFindings, approvedFindings, dismissedFindings, awaitingDisposition, verifiedStrengths, needsReview, scanIncomplete, message }
}
