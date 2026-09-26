import type { AuditItem, AuditState, BusinessProfile, FixItem, SavedScanRecord } from '../types/audit'
import type { CustomerFindingWording, CustomerView } from '../utils/customerScan'
import { customerReviewReadiness, findingLifecycle, isSupportingCustomerFinding, summarizeCustomerScan } from '../utils/customerScan'
import { profileCompleteness } from '../utils/profileCompleteness'
import { BusinessWorkspacePanel } from './BusinessWorkspacePanel'
import { CustomerFindingReview } from './CustomerFindingReview'
import { CustomerReviewPanel } from './CustomerReviewPanel'
import { PackagePreparationPanel } from './PackagePreparationPanel'
import './CustomerScanView.css'

interface Props {
  state: AuditState; items: AuditItem[]; fixes: FixItem[]; view: CustomerView; onView: (view: CustomerView) => void
  loading: boolean; scanError: boolean; onScan: () => void; onWorkbench: () => void
  onReview: (fix: FixItem, disposition: 'approved' | 'dismissed' | 'pending') => void
  onSaveRefinement: (fix: FixItem, wording: CustomerFindingWording) => void
  currentScanId: string; dirty: boolean; scans: SavedScanRecord[]; onProfileChange: (profile: BusinessProfile) => void
  onSaveCurrent: () => void; onSaveAsNew: () => void; onLoad: (id: string) => void; onDuplicate: (id: string) => void
  onRename: (id: string) => void; onDelete: (id: string) => void; onExportFullScan: (id: string) => void
  onImportFullScan: (file: File) => void; onStartBlank: () => void
}

const views: CustomerView[] = ['Business', 'Scan', 'Review', 'Package', 'Customer Review', 'Verification']
const titles: Record<CustomerView, [string, string]> = {
  Business: ['Business workspace', 'Select the right workspace, review identity facts, and confirm the profile is ready enough to scan.'],
  Scan: ['Operational scan', 'Run acquisition, watch evidence health, and identify what needs operator attention.'],
  Review: ['Evidence and finding decisions', 'Move from evidence to interpretation, customer wording, and an explicit disposition in one place.'],
  Package: ['Package preparation', 'Only explicitly approved findings create package scope.'],
  'Customer Review': ['Customer Review', 'Inspect the exact customer-safe handoff before copying or exporting it to Found Local Sites.'],
  Verification: ['Verification record', 'Completed work belongs here only after execution and follow-up verification.'],
}

export function CustomerScanView(props: Props) {
  const { state, items, fixes, view, onView: setView, loading, scanError } = props
  const summary = summarizeCustomerScan(state, items, fixes, loading, scanError)
  const readiness = customerReviewReadiness(state, summary)
  const completeness = profileCompleteness(state)
  const primaryCandidates = summary.cockpit.confirmedIssues.filter((fix) => !isSupportingCustomerFinding(fix))
  const lastRun = state.visibilityRuns?.at(-1)
  const lastActivity = lastRun?.endedAt || state.lastUpdated
  return <div className="customer-shell">
    <a className="customer-skip" href="#customer-content">Skip to content</a>
    <header className="customer-header"><div className="customer-brand"><span className="customer-brand-mark" aria-hidden="true">f<span>•</span></span><div><strong>Business Scanner Tool</strong><p>Internal Found Local operator workflow</p></div></div><button className="customer-workbench" type="button" onClick={props.onWorkbench}>Detailed evidence &amp; tools <span aria-hidden="true">↗</span></button></header>
    <div className="customer-workspace"><div><span className="customer-eyebrow">Current business</span><h1>{completeness.profile.businessName || 'Untitled business workspace'}</h1><p>{[completeness.profile.primaryCategory, completeness.profile.city || completeness.profile.localMarket, completeness.profile.state].filter(Boolean).join(' · ') || 'Review the business profile before scanning.'}</p></div><span className="customer-context-label">{props.currentScanId ? props.dirty ? 'Unsaved changes' : 'Saved workspace' : 'New workspace'}</span></div>
    <nav className="customer-nav operator-primary-nav" aria-label="Primary operator workflow">{views.map((name) => <button key={name} type="button" aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}>{name}{name === 'Review' && readiness.awaitingDisposition > 0 ? <span>{readiness.awaitingDisposition}</span> : null}</button>)}</nav>
    <main id="customer-content" className="customer-content">
      <section className="customer-intro operator-intro"><p className="customer-eyebrow">{view}</p><h2>{titles[view][0]}</h2><p>{titles[view][1]}</p></section>
      {view === 'Business' ? <BusinessWorkspacePanel state={state} currentScanId={props.currentScanId} dirty={props.dirty} scans={props.scans} onProfileChange={props.onProfileChange} onResearch={() => { setView('Scan'); props.onScan() }} onSaveCurrent={props.onSaveCurrent} onSaveAsNew={props.onSaveAsNew} onLoad={props.onLoad} onDuplicate={props.onDuplicate} onRename={props.onRename} onDelete={props.onDelete} onExport={props.onExportFullScan} onImport={props.onImportFullScan} onStartBlank={props.onStartBlank} onGoScan={() => setView('Scan')} /> : null}
      {view === 'Scan' ? <>
        <section className="operator-scan-grid" aria-label="Scan and evidence status"><article className="operator-scan-card"><p className="customer-eyebrow">Visibility scan</p><h3>{loading ? 'Scan in progress' : summary.snapshot.overall}</h3><p>{summary.snapshot.detail}</p><p className="customer-small">Last activity: {lastActivity ? new Date(lastActivity).toLocaleString() : 'Not scanned'}</p><button type="button" className="customer-primary" disabled={loading || !completeness.readyToScan} onClick={props.onScan}>{loading ? 'Running visibility scan…' : lastRun ? 'Re-run visibility scan' : 'Run visibility scan'}</button>{!completeness.readyToScan ? <p className="customer-small">Business name and website are required before scanning.</p> : null}</article>
          <article className="operator-scan-card"><p className="customer-eyebrow">Evidence health</p><div className="operator-area-list">{summary.areas.map((area) => <div key={area.title}><span className={`scan-state scan-state-${area.snapshotStatus === 'Looking good' ? 'good' : area.snapshotStatus === 'Needs attention' ? 'issue' : 'review'}`}>{area.snapshotStatus === 'Looking good' ? '✓' : area.snapshotStatus === 'Needs attention' ? '!' : '•'}</span><span><strong>{area.title}</strong><small>{area.snapshotStatus} · {area.detail}</small></span></div>)}</div><button className="customer-text-button" type="button" onClick={props.onWorkbench}>View detailed evidence <span aria-hidden="true">→</span></button></article></section>
        {scanError ? <p className="customer-small customer-scan-note" role="status">Some checks could not complete. Acquisition failures remain neutral and do not count as business problems.</p> : null}
        <section className="customer-next"><div><p className="customer-eyebrow">Next step</p><h3>{primaryCandidates.length} primary candidates need operator judgment</h3><p>Review captured evidence, refine customer wording where needed, and approve or dismiss each primary candidate.</p></div><button className="customer-primary" type="button" onClick={() => setView('Review')}>Continue to Review</button></section>
      </> : null}
      {view === 'Review' ? <><section className="panel review-evidence-summary"><div className="panel-header"><p className="eyebrow">Evidence summary</p><h2>{primaryCandidates.length} primary candidates · {readiness.needsReview} neutral destinations</h2><p>Unavailable or ambiguous destinations remain neutral. Detailed acquisition and provider data is available as a drill-down.</p></div>{summary.cockpit.deeperReview.length ? <ul>{summary.cockpit.deeperReview.map((entry) => <li key={`${entry.queryId}-${entry.destination}`}><strong>{entry.displayDestination}</strong>: {entry.explanation}</li>)}</ul> : <p>No destination-level Needs Review items are currently recorded.</p>}<button className="secondary" type="button" onClick={props.onWorkbench}>View evidence details</button></section><CustomerFindingReview state={state} fixes={fixes} onReview={props.onReview} onSaveRefinement={props.onSaveRefinement} /></> : null}
      {view === 'Package' ? <PackagePreparationPanel state={state} fixes={fixes} /> : null}
      {view === 'Customer Review' ? <CustomerReviewPanel state={state} items={items} fixes={fixes} onReview={() => setView('Review')} /> : null}
      {view === 'Verification' ? <><div className="customer-empty"><span aria-hidden="true">✓</span><h3>Verified improvements will appear here</h3><p>This workspace does not yet record implementation, approval, or before-and-after verification. Proposed actions are not completed results.</p></div><section className="customer-results-path" aria-label="Future verification process"><h3>What a verified result will show</h3><ol><li><strong>Before</strong><span>The original observation and its evidence.</span></li><li><strong>The change</strong><span>What was approved and implemented.</span></li><li><strong>After</strong><span>A repeat check against the agreed outcome.</span></li></ol></section><details className="customer-lifecycle"><summary>From an observation to a verified improvement</summary><p>These are process stages, not a claim that this workspace completed them.</p><p>{findingLifecycle.join(' → ')}</p></details></> : null}
    </main><footer className="customer-footer"><strong>Business Scanner Tool</strong><span>Business → Scan → Review → Package → Customer Review → Verification</span></footer>
  </div>
}
