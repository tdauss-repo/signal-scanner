import { useState } from 'react'
import type { AuditItem, AuditState } from '../types/audit'
import {
  customerStrengthReviewItems,
  type CustomerStrengthCandidate,
  type CustomerStrengthInput,
  type CustomerStrengthReviewItem,
} from '../utils/customerStrengths'

interface StrengthCardProps {
  item: CustomerStrengthReviewItem
  onSave: (candidate: CustomerStrengthCandidate, input: CustomerStrengthInput) => void
}

function StrengthCard({ item, onSave }: StrengthCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: item.title, summary: item.summary })
  const startEditing = () => {
    setDraft({
      title: item.previous?.title || item.title,
      summary: item.previous?.summary || item.summary,
    })
    setEditing(true)
  }
  const stateLabel = item.state === 'included_refined' ? 'Included · operator refined'
    : item.state === 'included_generated' ? 'Included · generated wording'
      : item.state === 'hidden' ? 'Hidden from customer' : 'Needs reconfirmation'
  const save = (input: CustomerStrengthInput) => onSave(item, input)

  return <article className="customer-strength-card">
    <div className="customer-strength-source">
      <p className="eyebrow">Scanner strength · read only</p>
      <h3>{item.sourceTitle}</h3>
      <p><strong>Evidence:</strong> {item.evidenceSummary}</p>
    </div>
    <div className="customer-strength-presentation">
      <div className="customer-refinement-heading"><div><p className="eyebrow">Customer-facing wording</p><h3>{item.title}</h3></div><span className={`customer-strength-state customer-strength-state-${item.state}`}>{stateLabel}</span></div>
      {item.state === 'needs_reconfirmation' ? <div className="customer-refinement-warning" role="status">
        <p>The supporting evidence changed. The previous presentation decision is preserved for review but is not included in Customer Review.</p>
        <dl className="customer-wording-summary">
          <div><dt>Previous state</dt><dd>{item.previous?.included ? 'Included' : 'Hidden'}</dd></div>
          {item.previous?.title ? <div><dt>Previous title</dt><dd>{item.previous.title}</dd></div> : null}
          {item.previous?.summary ? <div><dt>Previous summary</dt><dd>{item.previous.summary}</dd></div> : null}
        </dl>
      </div> : null}
      {editing ? <div className="customer-refinement-form">
        <label>Customer-facing title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Customer-facing summary<textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
        <div className="directory-actions"><button type="button" disabled={!draft.title.trim() || !draft.summary.trim()} onClick={() => { save({ included: item.state === 'needs_reconfirmation' ? item.previous?.included ?? true : item.included, ...draft }); setEditing(false) }}>Save refinement</button><button className="secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
      </div> : <dl className="customer-wording-summary">
        <div><dt>Title</dt><dd>{item.title}</dd></div>
        <div><dt>Summary</dt><dd>{item.summary}</dd></div>
      </dl>}
      {!editing ? <div className="directory-actions">
        <button className="secondary" type="button" onClick={startEditing}>Edit customer wording</button>
        {item.state === 'needs_reconfirmation'
          ? <button type="button" onClick={() => save({ included: item.previous?.included ?? true, title: item.previous?.title || item.defaultTitle, summary: item.previous?.summary || item.defaultSummary })}>Reconfirm previous presentation</button>
          : item.included
            ? <button className="secondary" type="button" onClick={() => save({ included: false, title: item.title, summary: item.summary })}>Hide from customer</button>
            : <button type="button" onClick={() => save({ included: true, title: item.title, summary: item.summary })}>Include in customer review</button>}
      </div> : null}
    </div>
  </article>
}

export function VerifiedStrengthReview({ state, items, onSave }: {
  state: AuditState
  items: AuditItem[]
  onSave?: (candidate: CustomerStrengthCandidate, input: CustomerStrengthInput) => void
}) {
  const strengths = customerStrengthReviewItems(state, items)
  const save = onSave || (() => undefined)
  return <section className="panel customer-strength-review">
    <div className="panel-header"><p className="eyebrow">What’s working</p><h2>{strengths.length} verified {strengths.length === 1 ? 'strength' : 'strengths'}</h2><p>Positive scanner evidence remains read-only. Choose what is useful to show the customer and refine only its customer-facing wording.</p></div>
    <div className="customer-strength-list">{strengths.map((item) => <StrengthCard key={item.id} item={item} onSave={save} />)}</div>
    {!strengths.length ? <p>No verified strengths are available from the current evidence.</p> : null}
  </section>
}
