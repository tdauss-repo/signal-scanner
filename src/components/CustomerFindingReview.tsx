import type { AuditState, FixItem } from '../types/audit'
import { canReviewFinding, isDismissedCustomerFinding, isPresentedFinding, isSupportingCustomerFinding } from '../utils/customerScan'

export function CustomerFindingReview({ state, fixes, onReview }: {
  state: AuditState
  fixes: FixItem[]
  onReview: (fix: FixItem, disposition: 'approved' | 'dismissed' | 'pending') => void
}) {
  const candidates = fixes.filter(canReviewFinding)
  const renderCandidate = (fix: FixItem) => <article className="customer-review-row" key={fix.id}>
      <h3>{fix.issue}</h3><p>{fix.evidenceSummary || fix.evidenceNote}</p>
      <p><strong>Operator disposition:</strong> {isPresentedFinding(state, fix) ? 'Approved for customer export' : isDismissedCustomerFinding(state, fix) ? 'Dismissed from customer review' : 'Awaiting review'}</p>
      <p><strong>Recommendation:</strong> {fix.fix}</p><p><strong>Why it matters:</strong> {fix.whyItMatters || 'Not recorded. The customer view will say this still needs discussion.'}</p>
      <p><strong>Verification:</strong> {fix.verificationMethod}</p>
      {fix.intelligence ? <details><summary>Operator evidence, delivery & verification</summary>
        <p>Lifecycle: {isPresentedFinding(state, fix) ? 'Reviewed · Action proposed (not approved for implementation)' : fix.intelligence.lifecycle}</p>
        <p>Check: {fix.intelligence.checkId} · Condition: {fix.intelligence.condition} · Rule version: {fix.intelligence.ruleVersion}</p>
        <p>Confidence: {fix.intelligence.evidence.confidence} · Scope: {fix.intelligence.delivery.scope} (confirm bounded scope before sale)</p>
        <p>Source: {fix.intelligence.evidence.provenance.sourceUrl} · {fix.intelligence.evidence.provenance.occurredAt || 'Time not recorded'}</p>
        <p>Provider: {fix.intelligence.evidence.provenance.provider} · Method: {fix.intelligence.evidence.provenance.method}</p>
        <p>{fix.intelligence.delivery.technicalChange}</p>
        <ol>{fix.intelligence.delivery.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <p>Access: {fix.intelligence.delivery.access.join('; ')}</p>
        <p>Customer input: {fix.intelligence.delivery.customerInput.join('; ')}</p>
        <p>Dependencies / risks: {fix.intelligence.delivery.dependencies.join('; ')}</p>
        {fix.intelligence.remediation ? <><p>Implementation mechanism: {fix.intelligence.remediation.implementationMechanism}</p><p>Rollback/recovery: {fix.intelligence.remediation.rollbackRecovery}</p></> : null}
        <p>Expected corrected state: {fix.intelligence.verification.expectedState}</p>
        <ul>{fix.intelligence.verification.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
      </details> : null}
      {isPresentedFinding(state, fix) ? <button type="button" onClick={() => onReview(fix, 'pending')}>Reopen finding for review</button>
        : isDismissedCustomerFinding(state, fix) ? <button type="button" onClick={() => onReview(fix, 'pending')}>Reopen finding for review</button>
          : <><button type="button" onClick={() => onReview(fix, 'approved')}>Approve for customer export</button><button type="button" onClick={() => onReview(fix, 'dismissed')}>Dismiss from customer review</button></>}
    </article>
  return <section className="panel customer-review-panel">
    <div className="panel-header"><p className="eyebrow">Customer review approval</p><h2>Adjudicate findings for customer export</h2><p>Review the evidence, wording, scope, and verification before either promoting or dismissing a primary candidate. Approval includes a finding in the sanitized Customer Review JSON; dismissal leaves it out. Neither decision authorizes remediation. Changed evidence or business details require a fresh review.</p></div>
    {candidates.filter((fix) => !isSupportingCustomerFinding(fix)).map(renderCandidate)}
    {candidates.some(isSupportingCustomerFinding) ? <details><summary>Supporting observations — operator review required</summary>
      <p>Contact, social and title observations need a specific defect case before joining the initial customer package. Review and supplement the evidence before approval.</p>
      {candidates.filter(isSupportingCustomerFinding).map(renderCandidate)}
    </details> : null}
    {!candidates.length ? <p>No eligible findings yet. Findings need a failure/partial result, evidence, a recommendation, and a verification method. Continue evidence review in the Workbench.</p> : null}
  </section>
}
