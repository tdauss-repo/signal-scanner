import type { BusinessProfile } from '../types/audit'

interface IntakeFormProps {
  profile: BusinessProfile
  onChange: (profile: BusinessProfile) => void
  onReset: () => void
  onPrint: () => void
  onExport: () => void
}

const updateField =
  (
    profile: BusinessProfile,
    onChange: (profile: BusinessProfile) => void,
    key: keyof BusinessProfile,
  ) =>
  (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange({ ...profile, [key]: event.target.value })
  }

export function IntakeForm({
  profile,
  onChange,
  onReset,
  onPrint,
  onExport,
}: IntakeFormProps) {
  return (
    <aside className="panel intake-panel">
      <div className="panel-header">
        <p className="eyebrow">Business Intake</p>
        <h2>Scan setup</h2>
      </div>
      <div className="form-grid">
        <label>
          Business name
          <input
            value={profile.businessName}
            onChange={updateField(profile, onChange, 'businessName')}
          />
        </label>
        <label>
          Website
          <input
            value={profile.website}
            onChange={updateField(profile, onChange, 'website')}
          />
        </label>
        <label>
          Phone
          <input
            value={profile.phone}
            onChange={updateField(profile, onChange, 'phone')}
          />
        </label>
        <label>
          Location / service area
          <input
            value={profile.serviceArea}
            onChange={updateField(profile, onChange, 'serviceArea')}
          />
        </label>
        <label>
          Primary services
          <textarea
            value={profile.primaryServices}
            onChange={updateField(profile, onChange, 'primaryServices')}
          />
        </label>
        <label>
          Target search location
          <input
            value={profile.targetLocation}
            onChange={updateField(profile, onChange, 'targetLocation')}
          />
        </label>
        <label>
          Target search phrases, one per line
          <textarea
            className="keyword-input"
            value={profile.keywords}
            onChange={updateField(profile, onChange, 'keywords')}
          />
        </label>
      </div>
      <div className="button-row">
        <button type="button" onClick={onPrint}>
          Print report
        </button>
        <button type="button" className="secondary" onClick={onExport}>
          Export JSON
        </button>
        <button type="button" className="ghost" onClick={onReset}>
          Reset checks
        </button>
      </div>
      <p className="small-copy">
        This MVP combines authorized website automation with guided
        verification workflows. It does not scrape maps, listings, search
        results, social platforms, or AI systems.
      </p>
    </aside>
  )
}
