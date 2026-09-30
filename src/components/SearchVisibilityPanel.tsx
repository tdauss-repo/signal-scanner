import { useState } from 'react'
import type { BrandPresenceMismatch, BrandPresenceVerificationOutcome, BusinessProfile, BusinessProfileState, SearchDestination, SearchDestinationObservation, SearchVisibilityQuery, SearchVisibilityResult, SearchVisibilityTestState } from '../types/audit'
import { buildSearchVisibilityQueries, publicPresenceUrl, defaultSearchDestinationObservation, normalizeSearchDestinationObservation, normalizeSearchResultTypes, resultTypesForDestination, searchDestinations, searchResultTypeLabel, searchVisibilityResultLabel } from '../utils/searchVisibility'
import { acceptOperatorAssistedBrandObservation, operatorAssistedEvidenceIsCurrent, operatorAssistedParsedFields, parseOperatorAssistedBrandObservation, type ParsedOperatorAssistedObservation } from '../utils/operatorAssistedSearch'
import { projectSalesVisibility } from '../utils/salesVisibilityProjection'
import { evidenceTimestampToLocalInput, formatEvidenceTimestamp, localInputToEvidenceTimestamp } from '../utils/evidenceTime'
import { brandPresenceMismatchLabels, brandPresenceOutcomeLabels, brandPresenceVerificationIsStale, buildBrandPresenceVerification, currentBrandPresenceVerification, expectedBrandPresenceIdentity } from '../utils/brandPresenceVerification'
import { brandPresenceEvidenceSummary, serializeBrandPresenceTechnicalEvidence, shortEvidenceUrl } from '../utils/brandPresenceEvidenceDetail'
import type { SalesVisibilityProjection } from '../utils/salesVisibilityProjection'
import { copyText } from '../utils/copyText'

interface Props { profile: BusinessProfile; profileState: BusinessProfileState; legacyTests: Record<string, SearchVisibilityTestState>; observations: Record<string, Partial<Record<SearchDestination, SearchDestinationObservation>>>; onChange: (query: SearchVisibilityQuery, observation: SearchDestinationObservation) => void; onAddToActionPlan: (query: SearchVisibilityQuery) => void }
const results: SearchVisibilityResult[] = ['not_checked', 'manual_review_needed', 'found_match', 'found_prominently', 'found_weak', 'found_conflicting_information', 'not_found', 'unable_to_verify']
const displayUrl = (value: string) => value.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '')

function OperatorAssistedGoogleBrand({ profile, profileState, query, value, url, onChange }: { profile: BusinessProfile; profileState: BusinessProfileState; query: SearchVisibilityQuery; value: SearchDestinationObservation; url: string; onChange: (query: SearchVisibilityQuery, observation: SearchDestinationObservation) => void }) {
  const [rawText, setRawText] = useState(value.operatorAssisted?.rawText || '')
  const [parsed, setParsed] = useState<ParsedOperatorAssistedObservation | null>(null)
  const [message, setMessage] = useState('')
  const current = operatorAssistedEvidenceIsCurrent(value, profile, profileState)
  const preview = parsed || value.operatorAssisted
  const fields = preview ? operatorAssistedParsedFields(preview) : {}
  const parse = () => {
    if (!rawText.trim()) { setParsed(null); setMessage('Paste a bounded section of visible Google result evidence first.'); return }
    const next = parseOperatorAssistedBrandObservation(rawText, url, profile, profileState)
    setParsed(next)
    setMessage(next.assessment.automaticObservation ? 'High-confidence matching business evidence parsed.' : next.assessment.matches.some((match) => match.conflictingFields.length) ? 'Conflicting business evidence parsed. Review the fields before accepting.' : 'The evidence remains ambiguous and will continue to require review.')
  }
  const accept = () => {
    if (!parsed) return
    onChange(query, acceptOperatorAssistedBrandObservation(value, parsed, profile, profileState))
    setMessage(parsed.assessment.automaticObservation ? 'Operator-assisted observation accepted as a matching business.' : 'Operator-assisted evidence accepted for continued review.')
    setParsed(null)
  }
  return <section aria-label="Operator-assisted Google Brand observation">
    <p><strong>Automated check blocked.</strong> Use a normal browser tab and paste only the visible result section needed to identify the business.</p>
    <div className="directory-actions"><a href={url} target="_blank" rel="noreferrer">Open Google Search for verification</a></div>
    <label className="full-width-label">Browser observation<textarea value={rawText} onChange={(event) => { setRawText(event.target.value); setParsed(null); setMessage('Evidence changed — parse and accept it again.'); }} placeholder={'Business name\nwebsite.example\n123 Main St\nCity, ST\n555-555-0100'} /></label>
    <div className="directory-actions"><button type="button" onClick={parse}>Parse observation</button>{parsed ? <button type="button" onClick={accept}>Accept observation</button> : null}</div>
    {message ? <p>{message}</p> : null}
    {preview ? <div><p>Parsed fields</p><dl>{Object.entries(fields).map(([field, observed]) => <div key={field}><dt>{field}</dt><dd>{observed}</dd></div>)}</dl><p>Confidence: {preview.assessment.confidence} · Result: {preview.assessment.visibilityResult} · Operator review required: {preview.assessment.operatorReviewRequired ? 'Yes' : 'No'}</p>{preview.assessment.selected?.conflictingFields.length ? <p>Conflicts: {preview.assessment.selected.conflictingFields.map((field) => `${field.field}: expected ${field.expected}; observed ${field.observed}`).join(' | ')}</p> : null}</div> : null}
    {value.operatorAssisted ? <p>Accepted provenance: operator_assisted_browser · {current ? 'Current for this reviewed profile' : 'Profile or evidence changed — parse and accept again'}</p> : null}
  </section>
}

const mismatchOptions = Object.keys(brandPresenceMismatchLabels) as BrandPresenceMismatch[]
const outcomeOptions = Object.keys(brandPresenceOutcomeLabels) as BrandPresenceVerificationOutcome[]

function BrandPresenceVerification({ profile, profileState, query, value, onChange }: {
  profile: BusinessProfile
  profileState: BusinessProfileState
  query: SearchVisibilityQuery
  value: SearchDestinationObservation
  onChange: (query: SearchVisibilityQuery, observation: SearchDestinationObservation) => void
}) {
  const current = currentBrandPresenceVerification(value, profile, profileState)
  const previous = value.operatorVerification
  const [outcome, setOutcome] = useState<BrandPresenceVerificationOutcome>(current?.outcome || previous?.outcome || 'found_correct')
  const [mismatches, setMismatches] = useState<BrandPresenceMismatch[]>(current?.mismatches || previous?.mismatches || [])
  const [operatorObservedUrl, setOperatorObservedUrl] = useState(current?.operatorObservedUrl || previous?.operatorObservedUrl || '')
  const [note, setNote] = useState(current?.note || previous?.note || '')
  const [message, setMessage] = useState('')
  const identity = expectedBrandPresenceIdentity(profile, profileState)
  const save = () => {
    const built = buildBrandPresenceVerification(value, profile, profileState, { outcome, mismatches, operatorObservedUrl, note })
    if (!built.ok) { setMessage(built.error); return }
    onChange(query, normalizeSearchDestinationObservation({ ...value, operatorVerification: built.verification }, { profile, brandPresence: true }))
    setMessage('Verification reviewed and saved.')
  }
  return <section aria-label={`${value.destination} assisted verification`} className="brand-presence-verification">
    <h4>Expected business identity</h4>
    <div className="expected-identity">
      {identity.businessName ? <p><strong>{identity.businessName}</strong></p> : null}
      {identity.categories.length ? <p>{identity.categories.join(', ')}</p> : null}
      {identity.streetAddress ? <p>{identity.streetAddress}</p> : null}
      {identity.locality ? <p>{identity.locality}</p> : null}
      {identity.phone ? <p>{identity.phone}</p> : null}
      {identity.website ? <p>{displayUrl(identity.website)}</p> : null}
      {!Object.values(identity).some((item) => Array.isArray(item) ? item.length : item) ? <p>Review the Business Profile before comparing this destination.</p> : null}
    </div>
    <fieldset><legend>What did you find?</legend><div className="result-type-fieldset">{outcomeOptions.map((option) => <label className="result-type-option" key={option}><input type="radio" name={`${query.id}-${value.destination}-verification`} checked={outcome === option} onChange={() => { setOutcome(option); setMessage('') }} /><span>{brandPresenceOutcomeLabels[option]}</span></label>)}</div></fieldset>
    {outcome === 'found_correction_needed' ? <fieldset className="result-type-fieldset"><legend>What needs correction?</legend>{mismatchOptions.map((item) => <label className="result-type-option" key={item}><input type="checkbox" checked={mismatches.includes(item)} onChange={(event) => setMismatches(event.target.checked ? [...mismatches, item] : mismatches.filter((value) => value !== item))} /><span>{brandPresenceMismatchLabels[item]}</span></label>)}</fieldset> : null}
    <div className="directory-row-grid"><label>Observed profile/result URL <span className="customer-small">(optional)</span><input type="url" value={operatorObservedUrl} onChange={(event) => setOperatorObservedUrl(event.target.value)} placeholder="https://…" /></label><label>Operator note <span className="customer-small">(optional unless needed to explain a correction)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label></div>
    <div className="directory-actions"><button type="button" onClick={save}>Save verification</button></div>
    {message ? <p role="status">{message}</p> : null}
    {current ? <p>Verification reviewed · {formatEvidenceTimestamp(current.reviewedAt)} (local time) · provenance: operator_verified</p> : previous && brandPresenceVerificationIsStale(value, profile, profileState) ? <p>Prior verification is preserved but needs reconfirmation because material evidence or the reviewed Business Profile changed.</p> : null}
  </section>
}

function BrandPresenceReviewWorkflow({ profile, profileState, query, value, sales, onChange }: {
  profile: BusinessProfile
  profileState: BusinessProfileState
  query: SearchVisibilityQuery
  value: SearchDestinationObservation
  sales: SalesVisibilityProjection
  onChange: (query: SearchVisibilityQuery, observation: SearchDestinationObservation) => void
}) {
  const [manualReview, setManualReview] = useState(false)
  const automaticallyVerified = ['verified_correct', 'verified_recent'].includes(sales.state) && Boolean(sales.automationSummary)
  if (automaticallyVerified && !manualReview) return <section className="brand-presence-verification brand-presence-verification-complete">
    <p><strong>No operator action required.</strong> {sales.state === 'verified_recent'
      ? value.destination === 'Bing Search' && value.automation?.assessment?.blocker === 'no_match'
        ? 'Recent acquired identity evidence remains within the freshness window; the latest refresh was inconclusive.'
        : 'Recent acquired identity evidence remains within the freshness window; the current refresh was unavailable.'
      : 'The acquired identity evidence passed automatic verification.'}</p>
    <button type="button" className="secondary" onClick={() => setManualReview(true)}>Review manually</button>
  </section>
  return <>
    {automaticallyVerified ? <button type="button" className="secondary" onClick={() => setManualReview(false)}>Cancel manual review</button> : null}
    <BrandPresenceVerification profile={profile} profileState={profileState} query={query} value={value} onChange={onChange} />
  </>
}

function BrandPresenceEvidenceDetail({ value, sales }: { value: SearchDestinationObservation; sales: SalesVisibilityProjection }) {
  const [rawOpen, setRawOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const summary = brandPresenceEvidenceSummary(value, sales)
  const rawEvidence = rawOpen ? serializeBrandPresenceTechnicalEvidence(value, sales) : ''
  const copyRawEvidence = async () => {
    const result = await copyText(rawEvidence || serializeBrandPresenceTechnicalEvidence(value, sales))
    setCopyStatus(result.copied ? 'Raw evidence copied.' : 'Copy was unavailable. Select the raw evidence below to copy it manually.')
  }
  return <details className="brand-presence-evidence-detail">
    <summary>Operator evidence &amp; acquisition detail</summary>
    <dl className="brand-presence-evidence-summary">
      <div><dt>Acquisition</dt><dd>{summary.acquisition}</dd></div>
      <div><dt>Result</dt><dd>{summary.result}</dd></div>
      {summary.observedResultUrl ? <div><dt>Observed result</dt><dd><a href={summary.observedResultUrl} target="_blank" rel="noreferrer">{shortEvidenceUrl(summary.observedResultUrl)}</a></dd></div> : null}
      {summary.knownProfileUrl ? <div><dt>Known profile</dt><dd><a href={summary.knownProfileUrl} target="_blank" rel="noreferrer">{shortEvidenceUrl(summary.knownProfileUrl)}</a></dd></div> : null}
      {summary.observedAt ? <div><dt>Observed</dt><dd>{formatEvidenceTimestamp(summary.observedAt)} (local time)</dd></div> : null}
      {summary.lastVerifiedAt ? <div><dt>Last verified</dt><dd>{formatEvidenceTimestamp(summary.lastVerifiedAt)} (local time)</dd></div> : null}
      <div><dt>Source</dt><dd>{summary.source}</dd></div>
      {summary.automationState ? <div><dt>{sales.state === 'verified_recent' ? value.destination === 'Bing Search' ? 'Latest refresh' : 'Current refresh' : 'Automation state'}</dt><dd>{summary.automationState}</dd></div> : null}
      {summary.appleMapsSearch ? <div><dt>Apple Maps search</dt><dd>{summary.appleMapsSearch}</dd></div> : null}
      {summary.structuredPlace ? <div><dt>Structured place</dt><dd>{summary.structuredPlace}</dd></div> : null}
      {summary.identityEvidence?.map((item) => <div key={`${item.label}-${item.result}`}><dt>{item.label}</dt><dd>{item.result}</dd></div>)}
      {summary.decision ? <div><dt>Decision</dt><dd>{summary.decision}</dd></div> : null}
      {summary.interpretation ? <div><dt>Interpretation</dt><dd>{summary.interpretation}</dd></div> : null}
      {summary.reason ? <div><dt>Reason</dt><dd>{summary.reason}</dd></div> : null}
      {summary.nextStep ? <div><dt>Next step</dt><dd>{summary.nextStep}</dd></div> : null}
      <div><dt>Verification destination</dt><dd><a href={summary.verificationUrl} target="_blank" rel="noreferrer">{summary.verificationLabel}</a></dd></div>
      {value.operatorVerification ? <><div><dt>Operator result</dt><dd>{brandPresenceOutcomeLabels[value.operatorVerification.outcome]}</dd></div><div><dt>Reviewed</dt><dd>{formatEvidenceTimestamp(value.operatorVerification.reviewedAt)} (local time)</dd></div>{value.operatorVerification.operatorObservedUrl ? <div><dt>Operator observed URL</dt><dd><a href={value.operatorVerification.operatorObservedUrl} target="_blank" rel="noreferrer">{shortEvidenceUrl(value.operatorVerification.operatorObservedUrl)}</a></dd></div> : null}{value.operatorVerification.mismatches.length ? <div><dt>Mismatches</dt><dd>{value.operatorVerification.mismatches.map((item) => brandPresenceMismatchLabels[item]).join(', ')}</dd></div> : null}{value.operatorVerification.note ? <div><dt>Operator note</dt><dd>{value.operatorVerification.note}</dd></div> : null}</> : null}
    </dl>
    <div className="directory-actions">{summary.observedResultUrl ? <a href={summary.observedResultUrl} target="_blank" rel="noreferrer">Open observed result</a> : null}<a href={summary.verificationUrl} target="_blank" rel="noreferrer">{sales.actionLabel}</a></div>
    <details className="brand-presence-raw-evidence" onToggle={(event) => { setRawOpen(event.currentTarget.open); setCopyStatus('') }}>
      <summary>Raw technical evidence</summary>
      {rawOpen ? <div className="brand-presence-raw-evidence-body"><div className="directory-actions"><button type="button" className="secondary" onClick={() => void copyRawEvidence()}>Copy raw evidence</button>{copyStatus ? <span role="status">{copyStatus}</span> : null}</div><pre>{rawEvidence}</pre></div> : null}
    </details>
  </details>
}


export function SearchVisibilityPanel({ profile, profileState, legacyTests, observations, onChange, onAddToActionPlan }: Props) {
  const [diagnostic, setDiagnostic] = useState(Boolean(legacyTests['search-brand-market'] || observations['search-brand-market']))
  const queries = buildSearchVisibilityQueries(profile, profileState, { includeLocationDiagnostic: diagnostic || Boolean(observations['search-brand-market']) })
  const patch = (query: SearchVisibilityQuery, destination: SearchDestination, next: Partial<SearchDestinationObservation>) => onChange(query, normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation(destination, query.query), ...observations[query.id]?.[destination], ...next, provenance: 'operator_observation', reviewed: next.reviewed ?? false }, { profile, brandPresence: query.role === 'Brand Presence' }))
  return <section className="panel search-visibility-panel">
    <div className="panel-header"><p className="eyebrow">Destination-specific public evidence</p><h2>Public Presence</h2><p>What can a prospective customer publicly find? Record each destination independently; this does not claim owner/admin access.</p></div>
    <div className="search-query-list">{queries.map((query) => <article className="search-query-card" key={query.id}>
      <div className="audit-title-row"><div><p className="fix-area">{query.role}{query.isDiagnostic ? ' · location diagnostic' : ''}</p><h3>{query.query}</h3></div>{query.id === 'search-brand-canonical' && !diagnostic && !observations['search-brand-market'] ? <button type="button" className="secondary" onClick={() => setDiagnostic(true)}>Run location diagnostic</button> : null}</div>
      {searchDestinations.map((destination) => { const value = normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation(destination, query.query), ...observations[query.id]?.[destination] }, { profile, brandPresence: query.role === 'Brand Presence' }); const googleSearchObservation = normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation('Google Search', query.query), ...observations[query.id]?.['Google Search'] }, { profile, brandPresence: query.role === 'Brand Presence' }); const sales = projectSalesVisibility(value, { profile, profileState, googleSearchObservation }); const types = resultTypesForDestination(destination); const assistedGoogleBrand = query.id === 'search-brand-canonical' && destination === 'Google Search' && value.automation?.state === 'interactive_review_required' && ['access_blocked', 'acquisition_failure', 'runtime_unavailable'].includes(value.automation.assessment?.blocker || ''); return <details className="destination-observation" key={destination}>
        <summary>{destination} — {sales.headline}</summary>
        <div className="destination-sales-summary"><p><strong>{sales.headline}</strong></p><p>{sales.explanation}</p><p><strong>Identity consistency:</strong> {sales.identitySummary}</p>{sales.automationSummary ? <p><strong>Automation:</strong> {sales.automationSummary}</p> : null}{sales.evidenceSourceSummary ? <p><strong>Evidence source:</strong> {sales.evidenceSourceSummary}</p> : null}<p><strong>Next action:</strong> {sales.nextAction}</p></div>
        <div className="directory-actions"><a href={sales.actionUrl} target="_blank" rel="noreferrer">{sales.actionLabel}</a>{sales.knownProfileUrl ? <a href={sales.knownProfileUrl} target="_blank" rel="noreferrer">{destination === 'Google Maps' ? 'Open Google Maps profile' : destination === 'Facebook' ? 'Open Facebook profile' : 'Open known profile'}</a> : null}</div>
        {query.role === 'Brand Presence' ? <BrandPresenceReviewWorkflow profile={profile} profileState={profileState} query={query} value={value} sales={sales} onChange={onChange} /> : <><div className="search-observation-grid"><label>Review outcome<select value={value.overallResult} onChange={(event) => { const overallResult = event.target.value as SearchVisibilityResult; patch(query, destination, { overallResult, reviewed: false, observedAt: new Date().toISOString(), evidenceKind: overallResult === 'not_found' ? 'absence' : overallResult === 'unable_to_verify' ? 'unable_to_verify' : 'external_observation' }) }}><option value="found_match">Found — looks correct</option><option value="found_conflicting_information">Found — correction needed</option><option value="not_found">Not found</option><option value="unable_to_verify">Unable to determine</option>{results.filter((result) => !['found_match', 'found_conflicting_information', 'not_found', 'unable_to_verify'].includes(result)).map((result) => <option key={result} value={result}>{searchVisibilityResultLabel(result)}</option>)}</select></label><label>Observed at (local time)<input type="datetime-local" value={evidenceTimestampToLocalInput(value.observedAt)} onChange={(event) => patch(query, destination, { observedAt: localInputToEvidenceTimestamp(event.target.value) })}/></label><label className="checkbox-field"><input id={`${query.id}-${destination}-reviewed`} type="checkbox" checked={value.reviewed} onChange={(event) => patch(query, destination, { reviewed: event.target.checked })}/><span>Observation reviewed</span></label></div><fieldset className="result-type-fieldset"><legend>Observed result types</legend>{types.map((type) => <label className="result-type-option" key={type} htmlFor={`${query.id}-${destination}-${type}`}><input id={`${query.id}-${destination}-${type}`} type="checkbox" checked={value.observedResultTypes.includes(type)} onChange={(event) => patch(query, destination, { observedResultTypes: normalizeSearchResultTypes(event.target.checked ? [...value.observedResultTypes, type] : value.observedResultTypes.filter((item) => item !== type)) })}/><span>{searchResultTypeLabel(destination, type)}</span></label>)}</fieldset><div className="directory-row-grid"><label>Evidence notes<textarea value={value.evidenceNotes} onChange={(event) => patch(query, destination, { evidenceNotes: event.target.value })}/></label><label>Competitors observed <span className="customer-small">(or correction notes: name, address, phone, website, category, other)</span><textarea value={value.competitorsObserved} onChange={(event) => patch(query, destination, { competitorsObserved: event.target.value })}/></label></div><label className="full-width-label">Recommended action<textarea value={value.recommendedAction} onChange={(event) => patch(query, destination, { recommendedAction: event.target.value })}/></label></>}
        {assistedGoogleBrand ? <OperatorAssistedGoogleBrand profile={profile} profileState={profileState} query={query} value={value} url={value.verificationUrl || publicPresenceUrl(destination, query.query)} onChange={onChange} /> : null}
        {value.automation || value.operatorAssisted || value.operatorVerification || sales.derivedGoogleMapsVerification ? <BrandPresenceEvidenceDetail value={value} sales={sales} /> : null}
      </details> })}
      {query.role === 'Brand Presence' ? null : <div className="directory-actions"><button type="button" onClick={() => onAddToActionPlan(query)}>Add reviewed primary evidence to Review</button></div>}
    </article>)}</div>
  </section>
}
