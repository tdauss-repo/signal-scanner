import type {
  BusinessProfile,
  BusinessProfileState,
  PhoneContactRecord,
} from '../types/audit'

interface BusinessProfilePanelProps {
  profile: BusinessProfile
  profileState: BusinessProfileState
  onChange: (profile: BusinessProfile) => void
}

const updateField = (
  profile: BusinessProfile,
  onChange: (profile: BusinessProfile) => void,
  key: keyof BusinessProfile,
) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  onChange({ ...profile, [key]: event.target.value })

const emptyPhoneRecord = (): PhoneContactRecord => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `phone-${Date.now()}`,
  number: '', label: '', role: '', publicUse: '', notes: '',
  isPrimaryForListings: false, isValidPublicContact: true,
})

const statusLabel = (status: string | undefined) =>
  status ? status.replace(/_/g, ' ') : 'not recorded'

export function BusinessProfilePanel({ profile, profileState, onChange }: BusinessProfilePanelProps) {
  const updatePhone = (id: string, next: PhoneContactRecord) =>
    onChange({ ...profile, phoneNumbers: profile.phoneNumbers.map((record) => record.id === id ? next : record) })

  return (
    <section className="panel business-profile-panel">
      <div className="panel-header">
        <p className="eyebrow">Reviewed data</p>
        <h2>Business Profile</h2>
        <p>Keep research, review, and confirmed details here. Existing scan consumers continue to use the compatible profile projection.</p>
      </div>
      <div className="profile-fact-summary">
        <span>{Object.keys(profileState.values).length} profile facts tracked</span>
        <span>Sources and confidence are retained with each saved scan.</span>
      </div>
      <div className="form-grid">
        <label>Primary business category<input value={profile.primaryCategory} onChange={updateField(profile, onChange, 'primaryCategory')} /></label>
        <label>Secondary categories<textarea value={profile.secondaryCategories} onChange={updateField(profile, onChange, 'secondaryCategories')} /></label>
        <label>Industry tags/services<textarea value={profile.industryTags} onChange={updateField(profile, onChange, 'industryTags')} /></label>
        <label>Local market/city<input value={profile.localMarket} onChange={updateField(profile, onChange, 'localMarket')} /></label>
        <label>Location / service area<input value={profile.serviceArea} onChange={updateField(profile, onChange, 'serviceArea')} /></label>
        <label>Primary services<textarea value={profile.primaryServices} onChange={updateField(profile, onChange, 'primaryServices')} /></label>
        <label>Target search location<input value={profile.targetLocation} onChange={updateField(profile, onChange, 'targetLocation')} /></label>
        <label>Target search phrases, one per line<textarea className="keyword-input" value={profile.keywords} onChange={updateField(profile, onChange, 'keywords')} /></label>
        <label className="full-width-label">Known existing directory/listing URLs<textarea value={profile.existingDirectoryUrls} onChange={updateField(profile, onChange, 'existingDirectoryUrls')} /></label>
        <label className="full-width-label">Contact structure note<textarea value={profile.contactStructureNote} onChange={updateField(profile, onChange, 'contactStructureNote')} /></label>
      </div>
      <div className="contact-records">
        <div className="contact-records-header"><strong>Alternate phone/contact numbers</strong><button type="button" className="secondary" onClick={() => onChange({ ...profile, phoneNumbers: [...profile.phoneNumbers, emptyPhoneRecord()] })}>Add number</button></div>
        {profile.phoneNumbers.map((record) => (
          <div className="contact-record" key={record.id}>
            <label>Number<input value={record.number} onChange={(event) => updatePhone(record.id, { ...record, number: event.target.value })} /></label>
            <label>Label<input value={record.label} onChange={(event) => updatePhone(record.id, { ...record, label: event.target.value })} /></label>
            <label>Role<input value={record.role} onChange={(event) => updatePhone(record.id, { ...record, role: event.target.value })} /></label>
            <label>Public use<input value={record.publicUse} onChange={(event) => updatePhone(record.id, { ...record, publicUse: event.target.value })} /></label>
            <label>Notes<textarea value={record.notes} onChange={(event) => updatePhone(record.id, { ...record, notes: event.target.value })} /></label>
            <p className="small-copy">Profile status: {statusLabel(profileState.values.phoneNumbers?.status)}</p>
            <button type="button" className="ghost" onClick={() => onChange({ ...profile, phoneNumbers: profile.phoneNumbers.filter((phone) => phone.id !== record.id) })}>Remove number</button>
          </div>
        ))}
      </div>
    </section>
  )
}
