import { useState } from 'react'
import type { AuditState, FixItem, PackageAssignmentChoice, PackageCommercialPricing, PackageScopeClassification } from '../types/audit'
import { derivePackagePreparation, type PackagePreparationItem, type PackageScopeInput } from '../utils/packagePreparation'
import {
  buildPackageCommercialPricing,
  deriveEffectivePackageOffers,
  formatPriceDisplay,
  initialProjectTotal,
  packagePricingIsComplete,
  type EffectivePackageOffer,
  type RecurringBillingType,
} from '../utils/packagePricing'

const scopeLabels: Record<PackageScopeClassification, string> = {
  starter: 'Included in Starter',
  separate: 'Separate scope',
  customer_action: 'Customer / third-party action required',
  not_included: 'Not included',
}

const assignmentChoice = (assignment: string): PackageAssignmentChoice =>
  assignment === 'Starter Visibility Cleanup' ? assignment
    : assignment === 'None' ? assignment : 'Custom / separate project'

function PackageScopeCard({ item, fix, onSave, reconciliation = false }: { item: PackagePreparationItem; fix: FixItem; onSave: (fix: FixItem, input: PackageScopeInput) => void; reconciliation?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [scopeClassification, setScopeClassification] = useState(item.scopeClassification)
  const [assignment, setAssignment] = useState<PackageAssignmentChoice>(assignmentChoice(item.packageAssignment))
  const [customAssignment, setCustomAssignment] = useState(assignmentChoice(item.packageAssignment) === 'Custom / separate project' && item.packageAssignment !== 'Custom / separate project' ? item.packageAssignment : '')
  const [deliveryDescription, setDeliveryDescription] = useState(item.remediationAction)
  const [includedScope, setIncludedScope] = useState(item.includedScope)
  const [internalNote, setInternalNote] = useState(item.internalScopeNote)
  const beginEditing = () => {
    setScopeClassification(item.scopeClassification)
    setAssignment(assignmentChoice(item.packageAssignment))
    setCustomAssignment(assignmentChoice(item.packageAssignment) === 'Custom / separate project' && item.packageAssignment !== 'Custom / separate project' ? item.packageAssignment : '')
    setDeliveryDescription(item.remediationAction)
    setIncludedScope(item.includedScope)
    setInternalNote(item.internalScopeNote)
    setEditing(true)
  }
  const changeClassification = (next: PackageScopeClassification) => {
    setScopeClassification(next)
    setAssignment(next === 'starter' ? 'Starter Visibility Cleanup' : next === 'separate' ? 'Custom / separate project' : 'None')
  }
  const currentInput = (): PackageScopeInput => ({
      scopeClassification,
      packageAssignment: assignment === 'Custom / separate project' ? customAssignment.trim() || assignment : assignment,
      deliveryDescription,
      includedScope,
      internalNote,
    })
  const save = () => {
    onSave(fix, currentInput())
    setEditing(false)
  }
  return <article className="fix-item package-scope-item">
    <div className="fix-title-cell"><p className="fix-area">{reconciliation ? 'Scope needing reconfirmation' : 'Approved finding'}</p><h3>{item.finding}</h3>{reconciliation ? <span className="method-pill">Previous scope</span> : item.overridden ? <span className="method-pill">Operator scope</span> : <span className="method-pill">Derived default</span>}</div>
    {!editing ? <>
      <div className="fix-table-cell"><strong>What Found Local will do</strong><p>{item.remediationAction}</p></div>
      <div className="fix-table-cell"><strong>Scope classification</strong><p>{scopeLabels[item.scopeClassification]}</p></div>
      <div className="fix-table-cell"><strong>Package assignment</strong><p>{item.packageAssignment}</p></div>
      <div className="fix-table-cell"><strong>Included scope</strong><p>{item.includedScope}</p></div>
      {item.internalScopeNote ? <div className="fix-table-cell package-internal-note"><strong>Internal scope note</strong><p>{item.internalScopeNote}</p></div> : null}
      {reconciliation ? <p className="customer-refinement-warning">{item.findingAbsentFromLatestScan ? 'The latest scan no longer produces this finding. Its previous scope is preserved until the operator resolves the prior decision in Review.' : item.approvalNeedsReconfirmation ? 'The finding decision must be reconfirmed in Review before this delivery scope can become active.' : 'The evidence supporting this finding was refreshed. Confirm or update its delivery scope.'}</p> : null}
      {reconciliation && item.canConfirmScope ? <button type="button" onClick={() => onSave(fix, { scopeClassification: item.scopeClassification, packageAssignment: item.packageAssignment, deliveryDescription: item.remediationAction, includedScope: item.includedScope, internalNote: item.internalScopeNote })}>Confirm previous scope</button> : null}
      {!reconciliation || item.canConfirmScope ? <button className="secondary package-edit-button" type="button" onClick={beginEditing}>Edit scope</button> : null}
    </> : <div className="package-scope-form">
      <label>Scope classification<select value={scopeClassification} onChange={(event) => changeClassification(event.target.value as PackageScopeClassification)}><option value="starter">Included in Starter</option><option value="separate">Separate scope</option><option value="customer_action">Customer / third-party action required</option><option value="not_included">Not included</option></select></label>
      <label>Package assignment<select value={assignment} onChange={(event) => setAssignment(event.target.value as PackageAssignmentChoice)}>{scopeClassification === 'starter' ? <option>Starter Visibility Cleanup</option> : scopeClassification === 'separate' ? <option>Custom / separate project</option> : <option>None</option>}</select></label>
      {assignment === 'Custom / separate project' ? <label>Custom package name<input value={customAssignment} placeholder="Custom / separate project" onChange={(event) => setCustomAssignment(event.target.value)} /></label> : null}
      <label className="full-width-label">What Found Local will do<textarea value={deliveryDescription} onChange={(event) => setDeliveryDescription(event.target.value)} /></label>
      <label className="full-width-label">Included scope<input value={includedScope} onChange={(event) => setIncludedScope(event.target.value)} /></label>
      <label className="full-width-label">Internal scope note <span>(operator-only)</span><textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></label>
      <div className="package-scope-actions"><button type="button" onClick={save}>Save scope</button><button className="secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </div>}
  </article>
}

const amountInput = (amountCents?: number) => amountCents === undefined ? '' : (amountCents / 100).toFixed(2)

function PackagePricingCard({ offer, onSave }: { offer: EffectivePackageOffer; onSave: (key: string, pricing: PackageCommercialPricing) => void }) {
  const [oneTimeAmount, setOneTimeAmount] = useState(amountInput(offer.pricing?.oneTimePrice?.amountCents))
  const [recurringAmount, setRecurringAmount] = useState(amountInput(offer.pricing?.recurringPrice?.amountCents))
  const [recurringBillingType, setRecurringBillingType] = useState<RecurringBillingType>(offer.pricing?.recurringPrice?.billingType === 'annual' || offer.pricing?.recurringPrice?.billingType === 'custom' ? offer.pricing.recurringPrice.billingType : 'monthly')
  const [customerPricingNote, setCustomerPricingNote] = useState(offer.pricing?.customerPricingNote || '')
  const [internalPricingNote, setInternalPricingNote] = useState(offer.pricing?.internalPricingNote || '')
  const [errors, setErrors] = useState<string[]>([])
  const save = () => {
    const result = buildPackageCommercialPricing(offer, { oneTimeAmount, recurringAmount, recurringBillingType, customerPricingNote, internalPricingNote })
    setErrors(result.errors)
    if (result.pricing) onSave(offer.key, result.pricing)
  }
  return <article className="package-pricing-card">
    <div className="package-pricing-heading"><div><h4>{offer.name}</h4><p>{offer.scopeClassification === 'starter' ? 'Customer package' : 'Separate-scope package'}</p></div><span className="method-pill">USD</span></div>
    <div className="package-pricing-form">
      <label>One-time price<span className="money-input"><span aria-hidden="true">$</span><input inputMode="decimal" placeholder="optional" value={oneTimeAmount} onChange={(event) => setOneTimeAmount(event.target.value)} /></span></label>
      <label>Recurring price <span>(optional)</span><span className="money-input"><span aria-hidden="true">$</span><input inputMode="decimal" placeholder="optional" value={recurringAmount} onChange={(event) => setRecurringAmount(event.target.value)} /></span></label>
      <label>Recurring billing<select value={recurringBillingType} onChange={(event) => setRecurringBillingType(event.target.value as RecurringBillingType)}><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label>
      <label className="full-width-label">Customer-facing pricing note <span>(optional)</span><textarea value={customerPricingNote} onChange={(event) => setCustomerPricingNote(event.target.value)} /></label>
      <label className="full-width-label">Internal pricing note <span>(operator only)</span><textarea value={internalPricingNote} onChange={(event) => setInternalPricingNote(event.target.value)} /></label>
    </div>
    {errors.length ? <div className="customer-refinement-warning" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
    <button type="button" onClick={save}>Save pricing</button>
  </article>
}

export function PackagePreparationPanel({ state, fixes, onSaveScope = () => undefined, onSavePricing = () => undefined }: { state: AuditState; fixes: FixItem[]; onSaveScope?: (fix: FixItem, input: PackageScopeInput) => void; onSavePricing?: (key: string, pricing: PackageCommercialPricing) => void }) {
  const preparation = derivePackagePreparation(state, fixes)
  const packageOffers = deriveEffectivePackageOffers(state, fixes)
  const pricingComplete = packagePricingIsComplete(packageOffers)
  const initialTotal = initialProjectTotal(packageOffers)
  const fixesById = new Map([
    ...Object.values(state.customerFindingDecisionSnapshots || {}).map((snapshot) => [snapshot.finding.id, snapshot.finding] as const),
    ...fixes.map((fix) => [fix.id, fix] as const),
  ])
  return <section className="panel package-preparation-panel" aria-label="Package Preparation">
    <div className="panel-header">
      <p className="eyebrow">Package Preparation</p>
      <h2>{preparation.recommendedPackage || (preparation.confirmedItems.length ? 'Approved work requires separate scoping' : 'No package recommended yet')}</h2>
      <p>{preparation.confirmedItems.length
        ? `${preparation.confirmedItems.length} confirmed ${preparation.confirmedItems.length === 1 ? 'finding is' : 'findings are'} available for delivery scoping.`
        : 'Approved findings do not currently support a package recommendation.'}</p>
    </div>
    {preparation.confirmedItems.length ? <div className="fix-list package-scope-list"><h3>Confirmed package scope</h3>
      {preparation.confirmedItems.map((item) => <PackageScopeCard item={item} fix={fixesById.get(item.findingId)!} onSave={onSaveScope} key={item.findingId} />)}
    </div> : null}
    {preparation.reconciliationItems.length ? <div className="fix-list package-scope-list package-reconciliation-list"><h3>Scope needing reconfirmation</h3><p>{preparation.reconciliationItems.length} {preparation.reconciliationItems.length === 1 ? 'finding requires' : 'findings require'} an operator decision before Customer Review.</p>{preparation.reconciliationItems.map((item) => <PackageScopeCard reconciliation item={item} fix={fixesById.get(item.findingId)!} onSave={onSaveScope} key={`reconcile-${item.findingId}`} />)}</div> : null}
    {packageOffers.length ? <section className="package-pricing-section" aria-label="Package Pricing">
      <div className="package-pricing-summary"><div><p className="eyebrow">Package Pricing</p><h3>Commercial offer</h3><p>Pricing is operator-controlled proposal metadata. It does not change findings or package scope.</p></div><div><span className={`profile-status profile-status-${pricingComplete ? 'ready' : 'review'}`}>{pricingComplete ? 'Pricing complete' : 'Pricing not entered'}</span>{initialTotal ? <strong>Initial project total: {formatPriceDisplay(initialTotal)}</strong> : null}</div></div>
      <div className="package-pricing-list">{packageOffers.map((offer) => <PackagePricingCard offer={offer} onSave={onSavePricing} key={offer.key} />)}</div>
      <p className="customer-small">Recurring charges are optional and shown separately. Blank pricing remains a warning, not a Customer Review blocker.</p>
    </section> : null}
    <p className="customer-small">Candidate, dismissed, and neutral needs-review observations do not create package scope. Package scope does not authorize implementation.</p>
  </section>
}
