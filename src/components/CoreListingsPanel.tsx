import type { AuditItem, CheckStatus, EvidenceConfidence } from '../types/audit'
import {
  evidenceConfidenceLabel,
  evidenceConfidenceOptions,
} from '../utils/evidenceConfidence'
import { StatusBadge } from './StatusBadge'

interface CoreListingsPanelProps {
  items: AuditItem[]
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
  evidenceConfidence: Record<string, EvidenceConfidence>
  onStatusChange: (id: string, status: CheckStatus) => void
  onNoteChange: (id: string, note: string) => void
  onEvidenceConfidenceChange: (id: string, confidence: EvidenceConfidence) => void
  onAddToActionPlan: (item: AuditItem) => void
}

const statusOptions: Array<{ value: CheckStatus; label: string }> = [
  { value: 'unknown', label: 'Not checked' },
  { value: 'pass', label: 'Pass' },
  { value: 'partial', label: 'Partial' },
  { value: 'fail', label: 'Fail' },
]

export function CoreListingsPanel({
  items,
  checks,
  notes,
  evidenceConfidence,
  onStatusChange,
  onNoteChange,
  onEvidenceConfidenceChange,
  onAddToActionPlan,
}: CoreListingsPanelProps) {
  return (
    <section className="panel core-listings-panel">
      <div className="panel-header">
        <p className="eyebrow">Core Listings</p>
        <h2>Primary local listing platforms</h2>
        <p>
          Verify public listing accuracy and note owner/admin access separately.
          Owner/admin unverified is not a public listing failure.
        </p>
      </div>
      <div className="core-listing-grid">
        {items.map((item) => {
          const status = checks[item.id] ?? 'unknown'

          return (
            <article className="core-listing-card" key={item.id}>
              <div className="audit-title-row">
                <h3>{item.label}</h3>
                <StatusBadge status={status} />
              </div>
              <p>{item.description}</p>
              <div className="core-signal-list">
                <span>Listing found</span>
                <span>Name match</span>
                <span>Phone/contact match</span>
                <span>Website match</span>
                <span>Address/service-area match</span>
                <span>Category/services match</span>
                <span>Reviews/photos signal</span>
              </div>
              <p className="owner-access-note">
                Owner/admin access: Unverified - public listing only
              </p>
              <label>
                Overall status
                <select
                  value={status}
                  onChange={(event) =>
                    onStatusChange(item.id, event.target.value as CheckStatus)
                  }
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Evidence notes
                <textarea
                  value={notes[item.id] ?? ''}
                  onChange={(event) => onNoteChange(item.id, event.target.value)}
                  placeholder="Summarize public evidence, listing accuracy, review/photo signals, and any owner-access follow-up."
                />
              </label>
              <label>
                Evidence Confidence
                <select
                  value={evidenceConfidence[item.id] ?? 'manual_needs_confirmation'}
                  onChange={(event) =>
                    onEvidenceConfidenceChange(
                      item.id,
                      event.target.value as EvidenceConfidence,
                    )
                  }
                >
                  {evidenceConfidenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="helper-text">
                  Public listing details can be observed manually, but owner/admin
                  access should only be marked confirmed after the business owner
                  verifies it. Current: {evidenceConfidenceLabel(evidenceConfidence[item.id])}
                </span>
              </label>
              <div className="directory-actions">
                {item.evidenceLinks.map((link) => (
                  <a
                    href={link.url}
                    key={`${item.id}-${link.label}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
                <button type="button" onClick={() => onAddToActionPlan(item)}>
                  Add to Action Plan
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
