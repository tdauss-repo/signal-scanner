import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import { assessSearchCapture } from './searchResultExtraction'
import { assessBusinessCandidates, reviewedProfileValue } from './entityMatcher'
import { evaluateMachineReadability } from './machineReadability'
import { resultTypesForDestination } from './searchVisibility'
import type { SearchVisibilityObservedResultType } from '../types/audit'
import { businessDirectoryKey } from './directorySuggestions'
import type { AcquisitionResult } from '../types/acquisition'
import type { AuditState, BusinessProfile, SearchDestinationObservation } from '../types/audit'
import type { WebsiteAuditResponse } from '../types/websiteAudit'
import type { ScanArea, VisibilityCheck, VisibilityRun } from '../types/visibilityScan'
import { buildSearchVisibilityQueries, defaultSearchDestinationObservation, primarySearchDestinations, publicPresenceUrl, searchDestinations } from './searchVisibility'
import { mapAutoAuditToWebsiteChecks, runWebsiteAutoAudit } from './websiteAutoAudit'
import { workspaceFindings } from './workspaceFindings'
import { compareIdentity, host, interpretPresence, isChallenge, pageText } from './presenceExtraction'

export { scanProfileKey, scanStateLabel, scanAreaState, restoreVisibilityRuns } from './visibilityScanState'
import { scanProfileKey } from './visibilityScanState'

export interface ScanDependencies {
  /** Version 1 is the retained Packet E integration contract; application and CLI use version 2. */
  automationVersion?: 1 | 2
  website(profile: BusinessProfile): Promise<WebsiteAuditResponse>
  acquire(url: string, method: 'server_fetch' | 'rendered_browser'): Promise<AcquisitionResult | undefined>
  /** Dedicated Google provider. Undefined means this runtime has no dedicated provider configured. */
  acquireGoogle?(url: string): Promise<AcquisitionResult | undefined>
  /** Dedicated Google Maps provider with the same unconfigured fallback contract. */
  acquireGoogleMaps?(url: string): Promise<AcquisitionResult | undefined>
  cancelled?: () => boolean
}
export const applicationScanDependencies: ScanDependencies = {
  automationVersion: 2,
  website: (profile) => runWebsiteAutoAudit(profile, { machineReadability: true }),
  async acquire(url, method) {
    const response = await fetch('/api/acquire-public-presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, method }), signal: AbortSignal.timeout(45_000) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Acquisition request failed.')
    return body.capture
  },
  async acquireGoogle(url) {
    const response = await fetch('/api/acquire-google-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(90_000) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Google acquisition request failed.')
    return body.capture
  },
  async acquireGoogleMaps(url) {
    const response = await fetch('/api/acquire-google-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(90_000) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Google Maps acquisition request failed.')
    return body.capture
  },
}

type StateUpdate = (state: AuditState) => AuditState
const compactCapture = (capture: AcquisitionResult): AcquisitionResult => {
  const compact = { ...capture, visibleText: pageText(capture).slice(0, 6000) }
  if (compact.renderedResultEvidence) compact.renderedResultEvidence = { ...compact.renderedResultEvidence,
    candidates: compact.renderedResultEvidence.candidates.slice(0, 20).map((candidate) => ({ ...candidate, excerpt: candidate.excerpt.slice(0, 1000), links: candidate.links.slice(0, 5), displayedUrls: candidate.displayedUrls?.slice(0, 5), phones: candidate.phones.slice(0, 3) })) }
  if (compact.normalizedSearchCandidates) compact.normalizedSearchCandidates = compact.normalizedSearchCandidates.slice(0, 30).map((candidate) => ({
    ...candidate,
    evidence: candidate.evidence.slice(0, 4).map((reference) => ({ ...reference, excerpt: reference.excerpt.slice(0, 2500) })),
  }))
  if (compact.providerAttempts) compact.providerAttempts = compact.providerAttempts.slice(0, 2)
  delete compact.html
  delete compact.browserEvidence
  return compact
}

/** Merge into the existing form without erasing operator corrections or supplemental notes. */
export function mergeAutomatedObservation(previous: SearchDestinationObservation | undefined, incoming: SearchDestinationObservation): SearchDestinationObservation {
  if (previous && previous.query !== incoming.query) return incoming
  const manual = previous && (previous.reviewed || (previous.provenance !== 'automated_acquisition' && Boolean(previous.evidenceNotes.trim() || previous.competitorsObserved.trim() || previous.recommendedAction.trim() || !['not_checked', 'manual_review_needed'].includes(previous.overallResult))))
  return manual ? { ...previous, automation: incoming.automation, reviewed: false } : {
    ...incoming, competitorsObserved: previous?.competitorsObserved || '', recommendedAction: previous?.recommendedAction || '',
  }
}

/** One runner shared by customer, Workbench and proving CLI. Every progress transition follows real work. */
export async function runVisibilityScan(initial: AuditState, dependencies: ScanDependencies, onUpdate: (update: StateUpdate) => void = () => undefined): Promise<VisibilityRun> {
  const enhanced = dependencies.automationVersion === 2
  const startedAt = new Date().toISOString()
  const run: VisibilityRun = { version: enhanced ? 2 : 1, ...(enhanced ? { profileReviewKey: evidenceFingerprint(initial.businessProfile) } : {}), id: `visibility-${startedAt}-${Math.random().toString(36).slice(2, 8)}`, profileKey: scanProfileKey(initial.profile), startedAt, checks: [], businessEvidence: [] }
  const profile = structuredClone(initial.profile)
  let state = structuredClone(initial)
  const alive = () => !dependencies.cancelled?.()
  const update = (fn: StateUpdate) => {
    if (!alive()) return
    const guarded: StateUpdate = (current) => scanProfileKey(current.profile) === run.profileKey && (!run.profileReviewKey || matchesEvidenceFingerprint(run.profileReviewKey, current.businessProfile)) ? fn(current) : current
    state = guarded(state)
    onUpdate(guarded)
  }
  const publish = () => {
    const snapshot = structuredClone(run)
    update((current) => ({ ...current, visibilityRuns: [...(current.visibilityRuns || []).filter((r) => r.id !== run.id), snapshot], lastUpdated: new Date().toISOString() }))
  }
  const check = (id: string, area: ScanArea, supported = true): VisibilityCheck => ({ id, area, state: supported ? 'queued' : 'not_checked', captures: [], evidenceCaptured: false, interpreted: false })
  const website = check('website-audit', 'WebsiteTechnical', Boolean(profile.website.trim()))
  const information = check('identity-comparison', 'BusinessInformation')
  run.checks.push(website)
  const queries = buildSearchVisibilityQueries(profile, initial.businessProfile, { includeLocationDiagnostic: enhanced || Boolean(initial.searchDestinationObservations['search-brand-market']) })
  for (const query of queries) for (const destination of query.role === 'Brand Presence' ? searchDestinations : primarySearchDestinations) {
    const prior = initial.searchDestinationObservations[query.id]?.[destination]?.automation
    const recorded = prior && initial.visibilityRuns?.some((record) => record.id === prior.runId && matchesEvidenceFingerprint(record.profileKey, profile)) ? prior.inspectedUrl : undefined
    const configured = [profile.knownListingUrl, ...profile.existingDirectoryUrls.split(/[\s,]+/)].find((url) => host(url) && host(url) === host(publicPresenceUrl(destination, query.query)) &&
      (destination !== 'Google Search' || new URL(url).pathname === '/search') &&
      (destination !== 'Google Maps' || new URL(url).pathname.startsWith('/maps')))
    run.checks.push({ ...check(`${query.id}:${destination}`, 'SearchMaps'), destination, queryId: query.id, query: query.query, queryMode: query.isDiagnostic ? 'location' : query.role === 'Brand Presence' ? 'brand' : 'discovery',
      url: enhanced && query.isDiagnostic ? publicPresenceUrl(destination, query.query) : query.role === 'Brand Presence' ? configured || recorded || publicPresenceUrl(destination, query.query) : publicPresenceUrl(destination, query.query) })
  }
  // Only recorded sources; no guessed directories or seed mutation. Runtime additionally requires an explicit host allowlist.
  const directoryUrls = [...new Set([profile.knownListingUrl, ...profile.existingDirectoryUrls.split(/[\s,]+/), ...initial.directories.activeRows.filter((row) => row.businessId === businessDirectoryKey(profile)).map((row) => row.listingUrl)].filter((url) => /^https?:\/\//.test(url)))]
    .filter((url) => !run.checks.some((item) => item.url === url))
  directoryUrls.forEach((url, index) => run.checks.push({ ...check(`public-directory-${index}`, 'BusinessInformation'), url, ...(index >= 8 ? { state: 'interactive_review_required' as const, error: 'This run is bounded to eight recorded public directories. Review this additional source manually.' } : {}) }))
  const machine = check('machine-readability', 'AIDiscovery', enhanced)
  run.checks.push(information, ...(enhanced ? [machine] : []), check(enhanced ? 'ai-answer-testing' : 'ai-discovery', 'AIDiscovery', false))
  publish()
  const start = (item: VisibilityCheck) => { item.state = 'scanning'; item.startedAt = new Date().toISOString(); publish() }
  const end = (item: VisibilityCheck) => { item.endedAt = new Date().toISOString(); item.elapsedMs = Date.parse(item.endedAt) - Date.parse(item.startedAt!); publish() }
  const rawCaptures: AcquisitionResult[] = []
  if (website.state !== 'not_checked' && alive()) {
    start(website)
    try {
      const result = await dependencies.website(profile)
      if (!alive()) return run
      update((current) => {
        const mapping = result.ok ? mapAutoAuditToWebsiteChecks(result, profile) : undefined
        return { ...current, websiteAudit: { ...current.websiteAudit, latestAttempt: result, lastSuccessful: result.ok ? result : current.websiteAudit.lastSuccessful },
          checks: { ...current.checks, ...mapping?.statuses }, notes: { ...current.notes, ...(result.ok ? mapping?.notes : {
            'website-homepage-clarity': [result.error, result.details, `Requested URL: ${result.requestedUrl}`, `Final URL: ${result.finalUrl || result.redirectUrl}`, `HTTP status: ${result.status}`, `Error type: ${result.errorType}`, `Redirect occurred: ${result.redirectOccurred ? 'Yes' : 'No'}`, `Blocked/forbidden: ${result.blocked ? 'Yes' : 'No'}`, `Redirect URL: ${result.redirectUrl}`, `Timestamp: ${result.timestamp}`, `Recommended next step: ${result.recommendedNextStep}`].join('\n'),
          }) },
          evidenceConfidence: { ...current.evidenceConfidence, ...Object.fromEntries(Object.keys(mapping?.statuses || {}).map((id) => [id, 'scanner_detected_public_page' as const])) } }
      })
      website.state = result.ok ? 'awaiting_review' : 'failed'
      website.evidenceCaptured = result.ok
      website.interpreted = result.ok
      if (result.ok) {
        rawCaptures.push({ version: 1, requestedUrl: profile.website, finalUrl: result.fetchedUrl, acquiredAt: result.analyzedAt, method: 'server_fetch', provider: result.acquisition.provider,
          outcome: 'success', confidence: 'captured', notes: [], visibleText: result.visibleTextSummary,
          html: result.jsonLdSchemaBlocks.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`).join('') })
      } else website.error = result.error
    } catch (error) {
      website.state = 'failed'; website.error = String(error)
      update((current) => ({ ...current, customerFindingReviews: {}, websiteAudit: { ...current.websiteAudit, latestAttempt: {
        ok: false, acquisition: { captureVersion: 1, provider: 'found-local-client', method: 'server_fetch', outcome: 'unavailable', requestedUrl: profile.website, occurredAt: new Date().toISOString(), recordOrigin: 'captured' },
        status: 0, error: String(error), errorType: 'client_acquisition_error', details: '', recommendedNextStep: 'Retry or review manually.', requestedUrl: profile.website,
        redirectUrl: '', redirectOccurred: false, redirectCount: 0, blocked: false, fetchStrategyUsed: 'website API request', httpsFallbackTried: false, protocolFallbackTried: false, wwwFallbackTried: false, timestamp: new Date().toISOString(),
      } } }))
    }
    end(website)
  }
  for (const item of run.checks.filter((item) => item.url && item.state === 'queued')) {
    if (!alive()) return run
    start(item)
    const captures: AcquisitionResult[] = []
    let dedicatedGoogleHandled = false
    // A caller that spreads application dependencies and replaces only `acquire`
    // is supplying a complete fixture/CLI provider and must not inherit a live API call.
    const googleProvider = dependencies.acquireGoogle === applicationScanDependencies.acquireGoogle
      && dependencies.acquire !== applicationScanDependencies.acquire ? undefined : dependencies.acquireGoogle
    const googleMapsProvider = dependencies.acquireGoogleMaps === applicationScanDependencies.acquireGoogleMaps
      && dependencies.acquire !== applicationScanDependencies.acquire ? undefined : dependencies.acquireGoogleMaps
    const dedicatedProvider = item.destination === 'Google Search' ? googleProvider : item.destination === 'Google Maps' ? googleMapsProvider : undefined
    if (dedicatedProvider) {
      try {
        const capture = await dedicatedProvider(item.url!)
        if (!alive()) return run
        if (capture) {
          captures.push(capture)
          dedicatedGoogleHandled = true
          item.captures = captures.map(compactCapture)
          publish()
          if (item.destination === 'Google Maps' && item.queryMode === 'brand' && !(capture.outcome === 'success' && capture.resultRegionInspected)) {
            const name = reviewedProfileValue(profile, initial.businessProfile, 'businessName')
            const city = reviewedProfileValue(profile, initial.businessProfile, 'city')
            const region = reviewedProfileValue(profile, initial.businessProfile, 'state')
            if (name && city && region) {
              const enrichedUrl = publicPresenceUrl('Google Maps', `${name} ${city} ${region}`)
              const enriched = await dedicatedProvider(enrichedUrl)
              if (!alive()) return run
              if (enriched) {
                captures.push({ ...enriched, notes: [...enriched.notes, 'One bounded reviewed-location query enrichment followed an unusable plain Brand Maps acquisition.'] })
                item.captures = captures.map(compactCapture)
                publish()
              }
            }
          }
        }
      } catch (error) {
        captures.push({ version: 1, requestedUrl: item.url!, acquiredAt: new Date().toISOString(), method: 'server_fetch', provider: item.destination === 'Google Maps' ? 'brightdata-google-maps-request' : 'brightdata-google-request', outcome: 'failed', confidence: 'unavailable', notes: ['Google provider request failed. This is not evidence that the business is absent.'], blocker: 'acquisition_failure', error: String(error) })
        dedicatedGoogleHandled = true
      }
    }
    if (!dedicatedGoogleHandled) {
      for (const method of ['server_fetch', 'rendered_browser'] as const) {
        if (!alive()) return run
        try {
          const capture = await dependencies.acquire(item.url!, method)
          if (!alive()) return run
          if (!capture) { item.error = 'Rendered acquisition unavailable; interactive review required.'; break }
          captures.push(capture)
          item.captures = captures.map(compactCapture)
          publish()
          const searchAssessment = item.destination && enhanced ? assessSearchCapture(capture, profile, initial.businessProfile, item.destination, item.queryMode) : undefined
          const sufficient = item.destination ? enhanced ? searchAssessment!.automaticObservation || searchAssessment!.visibilityResult === 'not_found' : interpretPresence(capture, profile, item.destination).interpreted : compareIdentity(capture, profile).some((record) => record.field !== 'Business name')
          if (sufficient && capture.outcome === 'success') break
          // Challenges/access controls require a human; do not retry them through a browser.
          if (capture.outcome === 'blocked' || isChallenge(capture)) break
        } catch (error) {
          captures.push({ version: 1, requestedUrl: item.url!, acquiredAt: new Date().toISOString(), method, provider: 'acquisition-request', outcome: 'failed', confidence: 'unavailable', notes: [], error: String(error) })
        }
      }
    }
    item.captures = captures.map(compactCapture)
    rawCaptures.push(...captures)
    if (item.destination && enhanced) {
      const assessments = captures.map((capture) => assessSearchCapture(capture, profile, initial.businessProfile, item.destination!, item.queryMode))
      const candidates = assessments.flatMap((assessment) => assessment.matches.map((match) => match.candidate))
      const assessment = candidates.length ? assessBusinessCandidates(candidates, profile, initial.businessProfile, item.queryMode)
        : assessments.find((value) => value.visibilityResult === 'not_found') || assessments.at(-1) || { matches: [], confidence: 'unavailable' as const, automaticObservation: false, visibilityResult: 'unavailable' as const, operatorReviewRequired: true, resultRegionInspected: false, ambiguityReasons: [item.error || 'No usable public evidence was captured.'], blocker: 'runtime_unavailable' as const, tier3Candidate: false }
      assessment.resultRegionInspected ||= assessments.some((value) => value.resultRegionInspected)
      if (!assessment.automaticObservation && !['identifier_conflict', 'unreviewed_profile', 'access_blocked', 'acquisition_failure', 'runtime_unavailable'].includes(assessment.blocker)) {
        assessment.tier3Candidate = assessments.some((value) => value.tier3Candidate)
        if (assessment.tier3Candidate) assessment.ambiguityReasons.push('Captured public interactive controls/place links may support bounded interaction to resolve this ambiguity.')
      }
      item.assessment = assessment
      item.evidenceCaptured = assessment.matches.length > 0 || assessment.visibilityResult === 'not_found'
      item.interpreted = assessment.automaticObservation || assessment.visibilityResult === 'not_found'
      item.state = assessment.operatorReviewRequired ? 'interactive_review_required' : 'evidence_captured'
      const selected = assessment.selected
      const evidence = assessment.matches.map((match) => `${JSON.stringify(match.candidate.fields)}\n${match.evidence.map((ref) => `${ref.sourceUrl} (${ref.locator}): ${ref.excerpt}`).join('\n')}`).join('\n').slice(0, 12000)
      const types: SearchVisibilityObservedResultType[] = []
      if (assessment.automaticObservation && selected) {
        if (['Google Maps', 'Apple Maps'].includes(item.destination)) types.push('local_business_profile')
        else if (item.destination === 'Yelp') types.push('directory_listing')
        else if (['Facebook', 'Instagram'].includes(item.destination)) types.push('social_profile')
        else if (selected.matchedFields.some((field) => field.field === 'website')) types.push('official_website')
        else types.push('third_party_mention')
        for (const field of selected.matchedFields) {
          if (field.field === 'name') types.push('business_name_correct')
          if (field.field === 'phone') types.push('phone_correct')
          if (field.field === 'website') types.push('website_correct')
          if (['streetAddress', 'address'].includes(field.field)) types.push('address_correct')
        }
      } else if (assessment.visibilityResult === 'not_found') {
        types.push('not_found')
      }
      const absenceCapture = captures[assessments.findIndex((value) => value.visibilityResult === 'not_found')]
      const absenceEvidence = assessment.visibilityResult === 'not_found'
        ? `${absenceCapture?.finalUrl || item.url} (bounded result region): ${assessment.ambiguityReasons.join(' ')}` : ''
      const normalizedEvidence = evidence || absenceEvidence
      const observation: SearchDestinationObservation = { ...defaultSearchDestinationObservation(item.destination, item.query!),
        observedAt: selected?.evidence[0]?.acquiredAt || captures.at(-1)?.acquiredAt || '', provenance: 'automated_acquisition', overallResult: assessment.automaticObservation ? 'found_match' : assessment.visibilityResult === 'not_found' ? 'not_found' : 'manual_review_needed',
        observedResultTypes: [...new Set(types)].filter((type) => resultTypesForDestination(item.destination!).includes(type)), evidenceNotes: normalizedEvidence,
        confidence: item.evidenceCaptured ? 'scanner_detected_public_page' : 'manual_needs_confirmation', evidenceKind: item.evidenceCaptured ? 'external_observation' : captures.some((capture) => ['success', 'partial'].includes(capture.outcome)) ? 'unable_to_verify' : 'acquisition_failure',
        automation: { runId: run.id, queryMode: item.queryMode, state: item.state, inspectedUrl: item.url!, captures: item.captures, evidence: normalizedEvidence, interpreted: item.interpreted, automaticObservation: assessment.automaticObservation, assessment },
      }
      update((current) => ({ ...current, searchDestinationObservations: { ...current.searchDestinationObservations,
        [item.queryId!]: { ...current.searchDestinationObservations[item.queryId!], [item.destination!]: mergeAutomatedObservation(current.searchDestinationObservations[item.queryId!]?.[item.destination!], observation) } } }))
    } else if (item.destination) {
      const interpretations = captures.map((capture) => ({ capture, ...interpretPresence(capture, profile, item.destination!) }))
      const best = interpretations.find((result) => result.interpreted) || interpretations.find((result) => result.evidence)
      item.evidenceCaptured = Boolean(best?.evidence)
      item.interpreted = Boolean(best?.interpreted)
      item.state = best ? 'awaiting_review' : 'interactive_review_required'
      const observation = { ...defaultSearchDestinationObservation(item.destination, item.query!),
        observedAt: best?.capture.acquiredAt || captures.at(-1)?.acquiredAt || '', provenance: 'automated_acquisition' as const,
        overallResult: 'manual_review_needed' as const, observedResultTypes: best?.types || [],
        evidenceNotes: best?.evidence || '', confidence: best ? 'scanner_detected_public_page' as const : 'manual_needs_confirmation' as const,
        evidenceKind: best ? 'external_observation' as const : 'acquisition_failure' as const,
        automation: { runId: run.id, state: item.state, inspectedUrl: item.url!, captures: item.captures, evidence: best?.evidence || '', interpreted: item.interpreted } }
      update((current) => ({ ...current, searchDestinationObservations: { ...current.searchDestinationObservations,
        [item.queryId!]: { ...current.searchDestinationObservations[item.queryId!], [item.destination!]: mergeAutomatedObservation(current.searchDestinationObservations[item.queryId!]?.[item.destination!], observation) } } }))
    } else {
      item.evidenceCaptured = captures.some((capture) => compareIdentity(capture, profile).length > 0)
      item.interpreted = item.evidenceCaptured
      item.state = item.evidenceCaptured ? 'awaiting_review' : 'interactive_review_required'
    }
    end(item)
  }
  if (!alive()) return run
  start(information)
  // Preserve disagreeing source/provider values; deduplicate only identical observed fields from the same source.
  run.businessEvidence = [...new Map(rawCaptures.flatMap((capture) => compareIdentity(capture, profile)).map((record) => [`${record.sourceUrl}:${record.field}:${record.observedValue}`, record])).values()]
  run.businessEvidence = run.businessEvidence.map((record, index) => ({ ...record, id: `${record.id}-${index}` }))
  information.evidenceCaptured = run.businessEvidence.length > 0
  information.interpreted = information.evidenceCaptured
  information.state = information.evidenceCaptured ? 'awaiting_review' : 'not_checked'
  const evidence = structuredClone(run.businessEvidence)
  update((current) => ({ ...current, salesReadiness: { ...current.salesReadiness, consistencyObservations: [
    ...(current.salesReadiness.consistencyObservations || []).filter((record) => record.provenance !== 'automated_acquisition'), ...evidence.map((record) => ({ ...record, notes: current.salesReadiness.consistencyObservations?.find((prior) => prior.sourceUrl === record.sourceUrl && prior.field === record.field)?.notes || '' })),
  ] } }))
  end(information)
  if (enhanced) {
    start(machine)
    const report = evaluateMachineReadability(state)
    run.machineReadability = report
    update((current) => ({ ...current, machineReadability: report }))
    machine.evidenceCaptured = report.status === 'evidence_captured'
    machine.interpreted = machine.evidenceCaptured
    machine.state = machine.evidenceCaptured ? 'evidence_captured' : 'not_checked'
    end(machine)
  }
  run.endedAt = new Date().toISOString()
  run.summary = {
    attempted: run.checks.filter((item) => item.startedAt).length,
    successful: run.checks.filter((item) => item.evidenceCaptured).length,
    evidenceCaptured: run.checks.filter((item) => item.evidenceCaptured).length,
    operatorReview: run.checks.filter((item) => ['awaiting_review', 'evidence_captured', 'interactive_review_required', 'failed'].includes(item.state)).length,
    interactiveReview: run.checks.filter((item) => item.state === 'interactive_review_required').length,
    acquisitionFailures: run.checks.reduce((sum, item) => sum + item.captures.filter((capture) => ['failed', 'blocked', 'unavailable'].includes(capture.outcome)).length + (item.id === website.id && item.state === 'failed' ? 1 : 0), 0),
    manualInterventionsRequired: run.checks.filter((item) => ['interactive_review_required', 'failed', 'not_checked'].includes(item.state)).length,
    providerEscalations: run.checks.filter((item) => item.captures.some((capture) => capture.method === 'rendered_browser')).length,
    candidateFindings: website.evidenceCaptured ? workspaceFindings(state).filter((fix) => ['website', 'ai_geo_readiness'].includes(fix.sourceArea || '') && !/^(website-h1|website-heading)$/.test(fix.id) && !state.manualFixes.some((manual) => manual.id === fix.id)).length : 0,
    // Presentation review is not customer permission to implement; that lifecycle is not recorded yet.
    customerApprovedFindings: 0,
  }
  publish()
  return run
}
