import { useState } from 'react'
import type {
  AIAnswerPackageFit,
  AIAnswerPlatform,
  AIAnswerResultStatus,
  AIAnswerTestState,
  BusinessProfile,
  EvidenceConfidence,
} from '../types/audit'
import { evidenceConfidenceOptions } from '../utils/evidenceConfidence'

interface AIAnswerVisibilityTestProps {
  profile: BusinessProfile
  selectedPlatform: AIAnswerPlatform
  value: AIAnswerTestState
  tests: Record<AIAnswerPlatform, AIAnswerTestState>
  platformScores: Record<AIAnswerPlatform, number>
  checkedCount: number
  uncheckedCount: number
  onSelectedPlatformChange: (platform: AIAnswerPlatform) => void
  onChange: (value: AIAnswerTestState) => void
  onAddToActionPlan: () => void
}

const platforms: AIAnswerPlatform[] = [
  'ChatGPT',
  'Gemini',
  'Perplexity',
  'Copilot',
  'Claude',
  'Grok',
]

const statusOptions: Array<{ value: AIAnswerResultStatus; label: string }> = [
  { value: 'unknown', label: 'Not tested' },
  { value: 'signin_required', label: 'Not tested - sign-in required' },
  { value: 'pass', label: 'Pass' },
  { value: 'partial', label: 'Partial' },
  { value: 'fail', label: 'Fail' },
]

const priorityOptions: AIAnswerTestState['priority'][] = [
  'High',
  'Medium',
  'Low',
]

const packageFitOptions: AIAnswerPackageFit[] = [
  'Starter Visibility Cleanup',
  'Monthly Visibility Monitoring',
  'Website SEO Implementation',
]

type CopiedPrompt = 'checking' | 'analysis' | null

const buildCheckingPrompt = (profile: BusinessProfile) => {
  const phoneLine = profile.phone ? `Phone: ${profile.phone}` : 'Phone: not provided'
  const contactLines = contactStructureLines(profile)

  return [
    'Evaluate this local business using public information available to you. Do not invent details. If something is unclear or inconsistent, say so.',
    '',
    `Business name: ${profile.businessName}`,
    `Website: ${profile.website}`,
    phoneLine,
    ...contactLines,
    `Location/service area: ${profile.targetLocation}; ${profile.serviceArea}`,
    `Services: ${profile.primaryServices}`,
    '',
    'Please answer these questions:',
    '1. Can you identify this business and its official website?',
    '2. What services do you associate with this business?',
    '3. What location or service area do you associate with this business?',
    '4. Is this business relevant for the target local searches implied by these services and locations?',
    '5. What details are missing, unclear, outdated, or inconsistent?',
    '6. What public sources or signals did you rely on?',
    '7. What improvements would help search, maps, and AI tools understand the business better?',
    '',
    'Return a concise summary with any source names or URLs you used.',
  ].join('\n')
}

const buildAnalysisPrompt = (
  profile: BusinessProfile,
  selectedPlatform: AIAnswerPlatform,
  rawResponse: string,
) => {
  const contactLines = contactStructureLines(profile)

  return [
    `Analyze the following ${selectedPlatform} response for a local business visibility audit.`,
    '',
    'Business profile contact context:',
    ...contactLines,
    '',
    'Return a scanner-ready summary using this exact structure:',
    '',
    'Result status:',
    'Choose Pass, Partial, or Fail.',
    '',
    'Priority:',
    'Choose High, Medium, or Low.',
    '',
    'Package fit:',
    'Choose one primary fit from:',
    '- Starter Visibility Cleanup',
    '- Monthly Visibility Monitoring',
    '- Website SEO Implementation',
    '',
    'Evidence summary:',
    'Return this field inside a fenced text block so it can be copied easily.',
    '',
    '```text',
    '[customer-ready evidence summary here]',
    '```',
    '',
    'Write a concise customer-ready summary of what the AI platform understood correctly, what it missed, and what visibility gaps or improvement opportunities were found.',
    '',
    'Sources/signals mentioned:',
    'Return this field inside a fenced text block so it can be copied easily.',
    '',
    '```text',
    '[public sources, websites, listings, reviews, maps references, directories, social profiles, or other signals mentioned]',
    '```',
    '',
    'Keep this short.',
    '',
    'Action Plan title:',
    'Return this field inside a fenced text block so it can be copied easily.',
    '',
    '```text',
    '[short Action Plan title here]',
    '```',
    '',
    'Recommended action for Action Plan:',
    'Return this field inside a fenced text block so it can be copied easily.',
    '',
    '```text',
    '[customer-ready recommended action here]',
    '```',
    '',
    'Write the recommended fix in customer-ready language. Focus on practical improvements to search, maps, listings, website SEO clarity, AI answer accuracy, voice readiness, or service-area visibility.',
    '',
    'Important:',
    '- Do not overstate the AI platform response as verified fact.',
    '- Treat the response as manual evidence from one AI platform test.',
    '- Do not claim rankings were automatically verified.',
    '- Do not claim the business was submitted to AI platforms.',
    '- If the AI platform identified the business accurately but found improvement opportunities, this is usually Pass with Medium or Low priority.',
    '- If the AI platform identified the business but missed important services, locations, phone, website, or business identity details, this is usually Partial.',
    '- If the AI platform could not identify the business or returned materially wrong information, this is usually Fail.',
    '- Do not treat multiple phone numbers as an inconsistency if the business profile explains they are valid owner/contact numbers.',
    '- If multiple numbers are valid, recommend clarifying the contact structure rather than forcing a single phone number.',
    '- If a platform requires one primary number, recommend selecting a primary listing number while keeping owner-specific numbers clearly labeled on the website.',
    '- For an intentional multi-owner contact setup, a useful Action Plan title is: Clarify multi-owner contact structure.',
    '- For an intentional multi-owner contact setup, a useful recommended action is: Keep both valid owner contact numbers if that matches the business workflow, but label them clearly on the website and use one preferred number only where a platform requires a single primary phone number.',
    '',
    'Raw AI platform response:',
    rawResponse.trim() || '[paste response here]',
  ].join('\n')
}

export function AIAnswerVisibilityTest({
  profile,
  selectedPlatform,
  value,
  tests,
  platformScores,
  checkedCount,
  uncheckedCount,
  onSelectedPlatformChange,
  onChange,
  onAddToActionPlan,
}: AIAnswerVisibilityTestProps) {
  const [copiedPrompt, setCopiedPrompt] = useState<CopiedPrompt>(null)
  const checkingPrompt = buildCheckingPrompt(profile)
  const analysisPrompt = buildAnalysisPrompt(
    profile,
    selectedPlatform,
    value.rawResponse,
  )

  const updateField = <Key extends keyof AIAnswerTestState>(
    key: Key,
    fieldValue: AIAnswerTestState[Key],
  ) => {
    onChange({ ...value, [key]: fieldValue })
  }

  const copyCheckingPrompt = async () => {
    await navigator.clipboard.writeText(checkingPrompt)
    setCopiedPrompt('checking')
    window.setTimeout(() => setCopiedPrompt(null), 2200)
  }

  const copyAnalysisPrompt = async () => {
    await navigator.clipboard.writeText(analysisPrompt)
    setCopiedPrompt('analysis')
    window.setTimeout(() => setCopiedPrompt(null), 2200)
  }

  return (
    <section className="panel ai-answer-test-panel">
      <div className="panel-header split-header">
        <div>
          <p className="eyebrow">Guided AI Answer Scan</p>
          <h2>AI Answer Visibility Test</h2>
          <p>
            Use the Checking Prompt to test the business in each AI platform.
            Then use the Analysis Prompt to turn that platform's raw response
            into scanner-ready evidence and Action Plan fields.
          </p>
        </div>
        <div className="prompt-action-buttons">
          <button type="button" onClick={() => void copyCheckingPrompt()}>
            Copy Checking Prompt
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void copyAnalysisPrompt()}
          >
            Copy Analysis Prompt
          </button>
          {copiedPrompt === 'checking' ? (
            <span className="copy-confirmation">Checking Prompt copied.</span>
          ) : null}
          {copiedPrompt === 'analysis' ? (
            <span className="copy-confirmation">Analysis Prompt copied.</span>
          ) : null}
        </div>
      </div>

      <section className="ai-coverage-panel ai-coverage-panel-top">
        <div>
          <p className="ai-step-label">Platform coverage</p>
          <p className="helper-text">
            {checkedCount} tested, {uncheckedCount} not tested. Select a
            platform below to edit its saved AI Answers test data.
          </p>
          <p className="helper-text">
            Some AI platforms may require login or signup before results are
            visible. Mark those as "Not tested - sign-in required" instead of
            Fail.
          </p>
        </div>
        <div className="ai-platform-coverage-list">
          {platforms.map((platform) => (
            <button
              className={`ai-platform-row ${
                selectedPlatform === platform ? 'ai-platform-row-active' : ''
              }`}
              key={platform}
              type="button"
              onClick={() => onSelectedPlatformChange(platform)}
            >
              <span>{platform}</span>
              <strong>{statusLabel(tests[platform].resultStatus)}</strong>
              <em>{Math.round(platformScores[platform])}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="ai-selected-platform-panel">
        <p className="selected-platform-label">Selected platform: {selectedPlatform}</p>
        <div className="ai-form-grid ai-classification-grid">
          <label>
            Result status
            <select
              value={value.resultStatus}
              onChange={(event) =>
                updateField(
                  'resultStatus',
                  event.target.value as AIAnswerResultStatus,
                )
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
            Priority
            <select
              value={value.priority}
              onChange={(event) =>
                updateField(
                  'priority',
                  event.target.value as AIAnswerTestState['priority'],
                )
              }
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>

          <label>
            Package fit
            <select
              value={value.packageFit}
              onChange={(event) =>
                updateField('packageFit', event.target.value as AIAnswerPackageFit)
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
              value={value.evidenceConfidence ?? 'ai_answer_response'}
              onChange={(event) =>
                updateField(
                  'evidenceConfidence',
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
            <span className="helper-text">
              This finding is based on one AI platform response and should be
              treated as directional evidence, not verified fact.
            </span>
          </label>
        </div>
      </section>

      <div className="ai-test-body">
        <div className="ai-result-form">
          <section className="ai-workflow-block">
            <label>
              Raw AI response
              <span className="helper-text">
                Paste the full response from Gemini, ChatGPT, Perplexity,
                Copilot, Claude, Grok, or another AI answer platform here.
                Paste the full AI platform response here first. Then copy the
                Analysis Prompt into ChatGPT, include this raw response, and
                paste the cleaned outputs into the fields below.
              </span>
              <textarea
                className="raw-ai-response-textarea"
                value={value.rawResponse}
                onChange={(event) =>
                  updateField('rawResponse', event.target.value)
                }
                placeholder="Paste the full AI response here."
              />
            </label>
          </section>

          <section className="ai-workflow-block">
            <label>
              Evidence summary
              <span className="helper-text">
                Summarize the useful finding here. This is the version that can
                be shown in the report or added to the Action Plan.
              </span>
              <textarea
                className="large-evidence-textarea"
                value={value.evidenceNotes}
                onChange={(event) =>
                  updateField('evidenceNotes', event.target.value)
                }
                placeholder="Write the cleaned, customer-ready summary here."
              />
            </label>
          </section>

          <label>
            Sources/signals mentioned
            <span className="helper-text">
              Keep this to the source names, directories, listings, or signals
              the platform referenced.
            </span>
            <textarea
              className="compact-textarea"
              value={value.sourcesMentioned}
              onChange={(event) =>
                updateField('sourcesMentioned', event.target.value)
              }
              placeholder="Example: business website, Google Business Profile, Facebook, Instagram, The Knot, WeddingWire, Zola."
            />
          </label>

          <label>
            Action Plan title
            <input
              value={value.gapTitle}
              onChange={(event) => updateField('gapTitle', event.target.value)}
              placeholder="Strengthen AI-readable local business signals"
            />
          </label>

          <label>
            Recommended action for Action Plan
            <span className="helper-text">
              Write the fix in customer-ready language. This will be used when
              adding the AI Answers finding to the Action Plan.
            </span>
            <textarea
              className="large-evidence-textarea"
              value={value.suggestedFix}
              onChange={(event) =>
                updateField('suggestedFix', event.target.value)
              }
              placeholder="Write the customer-ready recommended action here."
            />
          </label>

          <button type="button" onClick={onAddToActionPlan}>
            Add to Action Plan
          </button>
        </div>
      </div>
    </section>
  )
}

function statusLabel(status: AIAnswerResultStatus) {
  if (status === 'unknown') return 'Not tested'
  if (status === 'signin_required') return 'Not tested - sign-in required'
  if (status === 'pass') return 'Pass'
  if (status === 'partial') return 'Partial'
  return 'Fail'
}

function contactStructureLines(profile: BusinessProfile) {
  const validPhoneNumbers = (profile.phoneNumbers ?? []).filter(
    (record) => record.isValidPublicContact && record.number.trim(),
  )
  const phoneLines = validPhoneNumbers.map((record) => {
    const primary = record.isPrimaryForListings ? ' Primary for listings.' : ''
    return `Known valid contact numbers: ${record.label || 'Contact'} - ${record.number} - ${[record.role, record.publicUse]
      .filter(Boolean)
      .join(' / ') || 'valid public contact'}.${primary}`
  })

  if (!profile.contactStructureNote && phoneLines.length === 0) {
    return ['Contact structure note: none provided.']
  }

  return [
    `Contact structure note: ${profile.contactStructureNote || 'none provided.'}`,
    ...phoneLines,
  ]
}
