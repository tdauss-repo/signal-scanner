import { useState } from 'react'
import type { BusinessProfile, BusinessProfileState, SearchDestination, SearchDestinationObservation, SearchVisibilityQuery, SearchVisibilityResult, SearchVisibilityTestState } from '../types/audit'
import { buildSearchVisibilityQueries, publicPresenceUrl, defaultSearchDestinationObservation, normalizeSearchDestinationObservation, normalizeSearchResultTypes, resultTypesForDestination, searchDestinations, searchResultTypeLabel, searchVisibilityResultLabel } from '../utils/searchVisibility'
import { acceptOperatorAssistedBrandObservation, operatorAssistedEvidenceIsCurrent, operatorAssistedParsedFields, parseOperatorAssistedBrandObservation, type ParsedOperatorAssistedObservation } from '../utils/operatorAssistedSearch'
import { projectSalesVisibility } from '../utils/salesVisibilityProjection'

interface Props { profile: BusinessProfile; profileState: BusinessProfileState; legacyTests: Record<string, SearchVisibilityTestState>; observations: Record<string, Partial<Record<SearchDestination, SearchDestinationObservation>>>; onChange: (query: SearchVisibilityQuery, observation: SearchDestinationObservation) => void; onAddToActionPlan: (query: SearchVisibilityQuery) => void }
const results: SearchVisibilityResult[] = ['not_checked', 'manual_review_needed', 'found_match', 'found_prominently', 'found_weak', 'found_conflicting_information', 'not_found', 'unable_to_verify']

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


export function SearchVisibilityPanel({ profile, profileState, legacyTests, observations, onChange, onAddToActionPlan }: Props) {
  const [diagnostic, setDiagnostic] = useState(Boolean(legacyTests['search-brand-market'] || observations['search-brand-market']))
  const queries = buildSearchVisibilityQueries(profile, profileState, { includeLocationDiagnostic: diagnostic || Boolean(observations['search-brand-market']) })
  const patch = (query: SearchVisibilityQuery, destination: SearchDestination, next: Partial<SearchDestinationObservation>) => onChange(query, normalizeSearchDestinationObservation({ ...defaultSearchDestinationObservation(destination, query.query), ...observations[query.id]?.[destination], ...next, provenance: 'operator_observation', reviewed: next.reviewed ?? false }))
  return <section className="panel search-visibility-panel">
    <div className="panel-header"><p className="eyebrow">Destination-specific public evidence</p><h2>Public Presence</h2><p>What can a prospective customer publicly find? Record each destination independently; this does not claim owner/admin access.</p></div>
    <div className="search-query-list">{queries.map((query) => <article className="search-query-card" key={query.id}>
      <div className="audit-title-row"><div><p className="fix-area">{query.role}{query.isDiagnostic ? ' · location diagnostic' : ''}</p><h3>{query.query}</h3></div>{query.id === 'search-brand-canonical' && !diagnostic && !observations['search-brand-market'] ? <button type="button" className="secondary" onClick={() => setDiagnostic(true)}>Run location diagnostic</button> : null}</div>
      {searchDestinations.map((destination) => { const value = { ...defaultSearchDestinationObservation(destination, query.query), ...observations[query.id]?.[destination] }; const sales = projectSalesVisibility(value); const types = resultTypesForDestination(destination); const assistedGoogleBrand = query.id === 'search-brand-canonical' && destination === 'Google Search' && value.automation?.state === 'interactive_review_required' && ['access_blocked', 'acquisition_failure', 'runtime_unavailable'].includes(value.automation.assessment?.blocker || ''); return <details className="destination-observation" key={destination}>
        <summary>{destination} — {sales.headline}</summary>
        <div className="destination-sales-summary"><p><strong>{sales.headline}</strong></p><p>{sales.explanation}</p><p><strong>Identity consistency:</strong> {sales.identitySummary}</p><p><strong>Next action:</strong> {sales.nextAction}</p></div>
        <div className="directory-actions"><a href={sales.evidenceUrl} target="_blank" rel="noreferrer">{sales.state === 'profile_discovered' ? 'Open profile' : `Open ${destination}`}</a></div>
        {value.automation ? <details><summary>Operator evidence & acquisition detail — {value.automation.automaticObservation ? 'Automatically matched observation' : 'Automated evidence — review required'}</summary><p>{value.automation.evidence || 'No reliable interpretation. Use the public destination link for interactive review.'}</p>{value.automation.assessment ? <><p>Identity confidence: {value.automation.assessment.confidence} · Query mode: {value.automation.queryMode} · Blocker: {value.automation.assessment.blocker}</p><p>{value.automation.assessment.ambiguityReasons.join(' ')}</p><p>Result region inspected: {value.automation.assessment.resultRegionInspected ? 'Yes' : 'No'} · Provenance: {value.provenance}</p><pre>{JSON.stringify(sales.technicalDetail, null, 2)}</pre></> : null}<pre>{JSON.stringify(value.automation.captures, null, 2)}</pre></details> : null}
        {assistedGoogleBrand ? <OperatorAssistedGoogleBrand profile={profile} profileState={profileState} query={query} value={value} url={value.automation?.inspectedUrl || publicPresenceUrl(destination, query.query)} onChange={onChange} /> : null}
        <div className="search-observation-grid"><label>Review outcome<select value={value.overallResult} onChange={(event) => { const overallResult = event.target.value as SearchVisibilityResult; patch(query, destination, { overallResult, reviewed: false, observedAt: new Date().toISOString(), evidenceKind: overallResult === 'not_found' ? 'absence' : overallResult === 'unable_to_verify' ? 'unable_to_verify' : 'external_observation' }) }}><option value="found_match">Found — looks correct</option><option value="found_conflicting_information">Found — correction needed</option><option value="not_found">Not found</option><option value="unable_to_verify">Unable to determine</option>{results.filter((result) => !['found_match', 'found_conflicting_information', 'not_found', 'unable_to_verify'].includes(result)).map((result) => <option key={result} value={result}>{searchVisibilityResultLabel(result)}</option>)}</select></label><label>Observed at<input type="datetime-local" value={value.observedAt.slice(0, 16)} onChange={(event) => patch(query, destination, { observedAt: event.target.value ? new Date(event.target.value).toISOString() : '' })}/></label><label className="checkbox-field"> <input id={`${query.id}-${destination}-reviewed`} type="checkbox" checked={value.reviewed} onChange={(event) => patch(query, destination, { reviewed: event.target.checked })}/><span>Reviewed for Action Plan</span></label></div>
        <fieldset className="result-type-fieldset"><legend>Observed result types</legend>{types.map((type) => <label className="result-type-option" key={type} htmlFor={`${query.id}-${destination}-${type}`}><input id={`${query.id}-${destination}-${type}`} type="checkbox" checked={value.observedResultTypes.includes(type)} onChange={(event) => patch(query, destination, { observedResultTypes: normalizeSearchResultTypes(event.target.checked ? [...value.observedResultTypes, type] : value.observedResultTypes.filter((item) => item !== type)) })}/><span>{searchResultTypeLabel(destination, type)}</span></label>)}</fieldset>
        <div className="directory-row-grid"><label>Evidence notes<textarea value={value.evidenceNotes} onChange={(event) => patch(query, destination, { evidenceNotes: event.target.value })}/></label><label>Competitors observed <span className="customer-small">(or correction notes: name, address, phone, website, category, other)</span><textarea value={value.competitorsObserved} onChange={(event) => patch(query, destination, { competitorsObserved: event.target.value })}/></label></div><label className="full-width-label">Recommended action<textarea value={value.recommendedAction} onChange={(event) => patch(query, destination, { recommendedAction: event.target.value })}/></label>
      </details> })}
      <div className="directory-actions"><button type="button" onClick={() => onAddToActionPlan(query)}>Add reviewed primary evidence to Action Plan</button></div>
    </article>)}</div>
  </section>
}
