import type { BusinessProfile } from '../types/audit'

interface IntakeFormProps {
  profile: BusinessProfile
  onChange: (profile: BusinessProfile) => void
  onResearch: () => void
}

const updateField = (
  profile: BusinessProfile,
  onChange: (profile: BusinessProfile) => void,
  key: keyof BusinessProfile,
) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  onChange({ ...profile, [key]: event.target.value })
}

export function IntakeForm({ profile, onChange, onResearch }: IntakeFormProps) {
  return (
    <section className="panel intake-panel">
      <div className="panel-header">
        <p className="eyebrow">Step 1</p>
        <h2>Business Seed</h2>
        <p>
          Enter only the facts you know. Research and reviewed business details
          live in Business Profile.
          {' '}For a different business, use New business scan in Saved Scans;
          editing this seed keeps this workspace’s existing evidence.
        </p>
      </div>
      <div className="form-grid">
        <label>
          Business name
          <input value={profile.businessName} onChange={updateField(profile, onChange, 'businessName')} />
        </label>
        <label>
          Website
          <input value={profile.website} onChange={updateField(profile, onChange, 'website')} />
        </label>
        <label>
          Street address
          <input value={profile.streetAddress} onChange={updateField(profile, onChange, 'streetAddress')} />
        </label>
        <label>
          City
          <input value={profile.city} onChange={updateField(profile, onChange, 'city')} />
        </label>
        <label>
          State
          <input value={profile.state} onChange={updateField(profile, onChange, 'state')} />
        </label>
        <label>
          ZIP
          <input value={profile.zip} onChange={updateField(profile, onChange, 'zip')} />
        </label>
        <label>
          Primary phone
          <input value={profile.phone} onChange={updateField(profile, onChange, 'phone')} />
        </label>
        <label>
          Known listing URL <span className="optional-label">optional</span>
          <input value={profile.knownListingUrl} onChange={updateField(profile, onChange, 'knownListingUrl')} />
        </label>
        <label className="full-width-label">
          Operator note <span className="optional-label">optional</span>
          <textarea value={profile.operatorNote} onChange={updateField(profile, onChange, 'operatorNote')} />
        </label>
      </div>
      <div className="button-row">
        <button type="button" onClick={onResearch}>
          Research business
        </button>
      </div>
      <p className="small-copy">
        Research runs the existing authorized website scan. It does not create
        or overwrite business-profile facts.
      </p>
    </section>
  )
}
