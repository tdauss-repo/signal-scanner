import { useState } from 'react'
import type {
  BusinessProfile,
  CheckStatus,
  DirectoryAuditRow,
  DirectoryAuditState,
  DirectoryAuthority,
  DirectoryCheckMethod,
  DirectoryListingStatus,
  DirectorySuggestion,
  DirectoryType,
  EvidenceConfidence,
  OwnerAccessStatus,
} from '../types/audit'
import type { PublicPageCheckResponse } from '../types/publicPageCheck'
import { evidenceConfidenceOptions } from '../utils/evidenceConfidence'
import { runPublicPageCheck } from '../utils/publicPageCheck'
import {
  businessDirectoryKey,
  buildDirectorySuggestions,
  directorySuggestionToRow,
  emptyDirectoryRow,
} from '../utils/directorySuggestions'
import { StatusBadge } from './StatusBadge'

interface DirectoryAuditPanelProps {
  profile: BusinessProfile
  state: DirectoryAuditState
  onChange: (state: DirectoryAuditState) => void
  onAddToActionPlan: (row: DirectoryAuditRow) => void
}

const checkFields: Array<{
  key: keyof Pick<
    DirectoryAuditRow,
    | 'listingFound'
    | 'nameMatches'
    | 'addressMatches'
    | 'phoneMatches'
    | 'websiteMatches'
    | 'categoryMatches'
    | 'descriptionAccurate'
    | 'reviewsVisible'
    | 'photosPresent'
    | 'duplicateFound'
  >
  label: string
}> = [
  { key: 'listingFound', label: 'Listing found' },
  { key: 'nameMatches', label: 'Name matches' },
  { key: 'addressMatches', label: 'Address/service area matches' },
  { key: 'phoneMatches', label: 'Phone/contact matches' },
  { key: 'websiteMatches', label: 'Website matches' },
  { key: 'categoryMatches', label: 'Category/services match' },
  { key: 'descriptionAccurate', label: 'Description accurate' },
  { key: 'reviewsVisible', label: 'Reviews/ratings visible' },
  { key: 'photosPresent', label: 'Photos/portfolio present' },
  { key: 'duplicateFound', label: 'Duplicate/outdated listing found' },
]

const statusOptions: Array<{ value: CheckStatus; label: string }> = [
  { value: 'unknown', label: 'Not checked' },
  { value: 'pass', label: 'Pass' },
  { value: 'partial', label: 'Partial' },
  { value: 'fail', label: 'Fail' },
]

const directoryTypes: DirectoryType[] = [
  'Industry directory',
  'Local directory',
  'Chamber / association',
  'Marketplace',
  'Review site',
  'Social/profile site',
  'Other',
]

const checkMethods: DirectoryCheckMethod[] = [
  'Manual verification only',
  'Public search assist only',
  'Public page check available',
  'Future API only',
]

const authorityOptions: DirectoryAuthority[] = ['High', 'Medium', 'Low']

const ownerAccessOptions: OwnerAccessStatus[] = [
  'Not checked',
  'Unverified - public listing only',
  'Confirmed with owner',
  'Owner access missing',
  'Access request needed',
]

const directoryStatusOptions: Array<{
  value: DirectoryListingStatus
  label: string
}> = [
  { value: 'not_checked', label: 'Not checked' },
  { value: 'found_accurate', label: 'Found and accurate' },
  { value: 'found_incomplete', label: 'Found but incomplete' },
  { value: 'found_inaccurate', label: 'Found but inaccurate' },
  { value: 'not_found', label: 'Not found' },
  { value: 'duplicate_outdated', label: 'Duplicate/outdated listing found' },
  { value: 'manual_review_needed', label: 'Manual review needed' },
]

const rowStatus = (row: DirectoryAuditRow): CheckStatus => {
  const listingResult = row.listingResult ?? row.directoryStatus

  if (
    row.listingUrlStatus === 'url_needed' ||
    row.listingUrlStatus === 'url_needs_review' ||
    !listingResult ||
    listingResult === 'not_checked' ||
    listingResult === 'manual_review_needed'
  ) {
    return 'unknown'
  }
  if (listingResult === 'found_accurate') return 'pass'
  if (listingResult === 'found_incomplete') return 'partial'
  if (
    listingResult === 'found_inaccurate' ||
    listingResult === 'duplicate_outdated'
  ) {
    return 'fail'
  }
  if (listingResult === 'not_found') {
    return row.authority === 'Low' ? 'partial' : 'fail'
  }

  const values = checkFields.map((field) => row[field.key])
  if (values.every((value) => value === 'unknown')) return 'unknown'
  if (
    row.duplicateFound === 'fail' ||
    row.listingFound === 'fail' ||
    values.some((value) => value === 'fail')
  ) {
    return 'fail'
  }
  if (values.some((value) => value === 'partial' || value === 'unknown')) {
    return 'partial'
  }
  return 'pass'
}

export function directoryRowToAuditItem(row: DirectoryAuditRow) {
  const weight = row.authority === 'High' ? 10 : row.authority === 'Medium' ? 7 : 4

  return {
    id: `directory-${row.id}`,
    area: 'listings' as const,
    label: `${row.directoryName || 'Directory'} listing`,
    description:
      'Activated optional directory check. Owner/admin access is not assumed from public evidence.',
    weight,
    access: 'public' as const,
    evidenceLinks: row.manualSearchUrl
      ? [{ label: 'Manual search', url: row.manualSearchUrl }]
      : [],
    fix:
      row.recommendedAction ||
      'Correct public listing details, categories, website links, photos, descriptions, and owner access notes where applicable.',
  }
}

export function directoryRowToStatus(row: DirectoryAuditRow): CheckStatus {
  return rowStatus(row)
}

const directoryStatusLabel = (status: DirectoryListingStatus | undefined) =>
  directoryStatusOptions.find((option) => option.value === status)?.label ??
  'Not checked'

const listingUrlStatusLabel = (row: DirectoryAuditRow) => {
  if (
    row.checkMethod === 'Public page check available' &&
    row.listingUrlStatus === 'url_saved'
  ) {
    return 'URL saved'
  }
  if (row.listingUrlStatus === 'url_saved') return 'URL saved'
  if (row.listingUrlStatus === 'url_needs_review') return 'URL needs review'
  if (row.listingUrlStatus === 'url_unavailable') return 'URL unavailable'
  return 'URL needed'
}

const checkMethodDisplay = (
  method: DirectoryCheckMethod,
  listingUrlStatus?: DirectoryAuditRow['listingUrlStatus'],
) => {
  if (method === 'Public search assist only') return 'Manual search required'
  if (method === 'Public page check available') {
    return listingUrlStatus === 'url_saved'
      ? 'Public page check ready'
      : 'Public page check available — URL needed'
  }
  return method
}

const checkMethodGuidance = (
  method: DirectoryCheckMethod,
  listingUrlStatus?: DirectoryAuditRow['listingUrlStatus'],
) => {
  if (method === 'Public page check available') {
    if (listingUrlStatus === 'url_saved') {
      return 'A public listing URL is saved and can be checked by the scanner.'
    }
    return 'Add the public listing URL, then this directory can be checked by the scanner in a future scan.'
  }
  if (method === 'Public search assist only') {
    return 'Use the search link to manually confirm whether this listing exists.'
  }
  if (method === 'Manual verification only') return 'Manual verification only.'
  return 'Future API / manual-only for now.'
}

const protectedDirectoryPattern =
  /google business|google places|apple maps|apple business|bing places|bing maps|facebook|instagram|yelp|chatgpt|gemini|claude|copilot|perplexity|grok/i

const canRunPublicPageCheck = (row: DirectoryAuditRow) =>
  row.checkMethod === 'Public page check available' &&
  row.listingUrlStatus === 'url_saved' &&
  Boolean(row.listingUrl.trim()) &&
  !protectedDirectoryPattern.test(row.directoryName)

const foundDataRows: Array<{
  key: keyof NonNullable<DirectoryAuditRow['foundData']>
  label: string
}> = [
  { key: 'businessNameFound', label: 'Name' },
  { key: 'phoneFound', label: 'Phone/contact' },
  { key: 'websiteFound', label: 'Website' },
  { key: 'addressOrServiceAreaFound', label: 'Address/service area' },
  { key: 'categoryServicesFound', label: 'Category/services' },
  { key: 'descriptionFound', label: 'Description' },
]

export function DirectoryAuditPanel({
  profile,
  state,
  onChange,
  onAddToActionPlan,
}: DirectoryAuditPanelProps) {
  const [checkingRowId, setCheckingRowId] = useState<string | null>(null)
  const [checkMessages, setCheckMessages] = useState<Record<string, string>>({})
  const businessId = businessDirectoryKey(profile)
  const currentRows = state.activeRows.filter(
    (row) => !row.businessId || row.businessId === businessId,
  )
  const suggestions = buildDirectorySuggestions(profile).filter(
    (suggestion) =>
      !state.ignoredSuggestionIds.includes(suggestion.id) &&
      !currentRows.some(
        (row) => row.directoryName === suggestion.directoryName,
      ),
  )

  const updateRow = (id: string, nextRow: DirectoryAuditRow) => {
    onChange({
      ...state,
      activeRows: state.activeRows.map((row) => (row.id === id ? nextRow : row)),
    })
  }

  const updateListingUrl = (row: DirectoryAuditRow, listingUrl: string) => {
    const trimmedUrl = listingUrl.trim()
    updateRow(row.id, {
      ...row,
      listingUrl,
      listingUrlStatus: trimmedUrl
        ? 'url_saved'
        : row.requiresOperatorUrl
          ? 'url_needed'
          : 'url_unavailable',
    })
  }

  const activateSuggestion = (suggestion: DirectorySuggestion) => {
    const existingRow = state.activeRows.find(
      (row) =>
        row.businessId === businessId &&
        row.directoryName === suggestion.directoryName,
    )
    if (existingRow) return

    onChange({
      ...state,
      activeRows: [
        ...state.activeRows,
        directorySuggestionToRow(suggestion, businessId),
      ],
    })
  }

  const applyPublicPageCheck = (
    row: DirectoryAuditRow,
    result: PublicPageCheckResponse,
  ) => {
    updateRow(row.id, {
      ...row,
      foundData: result.foundData,
      listingResult: result.listingResult,
      directoryStatus: result.listingResult,
      lastCheckedAt: result.lastCheckedAt,
      publicEvidenceNotes: result.publicEvidenceNotes,
      evidenceNotes: result.publicEvidenceNotes,
      recommendedAction: result.recommendedAction,
      evidenceConfidence: result.evidenceConfidence,
      listingUrlStatus:
        result.listingResult === 'manual_review_needed'
          ? row.listingUrlStatus
          : 'url_saved',
    })
    setCheckMessages((messages) => ({
      ...messages,
      [row.id]: result.ok
        ? 'Public Page Check completed. Review before using in a customer report or Action Plan.'
        : result.error ?? 'Public page fetch was unavailable or blocked. Use manual verification.',
    }))
  }

  const runRowPublicPageCheck = async (row: DirectoryAuditRow) => {
    setCheckingRowId(row.id)
    setCheckMessages((messages) => ({ ...messages, [row.id]: '' }))
    try {
      const result = await runPublicPageCheck(profile, row)
      applyPublicPageCheck(row, result)
    } catch {
      const lastCheckedAt = new Date().toISOString()
      updateRow(row.id, {
        ...row,
        listingResult: 'manual_review_needed',
        directoryStatus: 'manual_review_needed',
        lastCheckedAt,
        publicEvidenceNotes:
          'Public page fetch was unavailable or blocked. Use manual verification.',
        evidenceNotes:
          'Public page fetch was unavailable or blocked. Use manual verification.',
        recommendedAction:
          'Manually review the directory listing and document whether the public information matches the business profile.',
        evidenceConfidence: 'manual_needs_confirmation',
      })
      setCheckMessages((messages) => ({
        ...messages,
        [row.id]: 'Public page fetch was unavailable or blocked. Use manual verification.',
      }))
    } finally {
      setCheckingRowId(null)
    }
  }

  const summary = currentRows.reduce(
    (totals, row) => {
      const listingResult = row.listingResult ?? row.directoryStatus
      if (listingResult === 'found_accurate') totals.found += 1
      if (
        listingResult === 'found_incomplete' ||
        listingResult === 'found_inaccurate' ||
        listingResult === 'duplicate_outdated'
      ) {
        totals.cleanup += 1
      }
      if (listingResult === 'not_found') totals.missing += 1
      if (
        row.ownerAccessStatus === 'Owner access missing' ||
        row.ownerAccessStatus === 'Access request needed'
      ) {
        totals.access += 1
      }
      return totals
    },
    { found: 0, cleanup: 0, missing: 0, access: 0 },
  )

  return (
    <section className="panel directory-panel">
      <div className="panel-header">
        <p className="eyebrow">Industry & Local Directory Opportunities</p>
        <h2>Suggested opportunities and activated checks</h2>
        <p>
          Suggestions are based on Business Settings. They are optional and do
          not affect Listings score until activated.
        </p>
      </div>

      <div className="directory-summary-grid">
        <div>
          <strong>{summary.found}</strong>
          <span>Found and accurate</span>
        </div>
        <div>
          <strong>{summary.cleanup}</strong>
          <span>Needs cleanup</span>
        </div>
        <div>
          <strong>{summary.missing}</strong>
          <span>Missing opportunities</span>
        </div>
        <div>
          <strong>{summary.access}</strong>
          <span>Access/onboarding items</span>
        </div>
      </div>

      <div className="directory-suggestions">
        {suggestions.map((suggestion) => (
          <article className="directory-suggestion" key={suggestion.id}>
            <div>
              <div className="directory-suggestion-heading">
                <strong>{suggestion.directoryName}</strong>
                <span className="method-pill">
                  {checkMethodDisplay(
                    suggestion.checkMethod,
                    suggestion.requiresOperatorUrl ? 'url_needed' : 'url_unavailable',
                  )}
                </span>
                <span className="method-pill method-pill-muted">
                  {suggestion.requiresOperatorUrl ? 'URL needed' : 'URL unavailable'}
                </span>
              </div>
              <p>
                {suggestion.authority} relevance | {suggestion.reason}
              </p>
              <p className="method-guidance">
                {checkMethodGuidance(
                  suggestion.checkMethod,
                  suggestion.requiresOperatorUrl ? 'url_needed' : 'url_unavailable',
                )}
              </p>
              <a href={suggestion.manualSearchUrl} target="_blank" rel="noreferrer">
                Manual search
              </a>
            </div>
            <div className="directory-actions">
              <button type="button" onClick={() => activateSuggestion(suggestion)}>
                Activate
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  onChange({
                    ...state,
                    ignoredSuggestionIds: [
                      ...state.ignoredSuggestionIds,
                      suggestion.id,
                    ],
                  })
                }
              >
                Ignore
              </button>
            </div>
          </article>
        ))}
        {suggestions.length === 0 ? (
          <p className="empty-state">No unused suggestions for this profile.</p>
        ) : null}
      </div>

      <div className="directory-active-header">
        <div>
          <p className="eyebrow">Activated Directory Checks</p>
          <h3>Active directory cards</h3>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...state,
              activeRows: [...state.activeRows, emptyDirectoryRow(businessId)],
            })
          }
        >
          Add custom directory
        </button>
      </div>

      <div className="directory-active-list">
        {currentRows.map((row) => (
          <article className="directory-row" key={row.id}>
            <div className="audit-title-row">
              <div>
                <p className="fix-area">{row.source === 'suggested' ? 'Activated suggestion' : 'Custom directory'}</p>
                <h3>{row.directoryName || 'Untitled directory'}</h3>
              </div>
              <StatusBadge status={rowStatus(row)} />
            </div>

            <div className="directory-compact-grid">
              <label>
                Directory name
                <input
                  value={row.directoryName}
                  onChange={(event) =>
                    updateRow(row.id, { ...row, directoryName: event.target.value })
                  }
                />
              </label>
              <label>
                Listing result
                <select
                  value={row.listingResult ?? row.directoryStatus ?? 'not_checked'}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      listingResult: event.target.value as DirectoryListingStatus,
                      directoryStatus: event.target.value as DirectoryListingStatus,
                      lastCheckedAt:
                        event.target.value === 'not_checked'
                          ? row.lastCheckedAt
                          : new Date().toISOString(),
                    })
                  }
                >
                  {directoryStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                URL status
                <input value={listingUrlStatusLabel(row)} readOnly />
              </label>
              <label>
                Check method
                <select
                  value={row.checkMethod}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      checkMethod: event.target.value as DirectoryCheckMethod,
                    })
                  }
                >
                  {checkMethods.map((method) => (
                    <option key={method} value={method}>
                      {checkMethodDisplay(method, row.listingUrlStatus)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Relevance
                <select
                  value={row.relevance ?? row.authority}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      authority: event.target.value as DirectoryAuthority,
                      relevance: event.target.value as DirectoryAuthority,
                    })
                  }
                >
                  {authorityOptions.map((authority) => (
                    <option key={authority} value={authority}>
                      {authority}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Listing/profile URL
                <input
                  value={row.listingUrl}
                  onChange={(event) =>
                    updateListingUrl(row, event.target.value)
                  }
                />
              </label>
              <label>
                Owner/admin access
                <select
                  value={row.ownerAdminAccessStatus ?? row.ownerAccessStatus}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      ownerAccessStatus: event.target.value as OwnerAccessStatus,
                      ownerAdminAccessStatus: event.target.value as OwnerAccessStatus,
                    })
                  }
                >
                  {ownerAccessOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="directory-method-note">
              <strong>
                {checkMethodDisplay(row.checkMethod, row.listingUrlStatus)}
              </strong>
              <span>
                URL status: {listingUrlStatusLabel(row)}
                {row.lastCheckedAt
                  ? ` | Last checked ${new Date(row.lastCheckedAt).toLocaleString()}`
                  : ''}
              </span>
              <span>{checkMethodGuidance(row.checkMethod, row.listingUrlStatus)}</span>
              <span>{row.capabilityNotes}</span>
              {canRunPublicPageCheck(row) ? (
                <span>
                  Public Page Check is a scanner-detected result from the saved
                  public URL. Review before using in the customer report or
                  Action Plan.
                </span>
              ) : null}
              {checkMessages[row.id] ? (
                <span className="method-guidance">{checkMessages[row.id]}</span>
              ) : null}
            </div>

            <div className="found-data-summary">
              {foundDataRows.map((item) => (
                <div key={`${row.id}-${item.key}`}>
                  <span>{item.label}</span>
                  <strong>{row.foundData?.[item.key] ?? 'Not checked'}</strong>
                </div>
              ))}
            </div>

            <div className="directory-row-grid">
              <label>
                Public evidence notes
                <textarea
                  value={row.publicEvidenceNotes ?? row.evidenceNotes}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      publicEvidenceNotes: event.target.value,
                      evidenceNotes: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Evidence Confidence
                <select
                  value={row.evidenceConfidence ?? 'manual_needs_confirmation'}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      evidenceConfidence: event.target.value as EvidenceConfidence,
                    })
                  }
                >
                  {evidenceConfidenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="helper-text">
                  Public listing details can be observed manually, but owner/admin
                  access should only be marked confirmed after the business owner
                  verifies it.
                </span>
              </label>
              <label>
                Recommended action
                <textarea
                  value={row.recommendedAction}
                  onChange={(event) =>
                    updateRow(row.id, {
                      ...row,
                      recommendedAction: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <details className="directory-details">
              <summary>Detailed public check fields</summary>
              <div className="directory-row-grid">
                <label>
                  Directory type
                  <select
                    value={row.directoryType}
                    onChange={(event) =>
                      updateRow(row.id, {
                        ...row,
                        directoryType: event.target.value as DirectoryType,
                      })
                    }
                  >
                    {directoryTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Current status
                  <input
                    value={directoryStatusLabel(
                      row.listingResult ?? row.directoryStatus,
                    )}
                    readOnly
                  />
                </label>
                <label>
                  Public page fetch allowed
                  <input
                    value={row.allowPublicPageFetch ? 'Yes, after URL is provided' : 'No'}
                    readOnly
                  />
                </label>
                <label>
                  Search result scraping
                  <input value="Disabled" readOnly />
                </label>
                <label>
                  Owner/admin access method
                  <input value={row.ownerAdminAccessMethod} readOnly />
                </label>
              </div>

              <div className="directory-check-grid">
                {checkFields.map((field) => (
                  <label key={`${row.id}-${field.key}`}>
                    {field.label}
                    <select
                      value={row[field.key]}
                      onChange={(event) =>
                        updateRow(row.id, {
                          ...row,
                          [field.key]: event.target.value as CheckStatus,
                        })
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="directory-row-grid">
                <label>
                  Business record key
                  <input value={row.businessId || businessId} readOnly />
                </label>
                <label>
                  Package fit
                  <input value={row.packageFit} readOnly />
                </label>
                <label>
                  Priority
                  <input value={row.priority} readOnly />
                </label>
              </div>
            </details>

            <div className="directory-actions">
              {row.manualSearchUrl ? (
                <a href={row.manualSearchUrl} target="_blank" rel="noreferrer">
                  Manual search
                </a>
              ) : null}
              {canRunPublicPageCheck(row) ? (
                <button
                  type="button"
                  onClick={() => void runRowPublicPageCheck(row)}
                  disabled={checkingRowId === row.id}
                >
                  {checkingRowId === row.id
                    ? 'Running Public Page Check...'
                    : 'Run Public Page Check'}
                </button>
              ) : null}
              <button type="button" onClick={() => onAddToActionPlan(row)}>
                Add to Action Plan
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  onChange({
                    ...state,
                    activeRows: state.activeRows.filter(
                      (activeRow) => activeRow.id !== row.id,
                    ),
                  })
                }
              >
                Remove active row
              </button>
            </div>
          </article>
        ))}
        {currentRows.length === 0 ? (
          <p className="empty-state">
            Activate a suggested directory or add a custom directory to begin
            scoring optional directory checks.
          </p>
        ) : null}
      </div>
    </section>
  )
}
