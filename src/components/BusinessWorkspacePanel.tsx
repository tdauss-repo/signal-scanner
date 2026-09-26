import { useState } from 'react'
import type { AuditState, BusinessProfile, SavedScanRecord } from '../types/audit'
import { profileCompleteness, profileProjectionWarnings } from '../utils/profileCompleteness'

interface Props {
  state: AuditState
  currentScanId: string
  dirty: boolean
  scans: SavedScanRecord[]
  onProfileChange: (profile: BusinessProfile) => void
  onSaveCurrent: () => void
  saveNotice: { kind: 'success' | 'error'; text: string } | null
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

const updateField = (
  profile: BusinessProfile,
  onChange: (profile: BusinessProfile) => void,
  key: keyof BusinessProfile,
) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  onChange({ ...profile, [key]: event.target.value })
}

const formatDate = (value: string) => value ? new Date(value).toLocaleString() : 'Not saved yet'

export function BusinessWorkspacePanel(props: Props) {
  const [changingBusiness, setChangingBusiness] = useState(false)
  const completeness = profileCompleteness(props.state)
  const profile = completeness.profile
  const identityWarnings = profileProjectionWarnings(props.state)
  const workspaceState = props.currentScanId ? props.dirty ? 'Unsaved changes' : 'Saved' : 'New workspace'
  return <div className="business-workspace-grid">
    <section className="business-workspace-switcher" aria-label="Current business workspace">
      <div><span>Workspace</span><strong>{profile.businessName || 'New business'}</strong><small>{workspaceState}</small></div>
      <button className="secondary" type="button" aria-expanded={changingBusiness} onClick={() => setChangingBusiness((open) => !open)}>Change business</button>
    </section>

    {changingBusiness ? <section className="panel business-workspace-manager">
      <div className="workspace-manager-actions"><button type="button" onClick={() => { props.onStartBlank(); setChangingBusiness(false) }}>New Business</button><button className="secondary" type="button" onClick={props.onSaveAsNew}>Save as new workspace</button><label className="import-scan-button">Import Full Scan JSON<input accept="application/json,.json" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.currentTarget.value = '' }} /></label></div>
      <div className="workspace-compact-list">{props.scans.length ? props.scans.map((scan) => <article className={scan.id === props.currentScanId ? 'workspace-compact-active' : ''} key={scan.id}><div><strong>{scan.businessName || 'Untitled business'}</strong><span>{scan.website || 'No website'} · Updated {formatDate(scan.updatedAt)}</span></div><div><button type="button" onClick={() => { props.onLoad(scan.id); setChangingBusiness(false) }}>{scan.id === props.currentScanId ? 'Use current' : 'Open'}</button><button className="secondary" type="button" onClick={() => props.onDuplicate(scan.id)}>Duplicate</button><button className="secondary" type="button" onClick={() => props.onRename(scan.id)}>Rename</button><button className="secondary" type="button" onClick={() => props.onExport(scan.id)}>Export Full Scan JSON</button><button className="ghost" type="button" onClick={() => props.onDelete(scan.id)}>Delete</button></div></article>) : <p>No saved business workspaces yet.</p>}</div>
    </section> : null}

    {identityWarnings.length ? <section className="customer-review-warnings business-identity-warning"><strong>Confirm the current business identity</strong><ul>{identityWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><button type="button" onClick={() => props.onProfileChange(profile)}>Confirm reviewed facts</button></section> : null}

    <section className="panel business-unified-form">
      <div className="business-form-heading"><div><p className="eyebrow">Business</p><h1>{profile.businessName ? 'Business details' : 'Tell Found Local what you know about this business.'}</h1><p>Enter known facts once. Reviewed values remain the source for scanning, interpretation, package preparation, and customer output.</p></div><span className={`profile-status profile-status-${completeness.readyToScan ? 'ready' : 'review'}`}>{completeness.readyToScan ? 'Ready to scan' : 'Needs basic business information'}</span></div>
      <div className="business-primary-fields form-grid">
        <label>Business name<input autoFocus={!profile.businessName} value={profile.businessName} onChange={updateField(profile, props.onProfileChange, 'businessName')} /></label>
        <label>Website<input value={profile.website} onChange={updateField(profile, props.onProfileChange, 'website')} /></label>
        <label className="full-width-label">Street address<input value={profile.streetAddress} onChange={updateField(profile, props.onProfileChange, 'streetAddress')} /></label>
        <label>City<input value={profile.city} onChange={updateField(profile, props.onProfileChange, 'city')} /></label>
        <label>State<input value={profile.state} onChange={updateField(profile, props.onProfileChange, 'state')} /></label>
        <label>ZIP<input value={profile.zip} onChange={updateField(profile, props.onProfileChange, 'zip')} /></label>
        <label>Phone<input value={profile.phone} onChange={updateField(profile, props.onProfileChange, 'phone')} /></label>
        <label className="full-width-label">Primary category / business type<input value={profile.primaryCategory} onChange={updateField(profile, props.onProfileChange, 'primaryCategory')} /></label>
      </div>
      {!profile.primaryCategory.trim() ? <p className="business-required-message" role="status">Primary category is required before scanning so Found Local can interpret results for the correct type of local business.</p> : null}
      <details className="business-secondary-details"><summary>Additional business context</summary><p>These reviewed details help Found Local interpret local visibility in the right business context.</p><div className="form-grid">
        <label>Secondary categories<textarea value={profile.secondaryCategories} onChange={updateField(profile, props.onProfileChange, 'secondaryCategories')} /></label>
        <label>Programs / services<textarea value={profile.primaryServices} onChange={updateField(profile, props.onProfileChange, 'primaryServices')} /></label>
        <label>Local market<input value={profile.localMarket} onChange={updateField(profile, props.onProfileChange, 'localMarket')} /></label>
        <label>Service area / customer market<input value={profile.serviceArea} onChange={updateField(profile, props.onProfileChange, 'serviceArea')} /></label>
        <label>Industry tags<textarea value={profile.industryTags} onChange={updateField(profile, props.onProfileChange, 'industryTags')} /></label>
        <label>Target search location<input value={profile.targetLocation} onChange={updateField(profile, props.onProfileChange, 'targetLocation')} /></label>
        <label className="full-width-label">Target search phrases<textarea value={profile.keywords} onChange={updateField(profile, props.onProfileChange, 'keywords')} /></label>
        <label className="full-width-label">Known listing URLs<textarea value={profile.existingDirectoryUrls} onChange={updateField(profile, props.onProfileChange, 'existingDirectoryUrls')} /></label>
        <label className="full-width-label">Internal operator note<textarea value={profile.operatorNote} onChange={updateField(profile, props.onProfileChange, 'operatorNote')} /></label>
      </div></details>
      <div className="business-form-actions"><button type="button" onClick={props.onSaveCurrent}>Save Business</button><button className="customer-primary" type="button" disabled={!completeness.readyToScan} onClick={props.onGoScan}>Continue to Scan →</button></div>
      {props.saveNotice ? <p className={`business-save-notice business-save-notice-${props.saveNotice.kind}`} role="status">{props.saveNotice.text}</p> : null}
    </section>
  </div>
}
