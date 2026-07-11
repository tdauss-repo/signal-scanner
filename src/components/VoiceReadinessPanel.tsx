import type {
  BusinessProfile,
  CheckStatus,
  EvidenceConfidence,
  VoicePromptTestState,
  VoicePromptTestStatus,
} from '../types/audit'
import { evidenceConfidenceOptions } from '../utils/evidenceConfidence'
import {
  buildVoicePromptTests,
  buildVoiceReadinessCategories,
  buildVoiceSourceReadinessGroups,
  defaultVoicePromptTest,
  personalizationRiskForDeviceContext,
  voiceDeviceContexts,
  voicePersonalizationRisks,
  voicePlatforms,
  voicePromptStatusLabel,
} from '../utils/voiceReadiness'

interface VoiceReadinessPanelProps {
  profile: BusinessProfile
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
  evidenceConfidence: Record<string, EvidenceConfidence>
  promptTests: Record<string, VoicePromptTestState>
  onStatusChange: (id: string, status: CheckStatus) => void
  onNoteChange: (id: string, note: string) => void
  onEvidenceConfidenceChange: (id: string, confidence: EvidenceConfidence) => void
  onPromptChange: (id: string, value: VoicePromptTestState) => void
  onAddCategoryToActionPlan: (id: string) => void
  onAddPromptToActionPlan: (id: string) => void
}

const statusOptions: Array<{ value: CheckStatus; label: string }> = [
  { value: 'unknown', label: 'Not checked' },
  { value: 'pass', label: 'Pass' },
  { value: 'partial', label: 'Partial' },
  { value: 'fail', label: 'Fail' },
]

const promptStatusOptions: Array<{
  value: VoicePromptTestStatus
  label: string
}> = [
  { value: 'not_tested', label: 'Not tested' },
  { value: 'business_found_accurate', label: 'Business found / accurate' },
  { value: 'business_found_incomplete', label: 'Business found / incomplete' },
  { value: 'wrong_outdated', label: 'Wrong or outdated info' },
  { value: 'not_found', label: 'Not found' },
]

const checkStatusLabel = (status: CheckStatus) => {
  if (status === 'pass') return 'Pass'
  if (status === 'partial') return 'Partial'
  if (status === 'fail') return 'Fail'
  return 'Needs review'
}

export function VoiceReadinessPanel({
  profile,
  checks,
  notes,
  evidenceConfidence,
  promptTests,
  onStatusChange,
  onNoteChange,
  onEvidenceConfidenceChange,
  onPromptChange,
  onAddCategoryToActionPlan,
  onAddPromptToActionPlan,
}: VoiceReadinessPanelProps) {
  const sourceGroups = buildVoiceSourceReadinessGroups(profile, checks)
  const categories = buildVoiceReadinessCategories(profile, checks)
  const prompts = buildVoicePromptTests(profile)
  const completedPromptCount = prompts.filter(
    (prompt) =>
      promptTests[prompt.id]?.testStatus &&
      promptTests[prompt.id]?.testStatus !== 'not_tested',
  ).length

  const updatePrompt = (
    id: string,
    current: VoicePromptTestState,
    patch: Partial<VoicePromptTestState>,
  ) => {
    onPromptChange(id, { ...current, ...patch })
  }

  return (
    <section className="panel voice-readiness-panel">
      <div className="panel-header">
        <p className="eyebrow">Derived readiness audit</p>
        <h2>Voice Search Readiness</h2>
        <p>
          Voice readiness is based on the public source signals voice assistants
          commonly rely on: maps/listings, contact details, categories, reviews,
          website content, FAQ content, and structured data. This is not a
          direct ranking check for Siri, Alexa, Google Assistant, or any other
          voice platform.
        </p>
        <p>
          Voice-style searches depend on whether assistants can clearly
          understand who the business is, what it offers, where it serves, and
          how customers can contact it.
        </p>
      </div>

      <div className="voice-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Source-readiness summary</p>
            <h3>Voice source readiness</h3>
            <p>
              These cards summarize source readiness for major voice-adjacent
              local data paths. They do not claim direct voice ranking checks.
            </p>
          </div>
        </div>

        <div className="voice-source-grid">
          {sourceGroups.map((group) => {
            const currentStatus = checks[group.id] ?? group.suggestedStatus
            return (
              <article className="voice-card voice-source-card" key={group.id}>
                <div className="audit-title-row">
                  <div>
                    <p className="fix-area">
                      Derived from: {group.sourceSection}
                    </p>
                    <h3>{group.label}</h3>
                  </div>
                </div>
                <p className="method-pill method-pill-inline">
                  Suggested status: {checkStatusLabel(group.suggestedStatus)} -
                  review
                </p>
                <p>{group.description}</p>
                <p className="method-guidance">{group.suggestedReason}</p>
                {currentStatus !== 'pass' ? <p>{group.recommendedAction}</p> : null}
                <label>
                  Status
                  <select
                    value={currentStatus}
                    onChange={(event) =>
                      onStatusChange(group.id, event.target.value as CheckStatus)
                    }
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Evidence notes
                  <textarea
                    value={notes[group.id] ?? ''}
                    onChange={(event) =>
                      onNoteChange(group.id, event.target.value)
                    }
                    placeholder="Record source-readiness evidence or why this needs review."
                  />
                </label>
                <label>
                  Evidence Confidence
                  <select
                    value={
                      evidenceConfidence[group.id] ??
                      'derived_readiness_signal'
                    }
                    onChange={(event) =>
                      onEvidenceConfidenceChange(
                        group.id,
                        event.target.value as EvidenceConfidence,
                      )
                    }
                  >
                    {evidenceConfidenceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {currentStatus === 'pass' ? (
                  <p className="method-guidance">
                    Source readiness appears strong. No Action Plan item needed
                    unless the operator overrides this check.
                  </p>
                ) : (
                  <div className="directory-actions">
                    <button
                      type="button"
                      onClick={() => onAddCategoryToActionPlan(group.id)}
                    >
                      Add to Action Plan
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>

      <div className="voice-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Primary score source</p>
            <h3>Derived readiness signals</h3>
            <p>
              These checks summarize public signal readiness. They are derived
              suggestions, not direct voice-platform test results.
            </p>
            <p>
              Voice readiness does not mean the business was submitted to Siri,
              Alexa, Google Assistant, or any other platform. It means the
              public signals those tools often rely on are clear, complete, and
              consistent.
            </p>
          </div>
        </div>

        <div className="voice-category-grid">
          {categories.map((category) => {
            const currentStatus = checks[category.id] ?? category.suggestedStatus
            return (
              <article className="voice-card" key={category.id}>
                <div className="audit-title-row">
                  <div>
                    <p className="fix-area">
                      Derived from: {category.sourceSection}
                    </p>
                    <h3>{category.label}</h3>
                  </div>
                </div>
                <p className="method-pill method-pill-inline">
                  Suggested status: {checkStatusLabel(category.suggestedStatus)} -
                  review
                </p>
                <p>{category.description}</p>
                <p className="method-guidance">{category.suggestedReason}</p>
                {currentStatus !== 'pass' ? (
                  <p>{category.recommendedAction}</p>
                ) : null}
                <label>
                  Status
                  <select
                    value={currentStatus}
                    onChange={(event) =>
                      onStatusChange(category.id, event.target.value as CheckStatus)
                    }
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Evidence notes
                  <textarea
                    value={notes[category.id] ?? ''}
                    onChange={(event) =>
                      onNoteChange(category.id, event.target.value)
                    }
                    placeholder="Record the public source or manual observation supporting this readiness status."
                  />
                </label>
                <label>
                  Evidence Confidence
                  <select
                    value={
                      evidenceConfidence[category.id] ??
                      'derived_readiness_signal'
                    }
                    onChange={(event) =>
                      onEvidenceConfidenceChange(
                        category.id,
                        event.target.value as EvidenceConfidence,
                      )
                    }
                  >
                    {evidenceConfidenceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {currentStatus === 'pass' ? (
                  <p className="method-guidance">
                    No Action Plan item needed unless the operator overrides
                    this check.
                  </p>
                ) : (
                  <div className="directory-actions">
                    <button
                      type="button"
                      onClick={() => onAddCategoryToActionPlan(category.id)}
                    >
                      Add to Action Plan
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>

      <details className="voice-section voice-samples-details">
        <summary>
          <div>
            <p className="eyebrow">Supporting evidence only</p>
            <h3>Optional directional voice samples</h3>
            <p>
              Manual voice samples are directional only. Results may vary by
              device, account, location, personalization, and exact wording.
              They are not used as the primary Voice Readiness score. Completed:{' '}
              {completedPromptCount}/{prompts.length}.{' '}
              {completedPromptCount === 0
                ? 'Manual voice tests optional / not completed.'
                : ''}
            </p>
          </div>
        </summary>

        <div className="voice-prompt-list">
          {prompts.map((prompt) => {
            const value = {
              ...defaultVoicePromptTest(prompt),
              ...promptTests[prompt.id],
            }
            return (
              <article className="search-query-card" key={prompt.id}>
                <div className="audit-title-row">
                  <div>
                    <p className="fix-area">{prompt.intent}</p>
                    <h3>{prompt.prompt}</h3>
                  </div>
                  <span className="method-pill">{prompt.priority} priority</span>
                </div>
                <div className="search-observation-grid">
                  <label>
                    Observed result
                    <select
                      value={value.testStatus}
                      onChange={(event) =>
                        updatePrompt(prompt.id, value, {
                          testStatus: event.target.value as VoicePromptTestStatus,
                          evidenceConfidence:
                            event.target.value === 'not_tested'
                              ? 'manual_needs_confirmation'
                              : 'public_search_observed',
                        })
                      }
                    >
                      {promptStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Platform tested
                    <select
                      value={value.platformTested}
                      onChange={(event) =>
                        updatePrompt(prompt.id, value, {
                          platformTested: event.target
                            .value as VoicePromptTestState['platformTested'],
                        })
                      }
                    >
                      {voicePlatforms.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Test device/context
                    <select
                      value={value.deviceContext}
                      onChange={(event) => {
                        const deviceContext = event.target
                          .value as VoicePromptTestState['deviceContext']
                        updatePrompt(prompt.id, value, {
                          deviceContext,
                          personalizationRisk:
                            personalizationRiskForDeviceContext(deviceContext),
                        })
                      }}
                    >
                      {voiceDeviceContexts.map((context) => (
                        <option key={context} value={context}>
                          {context}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Personalization risk
                    <select
                      value={value.personalizationRisk}
                      onChange={(event) =>
                        updatePrompt(prompt.id, value, {
                          personalizationRisk: event.target
                            .value as VoicePromptTestState['personalizationRisk'],
                        })
                      }
                    >
                      {voicePersonalizationRisks.map((risk) => (
                        <option key={risk} value={risk}>
                          {risk}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Package fit
                    <select
                      value={value.packageFit}
                      onChange={(event) =>
                        updatePrompt(prompt.id, value, {
                          packageFit: event.target
                            .value as VoicePromptTestState['packageFit'],
                        })
                      }
                    >
                      <option>Starter Visibility Cleanup</option>
                      <option>Website SEO Implementation</option>
                      <option>Monthly Visibility Monitoring</option>
                    </select>
                  </label>
                  <label>
                    Evidence Confidence
                    <select
                      value={value.evidenceConfidence}
                      onChange={(event) =>
                        updatePrompt(prompt.id, value, {
                          evidenceConfidence: event.target
                            .value as EvidenceConfidence,
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
                        updatePrompt(prompt.id, value, {
                          evidenceNotes: event.target.value,
                        })
                      }
                      placeholder="Record what the assistant/manual test returned. Avoid exact ranking or submission claims."
                    />
                  </label>
                  <label>
                    Recommended action
                    <textarea
                      value={value.recommendedAction}
                      onChange={(event) =>
                        updatePrompt(prompt.id, value, {
                          recommendedAction: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="directory-method-note">
                  <span>Status: {voicePromptStatusLabel(value.testStatus)}</span>
                  <span>
                    Context: {value.deviceContext}; personalization risk:{' '}
                    {value.personalizationRisk}.
                  </span>
                  <span>
                    Manual voice-style evidence only for the selected platform.
                    Do not claim direct platform submission, exact ranking, or
                    that one result applies to every voice assistant.
                  </span>
                </div>
                <div className="directory-actions">
                  <button
                    type="button"
                    onClick={() => onAddPromptToActionPlan(prompt.id)}
                  >
                    Add to Action Plan
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </details>
    </section>
  )
}
