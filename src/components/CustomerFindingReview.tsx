import { useState } from 'react'
import type { AuditState, FixItem } from '../types/audit'
import {
  activeCustomerFindingRefinement,
  canReviewFinding,
  defaultCustomerFindingWording,
  effectiveCustomerFindingWording,
  hasStaleCustomerFindingRefinement,
  isDismissedCustomerFinding,
  isPresentedFinding,
  isSupportingCustomerFinding,
  type CustomerFindingWording,
} from '../utils/customerScan'

type Disposition = 'approved' | 'dismissed' | 'pending'

interface FindingCardProps {
  state: AuditState
  fix: FixItem
  allowRefinement: boolean
  onReview: (fix: FixItem, disposition: Disposition) => void
  onSaveRefinement: (fix: FixItem, wording: CustomerFindingWording) => void
}

function FindingCard({ state, fix, allowRefinement, onReview, onSaveRefinement }: FindingCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CustomerFindingWording>(() => effectiveCustomerFindingWording(state, fix))
  const approved = isPresentedFinding(state, fix)
  const dismissed = isDismissedCustomerFinding(state, fix)
  const defaults = defaultCustomerFindingWording(fix)
  const effective = effectiveCustomerFindingWording(state, fix)
  const refinement = activeCustomerFindingRefinement(state, fix)
  const startEditing = () => {
    setDraft(effectiveCustomerFindingWording(state, fix))
    setEditing(true)
  }

  if (!allowRefinement) return <article className="customer-review-row">
    <h3>{fix.issue}</h3><p>{fix.evidenceSummary || fix.evidenceNote}</p>
    <p><strong>Operator disposition:</strong> {approved ? 'Approved for customer export' : dismissed ? 'Dismissed from customer review' : 'Awaiting review'}</p>
    <p><strong>Recommendation:</strong> {fix.fix}</p><p><strong>Why it matters:</strong> {fix.whyItMatters || 'Not recorded. The customer view will say this still needs discussion.'}</p>
    <p><strong>Verification:</strong> {fix.verificationMethod}</p>
    {approved || dismissed ? <button type="button" onClick={() => onReview(fix, 'pending')}>Reopen finding for review</button>
      : <><button type="button" onClick={() => onReview(fix, 'approved')}>Approve for customer export</button><button type="button" onClick={() => onReview(fix, 'dismissed')}>Dismiss from customer review</button></>}
  </article>

  return <article className="customer-review-row">
    <div className="customer-finding-source">
      <p className="eyebrow">Scanner finding · read only</p>
      <h3>{fix.issue}</h3>
      <p><strong>Raw scanner evidence:</strong> {fix.evidenceSummary || fix.evidenceNote}</p>
      <dl className="customer-wording-summary">
        <div><dt>Generated title</dt><dd>{defaults.title}</dd></div>
        <div><dt>Generated priority</dt><dd>{defaults.priority}</dd></div>
        <div><dt>Generated interpretation</dt><dd>{fix.intelligence?.customer.why || fix.whyItMatters || defaults.summary}</dd></div>
        <div><dt>Generated action</dt><dd>{defaults.recommendedAction}</dd></div>
      </dl>
      <p><strong>Verification:</strong> {fix.verificationMethod}</p>
      {fix.intelligence ? <details><summary>Operator evidence, delivery & verification</summary>
        <p>Lifecycle: {approved ? 'Reviewed · Action proposed (not approved for implementation)' : fix.intelligence.lifecycle}</p>
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
    </div>

    <div className="customer-finding-refinement">
      <div className="customer-refinement-heading"><div><p className="eyebrow">Customer-facing refinement</p><h3>{effective.title}</h3></div>{!editing ? <button className="secondary" type="button" onClick={startEditing}>Edit customer wording</button> : null}</div>
      {hasStaleCustomerFindingRefinement(state, fix) ? <p className="customer-refinement-warning" role="status">The saved customer wording belongs to older evidence and is no longer active. Review this finding again before saving or approving.</p> : null}
      {editing ? <div className="customer-refinement-form">
        <label>Customer-facing title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as FixItem['priority'] })}><option>High</option><option>Medium</option><option>Low</option></select></label>
        <label>Why it matters / customer summary<textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
        <label>Recommended Found Local action<textarea value={draft.recommendedAction} onChange={(event) => setDraft({ ...draft, recommendedAction: event.target.value })} /></label>
        <div className="directory-actions"><button type="button" onClick={() => { onSaveRefinement(fix, draft); setEditing(false) }}>Save refinement</button><button className="secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
      </div> : <dl className="customer-wording-summary">
        <div><dt>Priority</dt><dd>{effective.priority}</dd></div>
        <div><dt>Why it matters / summary</dt><dd>{effective.summary}</dd></div>
        <div><dt>Recommended action</dt><dd>{effective.recommendedAction}</dd></div>
      </dl>}
      <p className="customer-small">{refinement ? 'Operator-refined wording is active for the current evidence.' : 'Scanner-generated customer wording will be used unless an operator saves a refinement.'}</p>
    </div>

    <p><strong>Operator disposition:</strong> {approved ? 'Approved for customer export' : dismissed ? 'Dismissed from customer review' : 'Awaiting review'}</p>
    {approved || dismissed ? <button type="button" onClick={() => onReview(fix, 'pending')}>Reopen finding for review</button>
      : <><button type="button" onClick={() => onReview(fix, 'approved')}>Approve for customer export</button><button type="button" onClick={() => onReview(fix, 'dismissed')}>Dismiss from customer review</button></>}
  </article>
}

export function CustomerFindingReview({ state, fixes, onReview, onSaveRefinement }: {
  state: AuditState
  fixes: FixItem[]
  onReview: (fix: FixItem, disposition: Disposition) => void
  onSaveRefinement: (fix: FixItem, wording: CustomerFindingWording) => void
}) {
  const candidates = fixes.filter(canReviewFinding)
  const primary = candidates.filter((fix) => !isSupportingCustomerFinding(fix))
  const supporting = candidates.filter(isSupportingCustomerFinding)
  return <section className="panel customer-review-panel">
    <div className="panel-header"><p className="eyebrow">Customer review approval</p><h2>Adjudicate findings for customer export</h2><p>Scanner evidence remains read-only. Refine only the customer-facing interpretation, then approve or dismiss the finding. Approval includes the effective wording in Customer Review JSON; neither decision authorizes remediation.</p></div>
    {primary.map((fix) => <FindingCard key={fix.id} state={state} fix={fix} allowRefinement onReview={onReview} onSaveRefinement={onSaveRefinement} />)}
    {supporting.length ? <details><summary>Supporting observations — operator review required</summary>
      <p>Contact, social and title observations need a specific defect case before joining the initial customer package. Review and supplement the evidence before approval.</p>
      {supporting.map((fix) => <FindingCard key={fix.id} state={state} fix={fix} allowRefinement={false} onReview={onReview} onSaveRefinement={onSaveRefinement} />)}
    </details> : null}
    {!candidates.length ? <p>No eligible findings yet. Findings need a failure/partial result, evidence, a recommendation, and a verification method. Continue evidence review in the Workbench.</p> : null}
  </section>
}
