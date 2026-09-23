import { matchesEvidenceFingerprint } from './evidenceFingerprint'
import { currentMachineReadability, summarizeMachineReadability } from './machineReadability'
import { scanAreaState, scanStateLabel } from './visibilityScanState'
import type { ScanArea, ScanState } from '../types/visibilityScan'
import type { AuditItem, AuditState, CustomerFindingRefinement, FixItem } from '../types/audit'
import { effectivePackageFit, isStarterEligible, sortSalesActions } from './salesReadiness'
import { primarySearchDestinations } from './searchVisibility'
import { salesCockpitVisibility } from './salesVisibilityProjection'

export const findingLifecycle = ['Detected', 'Evidence captured', 'Reviewed', 'Action proposed', 'Approved', 'Implemented', 'Re-scanned', 'Verified'] as const
export type CustomerView = 'Scan' | 'Findings' | 'Action Plan' | 'Results'
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

/** No timestamps/lastUpdated or presentation flags: reviewing one card must not invalidate another.
 * Actual evidence/profile changes invalidate all approvals conservatively, including after a rescan.
 */
const stableReviewValue = (value: unknown): unknown => Array.isArray(value) ? value.map(stableReviewValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stableReviewValue(nested)])) : value

const customerEvidenceReviewValue = (state: AuditState, fix: FixItem) => [
  state.profile, state.businessProfile, state.checks, state.notes, state.evidenceConfidence,
  state.websiteAudit, state.searchDestinationObservations, state.aiAnswerTests,
  state.directories, state.salesReadiness, ...(state.machineReadability ? [state.machineReadability] : []), fix.intelligence ? { ...fix, reviewed: false } : fix,
]

/** Stable evidence identity shared by refinements, approvals, and dismissals. */
export const customerFindingEvidenceKey = (state: AuditState, fix: FixItem) =>
  JSON.stringify(stableReviewValue(customerEvidenceReviewValue(state, fix)))

export const activeCustomerFindingRefinement = (state: AuditState, fix: FixItem) => {
  const refinement = state.customerFindingRefinements?.[fix.id]
  return refinement?.evidenceKey === customerFindingEvidenceKey(state, fix) ? refinement : undefined
}

export const hasStaleCustomerFindingRefinement = (state: AuditState, fix: FixItem) => {
  const refinement = state.customerFindingRefinements?.[fix.id]
  return Boolean(refinement && refinement.evidenceKey !== customerFindingEvidenceKey(state, fix))
}

export interface CustomerFindingWording {
  title: string
  priority: FixItem['priority']
  summary: string
  recommendedAction: string
}

export const defaultCustomerFindingWording = (fix: FixItem): CustomerFindingWording => ({
  title: fix.intelligence?.customer.title || fix.issue,
  priority: fix.priority,
  summary: fix.intelligence?.customer.found || fix.whyItMatters || 'A reviewed visibility issue was confirmed and is ready to address.',
  recommendedAction: fix.intelligence?.customer.recommendation || fix.fix,
})

export const effectiveCustomerFindingWording = (state: AuditState, fix: FixItem): CustomerFindingWording => {
  const defaults = defaultCustomerFindingWording(fix)
  const refinement = activeCustomerFindingRefinement(state, fix)
  return refinement ? {
    title: refinement.title || defaults.title,
    priority: refinement.priority || defaults.priority,
    summary: refinement.summary || defaults.summary,
    recommendedAction: refinement.recommendedAction || defaults.recommendedAction,
  } : defaults
}

export const buildCustomerFindingRefinement = (
  state: AuditState,
  fix: FixItem,
  wording: CustomerFindingWording,
): CustomerFindingRefinement | null => {
  const defaults = defaultCustomerFindingWording(fix)
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
  const refinement = activeCustomerFindingRefinement(state, fix)
  if (!refinement) return fix
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

/** Legacy approvals retain their exact key when no valid refinement exists. */
export const customerReviewKey = (state: AuditState, fix: FixItem) => {
  const refinement = activeCustomerFindingRefinement(state, fix)
  return refinement
    ? JSON.stringify(stableReviewValue([...customerEvidenceReviewValue(state, fix), { customerRefinement: refinement }]))
    : customerFindingEvidenceKey(state, fix)
}

export const isPresentedFinding = (state: AuditState, fix: FixItem) =>
  canReviewFinding(fix) && state.customerFindingReviews?.[fix.id] === customerReviewKey(state, fix)

/** A dismissal is an explicit operator disposition, not the absence of approval.
 * It shares the approval fingerprint so changed evidence always returns a finding to review.
 */
export const isDismissedCustomerFinding = (state: AuditState, fix: FixItem) =>
  canReviewFinding(fix) && !isPresentedFinding(state, fix) &&
  state.customerFindingDismissals?.[fix.id] === customerReviewKey(state, fix)

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
  const allCandidatesAdjudicated = awaitingDisposition === 0
  const ready = allCandidatesAdjudicated && (approvedFindings > 0 || candidateFindings === 0 && verifiedStrengths > 0)
  const message = !allCandidatesAdjudicated
    ? `${awaitingDisposition} primary candidate ${awaitingDisposition === 1 ? 'awaits' : 'await'} an operator decision before export.`
    : ready
    ? approvedFindings > 0
      ? 'Every primary candidate has been reviewed. Approved findings can be exported with verified strengths and clearly labeled areas still to review.'
      : 'The completed review contains verified strengths and no candidate issues awaiting approval.'
    : candidateFindings > 0
      ? 'No customer findings were approved. Complete enough evidence review to establish a verified strength or approve an appropriate customer finding.'
      : 'Complete enough evidence review to establish a verified strength or an approved customer finding.'
  return { state: ready ? 'ready' : 'not_ready', candidateFindings, approvedFindings, dismissedFindings, awaitingDisposition, verifiedStrengths, needsReview, message }
}
