import type { AuditItem, AuditState, BusinessProfile, FixItem, SavedScanRecord } from '../types/audit'
import type { CustomerFindingWording, CustomerView } from '../utils/customerScan'
import { customerReviewReadiness, findingLifecycle, isSupportingCustomerFinding, summarizeCustomerScan } from '../utils/customerScan'
import { profileCompleteness } from '../utils/profileCompleteness'
import { scanProfileKey, visibilityRunIsTerminal, visibilityRunStatus } from '../utils/visibilityScanState'
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
  onSaveCurrent: () => void; saveNotice: { kind: 'success' | 'error'; text: string } | null; onSaveAsNew: () => void; onLoad: (id: string) => void; onDuplicate: (id: string) => void
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
  const lastRun = state.visibilityRuns?.filter((run) => run.profileKey === scanProfileKey(completeness.profile)).at(-1)
  const runStatus = visibilityRunStatus(lastRun)
  const scanRunning = loading || runStatus === 'running'
  const scanTerminal = !loading && visibilityRunIsTerminal(lastRun)
  const lastActivity = lastRun?.endedAt || state.lastUpdated
  const businessContext = [completeness.profile.businessName, completeness.profile.city || completeness.profile.localMarket, completeness.profile.state].filter(Boolean).join(' · ')
  return <div className="customer-shell">
    <a className="customer-skip" href="#customer-content">Skip to content</a>
    <header className="customer-header"><div className="customer-brand"><span className="customer-brand-mark" aria-hidden="true">f<span>•</span></span><div><strong>Found Local</strong><span>Business Scanner Tool</span></div></div><div className="customer-header-context"><span>{businessContext || 'New business'}</span><small>{props.currentScanId ? props.dirty ? 'Unsaved changes' : 'Saved' : 'New workspace'}</small></div><button className="customer-workbench" type="button" onClick={props.onWorkbench}>Detailed evidence &amp; tools <span aria-hidden="true">↗</span></button></header>
    <nav className="customer-nav operator-primary-nav" aria-label="Primary operator workflow">{views.map((name, index) => <button key={name} type="button" disabled={scanRunning && index >= 2 && index <= 4} aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}><span className="workflow-step-number">{index + 1}</span>{name}{name === 'Review' && readiness.awaitingDisposition > 0 ? <span className="workflow-step-count">{readiness.awaitingDisposition}</span> : null}</button>)}</nav>
    <main id="customer-content" className="customer-content">
      {view !== 'Business' ? <section className="customer-intro operator-intro"><p className="customer-eyebrow">{view}</p><h2>{titles[view][0]}</h2><p>{titles[view][1]}</p></section> : null}
      {view === 'Business' ? <BusinessWorkspacePanel state={state} currentScanId={props.currentScanId} dirty={props.dirty} scans={props.scans} onProfileChange={props.onProfileChange} onSaveCurrent={props.onSaveCurrent} saveNotice={props.saveNotice} onSaveAsNew={props.onSaveAsNew} onLoad={props.onLoad} onDuplicate={props.onDuplicate} onRename={props.onRename} onDelete={props.onDelete} onExport={props.onExportFullScan} onImport={props.onImportFullScan} onStartBlank={props.onStartBlank} onGoScan={() => setView('Scan')} /> : null}
      {view === 'Scan' ? <>
        <section className="operator-scan-grid" aria-label="Scan and evidence status"><article className="operator-scan-card"><p className="customer-eyebrow">Visibility scan</p><h3>{scanRunning ? 'Scan in progress' : runStatus === 'failed' ? 'Scan stopped — operator attention required' : runStatus === 'completed_with_review' ? 'Scan complete — some checks need review' : runStatus === 'completed' ? 'Scan complete' : summary.snapshot.overall}</h3><p>Check how this business appears across Website &amp; Technical, Search &amp; Maps, Business Information, and AI Discovery.</p><p>{summary.snapshot.detail}</p><p className="customer-small">Last activity: {lastActivity ? new Date(lastActivity).toLocaleString() : 'Not scanned'}</p><button type="button" className="customer-primary" disabled={scanRunning || !completeness.readyToScan} onClick={props.onScan}>{scanRunning ? 'Running visibility scan…' : lastRun ? 'Re-run Visibility Scan' : 'Run Visibility Scan'}</button>{!completeness.readyToScan ? <p className="customer-small">Business name, website, and primary category are required before scanning.</p> : null}</article>
          <article className="operator-scan-card"><p className="customer-eyebrow">Evidence health</p><div className="operator-area-list">{summary.areas.map((area) => <div key={area.title}><span className={`scan-state scan-state-${area.snapshotStatus === 'Looking good' ? 'good' : area.snapshotStatus === 'Needs attention' ? 'issue' : 'review'}`}>{area.snapshotStatus === 'Looking good' ? '✓' : area.snapshotStatus === 'Needs attention' ? '!' : '•'}</span><span><strong>{area.title}</strong><small>{area.snapshotStatus} · {area.detail}</small></span></div>)}</div><button className="customer-text-button" type="button" onClick={props.onWorkbench}>View detailed evidence <span aria-hidden="true">→</span></button></article></section>
        {scanError || runStatus === 'failed' ? <p className="customer-small customer-scan-note" role="status">Found Local could not complete every check. Captured evidence has been preserved. Acquisition failures remain neutral and do not count as business problems.</p> : null}
        <section className="customer-next"><div><p className="customer-eyebrow">{scanRunning ? 'Scan still running' : scanTerminal ? 'Scan complete' : 'Run the scan first'}</p><h3>{scanRunning ? `${primaryCandidates.length} provisional ${primaryCandidates.length === 1 ? 'finding is' : 'findings are'} visible from partial evidence` : scanTerminal ? `${primaryCandidates.length} potential ${primaryCandidates.length === 1 ? 'finding requires' : 'findings require'} operator review` : 'Review becomes available after the scan reaches a terminal state'}</h3><p>{scanRunning ? 'Partial evidence is preserved, but the overall scan has not completed.' : 'Review captured evidence, refine customer wording where needed, and approve or dismiss each primary candidate.'}</p></div><button className="customer-primary" type="button" disabled={!scanTerminal} onClick={() => setView('Review')}>{scanRunning ? 'Scan still running' : 'Continue to Review →'}</button></section>
      </> : null}
      {view === 'Review' ? <><section className="panel review-evidence-summary"><div className="panel-header"><p className="eyebrow">Evidence summary</p><h2>{primaryCandidates.length} primary candidates · {readiness.needsReview} neutral destinations</h2><p>Unavailable or ambiguous destinations remain neutral. Detailed acquisition and provider data is available as a drill-down.</p></div>{summary.cockpit.deeperReview.length ? <ul>{summary.cockpit.deeperReview.map((entry) => <li key={`${entry.queryId}-${entry.destination}`}><strong>{entry.displayDestination}</strong>: {entry.explanation}</li>)}</ul> : <p>No destination-level Needs Review items are currently recorded.</p>}<button className="secondary" type="button" onClick={props.onWorkbench}>View detailed evidence</button></section><section className="panel business-information-review"><div className="panel-header"><p className="eyebrow">Business information to confirm</p><h2>Identity and local context</h2><p>Missing or unreviewed facts guide operator follow-up. They do not automatically become customer findings.</p></div><div className="profile-completeness-list">{completeness.items.map((item) => <div key={item.id}><span className={`profile-fact-state profile-fact-${item.state}`}>{item.state.replace('_', ' ')}</span><strong>{item.label}</strong><span>{item.value || 'Not recorded'}</span></div>)}</div></section><CustomerFindingReview state={state} fixes={fixes} onReview={props.onReview} onSaveRefinement={props.onSaveRefinement} /><section className="customer-next review-completion"><div><p className="customer-eyebrow">Review completion</p><h3>{readiness.candidateFindings} primary · {readiness.approvedFindings} approved · {readiness.dismissedFindings} dismissed · {readiness.awaitingDisposition} awaiting review</h3><p>{readiness.needsReview} Needs Review destinations remain neutral and outside package scope.</p></div><button className="customer-primary" type="button" disabled={readiness.awaitingDisposition > 0} onClick={() => setView('Package')}>Continue to Package →</button></section></> : null}
      {view === 'Package' ? <><PackagePreparationPanel state={state} fixes={fixes} /><section className="customer-next"><div><p className="customer-eyebrow">Next step</p><h3>Review the exact customer handoff</h3><p>Customer Review uses this approved-only package projection and the effective customer wording.</p></div><button className="customer-primary" type="button" onClick={() => setView('Customer Review')}>Continue to Customer Review →</button></section></> : null}
      {view === 'Customer Review' ? <CustomerReviewPanel state={state} items={items} fixes={fixes} onReview={() => setView('Review')} /> : null}
      {view === 'Verification' ? <><div className="customer-empty"><span aria-hidden="true">✓</span><h3>No implementation has been recorded yet.</h3><p>Proposed or approved actions are not completed results. Verification begins only after authorized work is executed.</p></div><section className="customer-results-path" aria-label="Future verification process"><h3>What a verified result will show</h3><ol><li><strong>Before</strong><span>The original observation and its evidence.</span></li><li><strong>Change</strong><span>What was approved and implemented.</span></li><li><strong>After</strong><span>A repeat check against the agreed outcome.</span></li></ol></section><details className="customer-lifecycle"><summary>From an observation to a verified improvement</summary><p>These are process stages, not a claim that this workspace completed them.</p><p>{findingLifecycle.join(' → ')}</p></details></> : null}
    </main><footer className="customer-footer"><strong>Business Scanner Tool</strong><span>Business → Scan → Review → Package → Customer Review → Verification</span></footer>
  </div>
}
