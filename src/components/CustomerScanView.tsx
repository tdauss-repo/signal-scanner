import { useState } from 'react'
import type { AuditItem, AuditState, FixItem } from '../types/audit'
import { customerFindingGroup, customerReviewReadiness, findingLifecycle, isPresentedFinding, isSupportingCustomerFinding, summarizeCustomerScan } from '../utils/customerScan'
import type { CustomerView } from '../utils/customerScan'
import { buildCustomerVisibilityReviewExport, customerVisibilityReviewFilename, serializeCustomerVisibilityReview } from '../utils/customerVisibilityReviewExport'
import { PackagePreparationPanel } from './PackagePreparationPanel'
import './CustomerScanView.css'

interface Props {
  state: AuditState
  items: AuditItem[]
  fixes: FixItem[]
  view: CustomerView
  onView: (view: CustomerView) => void
  loading: boolean
  scanError: boolean
  onScan: () => void
  onWorkbench: () => void
  onReviewFindings: () => void
}

function FindingCard({ fix, approved = false }: { fix: FixItem; approved?: boolean }) {
  return <article className="customer-finding">
    <div className="customer-finding-heading"><span className="customer-priority">{fix.priority} priority</span><span className="customer-small">{approved ? 'Approved for customer export' : 'Candidate · operator approval required'}</span></div>
    <p className="customer-small">Finding candidate</p>
    <h3>{fix.intelligence?.customer.title || fix.issue}</h3>
    {fix.intelligence ? <p>{fix.intelligence.customer.found}</p> : null}
    <dl className="customer-finding-details">
      <div><dt>Why it matters</dt><dd>{fix.intelligence?.customer.why || fix.whyItMatters || 'The reason for this recommendation still needs to be discussed. No business outcome is assumed.'}</dd></div>
      <div><dt>What we recommend</dt><dd>{fix.intelligence?.customer.recommendation || fix.fix}</dd></div>
    </dl>
    <p className="customer-ownership">{customerFindingGroup(fix)}</p>
    <p className="customer-small">Scope, permission, and any required access must be agreed before changes.</p>
    {fix.intelligence ? <p>{fix.intelligence.customer.canRemediate ? 'Found Local can help with the agreed correction, subject to access and scope.' : 'This requires an external specialist.'} {fix.intelligence.customer.confirmation}</p> : null}
    <details><summary>Evidence & verification</summary>
      <p>{fix.intelligence?.customer.evidenceSummary || fix.evidenceSummary || fix.evidenceNote}</p>
      {fix.sources ? <p className="customer-evidence-source">Source notes: {fix.sources}</p> : null}
      {fix.evidenceSources?.length ? <ul>{fix.evidenceSources.map((source, index) => <li key={index}>{source}</li>)}</ul> : null}
      <p><strong>How we will check it:</strong> {fix.intelligence?.customer.verificationSummary || fix.verificationMethod}</p>
      {!fix.intelligence && fix.dependencies?.length ? <p>Required first: {fix.dependencies.join(', ')}</p> : null}
    </details>
  </article>
}

export function CustomerScanView({ state, items, fixes, view, onView: setView, loading, scanError, onScan, onWorkbench, onReviewFindings }: Props) {
  const summary = summarizeCustomerScan(state, items, fixes, loading, scanError)
  const [exportStatus, setExportStatus] = useState('')
  const cockpit = summary.cockpit
  const primaryCandidates = cockpit.confirmedIssues.filter((fix) => !isSupportingCustomerFinding(fix))
  const readiness = customerReviewReadiness(state, summary)
  const reviewReady = readiness.state === 'ready'
  const customerReview = buildCustomerVisibilityReviewExport(state, items, fixes)
  const customerReviewJson = serializeCustomerVisibilityReview(customerReview)
  const copyCustomerReview = async () => {
    if (!reviewReady) return
    try {
      await navigator.clipboard.writeText(customerReviewJson)
      setExportStatus('Customer Review JSON copied.')
    } catch {
      setExportStatus('Copy is unavailable in this browser. Download the JSON instead.')
    }
  }
  const downloadCustomerReview = () => {
    if (!reviewReady) return
    const blob = new Blob([customerReviewJson], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = customerVisibilityReviewFilename(customerReview)
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    setExportStatus('Customer Review JSON downloaded.')
  }
  const titles: Record<CustomerView, [string, string]> = {
    Scan: ['Operator overview', 'Run the scan, inspect what still needs review, and prepare an approved customer-safe handoff.'],
    Findings: ['Finding candidates', 'Eligible findings remain internal until an operator approves their evidence and customer wording.'],
    'Action Plan': ['Package preparation', 'Only approved customer findings are available for package preparation.'],
    Results: ['Verification record', 'Completed work belongs here only after execution and follow-up verification.'],
  }
  const navLabels: Record<CustomerView, string> = { Scan: 'Scan', Findings: 'Findings', 'Action Plan': 'Package', Results: 'Verification' }
  return <div className="customer-shell">
    <a className="customer-skip" href="#customer-content">Skip to content</a>
    <header className="customer-header">
      <div className="customer-brand"><span className="customer-brand-mark" aria-hidden="true">f<span>•</span></span><div><strong>Business Scanner Tool</strong><p>Internal Found Local operator workflow</p></div></div>
      <button className="customer-workbench" type="button" onClick={onWorkbench}>Open evidence Workbench <span aria-hidden="true">↗</span></button>
    </header>
    <div className="customer-workspace"><div><span className="customer-eyebrow">Business Profile</span><h1>{state.profile.businessName || 'Untitled business workspace'}</h1><p>{[state.profile.website, state.profile.city || state.profile.localMarket, state.profile.state].filter(Boolean).join(' · ') || 'Add and review business details in the Workbench.'}</p></div><span className="customer-context-label">Internal operator system</span></div>
    <nav className="customer-nav" aria-label="Operator workflow navigation">{(['Scan', 'Findings', 'Action Plan', 'Results'] as const).map((name) => <button key={name} type="button" aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}>{navLabels[name]}{name === 'Findings' && readiness.candidateFindings > 0 ? <span>{readiness.candidateFindings}</span> : null}</button>)}</nav>
    <main id="customer-content" className="customer-content">
      <section className="customer-intro operator-intro"><p className="customer-eyebrow">{navLabels[view]}</p><h2>{titles[view][0]}</h2><p>{titles[view][1]}</p></section>
      {view === 'Scan' ? <>
        <ol className="operator-workflow" aria-label="Operator workflow">
          {['Business Profile', 'Scan', 'Evidence', 'Findings', 'Package', 'Customer Review Readiness', 'Export'].map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}
        </ol>
        <section className="operator-scan-grid" aria-label="Scan and evidence status">
          <article className="operator-scan-card"><p className="customer-eyebrow">Scan</p><h3>{summary.snapshot.overall}</h3><p>{summary.snapshot.detail}</p><button type="button" className="customer-primary" disabled={loading || !(state.profile.website.trim() || state.profile.businessName.trim())} onClick={onScan}>{loading ? 'Running visibility scan…' : 'Run visibility scan'}</button></article>
          <article className="operator-scan-card"><p className="customer-eyebrow">Evidence status</p><div className="operator-area-list">{summary.areas.map((area) => <div key={area.title}><span className={`scan-state scan-state-${area.snapshotStatus === 'Looking good' ? 'good' : area.snapshotStatus === 'Needs attention' ? 'issue' : 'review'}`}>{area.snapshotStatus === 'Looking good' ? '✓' : area.snapshotStatus === 'Needs attention' ? '!' : '•'}</span><span><strong>{area.title}</strong><small>{area.snapshotStatus} · {area.detail}</small></span></div>)}</div><button className="customer-text-button" type="button" onClick={onWorkbench}>Inspect evidence in Workbench <span aria-hidden="true">→</span></button></article>
        </section>
        {loading ? <p className="customer-small customer-scan-note" role="status">Checking website and queued visibility evidence. Findings still require operator review.</p> : null}
        <section className={`customer-readiness customer-readiness-${readiness.state}`} aria-label="Customer Review Readiness"><div><p className="customer-eyebrow">Customer Review Readiness</p><h2>{reviewReady ? 'Ready for customer presentation' : 'Not ready'}</h2><p>{readiness.message}</p></div><dl><div><dt>Candidate findings</dt><dd>{readiness.candidateFindings}</dd></div><div><dt>Approved findings</dt><dd>{readiness.approvedFindings}</dd></div><div><dt>Dismissed findings</dt><dd>{readiness.dismissedFindings}</dd></div><div><dt>Awaiting review</dt><dd>{readiness.awaitingDisposition}</dd></div><div><dt>Verified strengths</dt><dd>{readiness.verifiedStrengths}</dd></div><div><dt>Needs review</dt><dd>{readiness.needsReview}</dd></div></dl><p className="customer-small">Needs-review destinations remain explicit and neutral. They do not become customer findings or block an otherwise adjudicated review.</p><div className="customer-readiness-actions">{reviewReady ? <><button className="customer-text-button" type="button" onClick={() => void copyCustomerReview()}>Copy Customer Review JSON</button><button className="customer-primary" type="button" onClick={downloadCustomerReview}>Export Customer Review JSON</button></> : <button className="customer-primary" type="button" onClick={onReviewFindings}>Review Findings</button>}</div>{exportStatus ? <p className="customer-small" role="status">{exportStatus}</p> : null}</section>
        {scanError ? <p className="customer-small customer-scan-note" role="status">Some checks could not complete. Acquisition failures remain neutral and do not count as business problems.</p> : null}
      </> : null}
      {view === 'Findings' ? <section aria-label="Finding candidates">{primaryCandidates.length ? <><div className="customer-findings-list">{primaryCandidates.map((fix) => <FindingCard key={fix.id} fix={fix} approved={isPresentedFinding(state, fix)} />)}</div><button className="customer-primary operator-review-button" type="button" onClick={onReviewFindings}>Review evidence and approvals in Workbench</button></> : <div className="customer-empty"><span aria-hidden="true">◎</span><h3>No eligible finding candidates</h3><p>Continue scanning and evidence review. Unavailable checks remain neutral.</p></div>}</section> : null}
      {view === 'Action Plan' ? <PackagePreparationPanel state={state} fixes={fixes} /> : null}
      {view === 'Results' ? <>
        <div className="customer-empty"><span aria-hidden="true">✓</span><h3>Verified improvements will appear here</h3><p>This workspace does not yet record implementation, approval, or before-and-after verification. Proposed actions are not completed results.</p></div>
        <section className="customer-results-path" aria-label="Future verification process"><h3>What a verified result will show</h3><ol><li><strong>Before</strong><span>The original observation and its evidence.</span></li><li><strong>The change</strong><span>What was approved and implemented.</span></li><li><strong>After</strong><span>A repeat check against the agreed outcome.</span></li></ol></section>
        <details className="customer-lifecycle"><summary>From an observation to a verified improvement</summary><p>These are the stages of the service process, not a claim that this workspace has completed them.</p><p>{findingLifecycle.join(' → ')}</p></details>
      </> : null}
    </main><footer className="customer-footer"><strong>Business Scanner Tool</strong><span>Internal evidence, approval, package, and export workflow.</span></footer>
  </div>
}
