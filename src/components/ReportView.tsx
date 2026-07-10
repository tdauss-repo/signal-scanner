import type {
  BusinessProfile,
  CheckStatus,
  EvidenceConfidence,
  ScoreResult,
} from '../types/audit'
import { customerEvidenceConfidenceLabel } from '../utils/evidenceConfidence'
import { formatScore } from '../utils/scoring'
import { StatusBadge } from './StatusBadge'

interface ReportViewProps {
  profile: BusinessProfile
  scores: Record<string, ScoreResult>
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
  evidenceConfidence?: Record<string, EvidenceConfidence>
}

export function ReportView({
  profile,
  scores,
  checks,
  notes,
  evidenceConfidence = {},
}: ReportViewProps) {
  const findings = Object.entries(checks).filter(
    ([id, status]) => status !== 'unknown' && notes[id]?.trim(),
  )

  return (
    <section className="panel report-view">
      <div className="panel-header">
        <p className="eyebrow">Sales Conversation Snapshot</p>
        <h2>{profile.businessName} opportunity summary</h2>
        <p>
          Internal pre-call and meeting reference for {profile.targetLocation}.
          Owner access unverified - confirm during onboarding.
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
        {(profile.phoneNumbers ?? [])
          .filter((record) => record.isValidPublicContact && record.number.trim())
          .map((record) => (
            <p key={`${record.label}-${record.number}`}>
              {record.label || 'Contact'}: {record.number}
              {record.role ? ` (${record.role})` : ''}
            </p>
          ))}
        {profile.contactStructureNote ? (
          <p>{profile.contactStructureNote}</p>
        ) : null}
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
              <strong>{id}</strong> ({status},{' '}
              {customerEvidenceConfidenceLabel(evidenceConfidence[id])}):{' '}
              {notes[id]}
            </p>
          ))
        )}
      </div>
    </section>
  )
}
