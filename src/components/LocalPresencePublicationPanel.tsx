import { useState } from 'react'
import type { AuditState, CustomerLocalPresencePlatform, FixItem } from '../types/audit'
import {
  customerLocalPresenceCandidate,
  customerLocalPresencePublicationIsCurrent,
  type CustomerLocalPresencePublicationInput,
} from '../utils/customerLocalPresence'
import { derivePackagePreparation } from '../utils/packagePreparation'

interface Props {
  state: AuditState
  fixes: FixItem[]
  onSave: (input: CustomerLocalPresencePublicationInput) => void
}

type ListingSelection = CustomerLocalPresencePublicationInput['listings']

export function LocalPresencePublicationPanel({ state, fixes, onSave }: Props) {
  const candidate = customerLocalPresenceCandidate(state)
  const publication = state.customerLocalPresencePublication
  const current = customerLocalPresencePublicationIsCurrent(state, candidate)
  const approvedFindings = derivePackagePreparation(state, fixes).approvedFindings
  const [includeAddress, setIncludeAddress] = useState(publication?.includeAddress ?? false)
  const [listingSelections, setListingSelections] = useState<ListingSelection>(() => Object.fromEntries(
    Object.entries(publication?.listings || {}).map(([platform, decision]) => [platform, {
      include: decision?.status === 'approved',
      includeProfileUrl: decision?.includeProfileUrl === true,
    }]),
  ))
  const [relatedFindingIds, setRelatedFindingIds] = useState<string[]>(publication?.relatedFindingIds ?? [])
  const [status, setStatus] = useState('')

  if (!candidate) return <section className="panel local-presence-publication" aria-label="Local Presence publication">
    <div className="panel-header"><p className="eyebrow">Local Presence</p><h2>Customer publication</h2><p>Add an operator-reviewed business name, street address, city, and state before approving location details for Customer Review.</p></div>
  </section>

  const updateListing = (platform: CustomerLocalPresencePlatform, change: Partial<{ include: boolean; includeProfileUrl: boolean }>) => {
    setListingSelections((currentSelections) => ({
      ...currentSelections,
      [platform]: { include: false, includeProfileUrl: false, ...currentSelections[platform], ...change },
    }))
  }
  const toggleFinding = (id: string, checked: boolean) => {
    setRelatedFindingIds((currentIds) => checked
      ? [...new Set([...currentIds, id])]
      : currentIds.filter((currentId) => currentId !== id))
  }
  const save = () => {
    onSave({ includeAddress, listings: listingSelections, relatedFindingIds })
    setStatus(includeAddress || Object.values(listingSelections).some((selection) => selection?.include)
      ? 'Local Presence publication decision saved.'
      : 'Local Presence was removed from Customer Review output.')
  }

  return <section className="panel local-presence-publication" aria-label="Local Presence publication">
    <div className="panel-header"><p className="eyebrow">Local Presence</p><h2>Approve customer-visible location details</h2><p>Technical verification makes these details eligible for review. Nothing below enters Customer Review until this separate publication decision is saved.</p></div>
    {publication && !current ? <p className="local-presence-reconciliation" role="status"><strong>Reconfirmation required.</strong> The reviewed location identity changed after the previous publication decision. Prior selections remain visible here but are omitted from Customer Review until saved again.</p> : null}
    <fieldset className="local-presence-group">
      <legend>Primary location</legend>
      <label className="local-presence-choice"><input type="checkbox" checked={includeAddress} onChange={(event) => setIncludeAddress(event.target.checked)} /><span><strong>Publish reviewed address</strong><small>{candidate.address.display}</small><small>{candidate.address.verification.source}{candidate.address.verification.reviewedAt ? ` · ${new Date(candidate.address.verification.reviewedAt).toLocaleString()}` : ''}</small></span></label>
    </fieldset>
    <fieldset className="local-presence-group">
      <legend>Verified platform listings</legend>
      {candidate.listings.length ? candidate.listings.map((listing) => {
        const selected = listingSelections[listing.platform]
        return <div className="local-presence-listing" key={listing.platform}>
          <label className="local-presence-choice"><input type="checkbox" checked={selected?.include ?? false} onChange={(event) => updateListing(listing.platform, { include: event.target.checked, includeProfileUrl: event.target.checked ? selected?.includeProfileUrl ?? false : false })} /><span><strong>Publish {listing.platform} presence</strong><small>{listing.status === 'verified_recent' ? 'Verified from recent evidence' : 'Verified'} · {listing.verification.source}</small></span></label>
          {listing.profileUrl ? <label className="local-presence-url-choice"><input type="checkbox" disabled={!selected?.include} checked={Boolean(selected?.include && selected.includeProfileUrl)} onChange={(event) => updateListing(listing.platform, { includeProfileUrl: event.target.checked })} /> Include approved profile URL <span>{listing.profileUrl}</span></label> : <p className="customer-small">No safe canonical profile URL is available for publication.</p>}
        </div>
      }) : <p>No currently verified platform listing is eligible for publication.</p>}
    </fieldset>
    <fieldset className="local-presence-group">
      <legend>Related approved improvements</legend>
      <p className="customer-small">Relationships are explicit operator decisions. No finding is linked by keyword or generated from listing evidence.</p>
      {approvedFindings.length ? approvedFindings.map((fix) => <label className="local-presence-choice" key={fix.id}><input type="checkbox" checked={relatedFindingIds.includes(fix.id)} onChange={(event) => toggleFinding(fix.id, event.target.checked)} /><span><strong>{fix.issue}</strong><small>{fix.id}</small></span></label>) : <p>No approved findings are available to link.</p>}
    </fieldset>
    <div className="customer-readiness-actions"><button className="customer-primary" type="button" onClick={save}>{publication && !current ? 'Reconfirm Local Presence publication' : includeAddress || Object.values(listingSelections).some((selection) => selection?.include) ? 'Save Local Presence publication' : 'Keep Local Presence out of export'}</button></div>
    {status ? <p role="status">{status}</p> : null}
  </section>
}
