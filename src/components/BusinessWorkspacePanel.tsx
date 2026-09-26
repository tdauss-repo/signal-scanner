import type { AuditState, BusinessProfile, SavedScanRecord } from '../types/audit'
import { profileCompleteness } from '../utils/profileCompleteness'
import { BusinessProfilePanel } from './BusinessProfilePanel'
import { IntakeForm } from './IntakeForm'
import { SavedScansPanel } from './SavedScansPanel'

interface Props {
  state: AuditState
  currentScanId: string
  dirty: boolean
  scans: SavedScanRecord[]
  onProfileChange: (profile: BusinessProfile) => void
  onResearch: () => void
  onSaveCurrent: () => void
  onSaveAsNew: () => void
  onLoad: (id: string) => void
  onDuplicate: (id: string) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onImport: (file: File) => void
  onStartBlank: () => void
  onGoScan: () => void
}

export function BusinessWorkspacePanel(props: Props) {
  const completeness = profileCompleteness(props.state)
  const profile = completeness.profile
  const location = [profile.streetAddress, [profile.city, profile.state, profile.zip].filter(Boolean).join(' ')].filter(Boolean)
  const reviewed = completeness.items.filter((item) => item.state === 'reviewed').length
  return <div className="business-workspace-grid">
    <section className="panel business-workspace-summary">
      <div><p className="eyebrow">Business</p><h2>{profile.businessName || 'New business workspace'}</h2><p>{profile.primaryCategory || 'Business type not reviewed'}</p>{location.map((line) => <p key={line}>{line}</p>)}<p>{profile.phone || 'Phone not recorded'}</p><p>{profile.website || 'Website not recorded'}</p></div>
      <div className="business-workspace-actions"><span className={`profile-status profile-status-${completeness.missing.length ? 'review' : 'ready'}`}>{completeness.missing.length ? 'Needs attention' : 'Reviewed'}</span><button type="button" onClick={props.onSaveCurrent}>Save workspace</button><button className="secondary" type="button" onClick={props.onGoScan} disabled={!completeness.readyToScan}>Continue to Scan</button></div>
    </section>
    <section className="panel profile-completeness-panel">
      <div className="panel-header"><p className="eyebrow">Profile completeness</p><h2>{reviewed} reviewed · {completeness.missing.length} missing · {completeness.needsReview.length} need review</h2><p>Missing facts guide operator research. They are not customer findings.</p></div>
      <div className="profile-completeness-list">{completeness.items.map((item) => <div key={item.id}><span className={`profile-fact-state profile-fact-${item.state}`}>{item.state.replace('_', ' ')}</span><strong>{item.label}</strong><span>{item.value || 'Not recorded'}</span></div>)}</div>
    </section>
    <SavedScansPanel currentScanId={props.currentScanId} dirty={props.dirty} scans={props.scans} onSaveCurrent={props.onSaveCurrent} onSaveAsNew={props.onSaveAsNew} onLoad={props.onLoad} onDuplicate={props.onDuplicate} onRename={props.onRename} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} onStartBlank={props.onStartBlank} />
    <IntakeForm profile={profile} onChange={props.onProfileChange} onResearch={props.onResearch} />
    <BusinessProfilePanel profile={profile} profileState={props.state.businessProfile} onChange={props.onProfileChange} />
  </div>
}
