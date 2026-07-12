import { useMemo, useState } from 'react'
import type {
  BusinessProfile,
  CheckStatus,
  EvidenceConfidence,
  FixItem,
  ScoreResult,
} from '../types/audit'
import { customerEvidenceConfidenceLabel } from '../utils/evidenceConfidence'
import { formatScore } from '../utils/scoring'
import { StatusBadge } from './StatusBadge'

interface ReportViewProps {
  profile: BusinessProfile
  scores: Record<string, ScoreResult>
  checks: Record<string, CheckStatus>
  notes: Record<string, string>
  fixes: FixItem[]
  lastUpdated: string
  reportSummary: string
  onReportSummaryChange: (summary: string) => void
  evidenceConfidence?: Record<string, EvidenceConfidence>
}

const reportSections = [
  'Listings',
  'Website SEO',
  'Search Visibility',
  'AI Answers',
  'Voice',
] as const

const friendlyStatus = (score: ScoreResult | undefined) => {
  if (!score || score.score === null) return 'Needs review'
  if (score.status === 'Green') return 'Strong'
  if (score.status === 'Yellow') return 'Needs cleanup'
  if (score.status === 'Red') return 'Priority gap'
  return 'Needs review'
}

const fixSection = (fix: FixItem) => {
  const area = fix.area.toLowerCase()
  if (area.includes('listing') || area.includes('directory')) return 'Listings'
  if (area.includes('website')) return 'Website SEO'
  if (area.includes('search')) return 'Search Visibility'
  if (area.includes('ai')) return 'AI Answers'
  if (area.includes('voice')) return 'Voice'
  return 'Overall'
}

const packageFitForFix = (fix: FixItem) => {
  if (fix.packageFit) return fix.packageFit
  if (fix.area.toLowerCase().includes('website')) return 'Website SEO Implementation'
  if (fix.area.toLowerCase().includes('search')) return 'Monthly Visibility Monitoring'
  return 'Starter Visibility Cleanup'
}

const isHomepageSeoClarityFix = (fix: FixItem) =>
  fix.id === 'website-homepage-clarity' ||
  fix.issue.toLowerCase().includes('homepage seo clarity')

const whyItMattersForFix = (fix: FixItem) => {
  if (isHomepageSeoClarityFix(fix)) {
    return 'Clear homepage signals help customers, search engines, maps, and AI tools quickly understand what the business offers, where it serves, and how to contact it.'
  }
  if (fix.whyItMatters) return fix.whyItMatters
  if (fix.area.toLowerCase().includes('listing')) {
    return 'Consistent listings help customers, maps, search engines, and AI answer systems trust the business details.'
  }
  if (fix.area.toLowerCase().includes('website')) {
    return 'Clear website signals help customers and search systems understand services, service area, and contact paths.'
  }
  if (fix.area.toLowerCase().includes('ai')) {
    return 'AI answer tools rely on public source signals to describe the business accurately.'
  }
  if (fix.area.toLowerCase().includes('voice')) {
    return 'Voice-style searches rely on clear source data for identity, contact, services, location, and reviews.'
  }
  return 'This improvement can make the business easier to find and understand online.'
}

const customerTitleForFix = (fix: FixItem) =>
  isHomepageSeoClarityFix(fix) ? 'Homepage SEO clarity' : fix.issue

const customerFindingSummaryForFix = (
  fix: FixItem,
  profile: BusinessProfile,
  notes: Record<string, string>,
) => {
  if (isHomepageSeoClarityFix(fix)) {
    return `The website is live and clearly connected to ${profile.businessName}, but the homepage could communicate services, service areas, contact paths, FAQ content, and structured local business information more clearly. The detailed scan also found supporting technical evidence that should remain in the internal appendix.`
  }

  const raw = fix.evidenceNote || notes[fix.id] || ''
  const filtered = raw
    .split('\n')
    .filter(
      (line) =>
        !/h1|h2|heading|json-ld|schema block|raw html|extracted/i.test(line),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!filtered) return 'Observed during the guided visibility review.'
  return filtered.length > 360 ? `${filtered.slice(0, 357)}...` : filtered
}

const customerRecommendedActionForFix = (fix: FixItem) => {
  if (isHomepageSeoClarityFix(fix)) {
    return 'Strengthen the homepage title/meta alignment, visible intro copy, service-area wording, internal links to priority service pages, contact clarity, FAQ content, and LocalBusiness/ProfessionalService schema.'
  }
  return fix.fix
}

const customerPackageFitForFix = (fix: FixItem) => {
  if (isHomepageSeoClarityFix(fix)) {
    return 'Starter Visibility Cleanup or Website SEO Implementation depending on implementation depth.'
  }
  return packageFitForFix(fix)
}

const sectionSummary = (
  section: (typeof reportSections)[number],
  score: ScoreResult,
  fixes: FixItem[],
) => {
  const count = fixes.filter((fix) => fixSection(fix) === section).length
  const status = friendlyStatus(score)
  const sectionFix = fixes.find((fix) => fixSection(fix) === section)
  const action = sectionFix
    ? customerRecommendedActionForFix(sectionFix)
    : 'Keep monitoring this area and preserve the current source signals.'

  const copy: Record<typeof section, string> = {
    Listings:
      status === 'Strong'
        ? 'Core listing signals appear to be in good shape based on the checked items.'
        : 'Listing consistency and directory signals should be reviewed so customers, maps, and AI systems see the same business details.',
    'Website SEO':
      status === 'Strong'
        ? 'The website is contributing useful business, service, and local context.'
        : 'Website clarity can be strengthened so services, location, contact options, FAQ content, and schema are easier to understand.',
    'Search Visibility':
      status === 'Strong'
        ? 'Manual search observations show useful visibility for checked customer-style queries.'
        : 'Some service and location searches need stronger supporting signals before they become reliable discovery paths.',
    'AI Answers':
      status === 'Strong'
        ? 'AI answer tests are recognizing useful business facts across checked platforms.'
        : 'AI answer visibility still needs more source clarity or more platform coverage before it can be considered strong.',
    Voice:
      status === 'Strong'
        ? 'Voice source-readiness signals look strong across the checked public data sources.'
        : 'Voice readiness depends on improving source data such as listings, contact clarity, reviews, FAQ content, and structured data.',
  }

  return { count, status, copy: copy[section], action }
}

const generateExecutiveSummary = (
  profile: BusinessProfile,
  _scores: Record<string, ScoreResult>,
  _fixes: FixItem[],
) => {
  return `${profile.businessName} already has a solid local foundation, including a live website and public signals that help customers understand the business. The scan also found practical cleanup opportunities that could make the business easier to find and understand across search, maps, listings, and AI answers. The recommended next step is a Starter Visibility Cleanup focused on the highest-impact fixes first: listing clarity, website SEO signals, contact/service-area consistency, structured data, and public evidence alignment.`
}

const positiveFindings = (
  profile: BusinessProfile,
  scores: Record<string, ScoreResult>,
  checks: Record<string, CheckStatus>,
) => {
  const findings: string[] = []
  if (profile.businessName && profile.website) {
    findings.push('Business identity and website are documented in the profile.')
  }
  if (scores['Website SEO']?.status === 'Green') {
    findings.push('Website checks show useful service, local, or technical signals.')
  }
  if (scores['AI Answers']?.checked > 0) {
    findings.push('AI answer workflow has at least one platform observation recorded.')
  }
  if (scores.Listings?.checked > 0) {
    findings.push('Listings verification has started, giving the cleanup plan source evidence.')
  }
  if (Object.values(checks).some((status) => status === 'pass')) {
    findings.push('Some checked visibility signals are already marked as passing.')
  }
  return findings.slice(0, 5)
}

export function ReportView({
  profile,
  scores,
  checks,
  notes,
  fixes,
  lastUpdated,
  reportSummary,
  onReportSummaryChange,
  evidenceConfidence = {},
}: ReportViewProps) {
  const [activeReportView, setActiveReportView] = useState<
    'summary' | 'internal'
  >('summary')
  const executiveSummary = useMemo(
    () => reportSummary || generateExecutiveSummary(profile, scores, fixes),
    [fixes, profile, reportSummary, scores],
  )

  const priorityCounts = useMemo(
    () => ({
      high: fixes.filter((fix) => fix.priority === 'High').length,
      medium: fixes.filter((fix) => fix.priority === 'Medium').length,
      low: fixes.filter((fix) => fix.priority === 'Low').length,
    }),
    [fixes],
  )
  const topOpportunities = fixes
    .filter((fix) => fix.status === 'fail' || fix.status === 'partial')
    .slice(0, 6)
  const workingWell = positiveFindings(profile, scores, checks)
  const rawFindings = Object.entries(checks).filter(
    ([id, status]) => status !== 'unknown' || notes[id]?.trim(),
  )

  return (
    <section className="report-view">
      <div className="report-toggle no-print">
        <button
          className={activeReportView === 'summary' ? '' : 'secondary'}
          type="button"
          onClick={() => setActiveReportView('summary')}
        >
          Customer Summary
        </button>
        <button
          className={activeReportView === 'internal' ? '' : 'secondary'}
          type="button"
          onClick={() => setActiveReportView('internal')}
        >
          Internal Evidence Detail
        </button>
      </div>

      {activeReportView === 'summary' ? (
        <div className="customer-report">
          <header className="report-hero panel">
            <div>
              <p className="eyebrow">Found Local</p>
              <h1>Local Visibility Snapshot</h1>
              <p>Helping local businesses get found in search, maps, and AI.</p>
            </div>
            <div className="report-business-card">
              <strong>{profile.businessName}</strong>
              <span>{profile.website}</span>
              <span>
                {profile.targetLocation || profile.localMarket} |{' '}
                {profile.serviceArea}
              </span>
              <span>Scanned {new Date(lastUpdated).toLocaleString()}</span>
            </div>
          </header>

          <section className="panel report-section">
            <div className="report-section-heading">
              <div>
                <p className="eyebrow">Executive Summary</p>
                <h2>Visibility snapshot</h2>
              </div>
              <StatusBadge status={scores.Overall.status} />
            </div>
            <textarea
              className="report-summary-editor"
              value={executiveSummary}
              onChange={(event) => onReportSummaryChange(event.target.value)}
            />
            <div className="report-priority-row">
              <span>{priorityCounts.high} high priority</span>
              <span>{priorityCounts.medium} medium priority</span>
              <span>{priorityCounts.low} low priority</span>
            </div>
          </section>

          <section className="panel report-section">
            <p className="eyebrow">What is working well</p>
            <div className="report-positive-list">
              {workingWell.length > 0 ? (
                workingWell.map((finding) => <p key={finding}>{finding}</p>)
              ) : (
                <p>
                  Complete more checks to identify confirmed positive signals.
                </p>
              )}
            </div>
          </section>

          <section className="panel report-section">
            <p className="eyebrow">Highest-impact opportunities</p>
            <div className="report-opportunity-list">
              {topOpportunities.length > 0 ? (
                topOpportunities.map((fix) => (
                  <article className="report-opportunity-card" key={fix.id}>
                    <div className="report-opportunity-head">
                      <div>
                        <p className="fix-area">{fixSection(fix)}</p>
                        <h3>{customerTitleForFix(fix)}</h3>
                      </div>
                      <StatusBadge status={fix.priority} />
                    </div>
                    <p>
                      <strong>Why it matters:</strong> {whyItMattersForFix(fix)}
                    </p>
                    <p>
                      <strong>Finding summary:</strong>{' '}
                      {customerFindingSummaryForFix(fix, profile, notes)}
                    </p>
                    <p>
                      <strong>Recommended action:</strong>{' '}
                      {customerRecommendedActionForFix(fix)}
                    </p>
                    <p>
                      <strong>Package fit:</strong> {customerPackageFitForFix(fix)}
                    </p>
                    <p>
                      <strong>Evidence confidence:</strong>{' '}
                      {customerEvidenceConfidenceLabel(fix.evidenceConfidence)}
                    </p>
                  </article>
                ))
              ) : (
                <p>No high-impact opportunities have been added yet.</p>
              )}
            </div>
          </section>

          <section className="report-section-grid">
            {reportSections.map((section) => {
              const score = scores[section]
              const summary = sectionSummary(section, score, fixes)
              return (
                <article className="panel report-section-card" key={section}>
                  <div className="report-section-heading">
                    <div>
                      <p className="eyebrow">{section}</p>
                      <h3>{summary.status}</h3>
                    </div>
                    <StatusBadge status={score.status} />
                  </div>
                  <p>
                    {score.checked} checked
                    {typeof score.unchecked === 'number'
                      ? ` | ${score.unchecked} unchecked`
                      : ''}{' '}
                    | {summary.count} potential fixes
                  </p>
                  <p>{summary.copy}</p>
                  <p>
                    <strong>Main action:</strong> {summary.action}
                  </p>
                </article>
              )
            })}
          </section>

          <section className="panel report-section report-package-section">
            <p className="eyebrow">Recommended package</p>
            <div className="report-package-grid">
              <article className="recommended-card recommended-card-primary">
                <span className="offer-badge">Recommended</span>
                <h3>Starter Visibility Cleanup</h3>
                <strong className="price-placeholder">$299 one-time</strong>
                <p>
                  Recommended because it fixes the highest-impact visibility
                  signals first: listings, website clarity, contact details,
                  service-area wording, and AI/search readability.
                </p>
                <ul className="package-list compact-package-list">
                  <li>Correct/standardize business listing signals</li>
                  <li>Improve website SEO clarity signals</li>
                  <li>Strengthen service/location visibility</li>
                  <li>Review AI answer/source accuracy</li>
                  <li>Create a prioritized cleanup plan</li>
                </ul>
              </article>
              <article className="recommended-card">
                <span className="offer-badge offer-badge-muted">Future option</span>
                <h3>Monthly Visibility Monitoring</h3>
                <strong className="price-placeholder">$70/month</strong>
                <p>
                  Future option for monthly re-checks, listing drift review,
                  search visibility snapshots, AI answer checks, and simple
                  reporting.
                </p>
              </article>
              <article className="recommended-card">
                <span className="offer-badge offer-badge-muted">Future option</span>
                <h3>Website SEO Implementation</h3>
                <strong className="price-placeholder">$500-$2,500+</strong>
                <p>
                  Future option for larger website improvements such as service
                  pages, FAQ content, schema implementation, local SEO copy, and
                  technical cleanup.
                </p>
              </article>
            </div>
          </section>
        </div>
      ) : (
        <div className="panel internal-report">
          <div className="panel-header">
            <p className="eyebrow">Internal Evidence Detail</p>
            <h2>Supporting scanner evidence and raw notes</h2>
            <p>
              Internal appendix for operator review. This view can include raw
              check IDs, evidence notes, and needs-review flags.
            </p>
          </div>
          <div className="report-block">
            <h3>Business profile source data</h3>
            <p>Business: {profile.businessName}</p>
            <p>Website: {profile.website}</p>
            <p>Phone: {profile.phone}</p>
            <p>Location/service area: {profile.targetLocation} | {profile.serviceArea}</p>
            <p>Services: {profile.primaryServices}</p>
            {profile.contactStructureNote ? (
              <p>Contact structure: {profile.contactStructureNote}</p>
            ) : null}
          </div>
          <div className="report-grid">
            {Object.entries(scores).map(([label, score]) => (
              <div className="report-score" key={label}>
                <p>{label}</p>
                <strong>{formatScore(score.score)}</strong>
                <StatusBadge status={score.status} label={score.statusLabel} />
                <p>{score.checked} checked</p>
              </div>
            ))}
          </div>
          <div className="report-block">
            <h3>Raw scanner checks and evidence notes</h3>
            {rawFindings.length === 0 ? (
              <p>No checked findings have evidence notes yet.</p>
            ) : (
              rawFindings.map(([id, status]) => (
                <p key={id}>
                  <strong>{id}</strong> ({status},{' '}
                  {customerEvidenceConfidenceLabel(evidenceConfidence[id])}):{' '}
                  {notes[id] || 'No evidence note entered.'}
                </p>
              ))
            )}
          </div>
          <div className="report-block">
            <h3>Action Plan evidence</h3>
            {fixes.length === 0 ? (
              <p>No Action Plan items yet.</p>
            ) : (
              fixes.map((fix) => (
                <p key={fix.id}>
                  <strong>{fix.area}: {fix.issue}</strong> ({fix.priority})<br />
                  {fix.evidenceNote || notes[fix.id] || 'No evidence note entered.'}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}
