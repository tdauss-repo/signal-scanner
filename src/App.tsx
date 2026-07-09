import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { AiPromptPanel } from './components/AiPromptPanel'
import { AuditSection } from './components/AuditSection'
import { FixPlan } from './components/FixPlan'
import { IntakeForm } from './components/IntakeForm'
import { ReportView } from './components/ReportView'
import { ScoreCard } from './components/ScoreCard'
import { buildAuditItems, aiPromptPack } from './data/auditCatalog'
import { defaultProfile } from './data/demoProfile'
import type { AuditState, CheckStatus } from './types/audit'
import type { WebsiteAuditResponse } from './types/websiteAudit'
import { buildFixPlan, scoreItems, trafficStatusForScore, weightedAverage } from './utils/scoring'
import { mapAutoAuditToWebsiteChecks, runWebsiteAutoAudit } from './utils/websiteAutoAudit'

const storageKey = 'local-signal-scanner-state'
const activeViewStorageKey = 'business-scanner-active-view'

type ActiveView =
  | 'Overall'
  | 'Listings'
  | 'Website SEO'
  | 'Search Visibility'
  | 'AI Answers'
  | 'Voice'

const views: ActiveView[] = [
  'Overall',
  'Listings',
  'Website SEO',
  'Search Visibility',
  'AI Answers',
  'Voice',
]

const loadActiveView = (): ActiveView => {
  const stored = localStorage.getItem(activeViewStorageKey)
  return views.includes(stored as ActiveView) ? (stored as ActiveView) : 'Overall'
}

const initialState: AuditState = {
  profile: defaultProfile,
  checks: {},
  notes: {},
  lastUpdated: new Date().toISOString(),
}

const loadState = (): AuditState => {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? { ...initialState, ...JSON.parse(stored) } : initialState
  } catch {
    return initialState
  }
}

function App() {
  const [auditState, setAuditState] = useState<AuditState>(loadState)
  const [websiteAudit, setWebsiteAudit] = useState<WebsiteAuditResponse | null>(
    null,
  )
  const [websiteAuditLoading, setWebsiteAuditLoading] = useState(false)
  const [websiteAuditError, setWebsiteAuditError] = useState('')
  const [activeView, setActiveView] = useState<ActiveView>(loadActiveView)

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
    const listings = scoreItems(groups.listings, auditState.checks)
    const website = scoreItems(groups.website, auditState.checks)
    const searchVisibility = scoreItems(
      groups.searchVisibility,
      auditState.checks,
    )
    const ai = scoreItems(groups.ai, auditState.checks)
    const voice = scoreItems(groups.voice, auditState.checks)
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
  }, [auditState.checks, groups])

  const fixes = useMemo(
    () => buildFixPlan(auditItems, auditState.checks),
    [auditItems, auditState.checks],
  )

  const prompts = useMemo(
    () => aiPromptPack(auditState.profile),
    [auditState.profile],
  )

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(auditState))
  }, [auditState])

  useEffect(() => {
    localStorage.setItem(activeViewStorageKey, activeView)
  }, [activeView])

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

  const resetChecks = () => {
    const confirmed = window.confirm('Clear saved statuses and evidence notes?')
    if (confirmed) updateState({ checks: {}, notes: {} })
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(auditState, null, 2)], {
      type: 'application/json',
    })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `local-signal-scan-${auditState.profile.businessName
      .replace(/\W+/g, '-')
      .toLowerCase()}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
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

  const overallSummary = [
    {
      label: 'Current profile',
      text: `${auditState.profile.businessName} | ${auditState.profile.targetLocation}`,
    },
    {
      label: 'Audit progress',
      text: `${scores.Overall.checked} checks completed across listings, website, search visibility, AI answers, and voice readiness.`,
    },
    {
      label: 'Top action items',
      text:
        fixes.length > 0
          ? `${fixes.length} prioritized gap${fixes.length === 1 ? '' : 's'} ready for review.`
          : 'No action items yet. Complete guided verification or run the website scan.',
    },
  ]

  const renderActiveView = () => {
    if (activeView === 'Overall') {
      return (
        <div className="overall-grid">
          <section className="panel notice-panel">
            <strong>Audit boundary:</strong> public checks are generated search
            and platform links for guided review. Owner/admin status is always
            treated as “Owner access unverified - confirm during onboarding.”
          </section>

          <section className="panel">
            <div className="panel-header">
              <p className="eyebrow">High-Level Summary</p>
              <h2>{auditState.profile.businessName} visibility snapshot</h2>
              <p>
                This view combines automated website findings, guided listings
                verification, search visibility review, AI answer checks, and
                voice-search readiness into a prioritized customer discussion.
              </p>
            </div>
            <div className="summary-grid">
              {overallSummary.map((item) => (
                <div className="summary-item" key={item.label}>
                  <strong>{item.label}</strong>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <FixPlan fixes={fixes} />

          <section className="panel next-step-panel">
            <h2>Customer-ready next steps</h2>
            <p>
              Confirm owner access during onboarding, complete any guided
              verification items, then use the Action Plan to prioritize the
              fixes most likely to improve trust, search visibility, and source
              clarity.
            </p>
          </section>

          <ReportView
            profile={auditState.profile}
            scores={scores}
            checks={auditState.checks}
            notes={auditState.notes}
          />
        </div>
      )
    }

    if (activeView === 'Listings') {
      return (
        <AuditSection
          title="Listings audit"
          eyebrow="Guided Listings Verification"
          subtitle="Review public business listings across major platforms and verify whether name, phone, website, category, service area, reviews, and profile completeness match the business source of truth."
          note="Owner/admin status usually requires customer authorization and should be confirmed during onboarding."
          items={groups.listings}
          checks={auditState.checks}
          notes={auditState.notes}
          onStatusChange={setCheck}
          onNoteChange={setNote}
        />
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
        <AuditSection
          title="Search Visibility Audit"
          eyebrow="Auto-Generated Visibility Scan"
          subtitle="The scanner generates target search queries from the business services and service areas, then helps verify whether the business appears for the searches customers are likely to use. These results connect website SEO, listings, reviews, and local authority to real search visibility."
          note="Automated query generation is included. Exact ranking verification requires manual review or a future SERP API integration."
          items={groups.searchVisibility}
          checks={auditState.checks}
          notes={auditState.notes}
          onStatusChange={setCheck}
          onNoteChange={setNote}
        />
      )
    }

    if (activeView === 'AI Answers') {
      return (
        <AuditSection
          title="AI answer visibility audit"
          eyebrow="Guided AI Answer Scan"
          subtitle="Use generated prompts to test how major AI answer engines describe the business, what sources they cite, and whether they return correct services, location, website, and phone information."
          note="AI platform responses are manually verified in this MVP. Future integrations may use platform APIs where appropriate."
          items={groups.ai}
          checks={auditState.checks}
          notes={auditState.notes}
          onStatusChange={setCheck}
          onNoteChange={setNote}
        >
          <AiPromptPanel prompts={prompts} />
        </AuditSection>
      )
    }

    return (
      <AuditSection
        title="Voice Search Readiness"
        eyebrow="Guided Voice Readiness Review"
        subtitle="Score whether assistants can resolve contact facts and answer conversational local service questions."
        items={groups.voice}
        checks={auditState.checks}
        notes={auditState.notes}
        onStatusChange={setCheck}
        onNoteChange={setNote}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Local MVP</p>
          <h1>Business Scanner Tool</h1>
          <p>
            Structured local visibility audit for listings, website SEO, search
            visibility, AI answers, voice readiness, and prioritized action
            planning.
          </p>
        </div>
        <div className="header-note">
          No scraping or paid APIs. Evidence links open public pages for human
          verification.
        </div>
      </header>

      <main className="workspace">
        <IntakeForm
          profile={auditState.profile}
          onChange={(profile) => updateState({ profile })}
          onReset={resetChecks}
          onPrint={() => window.print()}
          onExport={exportJson}
        />

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
