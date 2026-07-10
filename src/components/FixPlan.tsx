import type { FixItem } from '../types/audit'
import { evidenceConfidenceLabel } from '../utils/evidenceConfidence'
import { StatusBadge } from './StatusBadge'

interface FixPlanProps {
  fixes: FixItem[]
  notes?: Record<string, string>
}

const effortForFix = (fix: FixItem) => {
  if (fix.effort) return fix.effort
  if (fix.priority === 'High') return 'Medium'
  if (fix.area.toLowerCase().includes('website')) return 'Medium'
  return 'Low'
}

const packageFitForFix = (fix: FixItem) => {
  if (fix.packageFit) return fix.packageFit
  if (fix.area.toLowerCase().includes('website')) {
    return 'Starter cleanup now; Website SEO Implementation if scope grows.'
  }
  if (fix.area.toLowerCase().includes('ai')) {
    return 'Starter cleanup now; monthly monitoring later.'
  }
  if (fix.area.toLowerCase().includes('search')) {
    return 'Starter cleanup now; monthly monitoring later.'
  }
  return 'Starter Visibility Cleanup.'
}

const whyItMattersForFix = (fix: FixItem) => {
  if (fix.whyItMatters) return fix.whyItMatters
  if (fix.area.toLowerCase().includes('listing')) {
    return 'Inconsistent listing signals can reduce trust across search, maps, and AI answer sources.'
  }
  if (fix.area.toLowerCase().includes('website')) {
    return 'Weak website clarity can make it harder for customers and search systems to understand services, location, and contact paths.'
  }
  if (fix.area.toLowerCase().includes('ai')) {
    return 'AI answers need reliable source facts to describe the business accurately.'
  }
  if (fix.area.toLowerCase().includes('search')) {
    return 'Search visibility gaps can hide the business from customers using service and location searches.'
  }
  return 'This gap may reduce customer confidence or make the business harder to find.'
}

const evidenceForFix = (fix: FixItem, notes: Record<string, string>) => {
  const evidence = fix.evidenceNote || notes[fix.id]
  const confidence = `Evidence confidence: ${evidenceConfidenceLabel(
    fix.evidenceConfidence,
  )}`
  const sources = fix.sources ? `Sources/signals mentioned:\n${fix.sources}` : ''
  return [
    confidence,
    evidence || 'Add a manual verification note during review.',
    sources,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function FixPlan({ fixes, notes = {} }: FixPlanProps) {
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
            No verified gaps marked yet. Complete the guided verification and
            automated audit steps to generate sales-ready recommendations.
          </p>
        ) : (
          fixes.map((fix) => (
            <article className="fix-item" key={fix.id}>
              <div className="fix-priority-cell">
                <StatusBadge status={fix.priority} />
                <span>Effort: {effortForFix(fix)}</span>
              </div>
              <div className="fix-title-cell">
                <p className="fix-area">{fix.area}</p>
                <h3>{fix.issue}</h3>
              </div>
              <div className="fix-table-cell">
                <strong>Why it matters</strong>
                <p>{whyItMattersForFix(fix)}</p>
              </div>
              <div className="fix-table-cell">
                <strong>Evidence / manual note</strong>
                <p>{evidenceForFix(fix, notes)}</p>
              </div>
              <div className="fix-table-cell">
                <strong>Recommended action</strong>
                <p>{fix.fix}</p>
              </div>
              <div className="fix-table-cell">
                <strong>Package fit</strong>
                <p>{packageFitForFix(fix)}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
