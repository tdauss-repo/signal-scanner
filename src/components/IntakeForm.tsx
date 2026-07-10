import type { BusinessProfile, PhoneContactRecord } from '../types/audit'

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

const emptyPhoneRecord = (): PhoneContactRecord => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `phone-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  number: '',
  label: '',
  role: '',
  publicUse: '',
  notes: '',
  isPrimaryForListings: false,
  isValidPublicContact: true,
})

const updatePhoneRecord = (
  profile: BusinessProfile,
  onChange: (profile: BusinessProfile) => void,
  id: string,
  nextRecord: PhoneContactRecord,
) => {
  onChange({
    ...profile,
    phoneNumbers: (profile.phoneNumbers ?? []).map((record) =>
      record.id === id ? nextRecord : record,
    ),
  })
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
        <h2>Pre-call profile</h2>
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
          Primary business category
          <input
            value={profile.primaryCategory}
            onChange={updateField(profile, onChange, 'primaryCategory')}
            placeholder="Example: Nail Salon, Montessori School, Plumbing Contractor"
          />
        </label>
        <label>
          Secondary categories
          <textarea
            value={profile.secondaryCategories}
            onChange={updateField(profile, onChange, 'secondaryCategories')}
            placeholder="Optional: additional categories, one per line or comma-separated"
          />
        </label>
        <label>
          Industry tags/services
          <textarea
            value={profile.industryTags}
            onChange={updateField(profile, onChange, 'industryTags')}
            placeholder="Example: manicures, pedicures, nail art, spa"
          />
        </label>
        <label>
          Local market/city
          <input
            value={profile.localMarket}
            onChange={updateField(profile, onChange, 'localMarket')}
            placeholder="Example: Sylvania, OH"
          />
        </label>
        <label>
          Known existing directory/listing URLs
          <textarea
            value={profile.existingDirectoryUrls}
            onChange={updateField(profile, onChange, 'existingDirectoryUrls')}
            placeholder="Optional: paste known directory/profile URLs, one per line"
          />
        </label>
        <label>
          Contact structure note
          <textarea
            value={profile.contactStructureNote ?? ''}
            onChange={updateField(profile, onChange, 'contactStructureNote')}
            placeholder="Example: This business uses more than one valid contact number. The main listing number is used for general inquiries, while owner, booking, service, or after-hours numbers may also appear on the website. Label each number clearly so customers, listings, search engines, and AI tools understand which contact path to use."
          />
        </label>
        <div className="contact-records">
          <div className="contact-records-header">
            <strong>Valid phone/contact numbers</strong>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange({
                  ...profile,
                  phoneNumbers: [
                    ...(profile.phoneNumbers ?? []),
                    emptyPhoneRecord(),
                  ],
                })
              }
            >
              Add number
            </button>
          </div>
          {(profile.phoneNumbers ?? []).map((record) => (
            <div className="contact-record" key={record.id}>
              <label>
                Number
                <input
                  value={record.number}
                  placeholder="Example: 555.123.4567"
                  onChange={(event) =>
                    updatePhoneRecord(profile, onChange, record.id, {
                      ...record,
                      number: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Label
                <input
                  value={record.label}
                  placeholder="Example: Main line, Owner mobile, Booking line, Emergency line"
                  onChange={(event) =>
                    updatePhoneRecord(profile, onChange, record.id, {
                      ...record,
                      label: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Role
                <input
                  value={record.role}
                  placeholder="Example: Owner, Office, Sales, Service, After-hours"
                  onChange={(event) =>
                    updatePhoneRecord(profile, onChange, record.id, {
                      ...record,
                      role: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Public use
                <input
                  value={record.publicUse}
                  placeholder="Example: New inquiries, existing customers, booking requests, emergency calls"
                  onChange={(event) =>
                    updatePhoneRecord(profile, onChange, record.id, {
                      ...record,
                      publicUse: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Notes
                <textarea
                  value={record.notes}
                  placeholder="Example: Valid public contact number. Use this number where customers are expected to call or text."
                  onChange={(event) =>
                    updatePhoneRecord(profile, onChange, record.id, {
                      ...record,
                      notes: event.target.value,
                    })
                  }
                />
              </label>
              <div className="checkbox-row">
                <label>
                  <input
                    checked={record.isValidPublicContact}
                    type="checkbox"
                    onChange={(event) =>
                      updatePhoneRecord(profile, onChange, record.id, {
                        ...record,
                        isValidPublicContact: event.target.checked,
                      })
                    }
                  />
                  Valid public contact
                </label>
                <label>
                  <input
                    checked={Boolean(record.isPrimaryForListings)}
                    type="checkbox"
                    onChange={(event) =>
                      updatePhoneRecord(profile, onChange, record.id, {
                        ...record,
                        isPrimaryForListings: event.target.checked,
                      })
                    }
                  />
                  Primary for listings
                </label>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  onChange({
                    ...profile,
                    phoneNumbers: (profile.phoneNumbers ?? []).filter(
                      (phoneRecord) => phoneRecord.id !== record.id,
                    ),
                  })
                }
              >
                Remove number
              </button>
            </div>
          ))}
        </div>
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
        verification workflows for private sales preparation. It does not scrape
        maps, listings, search results, social platforms, or AI systems.
      </p>
    </aside>
  )
}
