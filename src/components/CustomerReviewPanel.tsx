import { useState } from 'react'
import type { AuditItem, AuditState, FixItem } from '../types/audit'
import { customerReviewReadiness, hasStaleCustomerFindingRefinement, summarizeCustomerScan } from '../utils/customerScan'
import { buildCustomerVisibilityReviewExport, customerVisibilityReviewFilename, customerVisibilityReviewQaText, serializeCustomerVisibilityReview } from '../utils/customerVisibilityReviewExport'
import { derivePackagePreparation } from '../utils/packagePreparation'
import { profileCompleteness, profileProjectionWarnings } from '../utils/profileCompleteness'
import { copyText } from '../utils/copyText'

export function ManualCopyFallback({ label, content }: { label: string; content: string }) {
  return <section className="customer-manual-copy" aria-label="Manual copy fallback">
    <strong>Automatic copy is unavailable. Select the text below and copy manually.</strong>
    <label>{label}<textarea readOnly spellCheck={false} value={content} onFocus={(event) => event.currentTarget.select()} /></label>
  </section>
}

export function CustomerReviewPanel({ state, items, fixes, onReview }: { state: AuditState; items: AuditItem[]; fixes: FixItem[]; onReview: () => void }) {
  const [status, setStatus] = useState('')
  const [manualCopy, setManualCopy] = useState<{ label: string; content: string } | null>(null)
  const summary = summarizeCustomerScan(state, items, fixes)
  const readiness = customerReviewReadiness(state, summary)
  const completeness = profileCompleteness(state)
  const review = buildCustomerVisibilityReviewExport(state, items, fixes)
  const preparation = derivePackagePreparation(state, fixes)
  const stale = fixes.filter((fix) => hasStaleCustomerFindingRefinement(state, fix))
  const blockingProfile = completeness.missing.filter((item) => ['name', 'category', 'website', 'market'].includes(item.id))
  const wordingWarnings = review.confirmedIssues.filter((issue) => !issue.title.trim() || !issue.summary.trim() || !issue.foundLocalAction.trim())
    .map((issue) => `${issue.id} is missing customer-safe wording.`)
  const packageScopes = preparation.starterItems.map((item) => item.includedScope)
  const packageWarnings = JSON.stringify(packageScopes) === JSON.stringify(review.recommendedPackage.included)
    ? [] : ['The customer package preview does not match Package Preparation.']
  const warnings = [
    ...profileProjectionWarnings(state),
    ...blockingProfile.map((item) => `${item.label} is missing.`),
    ...stale.map((fix) => `${fix.issue} has stale customer wording and must be reviewed again.`),
    ...(readiness.scanIncomplete ? ['The active visibility scan has not reached a terminal state.'] : []),
    ...(readiness.awaitingDisposition ? [`${readiness.awaitingDisposition} primary finding${readiness.awaitingDisposition === 1 ? '' : 's'} still await operator disposition.`] : []),
    ...wordingWarnings,
    ...packageWarnings,
  ]
  const ready = readiness.state === 'ready' && warnings.length === 0
  const json = serializeCustomerVisibilityReview(review)
  const qaText = customerVisibilityReviewQaText(review, ready)
  const copyForOperator = async (content: string, label: string, successMessage: string) => {
    const result = await copyText(content)
    if (result.copied) {
      setManualCopy(null)
      setStatus(successMessage)
      return
    }
    setManualCopy({ label, content })
    setStatus('Automatic copy is unavailable. Select the text below and copy manually.')
  }
  const download = () => {
    if (!ready) return
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    anchor.download = customerVisibilityReviewFilename(review)
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    setStatus('Customer Review JSON downloaded.')
  }
  return <div className="customer-review-handoff">
    <section className={`customer-readiness customer-readiness-${ready ? 'ready' : 'not_ready'}`} aria-label="Customer Review Readiness">
      <div><p className="customer-eyebrow">Final quality gate</p><h2>{ready ? 'Ready for customer presentation' : 'Not ready'}</h2><p>{warnings[0] || readiness.message}</p></div>
      <dl><div><dt>Candidate findings</dt><dd>{readiness.candidateFindings}</dd></div><div><dt>Approved</dt><dd>{readiness.approvedFindings}</dd></div><div><dt>Dismissed</dt><dd>{readiness.dismissedFindings}</dd></div><div><dt>Awaiting review</dt><dd>{readiness.awaitingDisposition}</dd></div><div><dt>Verified strengths</dt><dd>{readiness.verifiedStrengths}</dd></div><div><dt>Needs review</dt><dd>{readiness.needsReview}</dd></div></dl>
      {warnings.length ? <div className="customer-review-warnings"><strong>Resolve before export</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      <div className="customer-readiness-actions">{ready ? <><button className="customer-text-button" type="button" onClick={() => void copyForOperator(json, 'Customer Review JSON', 'Customer Review JSON copied')}>Copy Customer Review JSON</button><button className="customer-primary" type="button" onClick={download}>Export Customer Review JSON</button></> : <button className="customer-primary" type="button" onClick={onReview}>Return to Review</button>}</div>{status ? <p role="status">{status}</p> : null}
    </section>
    {manualCopy ? <ManualCopyFallback label={manualCopy.label} content={manualCopy.content} /> : null}
    <section className="panel customer-qa-frame" aria-label="Customer Review operator QA">
      <div className="customer-qa-heading"><div><p className="eyebrow">Customer Review — operator QA</p><h2>Exact customer-safe preview</h2><p>This frame and the Sites JSON below use the same projection.</p></div><button className="customer-primary" type="button" onClick={() => void copyForOperator(qaText, 'Customer Review text', 'Review text copied')}>Copy Review Text</button></div>
      <div className="customer-qa-section"><h3>Business</h3><p><strong>{review.business.name}</strong><br />{review.business.category}<br />{[review.business.city, review.business.state].filter(Boolean).join(', ')}<br />{review.business.website}</p></div>
      <div className="customer-qa-section"><h3>What’s working</h3>{review.verifiedStrengths.length ? <ul>{review.verifiedStrengths.map((strength) => <li key={strength.title}><strong>{strength.title}</strong><span>{strength.summary}</span></li>)}</ul> : <p>No verified strengths are included yet.</p>}</div>
      <div className="customer-qa-section"><h3>Recommended improvements</h3>{review.confirmedIssues.length ? <ol className="customer-qa-findings">{review.confirmedIssues.map((issue) => <li key={issue.id}><h4>{issue.title}</h4><strong>Why it matters</strong><p>{issue.summary}</p><strong>Found Local will</strong><p>{issue.foundLocalAction}</p></li>)}</ol> : <p>No approved customer improvements.</p>}</div>
      <div className="customer-qa-section"><h3>Still being verified</h3>{review.needsReview.length ? <ul>{review.needsReview.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Nothing currently listed.</p>}</div>
      <div className="customer-qa-section"><h3>Recommended package</h3><p><strong>{review.recommendedPackage.name}</strong></p><p>{review.recommendedPackage.summary}</p><h4>Included</h4>{review.recommendedPackage.included.length ? <ul>{review.recommendedPackage.included.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No approved package scope.</p>}</div>
      <div className={`customer-qa-readiness customer-qa-readiness-${ready ? 'ready' : 'not-ready'}`}><strong>Readiness</strong><span>{ready ? 'READY FOR CUSTOMER PRESENTATION' : 'NOT READY FOR CUSTOMER PRESENTATION'}</span></div>
    </section>
    <section className="panel"><div className="panel-header"><p className="eyebrow">Area states</p><h2>Customer-safe coverage</h2></div><div className="operator-area-list">{review.scanAreas.map((area) => <div key={area.id}><span className={`scan-state scan-state-${area.state === 'good' ? 'good' : area.state === 'issue' ? 'issue' : 'review'}`}>{area.state === 'good' ? '✓' : area.state === 'issue' ? '!' : '•'}</span><span><strong>{area.name}</strong><small>{area.state} · {area.summary}</small></span></div>)}</div>{review.needsReview.length ? <p>Neutral Needs Review: {review.needsReview.join(', ')}</p> : null}</section>
  </div>
}
