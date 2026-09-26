import { useState } from 'react'
import type { AuditItem, AuditState, FixItem } from '../types/audit'
import { customerReviewReadiness, hasStaleCustomerFindingRefinement, summarizeCustomerScan } from '../utils/customerScan'
import { buildCustomerVisibilityReviewExport, customerVisibilityReviewFilename, serializeCustomerVisibilityReview } from '../utils/customerVisibilityReviewExport'
import { profileCompleteness, profileProjectionWarnings } from '../utils/profileCompleteness'

export function CustomerReviewPanel({ state, items, fixes, onReview }: { state: AuditState; items: AuditItem[]; fixes: FixItem[]; onReview: () => void }) {
  const [status, setStatus] = useState('')
  const summary = summarizeCustomerScan(state, items, fixes)
  const readiness = customerReviewReadiness(state, summary)
  const completeness = profileCompleteness(state)
  const review = buildCustomerVisibilityReviewExport(state, items, fixes)
  const stale = fixes.filter((fix) => hasStaleCustomerFindingRefinement(state, fix))
  const blockingProfile = completeness.missing.filter((item) => ['name', 'category', 'website', 'market'].includes(item.id))
  const warnings = [...profileProjectionWarnings(state), ...blockingProfile.map((item) => `${item.label} is missing.`), ...stale.map((fix) => `${fix.issue} has stale customer wording and must be reviewed again.`)]
  const ready = readiness.state === 'ready' && warnings.length === 0
  const json = serializeCustomerVisibilityReview(review)
  const copy = async () => {
    if (!ready) return
    try { await navigator.clipboard.writeText(json); setStatus('Customer Review JSON copied.') }
    catch { setStatus('Copy is unavailable in this browser. Download the JSON instead.') }
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
      <div className="customer-readiness-actions">{ready ? <><button className="customer-text-button" type="button" onClick={() => void copy()}>Copy Customer Review JSON</button><button className="customer-primary" type="button" onClick={download}>Export Customer Review JSON</button></> : <button className="customer-primary" type="button" onClick={onReview}>Return to Review</button>}</div>{status ? <p role="status">{status}</p> : null}
    </section>
    <section className="panel customer-handoff-identity"><p className="eyebrow">Business identity</p><h2>{review.business.name}</h2><p>{review.business.category}</p><p>{[review.business.city, review.business.state].filter(Boolean).join(', ')}</p><p>{review.business.website}</p></section>
    <section className="panel"><div className="panel-header"><p className="eyebrow">Exact customer findings preview</p><h2>{review.confirmedIssues.length} approved findings</h2></div>{review.confirmedIssues.length ? <div className="customer-findings-list">{review.confirmedIssues.map((issue) => <article className="customer-finding" key={issue.id}><h3>{issue.title}</h3><p>{issue.summary}</p><p><strong>Found Local action:</strong> {issue.foundLocalAction}</p></article>)}</div> : <p>No approved customer findings.</p>}</section>
    <section className="panel"><div className="panel-header"><p className="eyebrow">Package preview</p><h2>{review.recommendedPackage.name}</h2><p>{review.recommendedPackage.summary}</p></div>{review.recommendedPackage.included.length ? <ul>{review.recommendedPackage.included.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No approved package scope.</p>}</section>
    <section className="panel"><div className="panel-header"><p className="eyebrow">Area states</p><h2>Customer-safe coverage</h2></div><div className="operator-area-list">{review.scanAreas.map((area) => <div key={area.id}><span className={`scan-state scan-state-${area.state === 'good' ? 'good' : area.state === 'issue' ? 'issue' : 'review'}`}>{area.state === 'good' ? '✓' : area.state === 'issue' ? '!' : '•'}</span><span><strong>{area.name}</strong><small>{area.state} · {area.summary}</small></span></div>)}</div>{review.needsReview.length ? <p>Neutral Needs Review: {review.needsReview.join(', ')}</p> : null}</section>
  </div>
}
