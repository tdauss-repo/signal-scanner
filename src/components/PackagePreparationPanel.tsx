import type { AuditState, FixItem } from '../types/audit'
import { derivePackagePreparation } from '../utils/packagePreparation'

const scopeLabel = (fit: NonNullable<FixItem['salesPackageFit']>) => ({
  starter: 'Included in Starter',
  later: 'Separate scope',
  owner_action: 'Customer/platform action required',
  excluded: 'Not included',
})[fit]

export function PackagePreparationPanel({ state, fixes }: { state: AuditState; fixes: FixItem[] }) {
  const preparation = derivePackagePreparation(state, fixes)
  return <section className="panel package-preparation-panel" aria-label="Package Preparation">
    <div className="panel-header">
      <p className="eyebrow">Package Preparation</p>
      <h2>{preparation.recommendedPackage || 'No package recommended yet'}</h2>
      <p>{preparation.recommendedPackage
        ? `${preparation.starterItems.length} approved ${preparation.starterItems.length === 1 ? 'finding supports' : 'findings support'} this package recommendation.`
        : 'Approved findings do not currently support a package recommendation.'}</p>
    </div>
    {preparation.starterItems.length ? <div className="fix-list">
      <h3>Approved findings included</h3>
      {preparation.starterItems.map((item) => <article className="fix-item" key={item.findingId}>
        <div className="fix-title-cell"><p className="fix-area">Finding</p><h3>{item.finding}</h3></div>
        <div className="fix-table-cell"><strong>Priority</strong><p>{item.priority}</p></div>
        <div className="fix-table-cell"><strong>What Found Local will do</strong><p>{item.remediationAction}</p></div>
        <div className="fix-table-cell"><strong>Scope classification</strong><p>{scopeLabel(item.packageFit)}</p></div>
        <div className="fix-table-cell"><strong>Package assignment</strong><p>{item.packageAssignment}</p></div>
        <div className="fix-table-cell"><strong>Included scope</strong><p>{item.includedScope}</p></div>
      </article>)}
    </div> : null}
    {preparation.separateScopeItems.length ? <div className="fix-list">
      <h3>Not included / separate scope</h3>
      {preparation.separateScopeItems.map((item) => <article className="fix-item" key={item.findingId}>
        <div className="fix-title-cell"><p className="fix-area">Approved finding</p><h3>{item.finding}</h3></div>
        <div className="fix-table-cell"><strong>Priority</strong><p>{item.priority}</p></div>
        <div className="fix-table-cell"><strong>What Found Local will do</strong><p>{item.remediationAction}</p></div>
        <div className="fix-table-cell"><strong>Scope classification</strong><p>{scopeLabel(item.packageFit)}</p></div>
        <div className="fix-table-cell"><strong>Package assignment</strong><p>{item.packageAssignment}</p></div>
      </article>)}
    </div> : null}
    <p className="customer-small">Candidate, dismissed, and neutral needs-review observations do not create package scope. Package approval does not authorize implementation.</p>
  </section>
}
