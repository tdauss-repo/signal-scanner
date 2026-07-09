import { formatScore } from '../utils/scoring'
import { StatusBadge } from './StatusBadge'
import type { ScoreResult } from '../types/audit'

interface ScoreCardProps {
  label: string
  result: ScoreResult
  weight?: string
  active?: boolean
  onClick?: () => void
}

export function ScoreCard({
  label,
  result,
  weight,
  active = false,
  onClick,
}: ScoreCardProps) {
  const score = result.score === null ? 0 : Math.round(result.score)

  return (
    <button
      className={`score-card ${active ? 'score-card-active' : ''}`}
      onClick={onClick}
      role="tab"
      aria-selected={active}
      type="button"
    >
      <div>
        <p className="score-label">{label}</p>
        <strong>{formatScore(result.score)}</strong>
      </div>
      <StatusBadge status={result.status} />
      <div className="score-track" aria-hidden="true">
        <span style={{ width: `${score}%` }} />
      </div>
      <p className="score-meta">
        {result.checked} checked
        {weight ? ` | ${weight}` : ''}
      </p>
    </button>
  )
}
