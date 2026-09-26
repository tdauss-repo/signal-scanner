import { useState } from 'react'
import type { AuditState, FixItem, PackageAssignmentChoice, PackageScopeClassification } from '../types/audit'
import { derivePackagePreparation, type PackagePreparationItem, type PackageScopeInput } from '../utils/packagePreparation'

const scopeLabels: Record<PackageScopeClassification, string> = {
  starter: 'Included in Starter',
  separate: 'Separate scope',
  customer_action: 'Customer / third-party action required',
  not_included: 'Not included',
}

const assignmentChoice = (assignment: string): PackageAssignmentChoice =>
  assignment === 'Starter Visibility Cleanup' ? assignment
    : assignment === 'None' ? assignment : 'Custom / separate project'

function PackageScopeCard({ item, fix, onSave }: { item: PackagePreparationItem; fix: FixItem; onSave: (fix: FixItem, input: PackageScopeInput) => void }) {
  const [editing, setEditing] = useState(false)
  const [scopeClassification, setScopeClassification] = useState(item.scopeClassification)
  const [assignment, setAssignment] = useState<PackageAssignmentChoice>(assignmentChoice(item.packageAssignment))
  const [customAssignment, setCustomAssignment] = useState(assignmentChoice(item.packageAssignment) === 'Custom / separate project' && item.packageAssignment !== 'Custom / separate project' ? item.packageAssignment : '')
  const [deliveryDescription, setDeliveryDescription] = useState(item.remediationAction)
  const [includedScope, setIncludedScope] = useState(item.includedScope)
  const [internalNote, setInternalNote] = useState(item.internalScopeNote)
  const beginEditing = () => {
    setScopeClassification(item.scopeClassification)
    setAssignment(assignmentChoice(item.packageAssignment))
    setCustomAssignment(assignmentChoice(item.packageAssignment) === 'Custom / separate project' && item.packageAssignment !== 'Custom / separate project' ? item.packageAssignment : '')
    setDeliveryDescription(item.remediationAction)
    setIncludedScope(item.includedScope)
    setInternalNote(item.internalScopeNote)
    setEditing(true)
  }
  const changeClassification = (next: PackageScopeClassification) => {
    setScopeClassification(next)
    setAssignment(next === 'starter' ? 'Starter Visibility Cleanup' : next === 'separate' ? 'Custom / separate project' : 'None')
  }
  const save = () => {
    onSave(fix, {
      scopeClassification,
      packageAssignment: assignment === 'Custom / separate project' ? customAssignment.trim() || assignment : assignment,
      deliveryDescription,
      includedScope,
      internalNote,
    })
    setEditing(false)
  }
  return <article className="fix-item package-scope-item">
    <div className="fix-title-cell"><p className="fix-area">Approved finding</p><h3>{item.finding}</h3>{item.overridden ? <span className="method-pill">Operator scope</span> : <span className="method-pill">Derived default</span>}</div>
    {!editing ? <>
      <div className="fix-table-cell"><strong>What Found Local will do</strong><p>{item.remediationAction}</p></div>
      <div className="fix-table-cell"><strong>Scope classification</strong><p>{scopeLabels[item.scopeClassification]}</p></div>
      <div className="fix-table-cell"><strong>Package assignment</strong><p>{item.packageAssignment}</p></div>
      <div className="fix-table-cell"><strong>Included scope</strong><p>{item.includedScope}</p></div>
      {item.internalScopeNote ? <div className="fix-table-cell package-internal-note"><strong>Internal scope note</strong><p>{item.internalScopeNote}</p></div> : null}
      {item.staleOverride ? <p className="customer-refinement-warning">Earlier package scope is stale and is not active. Review and save the current scope before Customer Review.</p> : null}
      <button className="secondary package-edit-button" type="button" onClick={beginEditing}>Edit scope</button>
    </> : <div className="package-scope-form">
      <label>Scope classification<select value={scopeClassification} onChange={(event) => changeClassification(event.target.value as PackageScopeClassification)}><option value="starter">Included in Starter</option><option value="separate">Separate scope</option><option value="customer_action">Customer / third-party action required</option><option value="not_included">Not included</option></select></label>
      <label>Package assignment<select value={assignment} onChange={(event) => setAssignment(event.target.value as PackageAssignmentChoice)}>{scopeClassification === 'starter' ? <option>Starter Visibility Cleanup</option> : scopeClassification === 'separate' ? <option>Custom / separate project</option> : <option>None</option>}</select></label>
      {assignment === 'Custom / separate project' ? <label>Custom package name<input value={customAssignment} placeholder="Custom / separate project" onChange={(event) => setCustomAssignment(event.target.value)} /></label> : null}
      <label className="full-width-label">What Found Local will do<textarea value={deliveryDescription} onChange={(event) => setDeliveryDescription(event.target.value)} /></label>
      <label className="full-width-label">Included scope<input value={includedScope} onChange={(event) => setIncludedScope(event.target.value)} /></label>
      <label className="full-width-label">Internal scope note <span>(operator-only)</span><textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></label>
      <div className="package-scope-actions"><button type="button" onClick={save}>Save scope</button><button className="secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </div>}
  </article>
}

export function PackagePreparationPanel({ state, fixes, onSaveScope = () => undefined }: { state: AuditState; fixes: FixItem[]; onSaveScope?: (fix: FixItem, input: PackageScopeInput) => void }) {
  const preparation = derivePackagePreparation(state, fixes)
  const fixesById = new Map(fixes.map((fix) => [fix.id, fix]))
  return <section className="panel package-preparation-panel" aria-label="Package Preparation">
    <div className="panel-header">
      <p className="eyebrow">Package Preparation</p>
      <h2>{preparation.recommendedPackage || (preparation.items.length ? 'Approved work requires separate scoping' : 'No package recommended yet')}</h2>
      <p>{preparation.items.length
        ? `${preparation.items.length} approved ${preparation.items.length === 1 ? 'finding is' : 'findings are'} available for operator delivery scoping.`
        : 'Approved findings do not currently support a package recommendation.'}</p>
    </div>
    {preparation.items.length ? <div className="fix-list package-scope-list">
      {preparation.items.map((item) => <PackageScopeCard item={item} fix={fixesById.get(item.findingId)!} onSave={onSaveScope} key={item.findingId} />)}
    </div> : null}
    <p className="customer-small">Candidate, dismissed, and neutral needs-review observations do not create package scope. Package scope does not authorize implementation.</p>
  </section>
}
