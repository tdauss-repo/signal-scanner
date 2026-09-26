import type { AuditState } from '../types/audit'
import { normalizeBusinessProfileState } from './businessProfileState'
import { normalizeSalesReadiness } from './salesReadiness'
import { normalizeWebsiteAuditWorkspaceState } from './websiteAuditState'
import { blankProfile } from './workspaceProfile'

/**
 * Creates a new-business workspace from application defaults while explicitly
 * clearing every business-specific fact, observation, decision, and export
 * input. Runtime configuration in the supplied defaults is preserved.
 */
export const createIsolatedBusinessWorkspace = (
  defaults: AuditState,
  recordedAt = new Date().toISOString(),
): AuditState => ({
  ...defaults,
  profile: structuredClone(blankProfile),
  businessProfile: normalizeBusinessProfileState(blankProfile, undefined, recordedAt),
  checks: {},
  notes: {},
  evidenceConfidence: {},
  aiAnswerTests: Object.entries(defaults.aiAnswerTests).reduce((tests, [platform, test]) => ({
    ...tests,
    [platform]: {
      ...test,
      resultStatus: 'unknown',
      evidenceConfidence: 'ai_answer_response',
      rawResponse: '',
      evidenceNotes: '',
      sourcesMentioned: '',
      gapTitle: 'Strengthen AI-readable local business signals',
      suggestedFix: 'Improve source-of-truth pages, listings, citations, and concise service and location facts so answer platforms can identify the business accurately.',
      priority: 'Medium',
      packageFit: 'Starter Visibility Cleanup',
      observations: [],
    },
  }), {} as AuditState['aiAnswerTests']),
  searchVisibilityTests: {},
  searchDestinationObservations: {},
  voicePromptTests: {},
  voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, blankProfile),
  reportSummary: '',
  websiteAudit: normalizeWebsiteAuditWorkspaceState(undefined),
  visibilityRuns: undefined,
  machineReadability: undefined,
  customerFindingReviews: undefined,
  customerFindingDismissals: undefined,
  customerFindingRefinements: undefined,
  profileProjectionConflicts: undefined,
  lastUpdated: recordedAt,
})
