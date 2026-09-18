import type { AuditItem, AuditState, FixItem } from '../types/audit'
import { customerFindingGroup, findingLifecycle, summarizeCustomerScan } from '../utils/customerScan'
import type { CustomerView } from '../utils/customerScan'
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
}

function FindingCard({ fix }: { fix: FixItem }) {
  return <article className="customer-finding">
    <div className="customer-finding-heading"><span className="customer-priority">{fix.priority} priority</span><span className="customer-small">Action proposed · Awaiting approval</span></div>
    <p className="customer-small">What we found</p>
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

export function CustomerScanView({ state, items, fixes, view, onView: setView, loading, scanError, onScan, onWorkbench }: Props) {
  const summary = summarizeCustomerScan(state, items, fixes, loading, scanError)
  const groups = ['Found Local can help fix', 'Customer confirmation / input needed', 'Future / additional opportunity']
  const titles: Record<CustomerView, [string, string]> = {
    Scan: ['A clearer picture of your public presence.', 'Understand what has been checked, where there may be room to improve, and what needs a closer look.'],
    Findings: ['Useful findings. Clear next steps.', 'Reviewed observations for this business, with the evidence and recommendation behind each one.'],
    'Action Plan': ['From findings to improvements.', 'Proposed service work, ready to discuss. Nothing here means a change has been approved or completed.'],
    Results: ['See what changes. Know what works.', 'Completed work belongs here once implementation and follow-up checks provide the evidence.'],
  }
  return <div className="customer-shell">
    <a className="customer-skip" href="#customer-content">Skip to content</a>
    <header className="customer-header">
      <div className="customer-brand"><span className="customer-brand-mark" aria-hidden="true">f<span>•</span></span><div><strong>Found Local</strong><p>Helping local businesses get found in search, maps, and AI.</p></div></div>
      <button className="customer-workbench" type="button" onClick={onWorkbench}>Open Workbench <span aria-hidden="true">↗</span></button>
    </header>
    <div className="customer-workspace"><div><span className="customer-eyebrow">Your business</span><h1>{state.profile.businessName || 'Your business workspace'}</h1><p>{[state.profile.website, state.profile.city || state.profile.localMarket, state.profile.state].filter(Boolean).join(' · ') || 'Add business details in the Workbench to begin.'}</p></div><span className="customer-context-label">Visibility review</span></div>
    <nav className="customer-nav" aria-label="Customer navigation">{(['Scan', 'Findings', 'Action Plan', 'Results'] as const).map((name) => <button key={name} type="button" aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}>{name}{name === 'Findings' && summary.findings.length > 0 ? <span>{summary.findings.length}</span> : null}</button>)}</nav>
    <main id="customer-content" className="customer-content">
      <section className="customer-intro"><p className="customer-eyebrow">{view === 'Scan' ? 'Understand your visibility' : view}</p><h2>{titles[view][0]}</h2><p>{titles[view][1]}</p></section>
      {view === 'Scan' ? <>
        <section className="customer-summary" aria-label="Scan summary">
          {[[summary.websiteCompleted, 'Website checks with results'], [summary.websiteGood, 'Website checks looking good'], [summary.improvementCount, 'Reviewed improvements'], [summary.confirmationCount, 'Reviewed items needing input']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </section>
        <div className="customer-section-heading"><h3>Where you stand</h3><button type="button" className="customer-primary" disabled={loading || !state.profile.website.trim()} onClick={onScan}>{loading ? 'Analyzing website…' : 'Scan website'}</button></div>
        <p className="customer-small" role="status">{loading ? 'Website scan in progress. Findings will need review before they appear here.' : scanError ? 'The website scan could not complete. No new findings were recorded; review the details in the Workbench.' : 'Website checks can run automatically. Search, maps, business information, and AI observations require their own review.'}</p>
        <section className="customer-area-grid" aria-label="Visibility areas">{summary.areas.map((area, index) => <article key={area.title} className="customer-area"><span className="customer-area-number" aria-hidden="true">0{index + 1}</span><h3>{area.title}</h3><span className={`customer-status customer-status-${area.status === 'Looking good' ? 'good' : area.status === 'Scan in progress' ? 'progress' : area.status === 'Not reviewed / Not checked' ? 'neutral' : 'attention'}`}>{area.status}</span><p>{area.detail}</p></article>)}</section>
        <section className="customer-next"><div><p className="customer-eyebrow">The next step</p><h3>{summary.findings.length ? 'Turn reviewed findings into a plan.' : 'Good recommendations start with evidence.'}</h3><p>{summary.findings.length ? 'Explore the recommendations and decide what is worth taking forward.' : 'Scan results are reviewed before recommendations are shared. No findings here yet does not mean there are no improvements to make.'}</p></div><button className="customer-text-button" type="button" onClick={() => setView('Findings')}>View findings <span aria-hidden="true">→</span></button></section>
      </> : null}
      {view === 'Findings' ? <section aria-label="Reviewed findings">{summary.findings.length ? <div className="customer-findings-list">{summary.findings.map((fix) => <FindingCard key={fix.id} fix={fix} />)}</div> : <div className="customer-empty"><span aria-hidden="true">◎</span><h3>No reviewed findings to share yet</h3><p>Results need an evidence review before becoming customer recommendations. Unchecked areas are still open.</p></div>}</section> : null}
      {view === 'Action Plan' ? <div className="customer-plan">{groups.map((group) => {
        const actions = summary.findings.filter((fix) => customerFindingGroup(fix) === group)
        return <section key={group}><div className="customer-section-heading"><h3>{group}</h3><span className="customer-count">{actions.length}</span></div>{actions.length ? actions.map((fix) => <FindingCard key={fix.id} fix={fix} />) : <p className="customer-plan-empty">No reviewed work proposed in this group.</p>}</section>
      })}<p className="customer-small">Additional opportunities are separate from the initial service scope. No changes happen without the required approval.</p></div> : null}
      {view === 'Results' ? <>
        <div className="customer-empty"><span aria-hidden="true">✓</span><h3>Verified improvements will appear here</h3><p>This workspace does not yet record implementation, approval, or before-and-after verification. Proposed actions are not completed results.</p></div>
        <section className="customer-results-path" aria-label="Future verification process"><h3>What a verified result will show</h3><ol><li><strong>Before</strong><span>The original observation and its evidence.</span></li><li><strong>The change</strong><span>What was approved and implemented.</span></li><li><strong>After</strong><span>A repeat check against the agreed outcome.</span></li></ol></section>
        <details className="customer-lifecycle"><summary>From an observation to a verified improvement</summary><p>These are the stages of the service process, not a claim that this workspace has completed them.</p><p>{findingLifecycle.join(' → ')}</p></details>
      </> : null}
    </main><footer className="customer-footer"><strong>Found Local</strong><span>Clear evidence. Practical improvements. Verified results.</span></footer>
  </div>
}
