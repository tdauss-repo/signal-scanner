import type { BusinessProfile, CheckStatus, ScoreResult } from '../types/audit'
import { formatScore } from '../utils/scoring'
import { StatusBadge } from './StatusBadge'

interface ReportViewProps {
  profile: BusinessProfile
  scores: Record<string, ScoreResult>
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
}

export function ReportView({
  profile,
  scores,
  checks,
  notes,
}: ReportViewProps) {
  const findings = Object.entries(checks).filter(
    ([id, status]) => status !== 'unknown' && notes[id]?.trim(),
  )

  return (
    <section className="panel report-view">
      <div className="panel-header">
        <p className="eyebrow">Printable Customer Report</p>
        <h2>{profile.businessName} local visibility summary</h2>
        <p>
          Structured audit report for {profile.targetLocation}. Owner access
          unverified - confirm during onboarding.
        </p>
      </div>
      <div className="report-grid">
        {Object.entries(scores).map(([label, score]) => (
          <div className="report-score" key={label}>
            <p>{label}</p>
            <strong>{formatScore(score.score)}</strong>
            <StatusBadge status={score.status} />
          </div>
        ))}
      </div>
      <div className="report-block">
        <h3>Business profile</h3>
        <p>{profile.website}</p>
        <p>{profile.phone}</p>
        <p>{profile.serviceArea}</p>
        <p>{profile.primaryServices}</p>
      </div>
      <div className="report-block">
        <h3>Evidence notes</h3>
        {findings.length === 0 ? (
          <p>No checked findings have evidence notes yet.</p>
        ) : (
          findings.map(([id, status]) => (
            <p key={id}>
              <strong>{id}</strong> ({status}): {notes[id]}
            </p>
          ))
        )}
      </div>
    </section>
  )
}
