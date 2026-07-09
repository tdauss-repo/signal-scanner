import type { FixItem } from '../types/audit'
import { StatusBadge } from './StatusBadge'

interface FixPlanProps {
  fixes: FixItem[]
}

export function FixPlan({ fixes }: FixPlanProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Action Plan</p>
        <h2>What to fix first</h2>
        <p>
          The scanner turns verified gaps into prioritized fixes with
          recommended actions, evidence, impact, effort, and optional pricing
          placeholders.
        </p>
      </div>
      <div className="fix-list">
        {fixes.length === 0 ? (
          <p className="empty-state">
            No urgent fixes marked yet. Start by completing the guided
            verification and automated audit steps.
          </p>
        ) : (
          fixes.map((fix) => (
            <article className="fix-item" key={fix.id}>
              <StatusBadge status={fix.priority} />
              <div>
                <p className="fix-area">{fix.area}</p>
                <h3>{fix.issue}</h3>
                <p>{fix.fix}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
