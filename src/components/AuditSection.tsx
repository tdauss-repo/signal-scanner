import type { AuditItem, CheckStatus } from '../types/audit'
import { StatusBadge } from './StatusBadge'

interface AuditSectionProps {
  title: string
  subtitle: string
  eyebrow?: string
  note?: string
  items: AuditItem[]
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
  onStatusChange: (id: string, status: CheckStatus) => void
  onNoteChange: (id: string, note: string) => void
  children?: React.ReactNode
}

const checkOptions: Array<{ value: CheckStatus; label: string }> = [
  { value: 'unknown', label: 'Unknown / not checked' },
  { value: 'pass', label: 'Pass' },
  { value: 'partial', label: 'Partial' },
  { value: 'fail', label: 'Fail' },
]

export function AuditSection({
  title,
  subtitle,
  eyebrow = 'Guided Audit',
  note,
  items,
  checks,
  notes,
  onStatusChange,
  onNoteChange,
  children,
}: AuditSectionProps) {
  return (
    <section className="panel audit-section">
      <div className="panel-header split-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {note ? <p className="section-note">{note}</p> : null}
        </div>
        {children}
      </div>
      <div className="audit-list">
        {items.map((item) => {
          const status = checks[item.id] ?? 'unknown'

          return (
            <article className="audit-item" key={item.id}>
              <div className="audit-main">
                <div className="audit-title-row">
                  <h3>{item.label}</h3>
                  <StatusBadge status={status} />
                </div>
                <p>{item.description}</p>
                <div className="audit-tags">
                  <span>
                    {item.access === 'owner-authorized'
                      ? 'Owner-authorized'
                      : 'Public'}
                  </span>
                  <span>Weight {item.weight}</span>
                </div>
                <div className="evidence-links">
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
                </div>
              </div>
              <div className="audit-controls">
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(event) =>
                      onStatusChange(item.id, event.target.value as CheckStatus)
                    }
                  >
                    {checkOptions.map((option) => (
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
                    placeholder="What did you verify? Add links, source notes, or customer-facing findings."
                    onChange={(event) =>
                      onNoteChange(item.id, event.target.value)
                    }
                  />
                </label>
                <p className="fix-copy">{item.fix}</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
