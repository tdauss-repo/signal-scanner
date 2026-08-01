import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { AIAnswerVisibilityTest } from './components/AIAnswerVisibilityTest'
import { AuditSection } from './components/AuditSection'
import { CoreListingsPanel } from './components/CoreListingsPanel'
import {
  DirectoryAuditPanel,
  directoryRowToStatus,
} from './components/DirectoryAuditPanel'
import { FixPlan } from './components/FixPlan'
import { BusinessProfilePanel } from './components/BusinessProfilePanel'
import { IntakeForm } from './components/IntakeForm'
import { ReportView } from './components/ReportView'
import { SavedScansPanel } from './components/SavedScansPanel'
import { ScoreCard } from './components/ScoreCard'
import { SearchVisibilityPanel } from './components/SearchVisibilityPanel'
import { VoiceReadinessPanel } from './components/VoiceReadinessPanel'
import { SalesReadinessPanel } from './components/SalesReadinessPanel'
import { buildAuditItems } from './data/auditCatalog'
import { applyCurrentCatalogMetadata, migrateSystemGeneratedFix } from './utils/catalogMetadata'
import { defaultProfile } from './data/demoProfile'
import type { AIAnswerObservation, AIAnswerPlatform, AIAnswerTestState, AuditItem, AuditState, BusinessProfile, CheckStatus, EvidenceConfidence, FixItem, SavedScanFile, SavedScanRecord, SearchDestinationObservation, SearchVisibilityQuery, VoiceAssistantObservation, VoicePromptTestState } from './types/audit'
import type { ManualWebsiteObservation } from './types/websiteAudit'
import { aiAnswerPlatforms, buildFixPlan, numericOverallScoreAreas, overallVisibilityCheckedCount, overallVisibilityScore, scoreItems, trafficStatusForScore } from './utils/scoring'
import { analyzeBrowserWebsiteObservation, analyzeManualWebsiteObservation, mapAutoAuditToWebsiteChecks, mergeBrowserMappingWithServerPrecedence, runWebsiteAutoAudit } from './utils/websiteAutoAudit'
import {
  browserWebsiteObservationFromPayload,
  captureBrowserWebsiteObservationProvenance,
  parseBrowserWebsiteEvidencePayload,
} from './utils/browserWebsiteObservation'
import {
  captureManualObservationProvenance,
  defaultManualWebsiteObservation,
  normalizeWebsiteAuditWorkspaceState,
  updateManualWebsiteObservationDraft,
} from './utils/websiteAuditState'
import { bingSearch, googleMapsSearch, googleSearch } from './utils/links'
import {
  businessDirectoryKey,
  publicPageCheckEligibilityFor,
  urlDiscoveryMethodFor,
} from './utils/directorySuggestions'
import {
  defaultSearchVisibilityTest,
  legacyWhereFoundToTypes,
  migrateLegacySearchDestinationObservations,
  normalizeSearchDestinationObservation,
  normalizeSearchResultTypes,
  searchVisibilityResultLabel,
  searchVisibilityResultToCheckStatus,
} from './utils/searchVisibility'
import { buildVoiceReadinessCategories, buildVoiceSourceReadinessGroups } from './utils/voiceReadiness'
import {
  normalizeBusinessProfileState,
  recordOperatorProfileChanges,
} from './utils/businessProfileState'
import { aggregateReviewedSearchObservations } from './utils/searchAggregation'
import { summarizeAIVisibilityEvidence } from './utils/aiPresence'
import { projectPublicObservationToProfiles, publicPresenceCoverage, publicPresenceQualityLabel, supportingPublicPresenceReviewedCount } from './utils/publicPresence'
import { entityAction, normalizeSalesReadiness, questionAction, sortSalesActions } from './utils/salesReadiness'

const storageKey = 'local-signal-scanner-state'
const activeViewStorageKey = 'business-scanner-active-view'
const savedScansStorageKey = 'found-local-saved-scans'
const currentScanIdStorageKey = 'found-local-current-scan-id'
const aiActionPlanId = 'manual-ai-answer-visibility-test'

const aiResultToCheckStatus = (status: AIAnswerTestState['resultStatus']) =>
  status === 'signin_required' ? 'unknown' : status

const createId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled-business'

const dateSlug = (value: string) =>
  new Date(value).toISOString().slice(0, 10)

const cloneAuditState = (state: AuditState): AuditState =>
  JSON.parse(JSON.stringify(state)) as AuditState

const phoneRecordId = (index: number, number?: string, label?: string) =>
  `phone-${index}-${(label || 'contact').replace(/\W+/g, '-').toLowerCase()}-${(number || 'new')
    .replace(/\W+/g, '')
    .toLowerCase()}`

const ensurePhoneRecordIds = (
  phoneNumbers: BusinessProfile['phoneNumbers'] | undefined,
) =>
  (phoneNumbers ?? []).map((record, index) => ({
    ...record,
    id: record.id || phoneRecordId(index, record.number, record.label),
  }))

const migrateDirectories = (
  directories: Partial<AuditState['directories']> | undefined,
  profile: BusinessProfile,
): AuditState['directories'] => ({
  activeRows: (directories?.activeRows ?? []).map((row) => ({
    ...row,
    businessId: row.businessId ?? businessDirectoryKey(profile),
    directoryStatus: row.directoryStatus ?? 'not_checked',
    listingResult: row.listingResult ?? row.directoryStatus ?? 'not_checked',
    checkMethod:
      (row.checkMethod as string) === 'Public page check candidate'
        ? 'Public page check available'
        : row.checkMethod ?? 'Manual verification only',
    urlDiscoveryMethod:
      row.urlDiscoveryMethod ??
      urlDiscoveryMethodFor(
        row.checkMethod ?? 'Manual verification only',
      ),
    publicPageCheckEligibility:
      publicPageCheckEligibilityFor(
        row.directoryName ?? '',
        row.checkMethod ?? 'Manual verification only',
        row.allowPublicPageFetch ?? false,
        row.publicPageCheckEligibility === 'Allowed after URL confirmed'
          ? row.publicPageCheckEligibility
          : undefined,
      ),
    relevance: row.relevance ?? row.authority ?? 'Medium',
    requiresOperatorUrl: row.requiresOperatorUrl ?? false,
    allowPublicPageFetch: row.allowPublicPageFetch ?? false,
    allowSearchResultScraping: row.allowSearchResultScraping ?? false,
    ownerAdminAccessMethod: row.ownerAdminAccessMethod ?? 'manual only',
    capabilityNotes:
      row.capabilityNotes ??
      'Saved directory check. Confirm the appropriate manual verification workflow.',
    listingUrlStatus:
      row.listingUrlStatus ??
      (row.listingUrl
        ? 'url_saved'
        : row.requiresOperatorUrl
          ? 'url_needed'
          : 'url_unavailable'),
    lastCheckedAt: row.lastCheckedAt ?? '',
    foundData: row.foundData ?? {},
    candidateUrls: row.candidateUrls ?? [],
    evidenceConfidence: row.evidenceConfidence ?? 'manual_needs_confirmation',
    publicEvidenceNotes: row.publicEvidenceNotes ?? row.evidenceNotes ?? '',
    evidenceNotes: row.evidenceNotes ?? row.publicEvidenceNotes ?? '',
    pastedVisiblePageText: row.pastedVisiblePageText ?? '',
    observedLinksText: row.observedLinksText ?? '',
    ownerAdminAccessStatus:
      row.ownerAdminAccessStatus ?? row.ownerAccessStatus ?? 'Unverified - public listing only',
    ownerAccessStatus:
      row.ownerAccessStatus ?? row.ownerAdminAccessStatus ?? 'Unverified - public listing only',
  })),
  ignoredSuggestionIds: directories?.ignoredSuggestionIds ?? [],
})

type ScoreView =
  | 'Overall'
  | 'Website SEO'

type ActiveView =
  | ScoreView
  | 'Public Presence'
  | 'Profile Management'
  | 'AI Visibility'
  | 'Sales Readiness'
  | 'Reports'
  | 'Business Profile'
  | 'Settings'

const views: ScoreView[] = ['Overall', ...numericOverallScoreAreas]

const navViews: ActiveView[] = [...views, 'Public Presence', 'Profile Management', 'AI Visibility', 'Sales Readiness', 'Reports', 'Business Profile', 'Settings']
const visibleViewLabel = (view: ActiveView) => view

const navIconPaths: Record<ActiveView, React.ReactNode> = {
  Overall: (
    <>
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v7h-7z" />
      <path d="M4 13h7v7H4z" />
      <path d="M13 13h7v7h-7z" />
    </>
  ),
  'Profile Management': (
    <>
      <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  'Website SEO': (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4a13 13 0 0 1 0 16" />
      <path d="M12 4a13 13 0 0 0 0 16" />
    </>
  ),
  'Public Presence': (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 5 5" />
      <path d="M8.5 10.5h4" />
    </>
  ),
  'AI Visibility': (
    <>
      <path d="M12 4 9 10l-5 2 5 2 3 6 3-6 5-2-5-2z" />
      <path d="M5 5h3" />
      <path d="M16 19h3" />
    </>
  ),
  Reports: (
    <>
      <path d="M7 4h8l3 3v13H7z" />
      <path d="M15 4v4h4" />
      <path d="M10 13h6" />
      <path d="M10 17h4" />
    </>
  ),
  'Sales Readiness': (<><path d="M5 19V9l7-5 7 5v10"/><path d="M9 19v-5h6v5"/></>),
  'Business Profile': (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6" />
      <path d="M18 6h3M19.5 4.5v3" />
    </>
  ),
  Settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7.3 7.3 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.3 7.3 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.3 3.1h5l.3-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7.3 7.3 0 0 0 .1-1z" />
    </>
  ),
}

function FoundLocalMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="found-local-mark">
      <path
        d="M10 34c7-14 20-8 27-22"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M31 15c0-5 4-9 9-9s9 4 9 9c0 7-9 15-9 15s-9-8-9-15z"
        transform="scale(.72) translate(16 0)"
      />
      <path d="m14 8 1.6 3.2 3.4.5-2.5 2.4.6 3.4L14 16l-3.1 1.6.6-3.4L9 11.7l3.4-.5z" />
      <circle cx="10" cy="34" r="3" />
    </svg>
  )
}

function ScannerToolMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="scanner-tool-mark">
      <path d="M9 12h20v20H9z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M15 12v20M23 12v20M9 19h20M9 27h20" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="29" cy="28" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="m35 34 7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <path d="m25.5 28 2.5 2.5 5-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <path d="M15 10c0-3 2.5-5.5 5.5-5.5S26 7 26 10c0 4.2-5.5 9.5-5.5 9.5S15 14.2 15 10z" fill="currentColor" opacity=".18" />
    </svg>
  )
}

function SidebarIcon({ view }: { view: ActiveView }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-svg-icon">
      {navIconPaths[view]}
    </svg>
  )
}

const loadActiveView = (): ActiveView => {
  const stored = localStorage.getItem(activeViewStorageKey)
  if (stored === 'AI Answers') return 'AI Visibility'
  if (stored === 'Listings') return 'Profile Management'
  if (stored === 'Search Visibility') return 'Public Presence'
  return navViews.includes(stored as ActiveView)
    ? (stored as ActiveView)
    : 'Overall'
}

const defaultAIAnswerTest: AIAnswerTestState = {
  resultStatus: 'unknown',
  evidenceConfidence: 'ai_answer_response',
  rawResponse: '',
  evidenceNotes: '',
  sourcesMentioned: '',
  gapTitle: 'Strengthen AI-readable local business signals',
  suggestedFix:
    'Improve source-of-truth pages, schema, listings, citations, reviews, and concise service/location facts so AI answer platforms can identify the business more accurately.',
  priority: 'Medium',
  packageFit: 'Starter Visibility Cleanup',
  observations: [],
}

const buildDefaultAIAnswerTests = () =>
  aiAnswerPlatforms.reduce(
    (tests, platform) => ({
      ...tests,
      [platform]: { ...defaultAIAnswerTest },
    }),
    {} as Record<AIAnswerPlatform, AIAnswerTestState>,
  )

const initialState: AuditState = {
  profile: defaultProfile,
  businessProfile: normalizeBusinessProfileState(
    defaultProfile,
    undefined,
    new Date().toISOString(),
  ),
  checks: {},
  notes: {},
  evidenceConfidence: {},
  selectedAIPlatform: 'Gemini',
  aiAnswerTests: buildDefaultAIAnswerTests(),
  searchVisibilityTests: {},
  searchDestinationObservations: {},
  voicePromptTests: {},
  voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, defaultProfile),
  reportSummary: '',
  websiteAudit: {
    lastSuccessful: null,
    latestAttempt: null,
    manualObservation: defaultManualWebsiteObservation(),
    browserObservation: null,
  },
  lastUpdated: new Date().toISOString(),
}

const blankProfile: BusinessProfile = {
  businessName: '',
  website: '',
  streetAddress: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  knownListingUrl: '',
  operatorNote: '',
  phoneNumbers: [],
  contactStructureNote: '',
  primaryCategory: '',
  secondaryCategories: '',
  industryTags: '',
  localMarket: '',
  existingDirectoryUrls: '',
  serviceArea: '',
  primaryServices: '',
  targetLocation: '',
  keywords: '',
}

const createBlankAuditState = (): AuditState => ({
  ...initialState,
  profile: blankProfile,
  businessProfile: normalizeBusinessProfileState(
    blankProfile,
    undefined,
    new Date().toISOString(),
  ),
  checks: {},
  notes: {},
  evidenceConfidence: {},
  selectedAIPlatform: 'Gemini',
  aiAnswerTests: buildDefaultAIAnswerTests(),
  searchVisibilityTests: {},
  searchDestinationObservations: {},
  voicePromptTests: {},
  voiceAssistantObservations: [],
  directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [],
  salesReadiness: normalizeSalesReadiness(undefined, blankProfile),
  reportSummary: '',
  websiteAudit: {
    lastSuccessful: null,
    latestAttempt: null,
    manualObservation: defaultManualWebsiteObservation(),
    browserObservation: null,
  },
  lastUpdated: new Date().toISOString(),
})

const legacyCity = (localMarket: string) => localMarket.split(',')[0]?.trim() ?? ''
const legacyState = (localMarket: string) => localMarket.split(',')[1]?.trim() ?? ''
const legacyAIObservation = (
  platform: AIAnswerPlatform,
  test: Partial<AIAnswerTestState>,
): AIAnswerObservation[] =>
  test.observations?.length
    ? test.observations
    : test.rawResponse || test.evidenceNotes
      ? [{
          id: `legacy-ai-${platform.toLowerCase()}`,
          evidenceMode: 'consumer_observation', promptType: 'branded_factual_accuracy',
          promptUsed: '', platform, model: '', observedAt: '', loginState: 'unknown',
          locationContext: '', personalizationContext: 'Legacy context not recorded.',
          mentioned: 'unclear', mentionPosition: 'not_applicable', recommendationStrength: 'not_mentioned',
          officialWebsiteCited: 'unclear', factualAccuracy: 'unable_to_verify', unsupportedClaims: '',
          competitorsMentioned: test.sourcesMentioned ?? '', rawResponse: test.rawResponse ?? '', sourceLinks: '',
          evidenceNotes: test.evidenceNotes ?? '', recommendedAction: test.suggestedFix ?? '',
          operatorReviewed: false, provenance: 'legacy_imported',
        }]
      : []

const legacyVoiceObservations = (
  tests: Record<string, VoicePromptTestState> | undefined,
): VoiceAssistantObservation[] =>
  Object.entries(tests ?? {}).map(([id, test]) => ({
    id: `legacy-${id}`, assistant: test.platformTested, deviceOrInterface: test.deviceContext,
    exactUtterance: id, locationContext: '', loginState: 'unknown', observedAt: '',
    result: test.testStatus === 'business_found_accurate' ? 'directly_identified' : test.testStatus === 'business_found_incomplete' ? 'included_among_options' : test.testStatus === 'wrong_outdated' ? 'found_with_inaccurate_facts' : test.testStatus === 'not_found' ? 'not_found' : 'unable_to_verify',
    responseTranscript: '', visibleSource: '', evidenceNotes: test.evidenceNotes,
    evidenceConfidence: test.evidenceConfidence, provenance: 'legacy_imported', operatorReviewed: false,
    recommendedAction: test.recommendedAction,
  }))

const normalizeAuditState = (parsed: Partial<AuditState>): AuditState => {
    const defaultTests = buildDefaultAIAnswerTests()
    const legacyParsed = parsed as Partial<AuditState> & {
      aiAnswerTest?: AIAnswerTestState & { platform?: AIAnswerPlatform }
    }
    const migratedSingleTest = legacyParsed.aiAnswerTest as
      | (AIAnswerTestState & { platform?: AIAnswerPlatform })
      | undefined
    const savedTests =
      parsed.aiAnswerTests ??
      (migratedSingleTest
        ? {
            ...defaultTests,
            [migratedSingleTest.platform ?? 'Gemini']: {
              ...defaultAIAnswerTest,
              ...migratedSingleTest,
            },
          }
        : defaultTests)

    const profile: BusinessProfile = {
      ...defaultProfile,
      ...parsed.profile,
      city: parsed.profile?.city ?? legacyCity(parsed.profile?.localMarket ?? defaultProfile.localMarket),
      state: parsed.profile?.state ?? legacyState(parsed.profile?.localMarket ?? defaultProfile.localMarket),
      streetAddress: parsed.profile?.streetAddress ?? '',
      zip: parsed.profile?.zip ?? '',
      knownListingUrl: parsed.profile?.knownListingUrl ?? '',
      operatorNote: parsed.profile?.operatorNote ?? '',
      phoneNumbers: ensurePhoneRecordIds(
        parsed.profile?.phoneNumbers ?? defaultProfile.phoneNumbers,
      ),
      contactStructureNote:
        parsed.profile?.contactStructureNote ?? defaultProfile.contactStructureNote,
    }

    return {
      ...initialState,
      ...parsed,
      profile,
      businessProfile: normalizeBusinessProfileState(
        profile,
        parsed.businessProfile,
        parsed.lastUpdated ?? new Date().toISOString(),
      ),
      selectedAIPlatform: parsed.selectedAIPlatform ?? 'Gemini',
      searchVisibilityTests: Object.fromEntries(
        Object.entries(parsed.searchVisibilityTests ?? {}).map(([id, test]) => [
          id,
          {
            ...defaultSearchVisibilityTest(),
            ...test,
            observedResultTypes:
              test.observedResultTypes?.length
                ? test.observedResultTypes
                : legacyWhereFoundToTypes(test.whereFound),
            provenance: test.provenance ?? 'legacy_imported',
          },
        ]),
      ),
      searchDestinationObservations: Object.fromEntries(
        Object.entries(
          parsed.searchDestinationObservations ??
            migrateLegacySearchDestinationObservations(parsed.searchVisibilityTests),
        ).map(([queryId, destinationObservations]) => [
          queryId,
          Object.fromEntries(
            Object.entries(destinationObservations).map(([destination, observation]) => [
              destination,
              normalizeSearchDestinationObservation({ ...observation, observedResultTypes: normalizeSearchResultTypes(observation.observedResultTypes ?? []) }),
            ]),
          ),
        ]),
      ),
      voicePromptTests: parsed.voicePromptTests ?? {},
      voiceAssistantObservations:
        parsed.voiceAssistantObservations ?? legacyVoiceObservations(parsed.voicePromptTests),
      aiAnswerTests: aiAnswerPlatforms.reduce(
        (tests, platform) => ({
          ...tests,
          [platform]: {
            ...defaultAIAnswerTest,
            ...savedTests[platform],
            observations: legacyAIObservation(platform, savedTests[platform] ?? {}),
            evidenceConfidence:
              savedTests[platform]?.evidenceConfidence ?? 'ai_answer_response',
          },
        }),
        {} as Record<AIAnswerPlatform, AIAnswerTestState>,
      ),
      directories: migrateDirectories(parsed.directories, {
        ...profile,
      }),
      evidenceConfidence: parsed.evidenceConfidence ?? {},
      reportSummary: parsed.reportSummary ?? '',
      websiteAudit: normalizeWebsiteAuditWorkspaceState(parsed.websiteAudit),
      manualFixes: (parsed.manualFixes ?? [])
        .map((fix) => ({
          ...fix,
          evidenceConfidence:
            fix.evidenceConfidence ?? 'manual_needs_confirmation',
        }))
        .map((fix) =>
          migrateSystemGeneratedFix(
            fix,
            buildAuditItems(profile).map(applyCurrentCatalogMetadata),
          ),
        ),
      salesReadiness: normalizeSalesReadiness(parsed.salesReadiness, profile),
    }
}

const loadState = (): AuditState => {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return initialState

    return normalizeAuditState(JSON.parse(stored) as Partial<AuditState>)
  } catch {
    return initialState
  }
}

const savedScanFromWorkspace = (
  auditState: AuditState,
  existing?: SavedScanRecord,
): SavedScanRecord => {
  const now = new Date().toISOString()
  const payload = cloneAuditState({
    ...auditState,
    lastUpdated: now,
  })

  return {
    id: existing?.id ?? createId('scan'),
    businessName: payload.profile.businessName || 'Untitled business',
    website: payload.profile.website,
    localMarket: payload.profile.localMarket || payload.profile.targetLocation,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    scanDate: payload.lastUpdated,
    notes: existing?.notes ?? '',
    payload,
  }
}

const normalizeSavedScan = (scan: Partial<SavedScanRecord>): SavedScanRecord => {
  const payload = normalizeAuditState(scan.payload ?? initialState)
  const now = new Date().toISOString()

  return {
    id: scan.id ?? createId('scan'),
    businessName: scan.businessName ?? payload.profile.businessName,
    website: scan.website ?? payload.profile.website,
    localMarket:
      scan.localMarket ??
      payload.profile.localMarket ??
      payload.profile.targetLocation,
    createdAt: scan.createdAt ?? now,
    updatedAt: scan.updatedAt ?? payload.lastUpdated ?? now,
    scanDate: scan.scanDate ?? payload.lastUpdated ?? now,
    notes: scan.notes ?? '',
    payload,
  }
}

const loadSavedScans = (): SavedScanRecord[] => {
  try {
    const stored = localStorage.getItem(savedScansStorageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored) as Partial<SavedScanRecord>[]
    return Array.isArray(parsed) ? parsed.map(normalizeSavedScan) : []
  } catch {
    return []
  }
}

const loadCurrentScanId = () =>
  localStorage.getItem(currentScanIdStorageKey) ?? ''

const buildSavedScanFile = (scan: SavedScanRecord): SavedScanFile => ({
  app: 'Found Local Business Scanner Tool',
  fileType: 'found-local-scan',
  version: 1,
  exportedAt: new Date().toISOString(),
  scan,
})

const parseImportedScanFile = (text: string): SavedScanRecord | null => {
  try {
    const parsed = JSON.parse(text) as Partial<SavedScanFile> | Partial<SavedScanRecord>
    if (
      'fileType' in parsed &&
      parsed.fileType === 'found-local-scan' &&
      parsed.scan
    ) {
      return normalizeSavedScan({
        ...parsed.scan,
        id: createId('scan'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  } catch {
    return null
  }

  return null
}

function App() {
  const [auditState, setAuditState] = useState<AuditState>(loadState)
  const [websiteAuditLoading, setWebsiteAuditLoading] = useState(false)
  const [websiteAuditError, setWebsiteAuditError] = useState('')
  const [browserEvidenceJson, setBrowserEvidenceJson] = useState('')
  const [browserEvidenceImportError, setBrowserEvidenceImportError] = useState('')
  const [activeView, setActiveView] = useState<ActiveView>(loadActiveView)
  const [savedScans, setSavedScans] = useState<SavedScanRecord[]>(loadSavedScans)
  const [currentScanId, setCurrentScanId] = useState(loadCurrentScanId)

  const auditItems = useMemo(
    () =>
      buildAuditItems(auditState.profile, auditState.businessProfile).map(
        applyCurrentCatalogMetadata,
      ),
    [auditState.businessProfile, auditState.profile],
  )

  const groups = useMemo(
    () => ({
      listings: auditItems.filter((item) => item.area === 'listings'),
      website: auditItems.filter((item) => item.area === 'website'),
      searchVisibility: auditItems.filter((item) => item.area === 'keywords'),
      ai: auditItems.filter((item) => item.area === 'ai'),
      voice: auditItems.filter((item) => item.area === 'voice'),
    }),
    [auditItems],
  )

  const scores = useMemo(() => {
    const currentBusinessId = businessDirectoryKey(auditState.profile)
    const currentDirectoryRows = auditState.directories.activeRows.filter(
      (row) => !row.businessId || row.businessId === currentBusinessId,
    )
    const website = scoreItems(groups.website, auditState.checks)
    const overallScore = overallVisibilityScore({
      website: website.score,
    })
    const primaryQueryId = groups.searchVisibility[0]?.id
    const coverage = publicPresenceCoverage(auditState.searchDestinationObservations, primaryQueryId ? [primaryQueryId] : [])
    const publicPresence = { score: null, status: coverage.completed === 0 ? 'Gray' as const : coverage.completed < coverage.total ? 'Yellow' as const : 'Green' as const, earned: 0, possible: 0, checked: coverage.completed, unchecked: coverage.total - coverage.completed, statusLabel: coverage.completed === 0 ? 'Not tested' : coverage.completed < coverage.total ? 'Incomplete' : publicPresenceQualityLabel(auditState.searchDestinationObservations, primaryQueryId ? [primaryQueryId] : []) }
    const profileManagement = { score: null, status: 'Gray' as const, earned: 0, possible: 0, checked: currentDirectoryRows.length, statusLabel: 'Owner/admin access incomplete' }

    return {
      Overall: {
        score: overallScore,
        status: trafficStatusForScore(overallScore),
        earned: overallScore ?? 0,
        possible: 100,
        checked: overallVisibilityCheckedCount({
          website: website.checked,
        }),
      },
      'Website SEO': website,
      'Public Presence': publicPresence,
      'Profile Management': profileManagement,
    }
  }, [auditState.checks, auditState.directories.activeRows, auditState.profile, auditState.searchDestinationObservations, groups])

  const aiVisibilityEvidence = useMemo(
    () => summarizeAIVisibilityEvidence(auditState.aiAnswerTests, auditState.profile),
    [auditState.aiAnswerTests, auditState.profile],
  )

  const publicPresenceDetails = useMemo(() => {
    const primaryQueryId = groups.searchVisibility[0]?.id
    const coverage = publicPresenceCoverage(auditState.searchDestinationObservations, primaryQueryId ? [primaryQueryId] : [])
    return `${coverage.completed} of ${coverage.total} primary checks complete | ${supportingPublicPresenceReviewedCount(auditState.searchDestinationObservations, primaryQueryId)} supporting checks reviewed`
  }, [auditState.searchDestinationObservations, groups.searchVisibility])

  const dashboardCards = [
    { label: 'Overall' as const, result: scores.Overall, weight: 'weighted' },
    { label: 'Website SEO' as const, result: scores['Website SEO'] },
    { label: 'Public Presence' as const, result: scores['Public Presence'], displayValue: scores['Public Presence'].statusLabel, details: publicPresenceDetails },
    { label: 'Profile Management' as const, result: scores['Profile Management'] },
    { label: 'AI Visibility' as const, result: { score: null, status: 'Gray' as const, earned: 0, possible: 0, checked: aiVisibilityEvidence.reviewedObservationCount, statusLabel: aiVisibilityEvidence.statusLabel } },
  ]

  const fixes = useMemo(
    () => [
      ...buildFixPlan(
        auditItems.filter(
          (item) => item.area !== 'ai' && !item.id.startsWith('voice-prompt-'),
        ),
        auditState.checks,
      ).map((fix) => ({
        ...fix,
        evidenceNote: auditState.notes[fix.id],
        evidenceConfidence: auditState.evidenceConfidence[fix.id],
      })),
      ...auditState.manualFixes,
    ],
    [
      auditItems,
      auditState.checks,
      auditState.evidenceConfidence,
      auditState.manualFixes,
      auditState.notes,
    ],
  )

  const salesFixes = useMemo(() => sortSalesActions(fixes), [fixes])

  const currentSavedScan = savedScans.find((scan) => scan.id === currentScanId)
  const hasUnsavedChanges = currentSavedScan
    ? JSON.stringify(normalizeAuditState(currentSavedScan.payload)) !==
      JSON.stringify(auditState)
    : true

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(auditState))
  }, [auditState])

  useEffect(() => {
    localStorage.setItem(activeViewStorageKey, activeView)
  }, [activeView])

  useEffect(() => {
    localStorage.setItem(savedScansStorageKey, JSON.stringify(savedScans))
  }, [savedScans])

  useEffect(() => {
    localStorage.setItem(currentScanIdStorageKey, currentScanId)
  }, [currentScanId])

  const updateState = (next: Partial<AuditState>) => {
    setAuditState((current) => ({
      ...current,
      ...next,
      lastUpdated: new Date().toISOString(),
    }))
  }

  const updateProfileFromOperator = (profile: BusinessProfile) => {
    setAuditState((current) => {
      const recordedAt = new Date().toISOString()
      return {
        ...current,
        profile,
        businessProfile: recordOperatorProfileChanges(
          current.profile,
          profile,
          current.businessProfile,
          recordedAt,
        ),
        lastUpdated: recordedAt,
      }
    })
  }

  const setCheck = (id: string, status: CheckStatus) => {
    updateState({ checks: { ...auditState.checks, [id]: status } })
  }

  const setNote = (id: string, note: string) => {
    updateState({ notes: { ...auditState.notes, [id]: note } })
  }

  const setEvidenceConfidence = (
    id: string,
    confidence: EvidenceConfidence,
  ) => {
    updateState({
      evidenceConfidence: {
        ...auditState.evidenceConfidence,
        [id]: confidence,
      },
    })
  }

  const setAIAnswerTest = (aiAnswerTest: AIAnswerTestState) => {
    const platform = auditState.selectedAIPlatform
    const checkStatus = aiResultToCheckStatus(aiAnswerTest.resultStatus)
    updateState({
      aiAnswerTests: {
        ...auditState.aiAnswerTests,
        [platform]: aiAnswerTest,
      },
      checks: {
        ...auditState.checks,
        [`ai-${platform.toLowerCase()}`]: checkStatus,
      },
      notes: {
        ...auditState.notes,
        [`ai-${platform.toLowerCase()}`]: aiAnswerTest.evidenceNotes,
      },
    })
  }

  const setSearchDestinationObservation = (
    query: SearchVisibilityQuery,
    observation: SearchDestinationObservation,
  ) => {
    const normalizedObservation = normalizeSearchDestinationObservation(observation)
    updateState({
      searchDestinationObservations: {
        ...auditState.searchDestinationObservations,
        [query.id]: {
          ...auditState.searchDestinationObservations[query.id],
          [normalizedObservation.destination]: normalizedObservation,
        },
      },
      directories: projectPublicObservationToProfiles(
        auditState.directories,
        businessDirectoryKey(auditState.profile),
        normalizedObservation,
      ),
      checks: {
        ...auditState.checks,
        [query.id]: searchVisibilityResultToCheckStatus(normalizedObservation.overallResult),
      },
      notes: { ...auditState.notes, [query.id]: normalizedObservation.evidenceNotes },
      evidenceConfidence: {
        ...auditState.evidenceConfidence,
        [query.id]: normalizedObservation.confidence,
      },
    })
  }

  const addEntityFindingToActionPlan = (finding: import('./types/audit').EntityClarityFinding) => {
    const fix = entityAction(finding)
    if (fix) updateState({ manualFixes: [...auditState.manualFixes.filter((item) => item.id !== fix.id), fix] })
  }

  const addCustomerQuestionToActionPlan = (question: import('./types/audit').CustomerQuestion) => {
    const fix = questionAction(question)
    if (fix) updateState({ manualFixes: [...auditState.manualFixes.filter((item) => item.id !== fix.id), fix] })
  }

  const addSearchVisibilityToActionPlan = (query: SearchVisibilityQuery) => {
    const aggregate = aggregateReviewedSearchObservations(
      Object.values(auditState.searchDestinationObservations[query.id] ?? {}),
    )
    if (!aggregate) {
      window.alert('Review at least one destination observation before adding it to the Action Plan.')
      return
    }
    const test = {
      ...defaultSearchVisibilityTest(),
      ...auditState.searchVisibilityTests[query.id],
      recommendedAction: aggregate.recommendation,
      evidenceNotes: aggregate.observations
        .map((item) => `${item.destination}: ${item.evidenceNotes}`)
        .filter(Boolean)
        .join('\n'),
      competitorsObserved: aggregate.observations
        .map((item) => `${item.destination}: ${item.competitorsObserved}`)
        .filter(Boolean)
        .join('\n'),
      evidenceConfidence: aggregate.evidenceConfidence,
    }
    const manualFix: FixItem = {
      id: `manual-search-visibility-${query.id}`,
      priority: aggregate.priority,
      area: `Search Visibility - ${query.intentType}`,
      issue: `Search visibility for "${query.query}" (${aggregate.kind.replace(/_/g, ' ')})`,
      fix: test.recommendedAction,
      status: aggregate.status,
      evidenceNote: [
        `Query: ${query.query}`,
        `Intent type: ${query.intentType}`,
        `Query importance: ${query.priority}`,
        `Aggregate interpretation: ${aggregate.kind.replace(/_/g, ' ')}`,
        `Primary destinations considered: ${aggregate.primaryObservations.map((item) => item.destination).join(', ') || 'none reviewed'}`,
        `Reviewed destinations: ${aggregate.observations.map((item) => `${item.destination} (${searchVisibilityResultLabel(item.overallResult)})`).join(', ')}`,
        test.evidenceNotes,
      ]
        .filter(Boolean)
        .join('\n'),
      sources: test.competitorsObserved
        ? `Competitors observed: ${test.competitorsObserved}`
        : '',
      packageFit: test.packageFit,
      effort: test.packageFit === 'Website SEO Implementation' ? 'Medium' : 'Low',
      evidenceConfidence: test.evidenceConfidence,
      whyItMatters:
        'Manual search observations show whether customers are likely to encounter the business, a directory profile, or competitors for this query.',
    }

    updateState({
      manualFixes: [
        ...auditState.manualFixes.filter((fix) => fix.id !== manualFix.id),
        manualFix,
      ],
      checks: {
        ...auditState.checks,
        [query.id]: aggregate.status,
      },
      notes: {
        ...auditState.notes,
        [query.id]: test.evidenceNotes,
        [manualFix.id]: manualFix.evidenceNote ?? '',
      },
      evidenceConfidence: {
        ...auditState.evidenceConfidence,
        [query.id]: test.evidenceConfidence,
      },
    })
  }

  const addVoiceCategoryToActionPlan = (id: string) => {
    const category = [
      ...buildVoiceSourceReadinessGroups(auditState.profile, auditState.checks),
      ...buildVoiceReadinessCategories(auditState.profile, auditState.checks),
    ].find((item) => item.id === id)
    if (!category) return

    const status = auditState.checks[id] ?? category.suggestedStatus
    const manualFix: FixItem = {
      id: `manual-${id}`,
      priority:
        status === 'fail' ? 'High' : category.weight >= 10 ? 'Medium' : 'Low',
      area: 'Listings / Entity Readiness',
      issue: category.label,
      fix: category.recommendedAction,
      status,
      evidenceNote: [
        `Suggested from scanner data: ${category.suggestedStatus}`,
        category.suggestedReason,
        auditState.notes[id] ?? '',
      ]
        .filter(Boolean)
        .join('\n'),
      packageFit: category.packageFit,
      effort: category.packageFit === 'Website SEO Implementation' ? 'Medium' : 'Low',
      evidenceConfidence:
        auditState.evidenceConfidence[id] ?? 'derived_readiness_signal',
      whyItMatters:
        'Clear public entity signals support reliable business identity, contact, location, services, listings, reviews, FAQs, and structured data.',
    }

    updateState({
      manualFixes: [
        ...auditState.manualFixes.filter((fix) => fix.id !== manualFix.id),
        manualFix,
      ],
      checks: {
        ...auditState.checks,
        [id]: status,
      },
      notes: {
        ...auditState.notes,
        [manualFix.id]: manualFix.evidenceNote ?? '',
      },
    })
  }

  const addVoiceAssistantObservationToActionPlan = (id: string) => {
    const observation = auditState.voiceAssistantObservations.find((item) => item.id === id)
    if (!observation?.operatorReviewed) return
    const manualFix: FixItem = {
      id: `manual-voice-observation-${id}`,
      priority: observation.result === 'wrong_business_selected' || observation.result === 'not_found' ? 'High' : 'Medium',
      area: `Voice Assistant Observation - ${observation.assistant}`,
      issue: observation.exactUtterance || `Voice observation for ${observation.assistant}`,
      fix: observation.recommendedAction || 'Review the observed assistant response against public source data, then improve the relevant business, location, contact, and listing signals.',
      status: observation.result === 'directly_identified' || observation.result === 'correct_business_action_available' ? 'pass' : observation.result === 'included_among_options' || observation.result === 'unable_to_verify' ? 'partial' : 'fail',
      evidenceNote: [`Assistant: ${observation.assistant}`, `Result: ${observation.result}`, observation.responseTranscript, observation.evidenceNotes].filter(Boolean).join('\n'),
      sources: observation.visibleSource,
      packageFit: 'Starter Visibility Cleanup',
      effort: 'Low',
      evidenceConfidence: observation.evidenceConfidence,
      whyItMatters: 'A device-specific assistant observation is evidence from one context, not a guarantee of what every consumer assistant will return.',
    }
    updateState({ manualFixes: [...auditState.manualFixes.filter((fix) => fix.id !== manualFix.id), manualFix] })
  }

  const addAIAnswerToActionPlan = () => {
    const platform = auditState.selectedAIPlatform
    const test = auditState.aiAnswerTests[platform]
    const observation = test.observations.find((item) => item.operatorReviewed)
    if (!observation) {
      window.alert(
        'Review at least one consumer observation before adding AI evidence to the Action Plan.',
      )
      return
    }

    const checkStatus = aiResultToCheckStatus(test.resultStatus)
    const issue = test.gapTitle.trim() || `${platform} AI observation follow-up`
    const manualFix: FixItem = {
      id: `${aiActionPlanId}-${platform.toLowerCase().replace(/\W+/g, '-')}-${issue
        .toLowerCase()
        .replace(/\W+/g, '-')}`,
      priority: test.priority,
      area: `AI Answers - ${platform}`,
      issue,
      fix: observation.recommendedAction || test.suggestedFix,
      status: checkStatus,
      evidenceNote: [
        `Platform tested: ${platform}`,
        `Evidence mode: ${observation.evidenceMode}`,
        `Mentioned: ${observation.mentioned}`,
        `Factual accuracy: ${observation.factualAccuracy}`,
        observation.evidenceNotes,
      ]
        .filter(Boolean)
        .join('\n'),
      sources: observation.sourceLinks || test.sourcesMentioned,
      packageFit: test.packageFit,
      platform,
      effort: test.packageFit === 'Website SEO Implementation' ? 'Medium' : 'Low',
      evidenceConfidence: test.evidenceConfidence ?? 'ai_answer_response',
      whyItMatters:
        'AI answers need clear, consistent public source signals to describe the business accurately.',
    }

    updateState({
      checks: {
        ...auditState.checks,
        [`ai-${platform.toLowerCase()}`]: checkStatus,
      },
      notes: {
        ...auditState.notes,
        [`ai-${platform.toLowerCase()}`]: test.evidenceNotes,
        [manualFix.id]: manualFix.evidenceNote ?? '',
      },
      manualFixes: [
        ...auditState.manualFixes.filter(
          (fix) => fix.id !== manualFix.id && fix.id !== aiActionPlanId,
        ),
        manualFix,
      ],
    })
  }

  const setDirectories = (directories: AuditState['directories']) => {
    updateState({ directories })
  }

  const addDirectoryToActionPlan = (row: AuditState['directories']['activeRows'][number]) => {
    const issue = `${row.directoryName || 'Directory'} listing cleanup`
    const manualFix: FixItem = {
      id: `manual-directory-${row.id}`,
      priority: row.priority,
      area: `Listings - ${row.directoryName || 'Directory'}`,
      issue,
      fix:
        row.recommendedAction ||
        'Correct listing details, categories, NAP/contact information, website links, descriptions, photos, and owner access notes.',
      status: directoryRowToStatus(row),
      evidenceNote: [
        row.listingUrl ? `Saved URL: ${row.listingUrl}` : '',
        `Listing result: ${row.listingResult ?? row.directoryStatus}`,
        row.lastCheckedAt ? `Last checked: ${new Date(row.lastCheckedAt).toLocaleString()}` : '',
        `Evidence confidence: ${row.evidenceConfidence ?? 'manual_needs_confirmation'}`,
        row.publicEvidenceNotes ?? row.evidenceNotes,
      ]
        .filter(Boolean)
        .join('\n'),
      packageFit: row.packageFit,
      effort: row.authority === 'High' ? 'Medium' : 'Low',
      evidenceConfidence: row.evidenceConfidence ?? 'manual_needs_confirmation',
      whyItMatters:
        'Relevant directory listings can corroborate the business for customers, search engines, maps, and AI answer systems.',
    }

    updateState({
      manualFixes: [
        ...auditState.manualFixes.filter((fix) => fix.id !== manualFix.id),
        manualFix,
      ],
    })
  }

  const addCoreListingToActionPlan = (item: AuditItem) => {
    const status = auditState.checks[item.id] ?? 'unknown'
    const manualFix: FixItem = {
      id: `manual-core-listing-${item.id}`,
      priority: status === 'fail' ? 'High' : 'Medium',
      area: `Listings - ${item.label}`,
      issue: `${item.label} cleanup`,
      fix: item.fix,
      status,
      evidenceNote: auditState.notes[item.id] ?? '',
      packageFit: 'Starter Visibility Cleanup',
      effort: 'Low',
      evidenceConfidence:
        auditState.evidenceConfidence[item.id] ?? 'manual_needs_confirmation',
      whyItMatters:
        'Core listings are primary public source signals for customers, maps, search engines, and AI answer systems.',
    }

    updateState({
      manualFixes: [
        ...auditState.manualFixes.filter((fix) => fix.id !== manualFix.id),
        manualFix,
      ],
    })
  }

  const setSelectedAIPlatform = (platform: AIAnswerPlatform) => {
    updateState({ selectedAIPlatform: platform })
  }

  const downloadScanJson = (scan: SavedScanRecord) => {
    const file = buildSavedScanFile(scan)
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json',
    })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `found-local-scan-${slugify(scan.businessName)}-${dateSlug(
      scan.scanDate,
    )}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  const saveScanRecord = (record: SavedScanRecord) => {
    setSavedScans((current) => {
      const withoutCurrent = current.filter((scan) => scan.id !== record.id)
      return [record, ...withoutCurrent].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )
    })
    setCurrentScanId(record.id)
    setAuditState(record.payload)
    return record
  }

  const saveCurrentScan = () => {
    const existing = savedScans.find((scan) => scan.id === currentScanId)
    const record = savedScanFromWorkspace(auditState, existing)
    saveScanRecord(record)
  }

  const saveAsNewScan = () => {
    const notes = window.prompt('Optional notes for this saved scan:', '') ?? ''
    const record = savedScanFromWorkspace(auditState)
    saveScanRecord({ ...record, notes })
  }

  const saveBeforeReplacingWorkspace = () => {
    if (!hasUnsavedChanges) return true
    const shouldSave = window.confirm(
      'Loading another scan will replace the current workspace. Save the current scan first?',
    )
    if (!shouldSave) return false
    saveCurrentScan()
    return true
  }

  const loadSavedScan = (id: string) => {
    if (id === currentScanId && hasUnsavedChanges) {
      saveCurrentScan()
      return
    }
    if (!saveBeforeReplacingWorkspace()) return
    const scan = savedScans.find((item) => item.id === id)
    if (!scan) return
    setCurrentScanId(scan.id)
    setAuditState(normalizeAuditState(scan.payload))
    setWebsiteAuditError('')
  }

  const duplicateSavedScan = (id: string) => {
    const scan = savedScans.find((item) => item.id === id)
    if (!scan) return
    const now = new Date().toISOString()
    const duplicate = normalizeSavedScan({
      ...scan,
      id: createId('scan'),
      businessName: `${scan.businessName} copy`,
      createdAt: now,
      updatedAt: now,
      scanDate: now,
      payload: {
        ...cloneAuditState(scan.payload),
        lastUpdated: now,
      },
    })
    setSavedScans((current) => [duplicate, ...current])
  }

  const renameSavedScan = (id: string) => {
    const scan = savedScans.find((item) => item.id === id)
    if (!scan) return
    const nextName = window.prompt('Saved scan name:', scan.businessName)
    if (!nextName?.trim()) return
    setSavedScans((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              businessName: nextName.trim(),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
  }

  const deleteSavedScan = (id: string) => {
    const scan = savedScans.find((item) => item.id === id)
    if (!scan) return
    const confirmed = window.confirm(
      `Delete saved scan "${scan.businessName}"? This does not clear the current workspace unless this scan is loaded.`,
    )
    if (!confirmed) return
    setSavedScans((current) => current.filter((item) => item.id !== id))
    if (currentScanId === id) setCurrentScanId('')
  }

  const exportSavedScan = (id: string) => {
    const scan = savedScans.find((item) => item.id === id)
    if (scan) downloadScanJson(scan)
  }

  const importSavedScan = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const imported = parseImportedScanFile(String(reader.result ?? ''))
      if (!imported) {
        window.alert('This does not look like a Found Local scan JSON file.')
        return
      }
      setSavedScans((current) => [imported, ...current])
      window.alert(
        `Imported "${imported.businessName}". It was added to Saved Scans but was not loaded into the current workspace.`,
      )
    }
    reader.readAsText(file)
  }

  const startBlankScan = () => {
    if (!saveBeforeReplacingWorkspace()) return
    setCurrentScanId('')
    setAuditState(createBlankAuditState())
    setWebsiteAuditError('')
    setActiveView('Settings')
  }

  const runAutoAudit = async () => {
    setWebsiteAuditLoading(true)
    setWebsiteAuditError('')

    try {
      const result = await runWebsiteAutoAudit(auditState.profile)

      if (result.ok === false) {
        const blockedNote = [
          result.error,
          result.details,
          `Requested URL: ${result.requestedUrl}`,
          `Final URL: ${result.finalUrl || result.redirectUrl}`,
          `HTTP status: ${result.status}`,
          `Error type: ${result.errorType}`,
          `Redirect occurred: ${result.redirectOccurred ? 'Yes' : 'No'}`,
          `Blocked/forbidden: ${result.blocked ? 'Yes' : 'No'}`,
          `Redirect URL: ${result.redirectUrl}`,
          `Timestamp: ${result.timestamp}`,
          `Recommended next step: ${result.recommendedNextStep}`,
        ].join('\n')

        setAuditState((current) => ({
          ...current,
          websiteAudit: {
            ...current.websiteAudit,
            latestAttempt: result,
          },
          notes: {
            ...current.notes,
            'website-homepage-clarity': blockedNote,
          },
          lastUpdated: new Date().toISOString(),
        }))
        return
      }

      const mapping = mapAutoAuditToWebsiteChecks(result, auditState.profile)
      setAuditState((current) => ({
        ...current,
        websiteAudit: {
          ...current.websiteAudit,
          lastSuccessful: result,
          latestAttempt: result,
        },
        checks: { ...current.checks, ...mapping.statuses },
        notes: { ...current.notes, ...mapping.notes },
        evidenceConfidence: {
          ...current.evidenceConfidence,
          ...Object.keys(mapping.statuses).reduce(
            (confidence, id) => ({
              ...confidence,
              [id]: 'scanner_detected_public_page',
            }),
            {} as Record<string, EvidenceConfidence>,
          ),
        },
        lastUpdated: new Date().toISOString(),
      }))
    } catch (error) {
      setWebsiteAuditError(
        error instanceof Error ? error.message : 'Website audit failed.',
      )
    } finally {
      setWebsiteAuditLoading(false)
    }
  }

  const researchBusiness = () => {
    setActiveView('Website SEO')
    void runAutoAudit()
  }

  const setManualWebsiteObservation = (
    nextObservation: Partial<ManualWebsiteObservation>,
  ) => {
    const manualObservation = updateManualWebsiteObservationDraft(
      auditState.websiteAudit.manualObservation,
      nextObservation,
    )
    const draftWasInvalidated =
      auditState.websiteAudit.manualObservation.analyzedAt &&
      !manualObservation.analyzedAt
    const retainedChecks = { ...auditState.checks }
    const retainedNotes = { ...auditState.notes }
    const retainedConfidence = { ...auditState.evidenceConfidence }
    if (draftWasInvalidated) {
      Object.entries(retainedConfidence).forEach(([id, confidence]) => {
        if (confidence === 'operator_observation') {
          delete retainedChecks[id]
          delete retainedNotes[id]
          delete retainedConfidence[id]
        }
      })
    }
    updateState({
      websiteAudit: {
        ...auditState.websiteAudit,
        manualObservation,
      },
      checks: retainedChecks,
      notes: retainedNotes,
      evidenceConfidence: retainedConfidence,
    })
  }

  const analyzeManualObservation = () => {
    const observation = captureManualObservationProvenance(
      auditState.websiteAudit.manualObservation,
      new Date().toISOString(),
    )
    const mapping = analyzeManualWebsiteObservation(
      observation,
      auditState.profile,
    )
    updateState({
      websiteAudit: {
        ...auditState.websiteAudit,
        manualObservation: observation,
      },
      checks: { ...auditState.checks, ...mapping.statuses },
      notes: { ...auditState.notes, ...mapping.notes },
      evidenceConfidence: {
        ...auditState.evidenceConfidence,
        ...Object.keys(mapping.statuses).reduce(
          (confidence, id) => ({
            ...confidence,
            [id]: 'operator_observation',
          }),
          {} as Record<string, EvidenceConfidence>,
        ),
      },
    })
  }

  const applyBrowserObservationAnalysis = (
    observation: NonNullable<AuditState['websiteAudit']['browserObservation']>,
  ) => {
    const mapping = analyzeBrowserWebsiteObservation(
      observation,
      auditState.profile,
    )
    const mergedBrowserEvidence = mergeBrowserMappingWithServerPrecedence(
      auditState,
      auditState.profile,
      mapping,
    )
    updateState({
      websiteAudit: {
        ...auditState.websiteAudit,
        browserObservation: observation,
      },
      ...mergedBrowserEvidence,
    })
  }

  const importBrowserEvidence = () => {
    const parsed = parseBrowserWebsiteEvidencePayload(browserEvidenceJson)
    if (!parsed.ok) {
      setBrowserEvidenceImportError(parsed.error)
      return
    }

    const observation = browserWebsiteObservationFromPayload(
      parsed.payload,
      new Date().toISOString(),
    )
    setBrowserEvidenceImportError('')
    applyBrowserObservationAnalysis(observation)
  }

  const reanalyzeBrowserObservation = () => {
    const observation = auditState.websiteAudit.browserObservation
    if (!observation) return

    setBrowserEvidenceImportError('')
    applyBrowserObservationAnalysis(
      captureBrowserWebsiteObservationProvenance(
        observation,
        new Date().toISOString(),
      ),
    )
  }

  const latestWebsiteAttempt = auditState.websiteAudit.latestAttempt
  const lastSuccessfulWebsiteAudit = auditState.websiteAudit.lastSuccessful
  const browserWebsiteObservation = auditState.websiteAudit.browserObservation
  const browserEvidenceDiffersFromLastServerSuccess = (() => {
    if (!browserWebsiteObservation || !lastSuccessfulWebsiteAudit) return false
    try {
      return (
        new URL(browserWebsiteObservation.sourceUrl).toString() !==
        new URL(lastSuccessfulWebsiteAudit.fetchedUrl).toString()
      )
    } catch {
      return browserWebsiteObservation.sourceUrl !== lastSuccessfulWebsiteAudit.fetchedUrl
    }
  })()

  const websiteScanAccess =
    latestWebsiteAttempt?.ok &&
    (!latestWebsiteAttempt.title || latestWebsiteAttempt.contentLength < 500)
      ? {
          className: 'scan-status scan-status-yellow',
          label: 'Scan access: Yellow - homepage fetched but limited/incomplete',
        }
      : {
          className: 'scan-status scan-status-green',
          label: 'Scan access: Green - homepage fetched successfully',
        }

  const highPriorityCount = fixes.filter((fix) => fix.priority === 'High').length
  const mediumPriorityCount = fixes.filter(
    (fix) => fix.priority === 'Medium',
  ).length
  const lowPriorityCount = fixes.filter((fix) => fix.priority === 'Low').length
  const currentBusinessId = businessDirectoryKey(auditState.profile)
  const currentDirectoryRows = auditState.directories.activeRows.filter(
    (row) => !row.businessId || row.businessId === currentBusinessId,
  )
  const totalChecks = auditItems.length + currentDirectoryRows.length
  const checkedCount = Object.values(auditState.checks).filter(
    (status) => status !== 'unknown',
  ).length
  const uncheckedCount = Math.max(totalChecks - checkedCount, 0)
  const firstService =
    auditState.profile.primaryServices
      .split(',')
      .map((service) => service.trim())
      .filter(Boolean)[0] || 'local service'
  const evidenceLinks = [
    { label: 'Open website', url: auditState.profile.website },
    {
      label: 'Google Business',
      url: googleSearch(
        `${auditState.profile.businessName} ${auditState.profile.phone}`,
      ),
    },
    {
      label: 'Google Maps',
      url: googleMapsSearch(
        `${auditState.profile.businessName} ${auditState.profile.serviceArea}`,
      ),
    },
    {
      label: 'Bing Search',
      url: bingSearch(
        `${auditState.profile.businessName} ${auditState.profile.serviceArea}`,
      ),
    },
    {
      label: 'Service Search',
      url: googleSearch(`${firstService} ${auditState.profile.targetLocation}`),
    },
  ]

  const validContactNumbers = (auditState.profile.phoneNumbers ?? []).filter(
    (record) => record.isValidPublicContact && record.number.trim(),
  )

  const renderActiveView = () => {
    if (activeView === 'Overall') {
      return (
        <div className="overall-grid">
          <section className="cockpit-top-grid">
            <article className="panel cockpit-card snapshot-card">
              <div className="compact-card-header">
                <p className="eyebrow">Snapshot</p>
                <h2>{auditState.profile.businessName}</h2>
              </div>
              <dl className="snapshot-list">
                <div>
                  <dt>Website</dt>
                  <dd>{auditState.profile.website}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{auditState.profile.phone}</dd>
                </div>
                {validContactNumbers.length > 0 ? (
                  <div>
                    <dt>Valid public contact numbers</dt>
                    <dd>
                      {validContactNumbers
                        .map(
                          (record) =>
                            `${record.label || 'Contact'}: ${record.number}`,
                        )
                        .join(' | ')}
                    </dd>
                  </div>
                ) : null}
                {auditState.profile.contactStructureNote ? (
                  <div>
                    <dt>Contact structure</dt>
                    <dd>{auditState.profile.contactStructureNote}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Location / service area</dt>
                  <dd>
                    {auditState.profile.targetLocation} |{' '}
                    {auditState.profile.serviceArea}
                  </dd>
                </div>
                <div>
                  <dt>Services</dt>
                  <dd>{auditState.profile.primaryServices}</dd>
                </div>
                <div>
                  <dt>Scan date/time</dt>
                  <dd>{new Date(auditState.lastUpdated).toLocaleString()}</dd>
                </div>
              </dl>
            </article>

            <article className="panel cockpit-card">
              <div className="compact-card-header">
                <p className="eyebrow">Scan Summary</p>
                <h2>Verification status</h2>
              </div>
              <div className="metric-stack">
                <div>
                  <span>Total checks</span>
                  <strong>{totalChecks}</strong>
                </div>
                <div>
                  <span>Checked</span>
                  <strong>{checkedCount}</strong>
                </div>
                <div>
                  <span>Unchecked</span>
                  <strong>{uncheckedCount}</strong>
                </div>
              </div>
            </article>

            <article className="panel cockpit-card">
              <div className="compact-card-header">
                <p className="eyebrow">Potential Fixes Identified</p>
                <h2>{fixes.length} visibility gaps</h2>
              </div>
              <div className="priority-stack">
                <div>
                  <span className="priority-dot priority-high" />
                  <span>High priority</span>
                  <strong>{highPriorityCount}</strong>
                </div>
                <div>
                  <span className="priority-dot priority-medium" />
                  <span>Medium priority</span>
                  <strong>{mediumPriorityCount}</strong>
                </div>
                <div>
                  <span className="priority-dot priority-low" />
                  <span>Low priority</span>
                  <strong>{lowPriorityCount}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="panel evidence-shortcuts-panel">
            <div>
              <p className="eyebrow">Evidence shortcuts</p>
              <p>Quick links for manual verification and customer evidence review.</p>
            </div>
            <div className="evidence-links evidence-shortcuts">
              {evidenceLinks.map((link) => (
                <a
                  href={link.url}
                  key={link.label}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </section>

          <section className="panel sales-summary-card">
            <p className="eyebrow">Sales Summary</p>
            <p>
              I identified {fixes.length} potential visibility gaps across
              website SEO, listings, search visibility, and optional manual AI evidence
              readiness. The recommended starter cleanup focuses on the
              highest-impact fixes first.
            </p>
          </section>

          <section className="recommended-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Recommended Next Steps</p>
                <h2>Offer path</h2>
              </div>
            </div>
            <div className="recommended-grid">
              <article className="panel recommended-card recommended-card-primary">
                <span className="offer-badge">Recommended</span>
                <h3>Starter Visibility Cleanup</h3>
                <strong className="price-placeholder">$299 one-time</strong>
                <ul className="package-list compact-package-list">
                  <li>Correct/standardize business listing signals</li>
                  <li>Improve website SEO clarity signals</li>
                  <li>Strengthen service/location visibility</li>
                  <li>Review AI answer/source accuracy</li>
                  <li>Create prioritized cleanup plan</li>
                </ul>
              </article>

              <article className="panel recommended-card">
                <span className="offer-badge offer-badge-muted">Future option</span>
                <h3>Future Monthly Monitoring</h3>
                <strong className="price-placeholder">$70/month</strong>
                <p>
                  Monthly monitoring can re-check visibility gaps, listing
                  consistency, search visibility, AI answer accuracy, reviews,
                  and send an email report.
                </p>
              </article>

              <article className="panel recommended-card">
                <span className="offer-badge offer-badge-muted">Future option</span>
                <h3>Website SEO Implementation</h3>
                <strong className="price-placeholder">$500-$2,500+</strong>
                <p>
                  Larger follow-on work for service pages, FAQ content, schema,
                  local SEO copy, CTA cleanup, and technical website
                  improvements.
                </p>
              </article>
            </div>
          </section>

          <FixPlan fixes={salesFixes} notes={auditState.notes} />
        </div>
      )
    }

    if (activeView === 'Profile Management') {
      return (
        <div className="listings-cockpit">
          <section className="panel listings-overview-panel">
            <div>
              <p className="eyebrow">Public profiles and ownership</p>
              <h2>Profile Management</h2>
              <p>
                Which public profiles exist, who controls them, and what
                requires owner confirmation or correction? Public evidence does
                not infer owner/admin access.
              </p>
            </div>
            <div className="metric-stack listings-metric-stack">
              <div>
                <span>Owner/admin access</span>
                <strong>Confirm separately</strong>
              </div>
              <div>
                <span>Activated directories</span>
                <strong>{currentDirectoryRows.length}</strong>
              </div>
            </div>
          </section>

          <CoreListingsPanel
            items={groups.listings.filter(
              (item) => item.id !== 'listing-industry-local',
            )}
            checks={auditState.checks}
            notes={auditState.notes}
            evidenceConfidence={auditState.evidenceConfidence}
            onStatusChange={setCheck}
            onNoteChange={setNote}
            onEvidenceConfidenceChange={setEvidenceConfidence}
            onAddToActionPlan={addCoreListingToActionPlan}
          />

          <DirectoryAuditPanel
            profile={auditState.profile}
            state={auditState.directories}
            onChange={setDirectories}
            onAddToActionPlan={addDirectoryToActionPlan}
          />

          <VoiceReadinessPanel
            profile={auditState.profile}
            checks={auditState.checks}
            notes={auditState.notes}
            evidenceConfidence={auditState.evidenceConfidence}
            observations={auditState.voiceAssistantObservations}
            onStatusChange={setCheck}
            onNoteChange={setNote}
            onEvidenceConfidenceChange={setEvidenceConfidence}
            onObservationChange={(voiceAssistantObservations) => updateState({ voiceAssistantObservations })}
            onAddCategoryToActionPlan={addVoiceCategoryToActionPlan}
            onAddObservationToActionPlan={(id) => addVoiceAssistantObservationToActionPlan(id)}
          />
        </div>
      )
    }

    if (activeView === 'Website SEO') {
      return (
        <AuditSection
          title="Website SEO audit"
          eyebrow="Automated Website Audit"
          subtitle="Run an authorized homepage scan to review local intent, service content, schema, contact visibility, and technical signals. Some checks may still require manual verification."
          items={groups.website}
          checks={auditState.checks}
          notes={auditState.notes}
          onStatusChange={setCheck}
          onNoteChange={setNote}
        >
          <div className="auto-audit-box">
            <button
              type="button"
              onClick={() => void runAutoAudit()}
              disabled={websiteAuditLoading}
            >
              {websiteAuditLoading
                ? 'Running Website Auto-Audit...'
                : 'Run Website Auto-Audit'}
            </button>
            <p>
              Fetches and analyzes only the entered business website homepage.
              Third-party platform checks stay manual.
            </p>
            {websiteAuditError ? (
              <p className="error-text">
                Scanner error - no website finding was recorded. {websiteAuditError}
              </p>
            ) : null}
            {latestWebsiteAttempt ? (
              <div className="auto-audit-result">
                <strong>Latest scan attempt</strong>
                {latestWebsiteAttempt.ok === true ? (
                  <>
                    <span className={websiteScanAccess.className}>
                      {websiteScanAccess.label}
                    </span>
                    <span>{new Date(latestWebsiteAttempt.analyzedAt).toLocaleString()}</span>
                    <span>Requested: {latestWebsiteAttempt.normalizedUrl}</span>
                    <span>Final URL: {latestWebsiteAttempt.fetchedUrl}</span>
                    <span>
                      Fetch strategy:{' '}
                      {latestWebsiteAttempt.fetchStrategyUsed?.trim() || 'not recorded'}
                    </span>
                    <span>Redirect count: {latestWebsiteAttempt.redirectCount}</span>
                    <span>
                      Found {latestWebsiteAttempt.detectedSchemaTypes.length} schema type(s),{' '}
                      {latestWebsiteAttempt.servicePhraseMatches.length} service phrase(s),{' '}
                      {latestWebsiteAttempt.serviceAreaPhraseMatches.length} area phrase(s)
                    </span>
                    {latestWebsiteAttempt.rejectedContactCandidates.length > 0 ? (
                      <details className="scanner-diagnostics">
                        <summary>Scanner diagnostics: rejected contact-link candidates ({latestWebsiteAttempt.rejectedContactCandidates.length})</summary>
                        <p>
                          These links were considered by legacy matching but rejected by the current contact classifier. They are operator diagnostics only and are not customer findings.
                        </p>
                        <ul>
                          {latestWebsiteAttempt.rejectedContactCandidates.map((link) => (
                            <li key={`${link.url}-${link.anchorText}`}>
                              <strong>{link.anchorText || '(no anchor text)'}</strong>{' '}
                              <span>{link.url}</span>{' '}
                              <em>({link.sourceRegion}; {link.reason})</em>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="scan-status scan-status-gray">
                      Scan access: Gray - needs manual review
                    </span>
                    <span className="blocked-message">
                      {latestWebsiteAttempt.error}
                    </span>
                    <span>{latestWebsiteAttempt.details}</span>
                    <span>Diagnostic detail: {latestWebsiteAttempt.details}</span>
                    <span>Requested URL: {latestWebsiteAttempt.requestedUrl}</span>
                    <span>Final URL: {latestWebsiteAttempt.finalUrl || latestWebsiteAttempt.redirectUrl}</span>
                    <span>HTTP status: {latestWebsiteAttempt.status || 'Unavailable'}</span>
                    <span>Error type: {latestWebsiteAttempt.errorType}</span>
                    <span>
                      Fetch strategy:{' '}
                      {latestWebsiteAttempt.fetchStrategyUsed?.trim() || 'not recorded'}
                    </span>
                    <span>Redirect occurred: {latestWebsiteAttempt.redirectOccurred ? 'Yes' : 'No'}</span>
                    <span>Redirect count: {latestWebsiteAttempt.redirectCount}</span>
                    <span>Protocol fallback tried: {latestWebsiteAttempt.protocolFallbackTried ? 'Yes' : 'No'}</span>
                    <span>WWW hostname fallback tried: {latestWebsiteAttempt.wwwFallbackTried ? 'Yes' : 'No'}</span>
                    <span>Blocked/forbidden: {latestWebsiteAttempt.blocked ? 'Yes' : 'No'}</span>
                    <span>Timestamp: {new Date(latestWebsiteAttempt.timestamp).toLocaleString()}</span>
                    <span>{latestWebsiteAttempt.recommendedNextStep}</span>
                  </>
                )}
              </div>
            ) : null}
            {lastSuccessfulWebsiteAudit && !latestWebsiteAttempt?.ok ? (
              <div className="auto-audit-result successful-audit-result">
                <strong>Last successful audit</strong>
                <span>{new Date(lastSuccessfulWebsiteAudit.analyzedAt).toLocaleString()}</span>
                <span>Final URL: {lastSuccessfulWebsiteAudit.fetchedUrl}</span>
                <span>
                  Previous successful Website SEO findings are still preserved
                  and are not reduced solely because the latest scan was blocked.
                </span>
              </div>
            ) : null}
          </div>
          {!latestWebsiteAttempt?.ok ? (
            <div className="manual-website-observation">
              <div>
                <p className="eyebrow">Manual Website Observation</p>
                <h3>Browser Observation Review</h3>
                <p>
                  If the website opens in your browser but blocks automated
                  scanning, paste visible homepage text, page title/meta details,
                  links, or page source snippets here for assisted review.
                </p>
                <p>
                  Future note: an Enhanced Browser Check could support
                  operator-opened or browser-rendered page analysis, but this
                  version keeps review manual and authorized.
                </p>
              </div>
              <div className="manual-website-grid">
                <label className="full-width-label">
                  Browser-assisted structured evidence JSON
                  <textarea
                    className="large-textarea"
                    value={browserEvidenceJson}
                    onChange={(event) => {
                      setBrowserEvidenceJson(event.target.value)
                      setBrowserEvidenceImportError('')
                    }}
                    placeholder="Run scripts/browser-website-evidence-helper.js in the public page browser console, then paste the JSON payload here."
                  />
                </label>
              </div>
              <button type="button" onClick={importBrowserEvidence}>
                Import Browser-Assisted Evidence
              </button>
              {browserEvidenceImportError ? (
                <p className="error-text">{browserEvidenceImportError}</p>
              ) : null}
              {browserWebsiteObservation ? (
                <div className="auto-audit-result">
                  <strong>Browser-assisted evidence</strong>
                  <span>Source URL: {browserWebsiteObservation.sourceUrl}</span>
                  <span>
                    DOM captured:{' '}
                    {new Date(browserWebsiteObservation.capturedAt).toLocaleString()}
                  </span>
                  {browserWebsiteObservation.recordedAt ? (
                    <span>
                      Recorded in Found Local:{' '}
                      {new Date(browserWebsiteObservation.recordedAt).toLocaleString()}
                    </span>
                  ) : null}
                  <span>
                    Found {browserWebsiteObservation.detectedSchemaTypes.length} schema type(s),{' '}
                    {browserWebsiteObservation.links.length} link(s),{' '}
                    {browserWebsiteObservation.contactLinks.length} contact link(s)
                  </span>
                  {browserEvidenceDiffersFromLastServerSuccess ? (
                    <span>
                      Browser-assisted source differs from the last successful
                      server acquisition. Both evidence records are preserved.
                    </span>
                  ) : null}
                  <button type="button" onClick={reanalyzeBrowserObservation}>
                    Re-analyze Browser-Assisted Evidence
                  </button>
                </div>
              ) : null}
              <div className="manual-website-grid">
                <label className="full-width-label">
                  Recorded source URL
                  <input
                    value={auditState.websiteAudit.manualObservation.sourceUrl}
                    onChange={(event) =>
                      setManualWebsiteObservation({ sourceUrl: event.target.value })
                    }
                    placeholder={auditState.profile.website || 'https://example.com'}
                  />
                </label>
                <label>
                  Observed page title
                  <input
                    value={auditState.websiteAudit.manualObservation.observedTitle}
                    onChange={(event) =>
                      setManualWebsiteObservation({
                        observedTitle: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Observed meta description
                  <textarea
                    value={
                      auditState.websiteAudit.manualObservation
                        .observedMetaDescription
                    }
                    onChange={(event) =>
                      setManualWebsiteObservation({
                        observedMetaDescription: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="full-width-label">
                  Visible homepage text
                  <textarea
                    className="large-textarea"
                    value={
                      auditState.websiteAudit.manualObservation
                        .visibleHomepageText
                    }
                    onChange={(event) =>
                      setManualWebsiteObservation({
                        visibleHomepageText: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="full-width-label">
                  Observed links / URLs
                  <textarea
                    value={auditState.websiteAudit.manualObservation.observedLinks}
                    onChange={(event) =>
                      setManualWebsiteObservation({
                        observedLinks: event.target.value,
                      })
                    }
                    placeholder="Paste visible navigation, contact, service, social, or booking URLs."
                  />
                </label>
                <label className="full-width-label">
                  Observed schema/source snippet, optional
                  <textarea
                    value={
                      auditState.websiteAudit.manualObservation
                        .observedSchemaSnippet
                    }
                    onChange={(event) =>
                      setManualWebsiteObservation({
                        observedSchemaSnippet: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="full-width-label">
                  Notes
                  <textarea
                    value={auditState.websiteAudit.manualObservation.notes}
                    onChange={(event) =>
                      setManualWebsiteObservation({ notes: event.target.value })
                    }
                  />
                </label>
              </div>
              <button type="button" onClick={analyzeManualObservation}>
                Analyze Manual Website Observation
              </button>
              {auditState.websiteAudit.manualObservation.analyzedAt ? (
                <p className="method-guidance">
                  Manual observation analyzed{' '}
                   {new Date(
                     auditState.websiteAudit.manualObservation.analyzedAt,
                   ).toLocaleString()}
                   . Findings are labeled as based on operator-provided website
                   observation.
                 </p>
               ) : null}
              {auditState.websiteAudit.manualObservation.recordedAt ? (
                <p className="method-guidance">
                  Recorded at{' '}
                  {new Date(
                    auditState.websiteAudit.manualObservation.recordedAt,
                  ).toLocaleString()}
                  .
                </p>
              ) : null}
            </div>
          ) : null}
        </AuditSection>
      )
    }

    if (activeView === 'Public Presence') {
      return (
        <SearchVisibilityPanel
          profile={auditState.profile}
          profileState={auditState.businessProfile}
          legacyTests={auditState.searchVisibilityTests}
          observations={auditState.searchDestinationObservations}
          onChange={setSearchDestinationObservation}
          onAddToActionPlan={addSearchVisibilityToActionPlan}
        />
      )
    }

    if (activeView === 'AI Visibility') {
      return (
        <AIAnswerVisibilityTest
          profile={auditState.profile}
          profileState={auditState.businessProfile}
          selectedPlatform={auditState.selectedAIPlatform}
          value={auditState.aiAnswerTests[auditState.selectedAIPlatform]}
          tests={auditState.aiAnswerTests}
          onSelectedPlatformChange={setSelectedAIPlatform}
          onChange={setAIAnswerTest}
          onAddToActionPlan={addAIAnswerToActionPlan}
        />
      )
    }

    if (activeView === 'Sales Readiness') {
      return <SalesReadinessPanel state={auditState.salesReadiness} profile={auditState.profile} directories={auditState.directories.activeRows} onChange={(salesReadiness) => updateState({ salesReadiness })} onAddEntity={addEntityFindingToActionPlan} onAddQuestion={addCustomerQuestionToActionPlan} />
    }

    if (activeView === 'Reports') {
      return (
        <ReportView
          profile={auditState.profile}
          scores={scores}
          checks={auditState.checks}
          notes={auditState.notes}
          fixes={fixes}
          lastUpdated={auditState.lastUpdated}
          reportSummary={auditState.reportSummary}
          onReportSummaryChange={(reportSummary) =>
            updateState({ reportSummary })
          }
          evidenceConfidence={auditState.evidenceConfidence}
          aiVisibilityEvidence={aiVisibilityEvidence}
        />
      )
    }

    if (activeView === 'Business Profile') {
      return (
        <BusinessProfilePanel
          profile={auditState.profile}
          profileState={auditState.businessProfile}
          onChange={updateProfileFromOperator}
        />
      )
    }

    if (activeView === 'Settings') {
      return (
        <div className="settings-grid">
          <section className="panel placeholder-panel">
            <div className="panel-header">
              <p className="eyebrow">Settings</p>
              <h2>Workspace settings</h2>
              <p>
                Save, reopen, export, and import complete scan workspaces
                before testing another business.
              </p>
            </div>
          </section>
          <SavedScansPanel
            currentScanId={currentScanId}
            dirty={hasUnsavedChanges}
            scans={savedScans}
            onSaveCurrent={saveCurrentScan}
            onSaveAsNew={saveAsNewScan}
            onLoad={loadSavedScan}
            onDuplicate={duplicateSavedScan}
            onRename={renameSavedScan}
            onDelete={deleteSavedScan}
            onExport={exportSavedScan}
            onImport={importSavedScan}
            onStartBlank={startBlankScan}
          />
          <IntakeForm
            profile={auditState.profile}
            onChange={updateProfileFromOperator}
            onResearch={researchBusiness}
          />
        </div>
      )
    }

    return null
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <FoundLocalMark />
          </div>
          <div>
            <strong>Found Local</strong>
            <span>Helping local businesses get found.</span>
          </div>
        </div>

        <div className="tool-chip">
          <ScannerToolMark />
          <span>Business Scanner Tool · internal scan workspace</span>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navViews.map((view) => (
            <button
              className={`sidebar-link ${activeView === view ? 'sidebar-link-active' : ''}`}
              key={view}
              onClick={() => setActiveView(view)}
              type="button"
            >
              <span className="sidebar-icon" aria-hidden="true">
                <SidebarIcon view={view} />
              </span>
              {visibleViewLabel(view)}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>Last Scan</span>
          <strong>{new Date(auditState.lastUpdated).toLocaleString()}</strong>
          <div className="sidebar-tools">
            <span>Report Tools</span>
            <button type="button" onClick={() => window.print()}>
              Print Report
            </button>
            <button
              type="button"
              onClick={() => setActiveView('Overall')}
            >
              View Action Plan
            </button>
            <button
              type="button"
              onClick={() => void runAutoAudit()}
              disabled={websiteAuditLoading}
            >
              {websiteAuditLoading ? 'Running Scan...' : 'Run Website Scan'}
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="main-header">
          <div>
            <h1>Business Scanner Tool</h1>
            <p>
              {auditState.profile.businessName} | scanned{' '}
              {new Date(auditState.lastUpdated).toLocaleString()}
              {currentSavedScan
                ? ` | ${hasUnsavedChanges ? 'unsaved changes' : 'saved scan'}`
                : ' | unsaved workspace'}
            </p>
          </div>
        </header>

        <div className="main-column">
          <section
            className="score-grid"
            role="tablist"
            aria-label="Dashboard score summary"
          >
            {dashboardCards.map(({ label, result, weight, displayValue, details }) => (
              <ScoreCard
                key={label}
                label={visibleViewLabel(label)}
                result={result}
                weight={weight}
                displayValue={displayValue}
                details={details}
                active={activeView === label}
                onClick={() => setActiveView(label)}
              />
            ))}
          </section>

          {renderActiveView()}
        </div>
      </main>
    </div>
  )
}

export default App
