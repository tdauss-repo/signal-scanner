import type {
  BusinessProfile,
  EvidenceConfidence,
  SearchVisibilityQuery,
  SearchVisibilityResult,
  SearchVisibilityTestState,
  SearchVisibilityWhereFound,
} from '../types/audit'
import { evidenceConfidenceOptions } from '../utils/evidenceConfidence'
import { bingSearch, duckDuckGoSearch, googleSearch } from '../utils/links'
import {
  buildSearchVisibilityQueries,
  defaultSearchVisibilityTest,
  findingPriorityForSearchObservation,
  recommendedActionForSearchObservation,
  searchVisibilityResultLabel,
} from '../utils/searchVisibility'

interface SearchVisibilityPanelProps {
  profile: BusinessProfile
  tests: Record<string, SearchVisibilityTestState>
  onChange: (id: string, value: SearchVisibilityTestState) => void
  onAddToActionPlan: (query: SearchVisibilityQuery) => void
}

const resultOptions: Array<{
  value: SearchVisibilityResult
  label: string
}> = [
  { value: 'not_checked', label: 'Not checked' },
  { value: 'found_prominently', label: 'Found prominently' },
  { value: 'found_weak', label: 'Found but weak' },
  { value: 'found_directory_only', label: 'Found only through directory/listing' },
  { value: 'not_found', label: 'Not found' },
  { value: 'manual_review_needed', label: 'Manual review needed' },
]

const whereFoundOptions: SearchVisibilityWhereFound[] = [
  'Website',
  'Google Business Profile / map result',
  'Directory',
  'Social profile',
  'Competitor results only',
  'Not observed',
]

const packageFitOptions: SearchVisibilityTestState['packageFit'][] = [
  'Starter Visibility Cleanup',
  'Website SEO Implementation',
  'Monthly Visibility Monitoring',
]

export function SearchVisibilityPanel({
  profile,
  tests,
  onChange,
  onAddToActionPlan,
}: SearchVisibilityPanelProps) {
  const queries = buildSearchVisibilityQueries(profile)

  const updateQuery = (
    query: SearchVisibilityQuery,
    patch: Partial<SearchVisibilityTestState>,
  ) => {
    const current = {
      ...defaultSearchVisibilityTest(),
      ...tests[query.id],
      recommendedAction:
        tests[query.id]?.recommendedAction ||
        recommendedActionForSearchObservation(
          query,
          tests[query.id]?.visibilityResult ?? 'not_checked',
        ),
    }
    onChange(query.id, { ...current, ...patch })
  }

  return (
    <section className="panel search-visibility-panel">
      <div className="panel-header">
        <p className="eyebrow">Auto-Generated Visibility Scan</p>
        <h2>Guided manual search visibility evidence</h2>
        <p>
          Open generated customer-style search queries, observe public results,
          and record evidence without claiming exact rankings or scraping search
          results.
        </p>
      </div>

      <div className="search-query-list">
        {queries.map((query) => {
          const value = {
            ...defaultSearchVisibilityTest(),
            ...tests[query.id],
            recommendedAction:
              tests[query.id]?.recommendedAction ||
              recommendedActionForSearchObservation(
                query,
                tests[query.id]?.visibilityResult ?? 'not_checked',
              ),
          }
          const findingPriority = findingPriorityForSearchObservation(
            query,
            value.visibilityResult,
          )

          return (
            <article className="search-query-card" key={query.id}>
              <div className="audit-title-row">
                <div>
                  <p className="fix-area">{query.intentType}</p>
                  <h3>{query.query}</h3>
                </div>
                <div className="search-priority-stack">
                  <span className="method-pill">
                    Query importance: {query.priority}
                  </span>
                  <span className="method-pill">
                    Finding priority: {findingPriority}
                  </span>
                </div>
              </div>
              <p className="method-guidance">
                Priority updates after observation. A high-importance query can
                become low priority if the business is found prominently.
              </p>

              <div className="directory-actions">
                <a href={googleSearch(query.query)} target="_blank" rel="noreferrer">
                  Google search
                </a>
                <a href={bingSearch(query.query)} target="_blank" rel="noreferrer">
                  Bing search
                </a>
                <a
                  href={duckDuckGoSearch(query.query)}
                  target="_blank"
                  rel="noreferrer"
                >
                  DuckDuckGo search
                </a>
              </div>

              <div className="search-observation-grid">
                <label>
                  Visibility result
                  <select
                    value={value.visibilityResult}
                    onChange={(event) =>
                      updateQuery(query, {
                        visibilityResult: event.target.value as SearchVisibilityResult,
                        recommendedAction: recommendedActionForSearchObservation(
                          query,
                          event.target.value as SearchVisibilityResult,
                        ),
                        evidenceConfidence:
                          event.target.value === 'not_checked'
                            ? 'manual_needs_confirmation'
                            : 'public_search_observed',
                      })
                    }
                  >
                    {resultOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Where found
                  <select
                    value={value.whereFound}
                    onChange={(event) =>
                      updateQuery(query, {
                        whereFound: event.target.value as SearchVisibilityWhereFound,
                      })
                    }
                  >
                    {whereFoundOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Package fit
                  <select
                    value={value.packageFit}
                    onChange={(event) =>
                      updateQuery(query, {
                        packageFit: event.target
                          .value as SearchVisibilityTestState['packageFit'],
                      })
                    }
                  >
                    {packageFitOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Evidence Confidence
                  <select
                    value={value.evidenceConfidence}
                    onChange={(event) =>
                      updateQuery(query, {
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
                </label>
              </div>

              <div className="directory-row-grid">
                <label>
                  Evidence notes
                  <textarea
                    value={value.evidenceNotes}
                    onChange={(event) =>
                      updateQuery(query, { evidenceNotes: event.target.value })
                    }
                    placeholder="Example: Found the website in organic results and a directory profile; Google Business/map result was not clearly visible."
                  />
                </label>
                <label>
                  Competitors observed
                  <textarea
                    value={value.competitorsObserved}
                    onChange={(event) =>
                      updateQuery(query, {
                        competitorsObserved: event.target.value,
                      })
                    }
                    placeholder="Example: Competitor names or directories that appeared strongly for this query."
                  />
                </label>
              </div>

              <label className="full-width-label">
                Recommended action
                <textarea
                  value={value.recommendedAction}
                  onChange={(event) =>
                    updateQuery(query, { recommendedAction: event.target.value })
                  }
                />
              </label>

              <div className="directory-method-note">
                <span>
                  Observed status: {searchVisibilityResultLabel(value.visibilityResult)}
                </span>
                <span>
                  Manual search evidence only. Do not record exact rankings unless
                  the operator explicitly verifies them in notes.
                </span>
              </div>

              <div className="directory-actions">
                <button type="button" onClick={() => onAddToActionPlan(query)}>
                  Add to Action Plan
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
