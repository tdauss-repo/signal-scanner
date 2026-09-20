import type { AuditState } from '../types/audit'
import { matchesEvidenceFingerprint } from '../utils/evidenceFingerprint'

export function VisibilityRunReview({ state }: { state: AuditState }) {
  const runs = (state.visibilityRuns || []).filter((run) => matchesEvidenceFingerprint(run.profileKey, state.profile))
  return <details><summary>Visibility scan runs & acquisition diagnostics ({runs.length})</summary>
    {runs.slice().reverse().map((run) => <section key={run.id}><h3>{run.startedAt} — {run.endedAt || (run.interrupted ? 'Interrupted — rerun or review remaining checks' : 'In progress / interrupted if no scan is active')}</h3>
      {run.summary ? <pre>{JSON.stringify(run.summary, null, 2)}</pre> : null}
      <p>Successful means usable evidence, not a business visibility pass. Customer approval is separate from presentation review.</p>
      {run.checks.map((check) => <details key={check.id}><summary>{check.destination || check.id} — {check.state} · {check.elapsedMs ?? 'pending'} ms</summary>
        <p>{check.query} {check.url}</p><p>{check.error}</p><pre>{JSON.stringify(check.captures, null, 2)}</pre>
      </details>)}
    </section>)}
  </details>
}
