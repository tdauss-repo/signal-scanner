import type { AuditItem, AuditState, FixItem } from '../types/audit'
import { effectivePackageFit, isStarterEligible, sortSalesActions } from './salesReadiness'
import { primarySearchDestinations } from './searchVisibility'

export const findingLifecycle = ['Detected', 'Evidence captured', 'Reviewed', 'Action proposed', 'Approved', 'Implemented', 'Re-scanned', 'Verified'] as const
export type CustomerView = 'Scan' | 'Findings' | 'Action Plan' | 'Results'
export type CustomerAreaStatus = 'Looking good' | 'Needs attention' | 'Opportunities identified' | 'Confirmation needed' | 'Scan in progress' | 'Not reviewed / Not checked'

/** Existing Starter eligibility stays intact; other groups also need evidence and a checkable action. */
export const canPresentFinding = (fix: FixItem) => {
  const fit = effectivePackageFit(fix)
  return !/^(website-h1|website-heading)$/.test(fix.id) && fit !== 'excluded' && fix.reviewed === true &&
    (fix.status === 'fail' || fix.status === 'partial') &&
    Boolean(fix.issue.trim() && fix.fix.trim() && (fix.evidenceSummary || fix.evidenceNote)?.trim() && fix.verificationMethod?.trim()) &&
    (fit !== 'starter' || isStarterEligible(fix))
}

/** A generated candidate may be reviewed, but is not thereby already reviewed. */
export const canReviewFinding = (fix: FixItem) => canPresentFinding(
  fix.intelligence ? { ...fix, reviewed: true } : fix,
)

/** No timestamps/lastUpdated or presentation flags: reviewing one card must not invalidate another.
 * Actual evidence/profile changes invalidate all approvals conservatively, including after a rescan.
 */
const stableReviewValue = (value: unknown): unknown => Array.isArray(value) ? value.map(stableReviewValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stableReviewValue(nested)])) : value

export const customerReviewKey = (state: AuditState, fix: FixItem) => JSON.stringify(stableReviewValue([
  state.profile, state.businessProfile, state.checks, state.notes, state.evidenceConfidence,
  state.websiteAudit, state.searchDestinationObservations, state.aiAnswerTests,
  state.directories, state.salesReadiness, fix.intelligence ? { ...fix, reviewed: false } : fix,
]))

export const isPresentedFinding = (state: AuditState, fix: FixItem) =>
  canReviewFinding(fix) && state.customerFindingReviews?.[fix.id] === customerReviewKey(state, fix)

export const customerFindingGroup = (fix: FixItem) => {
  const fit = effectivePackageFit(fix)
  return fit === 'starter' ? 'Found Local can help fix'
    : fit === 'owner_action' ? 'Customer confirmation / input needed'
      : 'Future / additional opportunity'
}

export interface CustomerArea {
  title: string
  status: CustomerAreaStatus
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
  const websiteFailed = scanError || state.websiteAudit.latestAttempt?.ok === false
  const websiteStatus: CustomerAreaStatus = loading ? 'Scan in progress' : websiteFailed ? 'Confirmation needed'
    : completed.length === 0 ? unreviewed : good < completed.length ? 'Needs attention'
      : completed.length < website.length ? 'Confirmation needed' : 'Looking good'
  const areas: CustomerArea[] = [
    { title: 'Website & Technical', status: websiteStatus,
      detail: loading ? 'Analyzing the website. Other areas are reviewed separately.'
        : websiteFailed ? 'The latest website check could not complete. Any earlier results still need review.'
          : completed.length ? `${completed.length} of ${website.length} website checks have results. ${good} look good.`
            : 'Website content and technical signals have not been checked yet.' },
    { title: 'Search & Maps', status: search.length === 0 ? unreviewed
        : searchCompleted.length < search.length ? 'Confirmation needed'
          : searchCompleted.some((item) => item?.overallResult !== 'found_prominently') ? 'Opportunities identified' : !primaryComplete ? 'Confirmation needed' : 'Looking good',
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
  return {
    areas, findings, websiteCompleted: completed.length, websiteGood: good,
    confirmationCount: findings.filter((fix) => effectivePackageFit(fix) === 'owner_action').length,
    improvementCount: findings.filter((fix) => effectivePackageFit(fix) !== 'owner_action').length,
    awaitingReview: fixes.filter((fix) => fix.status !== 'pass' && !isPresentedFinding(state, fix)).length,
  }
}
