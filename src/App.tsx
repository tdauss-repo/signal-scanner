import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { AIAnswerVisibilityTest } from './components/AIAnswerVisibilityTest'
import { AuditSection } from './components/AuditSection'
import { CoreListingsPanel } from './components/CoreListingsPanel'
import {
  DirectoryAuditPanel,
  directoryRowToAuditItem,
  directoryRowToStatus,
} from './components/DirectoryAuditPanel'
import { FixPlan } from './components/FixPlan'
import { IntakeForm } from './components/IntakeForm'
import { ReportView } from './components/ReportView'
import { SavedScansPanel } from './components/SavedScansPanel'
import { ScoreCard } from './components/ScoreCard'
import { SearchVisibilityPanel } from './components/SearchVisibilityPanel'
import { VoiceReadinessPanel } from './components/VoiceReadinessPanel'
import { buildAuditItems } from './data/auditCatalog'
import { defaultProfile } from './data/demoProfile'
import type { AIAnswerPlatform, AIAnswerTestState, AuditItem, AuditState, BusinessProfile, CheckStatus, EvidenceConfidence, FixItem, SavedScanFile, SavedScanRecord, SearchVisibilityQuery, SearchVisibilityTestState, VoicePromptTestState } from './types/audit'
import type { WebsiteAuditResponse } from './types/websiteAudit'
import { aiAnswerPlatforms, buildFixPlan, scoreAIAnswerPlatform, scoreAIAnswers, scoreItems, trafficStatusForScore, weightedAverage } from './utils/scoring'
import { mapAutoAuditToWebsiteChecks, runWebsiteAutoAudit } from './utils/websiteAutoAudit'
import { bingSearch, googleMapsSearch, googleSearch } from './utils/links'
import {
  businessDirectoryKey,
  publicPageCheckEligibilityFor,
  urlDiscoveryMethodFor,
} from './utils/directorySuggestions'
import {
  actionPlanPriorityForSearchObservation,
  defaultSearchVisibilityTest,
  searchVisibilityResultLabel,
  searchVisibilityResultToCheckStatus,
} from './utils/searchVisibility'
import {
  buildVoicePromptTests,
  buildVoiceReadinessCategories,
  buildVoiceSourceReadinessGroups,
  defaultVoicePromptTest,
  voicePromptStatusLabel,
  voicePromptStatusToCheckStatus,
} from './utils/voiceReadiness'

const storageKey = 'local-signal-scanner-state'
const activeViewStorageKey = 'business-scanner-active-view'
const savedScansStorageKey = 'found-local-saved-scans'
const currentScanIdStorageKey = 'found-local-current-scan-id'
const aiActionPlanId = 'manual-ai-answer-visibility-test'

const aiResultToCheckStatus = (status: AIAnswerTestState['resultStatus']) =>
  status === 'signin_required' ? 'unknown' : status

const aiResultLabel = (status: AIAnswerTestState['resultStatus']) => {
  if (status === 'signin_required') return 'Not tested - sign-in required'
  if (status === 'unknown') return 'Not tested'
  return status
}

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
  | 'Listings'
  | 'Website SEO'
  | 'Search Visibility'
  | 'AI Answers'
  | 'Voice'

type ActiveView =
  | ScoreView
  | 'Reports'
  | 'Settings'

const views: ScoreView[] = [
  'Overall',
  'Listings',
  'Website SEO',
  'Search Visibility',
  'AI Answers',
  'Voice',
]

const navViews: ActiveView[] = [...views, 'Reports', 'Settings']

const navIconPaths: Record<ActiveView, React.ReactNode> = {
  Overall: (
    <>
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v7h-7z" />
      <path d="M4 13h7v7H4z" />
      <path d="M13 13h7v7h-7z" />
    </>
  ),
  Listings: (
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
  'Search Visibility': (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 5 5" />
      <path d="M8.5 10.5h4" />
    </>
  ),
  'AI Answers': (
    <>
      <path d="M12 4 9 10l-5 2 5 2 3 6 3-6 5-2-5-2z" />
      <path d="M5 5h3" />
      <path d="M16 19h3" />
    </>
  ),
  Voice: (
    <>
      <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3" />
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
  checks: {},
  notes: {},
  evidenceConfidence: {},
  selectedAIPlatform: 'Gemini',
  aiAnswerTests: buildDefaultAIAnswerTests(),
  searchVisibilityTests: {},
  voicePromptTests: {},
  directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [],
  reportSummary: '',
  lastUpdated: new Date().toISOString(),
}

const blankProfile: BusinessProfile = {
  businessName: '',
  website: '',
  phone: '',
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
  checks: {},
  notes: {},
  evidenceConfidence: {},
  selectedAIPlatform: 'Gemini',
  aiAnswerTests: buildDefaultAIAnswerTests(),
  searchVisibilityTests: {},
  voicePromptTests: {},
  directories: { activeRows: [], ignoredSuggestionIds: [] },
  manualFixes: [],
  reportSummary: '',
  lastUpdated: new Date().toISOString(),
})

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

    return {
      ...initialState,
      ...parsed,
      profile: {
        ...defaultProfile,
        ...parsed.profile,
        phoneNumbers: ensurePhoneRecordIds(
          parsed.profile?.phoneNumbers ?? defaultProfile.phoneNumbers,
        ),
        contactStructureNote:
          parsed.profile?.contactStructureNote ??
          defaultProfile.contactStructureNote,
      },
      selectedAIPlatform: parsed.selectedAIPlatform ?? 'Gemini',
      searchVisibilityTests: parsed.searchVisibilityTests ?? {},
      voicePromptTests: parsed.voicePromptTests ?? {},
      aiAnswerTests: aiAnswerPlatforms.reduce(
        (tests, platform) => ({
          ...tests,
          [platform]: {
            ...defaultAIAnswerTest,
            ...savedTests[platform],
            evidenceConfidence:
              savedTests[platform]?.evidenceConfidence ?? 'ai_answer_response',
          },
        }),
        {} as Record<AIAnswerPlatform, AIAnswerTestState>,
      ),
      directories: migrateDirectories(parsed.directories, {
        ...defaultProfile,
        ...parsed.profile,
      }),
      evidenceConfidence: parsed.evidenceConfidence ?? {},
      reportSummary: parsed.reportSummary ?? '',
      manualFixes: (parsed.manualFixes ?? []).map((fix) => ({
        ...fix,
        evidenceConfidence:
          fix.evidenceConfidence ?? 'manual_needs_confirmation',
      })),
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
  const [websiteAudit, setWebsiteAudit] = useState<WebsiteAuditResponse | null>(
    null,
  )
  const [websiteAuditLoading, setWebsiteAuditLoading] = useState(false)
  const [websiteAuditError, setWebsiteAuditError] = useState('')
  const [activeView, setActiveView] = useState<ActiveView>(loadActiveView)
  const [savedScans, setSavedScans] = useState<SavedScanRecord[]>(loadSavedScans)
  const [currentScanId, setCurrentScanId] = useState(loadCurrentScanId)

  const auditItems = useMemo(
    () => buildAuditItems(auditState.profile),
    [auditState.profile],
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
    const directoryItems = currentDirectoryRows.map(
      directoryRowToAuditItem,
    )
    const directoryChecks = currentDirectoryRows.reduce(
      (checks, row) => ({
        ...checks,
        [directoryRowToAuditItem(row).id]: directoryRowToStatus(row),
      }),
      {} as Record<string, CheckStatus>,
    )
    const listings = scoreItems([...groups.listings, ...directoryItems], {
      ...auditState.checks,
      ...directoryChecks,
    })
    const website = scoreItems(groups.website, auditState.checks)
    const searchVisibility = scoreItems(
      groups.searchVisibility,
      auditState.checks,
    )
    const ai = scoreAIAnswers(auditState.aiAnswerTests)
    const voiceReadinessChecks = [
      ...buildVoiceSourceReadinessGroups(auditState.profile, auditState.checks),
      ...buildVoiceReadinessCategories(auditState.profile, auditState.checks),
    ].reduce(
      (checks, category) => ({
        ...checks,
        [category.id]: auditState.checks[category.id] ?? category.suggestedStatus,
      }),
      {} as Record<string, CheckStatus>,
    )
    const voiceItemsForScore = groups.voice.filter(
      (item) => !item.id.startsWith('voice-prompt-'),
    )
    const voice = scoreItems(voiceItemsForScore, {
      ...auditState.checks,
      ...voiceReadinessChecks,
    })
    const overallScore = weightedAverage([
      { score: listings.score, weight: 24 },
      { score: website.score, weight: 24 },
      { score: searchVisibility.score, weight: 18 },
      { score: ai.score, weight: 18 },
      { score: voice.score, weight: 16 },
    ])

    return {
      Overall: {
        score: overallScore,
        status: trafficStatusForScore(overallScore),
        earned: overallScore ?? 0,
        possible: 100,
        checked:
          listings.checked +
          website.checked +
          searchVisibility.checked +
          ai.checked +
          voice.checked,
      },
      Listings: listings,
      'Website SEO': website,
      'Search Visibility': searchVisibility,
      'AI Answers': ai,
      Voice: voice,
    }
  }, [auditState.aiAnswerTests, auditState.checks, auditState.directories.activeRows, auditState.profile, auditState.voicePromptTests, groups])

  const fixes = useMemo(
    () => [
      ...buildFixPlan(
        auditItems.filter(
          (item) => item.area !== 'ai' && !item.id.startsWith('voice-prompt-'),
        ),
        auditState.checks,
      ),
      ...auditState.manualFixes,
    ],
    [auditItems, auditState.checks, auditState.manualFixes],
  )

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

  const setSearchVisibilityTest = (
    id: string,
    searchVisibilityTest: SearchVisibilityTestState,
  ) => {
    const checkStatus = searchVisibilityResultToCheckStatus(
      searchVisibilityTest.visibilityResult,
    )
    updateState({
      searchVisibilityTests: {
        ...auditState.searchVisibilityTests,
        [id]: searchVisibilityTest,
      },
      checks: {
        ...auditState.checks,
        [id]: checkStatus,
      },
      notes: {
        ...auditState.notes,
        [id]: searchVisibilityTest.evidenceNotes,
      },
      evidenceConfidence: {
        ...auditState.evidenceConfidence,
        [id]: searchVisibilityTest.evidenceConfidence,
      },
    })
  }

  const addSearchVisibilityToActionPlan = (query: SearchVisibilityQuery) => {
    const test = {
      ...defaultSearchVisibilityTest(),
      ...auditState.searchVisibilityTests[query.id],
    }
    const status = searchVisibilityResultToCheckStatus(test.visibilityResult)
    const observedPriority = actionPlanPriorityForSearchObservation(
      query,
      test.visibilityResult,
    )
    const manualFix: FixItem = {
      id: `manual-search-visibility-${query.id}`,
      priority: observedPriority,
      area: `Search Visibility - ${query.intentType}`,
      issue: `Search visibility for "${query.query}"`,
      fix: test.recommendedAction,
      status,
      evidenceNote: [
        `Query: ${query.query}`,
        `Intent type: ${query.intentType}`,
        `Query importance: ${query.priority}`,
        `Finding priority: ${observedPriority}`,
        `Visibility result: ${searchVisibilityResultLabel(test.visibilityResult)}`,
        `Where found: ${test.whereFound}`,
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
        [query.id]: status,
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

  const setVoicePromptTest = (
    id: string,
    voicePromptTest: VoicePromptTestState,
  ) => {
    const checkStatus = voicePromptStatusToCheckStatus(
      voicePromptTest.testStatus,
    )
    updateState({
      voicePromptTests: {
        ...auditState.voicePromptTests,
        [id]: voicePromptTest,
      },
      checks: {
        ...auditState.checks,
        [id]: checkStatus,
      },
      notes: {
        ...auditState.notes,
        [id]: voicePromptTest.evidenceNotes,
      },
      evidenceConfidence: {
        ...auditState.evidenceConfidence,
        [id]: voicePromptTest.evidenceConfidence,
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
      area: 'Voice Search Readiness',
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
        'Voice-style answers depend on clear public signals for identity, contact, location, services, listings, reviews, FAQs, and structured data.',
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

  const addVoicePromptToActionPlan = (id: string) => {
    const prompt = buildVoicePromptTests(auditState.profile).find(
      (item) => item.id === id,
    )
    if (!prompt) return
    const test = {
      ...defaultVoicePromptTest(prompt),
      ...auditState.voicePromptTests[id],
    }
    const status = voicePromptStatusToCheckStatus(test.testStatus)
    const manualFix: FixItem = {
      id: `manual-${id}`,
      priority: prompt.priority,
      area: `Voice Search Readiness - ${prompt.intent}`,
      issue: prompt.prompt,
      fix: test.recommendedAction,
      status,
      evidenceNote: [
        `Prompt: ${prompt.prompt}`,
        `Platform tested: ${test.platformTested}`,
        `Test device/context: ${test.deviceContext}`,
        `Personalization risk: ${test.personalizationRisk}`,
        `Test status: ${voicePromptStatusLabel(test.testStatus)}`,
        test.evidenceNotes,
      ]
        .filter(Boolean)
        .join('\n'),
      packageFit: test.packageFit,
      effort: test.packageFit === 'Website SEO Implementation' ? 'Medium' : 'Low',
      evidenceConfidence: test.evidenceConfidence,
      whyItMatters:
        'Voice-style prompt tests reveal whether public signals resolve the correct business, contact path, services, and local relevance.',
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
        [id]: test.evidenceNotes,
        [manualFix.id]: manualFix.evidenceNote ?? '',
      },
      evidenceConfidence: {
        ...auditState.evidenceConfidence,
        [id]: test.evidenceConfidence,
      },
    })
  }

  const addAIAnswerToActionPlan = () => {
    const platform = auditState.selectedAIPlatform
    const test = auditState.aiAnswerTests[platform]
    if (
      test.resultStatus === 'signin_required' &&
      (!test.evidenceNotes.trim() || !test.suggestedFix.trim())
    ) {
      window.alert(
        'This platform is marked as sign-in required, so it will stay out of the Action Plan unless you add an evidence summary and recommended action.',
      )
      return
    }

    const statusLabel = aiResultLabel(test.resultStatus)
    const checkStatus = aiResultToCheckStatus(test.resultStatus)
    const issue = test.gapTitle.trim() || `${platform} AI answer visibility gap`
    const manualFix: FixItem = {
      id: `${aiActionPlanId}-${platform.toLowerCase().replace(/\W+/g, '-')}-${issue
        .toLowerCase()
        .replace(/\W+/g, '-')}`,
      priority: test.priority,
      area: `AI Answers - ${platform}`,
      issue,
      fix: test.suggestedFix,
      status: checkStatus,
      evidenceNote: [
        `Platform tested: ${platform}`,
        `Result status: ${statusLabel}`,
        test.evidenceNotes,
      ]
        .filter(Boolean)
        .join('\n'),
      sources: test.sourcesMentioned,
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

  const resetChecks = () => {
    const confirmed = window.confirm('Clear saved statuses and evidence notes?')
    if (confirmed) updateState({ checks: {}, notes: {} })
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
    setWebsiteAudit(null)
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

  const exportJson = () => {
    const existing = savedScans.find((scan) => scan.id === currentScanId)
    downloadScanJson(savedScanFromWorkspace(auditState, existing))
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
    setWebsiteAudit(null)
    setWebsiteAuditError('')
    setActiveView('Settings')
  }

  const runAutoAudit = async () => {
    setWebsiteAuditLoading(true)
    setWebsiteAuditError('')

    try {
      const result = await runWebsiteAutoAudit(auditState.profile)
      setWebsiteAudit(result)

      if (!result.ok) {
        const blockedNote = [
          'Website blocked automated scan - manual review required.',
          `Requested URL: ${result.requestedUrl}`,
          `HTTP status: ${result.status}`,
          `Redirect URL: ${result.redirectUrl}`,
          `Timestamp: ${result.timestamp}`,
          `Recommended next step: ${result.recommendedNextStep}`,
        ].join('\n')

        setAuditState((current) => ({
          ...current,
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
        checks: { ...current.checks, ...mapping.statuses },
        notes: { ...current.notes, ...mapping.notes },
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

  const websiteScanAccess =
    websiteAudit?.ok && (!websiteAudit.title || websiteAudit.contentLength < 500)
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

  const aiPlatformScores = aiAnswerPlatforms.reduce(
    (platformScores, platform) => ({
      ...platformScores,
      [platform]: scoreAIAnswerPlatform(auditState.aiAnswerTests[platform]),
    }),
    {} as Record<AIAnswerPlatform, number>,
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
              website SEO, listings, search visibility, AI answers, and voice
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

          <FixPlan fixes={fixes} notes={auditState.notes} />
        </div>
      )
    }

    if (activeView === 'Listings') {
      return (
        <div className="listings-cockpit">
          <section className="panel listings-overview-panel">
            <div>
              <p className="eyebrow">Guided Listings Verification</p>
              <h2>Listings visibility cockpit</h2>
              <p>
                Review core platforms first, then activate relevant industry
                and local directory opportunities. Suggested directories do not
                affect score until activated.
              </p>
            </div>
            <div className="metric-stack listings-metric-stack">
              <div>
                <span>Listings score</span>
                <strong>{Math.round(scores.Listings.score ?? 0)}</strong>
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
                Scan access: Red - actual website/server error likely affecting
                users. {websiteAuditError}
              </p>
            ) : null}
            {websiteAudit ? (
              <div className="auto-audit-result">
                <strong>Last auto-audit</strong>
                {websiteAudit.ok ? (
                  <>
                    <span className={websiteScanAccess.className}>
                      {websiteScanAccess.label}
                    </span>
                    <span>{new Date(websiteAudit.analyzedAt).toLocaleString()}</span>
                    <span>Fetched: {websiteAudit.fetchedUrl}</span>
                    <span>
                      Found {websiteAudit.detectedSchemaTypes.length} schema type(s),{' '}
                      {websiteAudit.servicePhraseMatches.length} service phrase(s),{' '}
                      {websiteAudit.serviceAreaPhraseMatches.length} area phrase(s)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="scan-status scan-status-gray">
                      Scan access: Gray - automated scan blocked or unavailable
                    </span>
                    <span className="blocked-message">
                      Website blocked automated scan — manual review required.
                    </span>
                    <span>{websiteAudit.details}</span>
                    <span>Requested: {websiteAudit.requestedUrl}</span>
                    <span>Redirect: {websiteAudit.redirectUrl}</span>
                    <span>{websiteAudit.recommendedNextStep}</span>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </AuditSection>
      )
    }

    if (activeView === 'Search Visibility') {
      return (
        <SearchVisibilityPanel
          profile={auditState.profile}
          tests={auditState.searchVisibilityTests}
          onChange={setSearchVisibilityTest}
          onAddToActionPlan={addSearchVisibilityToActionPlan}
        />
      )
    }

    if (activeView === 'AI Answers') {
      return (
        <AIAnswerVisibilityTest
          profile={auditState.profile}
          selectedPlatform={auditState.selectedAIPlatform}
          value={auditState.aiAnswerTests[auditState.selectedAIPlatform]}
          tests={auditState.aiAnswerTests}
          platformScores={aiPlatformScores}
          checkedCount={scores['AI Answers'].checked}
          uncheckedCount={scores['AI Answers'].unchecked ?? 0}
          onSelectedPlatformChange={setSelectedAIPlatform}
          onChange={setAIAnswerTest}
          onAddToActionPlan={addAIAnswerToActionPlan}
        />
      )
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
            onChange={(profile) => updateState({ profile })}
            onReset={resetChecks}
            onPrint={() => window.print()}
            onExport={exportJson}
          />
        </div>
      )
    }

    return (
      <VoiceReadinessPanel
        profile={auditState.profile}
        checks={auditState.checks}
        notes={auditState.notes}
        evidenceConfidence={auditState.evidenceConfidence}
        promptTests={auditState.voicePromptTests}
        onStatusChange={setCheck}
        onNoteChange={setNote}
        onEvidenceConfidenceChange={setEvidenceConfidence}
        onPromptChange={setVoicePromptTest}
        onAddCategoryToActionPlan={addVoiceCategoryToActionPlan}
        onAddPromptToActionPlan={addVoicePromptToActionPlan}
      />
    )
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
              {view}
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
            {views.map((label) => (
              <ScoreCard
                key={label}
                label={label}
                result={scores[label]}
                weight={label === 'Overall' ? 'weighted' : undefined}
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
