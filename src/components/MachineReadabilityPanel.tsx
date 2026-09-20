import type { AuditState } from '../types/audit'
import { currentMachineReadability, deriveMachineFindings } from '../utils/machineReadability'

export function MachineReadabilityPanel({ state }: { state: AuditState }) {
  const report = currentMachineReadability(state)
  const findings = deriveMachineFindings(state)
  return <section className="panel"><div className="panel-header"><p className="eyebrow">Deterministic website evidence</p><h2>Machine Readability / AI Readiness</h2><p>This inspects the captured website. AI Presence / Answer Testing remains a separate external observation workflow below.</p></div>
    {!report || report.status === 'unavailable' ? <p>No current machine-readability evidence. Run visibility scan; acquisition failures do not imply a business failure.</p> : <>
      <p>{report.sourceUrl} · {report.analyzedAt}</p><p>Parsed schema types: {report.schemaTypes.join(', ') || 'None parsed'}</p>
      {report.checks.map((check) => <details key={check.id}><summary>{check.group} — {check.id}: {check.result}</summary><p>{check.conclusion}</p><pre>{check.evidence.join('\n')}</pre></details>)}
      <details><summary>Parsed entity facts & reviewed profile comparisons</summary><pre>{JSON.stringify({ entities: report.entities, comparisons: report.comparisons }, null, 2)}</pre></details>
      {findings.map((finding) => <article key={finding.id}><h3>{finding.issue}</h3><p>{finding.evidenceSummary}</p><p>{finding.intelligence?.delivery.technicalChange}</p><p>Verification: {finding.verificationMethod}</p><p>Rollback/recovery: {finding.intelligence?.remediation?.rollbackRecovery}</p><p>Review this candidate in Customer presentation review before sharing. No implementation is authorized.</p></article>)}
    </>}
  </section>
}
