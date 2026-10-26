import { useState } from 'react'
import type {
  AuditState,
  CustomerLocalPresencePlatform,
  FixItem,
} from '../types/audit'
import {
  customerLocalPresenceCandidate,
  type CustomerLocalPresencePublicationInput,
} from '../utils/customerLocalPresence'
import {
  localPresencePublicationDraft,
  localPresencePublicationHasUnsavedChanges,
  localPresencePublicationNeedsReconfirmation,
  summarizeLocalPresencePublication,
} from '../utils/localPresencePublicationUi'
import { derivePackagePreparation } from '../utils/packagePreparation'

interface Props {
  state: AuditState
  fixes: FixItem[]
  onSave: (input: CustomerLocalPresencePublicationInput) => void
}

type ListingSelection = CustomerLocalPresencePublicationInput['listings']

const verificationDate = (value: string | undefined) => {
  if (!value || Number.isNaN(Date.parse(value))) return ''
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function LocalPresencePublicationPanel({ state, fixes, onSave }: Props) {
  const candidate = customerLocalPresenceCandidate(state)
  const publication = state.customerLocalPresencePublication
  const preparation = derivePackagePreparation(state, fixes)
  const approvedFindings = preparation.approvedFindings
  const savedDraft = localPresencePublicationDraft(publication)
  const [includeAddress, setIncludeAddress] = useState(savedDraft.includeAddress)
  const [listingSelections, setListingSelections] = useState<ListingSelection>(savedDraft.listings)
  const [relatedFindingIds, setRelatedFindingIds] = useState<string[]>(savedDraft.relatedFindingIds)
  const [status, setStatus] = useState('')

  if (!candidate) return <section className="panel local-presence-publication" aria-label="Local Presence publication">
    <div className="panel-header"><p className="eyebrow">Local Presence</p><h2>Customer publication</h2><p>Add an operator-reviewed business name, street address, city, and state before approving location details for Customer Review.</p></div>
    <div className="local-presence-ineligible" role="status"><strong>Location details are not eligible yet.</strong><span>Complete and review the required Business Profile fields before publishing an address or platform listing.</span></div>
  </section>

  const draft = { includeAddress, listings: listingSelections, relatedFindingIds }
  const unsaved = localPresencePublicationHasUnsavedChanges(publication, draft)
  const needsReconfirmation = localPresencePublicationNeedsReconfirmation(state, candidate)
  const summary = summarizeLocalPresencePublication(candidate, draft, approvedFindings.map((fix) => fix.id))
  const packageByFinding = new Map(preparation.items.map((item) => [item.findingId, item.packageAssignment]))

  const updateAddress = (checked: boolean) => {
    setIncludeAddress(checked)
    setStatus('')
  }
  const updateListing = (
    platform: CustomerLocalPresencePlatform,
    change: Partial<{ include: boolean; includeProfileUrl: boolean }>,
  ) => {
    setListingSelections((currentSelections) => ({
      ...currentSelections,
      [platform]: { include: false, includeProfileUrl: false, ...currentSelections[platform], ...change },
    }))
    setStatus('')
  }
  const toggleFinding = (id: string, checked: boolean) => {
    setRelatedFindingIds((currentIds) => checked
      ? [...new Set([...currentIds, id])]
      : currentIds.filter((currentId) => currentId !== id))
    setStatus('')
  }
  const save = () => {
    const normalizedListings = Object.fromEntries(candidate.listings.map((listing) => {
      const selection = listingSelections[listing.platform]
      return [listing.platform, {
        include: selection?.include === true,
        includeProfileUrl: Boolean(selection?.include && selection.includeProfileUrl && listing.profileUrl),
      }]
    })) as ListingSelection
    const input = { includeAddress, listings: normalizedListings, relatedFindingIds }
    try {
      onSave(input)
      setListingSelections(normalizedListings)
      setStatus(includeAddress || Object.values(normalizedListings).some((selection) => selection?.include)
        ? 'Local Presence publication decision saved.'
        : 'Local Presence was removed from Customer Review output.')
    } catch {
      setStatus('Local Presence publication could not be saved. Review the selections and try again.')
    }
  }

  return <section className="panel local-presence-publication" aria-label="Local Presence publication">
    <div className="panel-header"><p className="eyebrow">Local Presence</p><h2>Approve customer-visible location details</h2><p>Technical verification makes these details eligible for review. Nothing below enters Customer Review until this separate publication decision is saved.</p></div>
    {needsReconfirmation ? <p className="local-presence-reconciliation" role="status"><strong>Reconfirmation required.</strong> Reviewed location or listing evidence changed after the previous publication decision. Previous decisions remain omitted from Customer Review until the eligible selections below are saved again.</p> : null}

    <div className="local-presence-layout">
      <fieldset className="local-presence-group local-presence-location-group">
        <legend>Business location</legend>
        <article className="local-presence-location-card">
          <div className="local-presence-card-heading">
            <div><p className="eyebrow">Reviewed business</p><h3>{candidate.label}</h3></div>
            <span className="local-presence-status local-presence-status-reviewed">Reviewed</span>
          </div>
          <address>{candidate.address.display}</address>
          <p className="local-presence-verification">{candidate.address.verification.source}{verificationDate(candidate.address.verification.reviewedAt) ? ` · ${verificationDate(candidate.address.verification.reviewedAt)}` : ''}</p>
          <label className="local-presence-checkbox"><input type="checkbox" checked={includeAddress} onChange={(event) => updateAddress(event.target.checked)} /><span>Include reviewed address in customer review.</span></label>
        </article>
      </fieldset>

      <fieldset className="local-presence-group local-presence-listings-group">
        <legend>Verified platform listings</legend>
        {candidate.listings.length ? <div className="local-presence-listing-grid">{candidate.listings.map((listing) => {
          const selected = listingSelections[listing.platform]
          const savedListing = publication?.listings[listing.platform]
          const listingNeedsReconfirmation = Boolean(savedListing && savedListing.evidenceKey !== listing.evidenceKey)
          return <article className="local-presence-listing" key={listing.platform}>
            <div className="local-presence-card-heading">
              <h3>{listing.platform}</h3>
              <span className={`local-presence-status ${listing.status === 'verified_recent' ? 'local-presence-status-recent' : 'local-presence-status-verified'}`}>{listing.status === 'verified_recent' ? 'Verified from recent evidence' : 'Verified'}</span>
            </div>
            <p className="local-presence-verification">{listing.verification.source}{verificationDate(listing.verification.verifiedAt) ? ` · ${verificationDate(listing.verification.verifiedAt)}` : ''}</p>
            {listingNeedsReconfirmation ? <p className="local-presence-listing-reconfirmation">Listing evidence changed — reconfirm publication.</p> : null}
            <div className="local-presence-listing-controls">
              <label className="local-presence-checkbox"><input type="checkbox" checked={selected?.include ?? false} onChange={(event) => updateListing(listing.platform, { include: event.target.checked })} /><span>Include platform presence</span></label>
              {listing.profileUrl ? <>
                <label className="local-presence-checkbox local-presence-profile-choice"><input type="checkbox" checked={selected?.includeProfileUrl ?? false} onChange={(event) => updateListing(listing.platform, { includeProfileUrl: event.target.checked })} /><span>Include verified profile link</span></label>
                {selected?.includeProfileUrl && !selected.include ? <p className="local-presence-dependent-note">Select platform presence before the profile link can be published.</p> : null}
                <details className="local-presence-url-inspector"><summary>Inspect URL</summary><div><code>{listing.profileUrl}</code><a href={listing.profileUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${listing.platform} profile in a new tab`}>Open profile in new tab ↗</a></div></details>
              </> : <p className="local-presence-unavailable">No eligible canonical profile URL is available.</p>}
            </div>
          </article>
        })}</div> : <p className="local-presence-unavailable">No currently verified platform listing is eligible for publication.</p>}
      </fieldset>

      <fieldset className="local-presence-group local-presence-findings-group">
        <legend>Related approved findings</legend>
        <p className="customer-small">Link only the approved opportunities that apply to this location. No relationship is generated from listing evidence.</p>
        {approvedFindings.length ? <div className="local-presence-finding-grid">{approvedFindings.map((fix) => {
          const packageLabel = packageByFinding.get(fix.id)
          return <label className="local-presence-finding-choice" key={fix.id}><input type="checkbox" checked={relatedFindingIds.includes(fix.id)} onChange={(event) => toggleFinding(fix.id, event.target.checked)} /><span><strong>{fix.issue}</strong>{packageLabel && packageLabel !== 'None' ? <small>{packageLabel}</small> : null}</span></label>
        })}</div> : <p className="local-presence-unavailable">No approved findings are available to link.</p>}
      </fieldset>
    </div>

    <section className="local-presence-summary" aria-label="Local Presence publication summary">
      <div className="local-presence-summary-heading"><div><p className="eyebrow">Publication summary</p><h3>Selected for Customer Review</h3></div><span className={`local-presence-save-state ${unsaved ? 'local-presence-save-state-unsaved' : needsReconfirmation ? 'local-presence-save-state-reconfirm' : publication ? 'local-presence-save-state-saved' : 'local-presence-save-state-empty'}`}>{unsaved ? 'Unsaved changes' : needsReconfirmation ? 'Reconfirmation required' : publication ? 'Matches saved decision' : 'No saved decision'}</span></div>
      <dl><div><dt>Reviewed addresses</dt><dd>{summary.reviewedAddresses}</dd></div><div><dt>Platform presences</dt><dd>{summary.platformPresences}</dd></div><div><dt>Profile links</dt><dd>{summary.profileLinks}</dd></div><div><dt>Related findings</dt><dd>{summary.relatedFindings}</dd></div></dl>
      <p>Profile links count only when both the platform presence and its verified link are selected.</p>
    </section>
    <div className="customer-readiness-actions"><button className="customer-primary" type="button" onClick={save}>{needsReconfirmation ? 'Reconfirm Local Presence publication' : includeAddress || Object.values(listingSelections).some((selection) => selection?.include) ? 'Save Local Presence publication' : 'Keep Local Presence out of export'}</button></div>
    {status ? <p className="local-presence-save-message" role="status">{status}</p> : null}
  </section>
}
