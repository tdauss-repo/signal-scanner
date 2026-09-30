import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import { assessSearchCapture } from './searchResultExtraction'
import { assessBusinessCandidates, reviewedProfileValue } from './entityMatcher'
import { evaluateMachineReadability } from './machineReadability'
import { resultTypesForDestination, verificationUrlFor } from './searchVisibility'
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
import {
  buildRetainedGoogleAutomaticVerification,
  retainedGoogleAutomaticVerificationIsCurrent,
} from './googleAcquisitionResilience'
import { brandPresenceBusinessIdentityKey } from './brandPresenceAcquisitionResilience'
import {
  bingRefreshCanRetainRecentVerification,
  buildRetainedBingAutomaticVerification,
  retainedBingAutomaticVerificationIsCurrent,
} from './bingAcquisitionResilience'

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
  /** Dedicated native Bing Brand Search provider. Other Bing query modes retain their existing path. */
  acquireBingSearch?(url: string): Promise<AcquisitionResult | undefined>
  /** Dedicated bounded public Apple Maps Brand provider. */
  acquireAppleMaps?(url: string): Promise<AcquisitionResult | undefined>
  /** Dedicated bounded public DuckDuckGo Brand Search provider. */
  acquireDuckDuckGoSearch?(url: string): Promise<AcquisitionResult | undefined>
  cancelled?: () => boolean
  /** Test/runtime override. Application defaults keep each operation and the entire run bounded. */
  operationTimeoutMs?: number
  /** Brand Google Search override; explicit general test/runtime overrides still win when omitted. */
  googleBrandOperationTimeoutMs?: number
  overallTimeoutMs?: number
}

export interface ApplicationVisibilityScanDependencies extends ScanDependencies {
  automationVersion: 2
  acquireGoogle(url: string): Promise<AcquisitionResult | undefined>
  acquireGoogleMaps(url: string): Promise<AcquisitionResult | undefined>
  acquireBingSearch(url: string): Promise<AcquisitionResult | undefined>
  acquireAppleMaps(url: string): Promise<AcquisitionResult | undefined>
  acquireDuckDuckGoSearch(url: string): Promise<AcquisitionResult | undefined>
}
const defaultOperationTimeoutMs = 30_000
/** Two bounded SERP attempts plus one optional remote-browser fallback fit below the 180-second scan boundary. */
export const defaultGoogleBrandOperationTimeoutMs = 155_000
const defaultOverallTimeoutMs = 180_000
class VisibilityScanTimeoutError extends Error {
  constructor(message: string) { super(message); this.name = 'VisibilityScanTimeoutError' }
}
const acquirePublicPresenceFromApi: ScanDependencies['acquire'] = async (url, method) => {
  const response = await fetch('/api/acquire-public-presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, method }), signal: AbortSignal.timeout(45_000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Acquisition request failed.')
  return body.capture
}
const acquireGoogleSearchFromApi: NonNullable<ScanDependencies['acquireGoogle']> = async (url) => {
  const response = await fetch('/api/acquire-google-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(165_000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Google acquisition request failed.')
  return body.capture
}
const acquireGoogleMapsFromApi: NonNullable<ScanDependencies['acquireGoogleMaps']> = async (url) => {
  const response = await fetch('/api/acquire-google-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(90_000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Google Maps acquisition request failed.')
  return body.capture
}
const acquireBingSearchFromApi: NonNullable<ScanDependencies['acquireBingSearch']> = async (url) => {
  const response = await fetch('/api/acquire-bing-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(20_000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Bing acquisition request failed.')
  return body.capture
}
const acquireAppleMapsFromApi: NonNullable<ScanDependencies['acquireAppleMaps']> = async (url) => {
  const response = await fetch('/api/acquire-apple-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(20_000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Apple Maps acquisition request failed.')
  return body.capture
}
const acquireDuckDuckGoSearchFromApi: NonNullable<ScanDependencies['acquireDuckDuckGoSearch']> = async (url) => {
  const response = await fetch('/api/acquire-duckduckgo-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(20_000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'DuckDuckGo acquisition request failed.')
  return body.capture
}

/** The sole production composition path used by App and production-wiring tests. */
export function createApplicationVisibilityScanDependencies(
  options: Pick<ScanDependencies, 'cancelled'> = {},
): ApplicationVisibilityScanDependencies {
  return {
    automationVersion: 2,
    website: (profile) => runWebsiteAutoAudit(profile, { machineReadability: true }),
    acquire: acquirePublicPresenceFromApi,
    acquireGoogle: acquireGoogleSearchFromApi,
    acquireGoogleMaps: acquireGoogleMapsFromApi,
    acquireBingSearch: acquireBingSearchFromApi,
    acquireAppleMaps: acquireAppleMapsFromApi,
    acquireDuckDuckGoSearch: acquireDuckDuckGoSearchFromApi,
    ...options,
  }
}

/** Compatibility export for existing CLI/proving callers; App constructs a fresh dependency object. */
export const applicationScanDependencies = createApplicationVisibilityScanDependencies()

export type DestinationAcquisitionRoute = 'google_search' | 'google_maps' | 'bing_native_search' | 'apple_maps_native' | 'duckduckgo_native_search' | 'generic'

/** Brand destination dispatch is explicit so dedicated routes cannot silently enter the generic ladder. */
export function destinationAcquisitionRoute(
  destination: VisibilityCheck['destination'],
  queryMode: VisibilityCheck['queryMode'],
): DestinationAcquisitionRoute {
  if (destination === 'Google Search') return 'google_search'
  if (destination === 'Google Maps') return 'google_maps'
  if (destination === 'Bing Search' && queryMode === 'brand') return 'bing_native_search'
  if (destination === 'Apple Maps' && queryMode === 'brand') return 'apple_maps_native'
  if (destination === 'DuckDuckGo' && queryMode === 'brand') return 'duckduckgo_native_search'
  return 'generic'
}

type StateUpdate = (state: AuditState) => AuditState
interface AutomatedObservationMergeContext {
  profile: BusinessProfile
  profileState: AuditState['businessProfile']
  sourceProfileReviewKey?: string
  now?: number
  retainedBingSource?: { observation: SearchDestinationObservation; sourceProfileReviewKey?: string }
}
const compactCapture = (capture: AcquisitionResult): AcquisitionResult => {
  const compact = { ...capture, visibleText: pageText(capture).slice(0, 6000) }
  if (compact.renderedResultEvidence) compact.renderedResultEvidence = { ...compact.renderedResultEvidence,
    candidates: compact.renderedResultEvidence.candidates.slice(0, 20).map((candidate) => ({ ...candidate, excerpt: candidate.excerpt.slice(0, 1000), links: candidate.links.slice(0, 5), displayedUrls: candidate.displayedUrls?.slice(0, 5), phones: candidate.phones.slice(0, 3) })) }
  if (compact.normalizedSearchCandidates) compact.normalizedSearchCandidates = compact.normalizedSearchCandidates.slice(0, 30).map((candidate) => ({
    ...candidate,
    evidence: candidate.evidence.slice(0, 4).map((reference) => ({ ...reference, excerpt: reference.excerpt.slice(0, 2500) })),
  }))
  if (compact.providerAttempts) compact.providerAttempts = compact.providerAttempts.slice(0, 3)
  delete compact.html
  delete compact.browserEvidence
  return compact
}

/** Merge into the existing form without erasing operator corrections or supplemental notes. */
export function mergeAutomatedObservation(
  previous: SearchDestinationObservation | undefined,
  incoming: SearchDestinationObservation,
  context?: AutomatedObservationMergeContext,
): SearchDestinationObservation {
  if (previous && previous.query !== incoming.query) return incoming
  const currentGoogleUnavailable = incoming.destination === 'Google Search' && incoming.automation?.queryMode === 'brand' &&
    incoming.automation.assessment?.visibilityResult === 'unavailable'
  const newlyRetained = currentGoogleUnavailable && previous && context
    ? buildRetainedGoogleAutomaticVerification(previous, context.profile, context.profileState, context.sourceProfileReviewKey)
    : undefined
  const retainedGoogleVerification = currentGoogleUnavailable && previous && context
    ? newlyRetained && retainedGoogleAutomaticVerificationIsCurrent(newlyRetained, context.profile, context.profileState, context.now)
      ? newlyRetained
      : previous.automation?.assessment?.visibilityResult === 'unavailable' &&
          retainedGoogleAutomaticVerificationIsCurrent(previous.retainedGoogleVerification, context.profile, context.profileState, context.now)
        ? previous.retainedGoogleVerification : undefined
    : undefined
  const currentBingInconclusive = bingRefreshCanRetainRecentVerification(incoming)
  const priorOperatorCorrection = previous?.operatorVerification?.outcome === 'found_correction_needed'
  const newlyRetainedBing = currentBingInconclusive && previous && context && !priorOperatorCorrection
    ? buildRetainedBingAutomaticVerification(previous, context.profile, context.profileState, context.sourceProfileReviewKey)
      || (context.retainedBingSource ? buildRetainedBingAutomaticVerification(
        context.retainedBingSource.observation,
        context.profile,
        context.profileState,
        context.retainedBingSource.sourceProfileReviewKey,
      ) : undefined)
    : undefined
  const retainedBingVerification = currentBingInconclusive && previous && context && !priorOperatorCorrection
    ? newlyRetainedBing && retainedBingAutomaticVerificationIsCurrent(newlyRetainedBing, context.profile, context.profileState, context.now)
      ? newlyRetainedBing
      : bingRefreshCanRetainRecentVerification(previous) &&
          retainedBingAutomaticVerificationIsCurrent(previous.retainedBingVerification, context.profile, context.profileState, context.now)
        ? previous.retainedBingVerification : undefined
    : undefined
  const manual = previous && (previous.reviewed || (previous.provenance !== 'automated_acquisition' && Boolean(previous.evidenceNotes.trim() || previous.competitorsObserved.trim() || previous.recommendedAction.trim() || !['not_checked', 'manual_review_needed'].includes(previous.overallResult))))
  const merged = manual ? { ...previous, verificationUrl: incoming.verificationUrl, observedResultUrl: incoming.observedResultUrl || previous.observedResultUrl, canonicalProfileUrl: incoming.canonicalProfileUrl || previous.canonicalProfileUrl, automation: incoming.automation, reviewed: false } : {
    ...incoming, observedResultUrl: incoming.observedResultUrl || previous?.observedResultUrl,
    canonicalProfileUrl: incoming.canonicalProfileUrl || previous?.canonicalProfileUrl,
    competitorsObserved: previous?.competitorsObserved || '', recommendedAction: previous?.recommendedAction || '',
    operatorVerification: previous?.operatorVerification,
  }
  return { ...merged, retainedGoogleVerification, retainedBingVerification }
}

/** Recover a still-material prior Bing success already preserved in workspace run history. */
export function retainedBingSourceFromVisibilityRuns(
  state: AuditState,
  checkId: string,
  profile: BusinessProfile,
): AutomatedObservationMergeContext['retainedBingSource'] {
  for (const historicalRun of [...(state.visibilityRuns || [])].reverse()) {
    if (!matchesEvidenceFingerprint(historicalRun.profileKey, profile) ||
      !historicalRun.profileReviewKey || !matchesEvidenceFingerprint(historicalRun.profileReviewKey, state.businessProfile)) continue
    const historicalCheck = historicalRun.checks.find((check) => check.id === checkId && check.destination === 'Bing Search' && check.queryMode === 'brand')
    const assessment = historicalCheck?.assessment
    const conflictBlocker = assessment?.blocker === 'identifier_conflict' || assessment?.blocker === 'multiple_entities'
    if (assessment && (conflictBlocker || assessment.bingIdentityDecision?.conflictingSignals.length)) return undefined
    if (!historicalCheck || !assessment || !assessment.automaticObservation || assessment.operatorReviewRequired ||
      assessment.bingIdentityDecision?.decision !== 'verified' || assessment.visibilityResult !== 'found' || assessment.blocker !== 'none' ||
      !historicalCheck.captures.some((capture) => capture.outcome === 'success')) continue
    const selected = assessment.selected
    const evidence = assessment.matches.map((match) => `${JSON.stringify(match.candidate.fields)}\n${match.evidence.map((reference) => `${reference.sourceUrl} (${reference.locator}): ${reference.excerpt}`).join('\n')}`).join('\n').slice(0, 12000)
    const observedResultTypes: SearchVisibilityObservedResultType[] = []
    if (selected?.matchedFields.some((field) => field.field === 'website')) observedResultTypes.push('official_website')
    else observedResultTypes.push('third_party_mention')
    for (const field of selected?.matchedFields || []) {
      if (field.field === 'name') observedResultTypes.push('business_name_correct')
      if (field.field === 'phone') observedResultTypes.push('phone_correct')
      if (field.field === 'website') observedResultTypes.push('website_correct')
      if (['streetAddress', 'address'].includes(field.field)) observedResultTypes.push('address_correct')
    }
    const observedAt = selected?.evidence[0]?.acquiredAt || historicalCheck.captures.findLast((capture) => capture.outcome === 'success')?.acquiredAt || historicalRun.endedAt || historicalRun.startedAt
    const query = historicalCheck.query || profile.businessName
    const observation: SearchDestinationObservation = {
      ...defaultSearchDestinationObservation('Bing Search', query),
      verificationUrl: verificationUrlFor('Bing Search', query, profile, true),
      ...(selected?.candidate.resultUrl ? { observedResultUrl: selected.candidate.resultUrl } : {}),
      ...(selected?.candidate.fields.publicProfileUrl ? { canonicalProfileUrl: selected.candidate.fields.publicProfileUrl } : {}),
      overallResult: 'found_match',
      observedResultTypes: [...new Set(observedResultTypes)],
      observedAt,
      provenance: 'automated_acquisition',
      confidence: 'scanner_detected_public_page',
      evidenceNotes: evidence,
      evidenceKind: 'external_observation',
      reviewed: false,
      automation: {
        runId: historicalRun.id,
        queryMode: 'brand',
        state: historicalCheck.state,
        inspectedUrl: historicalCheck.url || verificationUrlFor('Bing Search', query, profile, true),
        captures: historicalCheck.captures,
        evidence,
        interpreted: true,
        automaticObservation: true,
        assessment,
      },
    }
    return { observation, sourceProfileReviewKey: historicalRun.profileReviewKey }
  }
  return undefined
}

/** One runner shared by customer, Workbench and proving CLI. Every progress transition follows real work. */
export async function runVisibilityScan(initial: AuditState, dependencies: ScanDependencies, onUpdate: (update: StateUpdate) => void = () => undefined): Promise<VisibilityRun> {
  const enhanced = dependencies.automationVersion === 2
  const startedAt = new Date().toISOString()
  const run: VisibilityRun = { version: enhanced ? 2 : 1, ...(enhanced ? { profileReviewKey: evidenceFingerprint(initial.businessProfile) } : {}), id: `visibility-${startedAt}-${Math.random().toString(36).slice(2, 8)}`, profileKey: scanProfileKey(initial.profile), startedAt, status: 'running', checks: [], businessEvidence: [] }
  const profile = structuredClone(initial.profile)
  let state = structuredClone(initial)
  const deadline = Date.now() + Math.max(1, dependencies.overallTimeoutMs ?? defaultOverallTimeoutMs)
  const operationTimeoutMs = Math.max(1, dependencies.operationTimeoutMs ?? defaultOperationTimeoutMs)
  const googleBrandOperationTimeoutMs = Math.max(1, dependencies.googleBrandOperationTimeoutMs
    ?? (dependencies.operationTimeoutMs === undefined ? defaultGoogleBrandOperationTimeoutMs : operationTimeoutMs))
  const awaitBounded = async <T>(work: () => Promise<T>, label: string, operationLimitMs = operationTimeoutMs): Promise<T> => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new VisibilityScanTimeoutError(`The visibility scan reached its overall time limit before ${label} could complete.`)
    const timeoutMs = Math.min(operationLimitMs, remaining)
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new VisibilityScanTimeoutError(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs) }),
      ])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }
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
    const verificationUrl = verificationUrlFor(destination, query.query, profile, query.id === 'search-brand-canonical')
    const prior = initial.searchDestinationObservations[query.id]?.[destination]?.automation
    const recorded = prior && initial.visibilityRuns?.some((record) => record.id === prior.runId && matchesEvidenceFingerprint(record.profileKey, profile)) ? prior.inspectedUrl : undefined
    const configured = [profile.knownListingUrl, ...profile.existingDirectoryUrls.split(/[\s,]+/)].find((url) => host(url) && host(url) === host(publicPresenceUrl(destination, query.query)) &&
      (destination !== 'Google Search' || new URL(url).pathname === '/search') &&
      (destination !== 'Google Maps' || new URL(url).pathname.startsWith('/maps')))
    run.checks.push({ ...check(`${query.id}:${destination}`, 'SearchMaps'), destination, queryId: query.id, query: query.query, queryMode: query.isDiagnostic ? 'location' : query.role === 'Brand Presence' ? 'brand' : 'discovery',
      url: destination === 'Google Search' || ['Bing Search', 'Apple Maps', 'DuckDuckGo'].includes(destination) && query.id === 'search-brand-canonical'
        ? verificationUrl
        : enhanced && query.isDiagnostic ? publicPresenceUrl(destination, query.query) : query.role === 'Brand Presence' ? configured || recorded || publicPresenceUrl(destination, query.query) : publicPresenceUrl(destination, query.query) })
  }
  // Only recorded sources; no guessed directories or seed mutation. Runtime additionally requires an explicit host allowlist.
  const directoryUrls = [...new Set([profile.knownListingUrl, ...profile.existingDirectoryUrls.split(/[\s,]+/), ...initial.directories.activeRows.filter((row) => row.businessId === businessDirectoryKey(profile)).map((row) => row.listingUrl)].filter((url) => /^https?:\/\//.test(url)))]
    .filter((url) => !run.checks.some((item) => item.url === url))
  directoryUrls.forEach((url, index) => run.checks.push({ ...check(`public-directory-${index}`, 'BusinessInformation'), url, ...(index >= 8 ? { state: 'interactive_review_required' as const, error: 'This run is bounded to eight recorded public directories. Review this additional source manually.' } : {}) }))
  const machine = check('machine-readability', 'AIDiscovery', enhanced)
  run.checks.push(information, ...(enhanced ? [machine] : []), check(enhanced ? 'ai-answer-testing' : 'ai-discovery', 'AIDiscovery', false))
  try {
  publish()
  const start = (item: VisibilityCheck) => { item.state = 'scanning'; item.startedAt = new Date().toISOString(); publish() }
  const end = (item: VisibilityCheck) => { item.endedAt = new Date().toISOString(); item.elapsedMs = Date.parse(item.endedAt) - Date.parse(item.startedAt!); publish() }
  const rawCaptures: AcquisitionResult[] = []
  if (website.state !== 'not_checked' && alive()) {
    start(website)
    try {
      const result = await awaitBounded(() => dependencies.website(profile), 'the website acquisition')
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
      update((current) => ({ ...current, customerFindingReviews: {}, customerFindingDismissals: {}, websiteAudit: { ...current.websiteAudit, latestAttempt: {
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
    let dedicatedProviderHandled = false
    const acquisitionRoute = destinationAcquisitionRoute(item.destination, item.queryMode)
    // A caller that spreads application dependencies and replaces only `acquire`
    // is supplying a complete fixture/CLI provider and must not inherit a live API call.
    const googleProvider = dependencies.acquireGoogle === applicationScanDependencies.acquireGoogle
      && dependencies.acquire !== applicationScanDependencies.acquire ? undefined : dependencies.acquireGoogle
    const googleMapsProvider = dependencies.acquireGoogleMaps === applicationScanDependencies.acquireGoogleMaps
      && dependencies.acquire !== applicationScanDependencies.acquire ? undefined : dependencies.acquireGoogleMaps
    const appleMapsProvider = dependencies.acquireAppleMaps === applicationScanDependencies.acquireAppleMaps
      && dependencies.acquire !== applicationScanDependencies.acquire ? undefined : dependencies.acquireAppleMaps
    const duckDuckGoProvider = dependencies.acquireDuckDuckGoSearch === applicationScanDependencies.acquireDuckDuckGoSearch
      && dependencies.acquire !== applicationScanDependencies.acquire ? undefined : dependencies.acquireDuckDuckGoSearch
    const dedicatedProvider = acquisitionRoute === 'google_search' ? googleProvider
      : acquisitionRoute === 'google_maps' ? googleMapsProvider
        : acquisitionRoute === 'bing_native_search' ? dependencies.acquireBingSearch
          : acquisitionRoute === 'apple_maps_native' ? appleMapsProvider
            : acquisitionRoute === 'duckduckgo_native_search' ? duckDuckGoProvider : undefined
    if (dedicatedProvider) {
      try {
        const timeoutMs = item.destination === 'Google Search' && item.queryMode === 'brand' ? googleBrandOperationTimeoutMs : operationTimeoutMs
        const capture = await awaitBounded(() => dedicatedProvider(item.url!), `${item.destination || 'destination'} acquisition`, timeoutMs)
        if (!alive()) return run
        if (capture) {
          captures.push(capture)
          dedicatedProviderHandled = true
          item.captures = captures.map(compactCapture)
          publish()
          if (item.destination === 'Google Maps' && item.queryMode === 'brand' && !(capture.outcome === 'success' && capture.resultRegionInspected)) {
            const name = reviewedProfileValue(profile, initial.businessProfile, 'businessName')
            const city = reviewedProfileValue(profile, initial.businessProfile, 'city')
            const region = reviewedProfileValue(profile, initial.businessProfile, 'state')
            if (name && city && region) {
              const enrichedUrl = publicPresenceUrl('Google Maps', `${name} ${city} ${region}`)
              const enriched = await awaitBounded(() => dedicatedProvider(enrichedUrl), 'Google Maps location enrichment')
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
        const errorText = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
        const blocker = error instanceof VisibilityScanTimeoutError ? 'provider_timeout'
          : /(?:Bing native|Apple Maps native|DuckDuckGo native) acquisition busy/i.test(errorText) ? 'capacity_busy'
            : /Failed to fetch|network/i.test(errorText) ? 'network_failure' : 'acquisition_failure'
        const provider = item.destination === 'Google Maps' ? 'brightdata-google-maps-request'
          : item.destination === 'Google Search' ? 'brightdata-google-request'
            : item.destination === 'Apple Maps' ? 'apple-maps-native-request'
              : item.destination === 'DuckDuckGo' ? 'duckduckgo-native-request' : 'bing-native-request'
        captures.push({ version: 1, requestedUrl: item.url!, acquiredAt: new Date().toISOString(), method: 'server_fetch', provider, outcome: 'failed', confidence: 'unavailable', notes: [`${item.destination || 'Destination'} provider request failed. This is not evidence that the business is absent.`], blocker, error: String(error) })
        dedicatedProviderHandled = true
      }
    }
    if (acquisitionRoute === 'bing_native_search' && !dedicatedProvider) {
      captures.push({
        version: 1, requestedUrl: item.url!, acquiredAt: new Date().toISOString(), method: 'server_fetch',
        provider: 'bing-native-request', checkedDestination: 'Bing Search', outcome: 'unavailable', confidence: 'unavailable',
        resultRegionInspected: false, blocker: 'bing_acquisition_not_configured',
        notes: ['The dedicated Bing Brand acquisition route was unavailable. This is not evidence that the business is absent.'],
        error: 'Dedicated Bing acquisition is not configured.',
      })
      dedicatedProviderHandled = true
    }
    if (acquisitionRoute === 'apple_maps_native' && !dedicatedProvider) {
      captures.push({
        version: 1, requestedUrl: item.url!, acquiredAt: new Date().toISOString(), method: 'server_fetch',
        provider: 'apple-maps-native-request', checkedDestination: 'Apple Maps', outcome: 'unavailable', confidence: 'unavailable',
        resultRegionInspected: false, blocker: 'apple_maps_acquisition_not_configured',
        notes: ['The dedicated Apple Maps Brand acquisition route was unavailable. This is not evidence that the business is absent.'],
        error: 'Dedicated Apple Maps acquisition is not configured.',
      })
      dedicatedProviderHandled = true
    }
    if (acquisitionRoute === 'duckduckgo_native_search' && !dedicatedProvider) {
      captures.push({
        version: 1, requestedUrl: item.url!, acquiredAt: new Date().toISOString(), method: 'server_fetch',
        provider: 'duckduckgo-native-request', checkedDestination: 'DuckDuckGo', outcome: 'unavailable', confidence: 'unavailable',
        resultRegionInspected: false, blocker: 'duckduckgo_acquisition_not_configured',
        notes: ['The dedicated DuckDuckGo Brand acquisition route was unavailable. This is not evidence that the business is absent.'],
        error: 'Dedicated DuckDuckGo acquisition is not configured.',
      })
      dedicatedProviderHandled = true
    }
    if (!dedicatedProviderHandled) {
      for (const method of ['server_fetch', 'rendered_browser'] as const) {
        if (!alive()) return run
        try {
          const capture = await awaitBounded(() => dependencies.acquire(item.url!, method), `${item.destination || 'public destination'} ${method}`)
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
      const assessment = candidates.length ? assessBusinessCandidates(candidates, profile, initial.businessProfile, item.queryMode, {
        automaticIdentityPolicy: item.queryMode !== 'brand' ? undefined
          : item.destination === 'Google Search' ? 'google_search'
            : item.destination === 'Bing Search' ? 'bing_search'
              : item.destination === 'Apple Maps' ? 'apple_maps'
                : item.destination === 'DuckDuckGo' ? 'duckduckgo_search' : undefined,
      })
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
        verificationUrl: verificationUrlFor(item.destination, item.query!, profile, item.queryMode === 'brand'),
        ...(selected?.candidate.resultUrl ? { observedResultUrl: selected.candidate.resultUrl } : {}),
        ...(selected?.candidate.fields.publicProfileUrl ? { canonicalProfileUrl: selected.candidate.fields.publicProfileUrl } : {}),
        observedAt: selected?.evidence[0]?.acquiredAt || captures.at(-1)?.acquiredAt || '', provenance: 'automated_acquisition', overallResult: assessment.automaticObservation ? 'found_match' : assessment.visibilityResult === 'not_found' ? 'not_found' : 'manual_review_needed',
        observedResultTypes: [...new Set(types)].filter((type) => resultTypesForDestination(item.destination!).includes(type)), evidenceNotes: normalizedEvidence,
        confidence: item.evidenceCaptured ? 'scanner_detected_public_page' : 'manual_needs_confirmation', evidenceKind: item.evidenceCaptured ? 'external_observation' : captures.some((capture) => ['success', 'partial'].includes(capture.outcome)) ? 'unable_to_verify' : 'acquisition_failure',
        automation: { runId: run.id, queryMode: item.queryMode, state: item.state, inspectedUrl: item.url!, captures: item.captures, evidence: normalizedEvidence, interpreted: item.interpreted, automaticObservation: assessment.automaticObservation,
          ...(['Google Search', 'Bing Search'].includes(item.destination) && item.queryMode === 'brand'
            ? { businessIdentityKey: brandPresenceBusinessIdentityKey(profile, initial.businessProfile) } : {}), assessment },
      }
      update((current) => {
        const previous = current.searchDestinationObservations[item.queryId!]?.[item.destination!]
        const sourceRun = current.visibilityRuns?.find((candidate) => candidate.id === previous?.automation?.runId)
        const retainedBingSource = item.destination === 'Bing Search' && item.queryMode === 'brand'
          ? retainedBingSourceFromVisibilityRuns(current, item.id, profile) : undefined
        return { ...current, searchDestinationObservations: { ...current.searchDestinationObservations,
          [item.queryId!]: { ...current.searchDestinationObservations[item.queryId!], [item.destination!]: mergeAutomatedObservation(previous, observation, {
            profile, profileState: initial.businessProfile, sourceProfileReviewKey: sourceRun?.profileReviewKey,
            retainedBingSource,
          }) } } }
      })
    } else if (item.destination) {
      const interpretations = captures.map((capture) => ({ capture, ...interpretPresence(capture, profile, item.destination!) }))
      const best = interpretations.find((result) => result.interpreted) || interpretations.find((result) => result.evidence)
      item.evidenceCaptured = Boolean(best?.evidence)
      item.interpreted = Boolean(best?.interpreted)
      item.state = best ? 'awaiting_review' : 'interactive_review_required'
      const observation = { ...defaultSearchDestinationObservation(item.destination, item.query!),
        verificationUrl: verificationUrlFor(item.destination, item.query!, profile, item.queryMode === 'brand'),
        observedAt: best?.capture.acquiredAt || captures.at(-1)?.acquiredAt || '', provenance: 'automated_acquisition' as const,
        overallResult: 'manual_review_needed' as const, observedResultTypes: best?.types || [],
        evidenceNotes: best?.evidence || '', confidence: best ? 'scanner_detected_public_page' as const : 'manual_needs_confirmation' as const,
        evidenceKind: best ? 'external_observation' as const : 'acquisition_failure' as const,
        automation: { runId: run.id, state: item.state, inspectedUrl: item.url!, captures: item.captures, evidence: best?.evidence || '', interpreted: item.interpreted } }
      update((current) => {
        const previous = current.searchDestinationObservations[item.queryId!]?.[item.destination!]
        const sourceRun = current.visibilityRuns?.find((candidate) => candidate.id === previous?.automation?.runId)
        return { ...current, searchDestinationObservations: { ...current.searchDestinationObservations,
          [item.queryId!]: { ...current.searchDestinationObservations[item.queryId!], [item.destination!]: mergeAutomatedObservation(previous, observation, {
            profile, profileState: initial.businessProfile, sourceProfileReviewKey: sourceRun?.profileReviewKey,
          }) } } }
      })
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
  run.status = run.checks.some((item) => ['failed', 'interactive_review_required', 'not_checked'].includes(item.state)) ? 'completed_with_review' : 'completed'
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
  } catch (error) {
    if (!alive()) return run
    const endedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : String(error)
    run.checks.forEach((item) => {
      if (item.state === 'scanning') {
        item.state = 'interactive_review_required'
        item.error = `The scan stopped before this check completed: ${message}`
        item.endedAt = endedAt
        item.elapsedMs = item.startedAt ? Date.parse(endedAt) - Date.parse(item.startedAt) : undefined
      } else if (item.state === 'queued') {
        item.state = 'not_checked'
        item.error = 'This check did not begin before the scan stopped.'
      }
    })
    run.endedAt = endedAt
    run.status = 'failed'
    run.failure = message
    run.summary = {
      attempted: run.checks.filter((item) => item.startedAt).length,
      successful: run.checks.filter((item) => item.evidenceCaptured).length,
      evidenceCaptured: run.checks.filter((item) => item.evidenceCaptured).length,
      operatorReview: run.checks.filter((item) => ['awaiting_review', 'evidence_captured', 'interactive_review_required', 'failed'].includes(item.state)).length,
      interactiveReview: run.checks.filter((item) => item.state === 'interactive_review_required').length,
      acquisitionFailures: run.checks.reduce((sum, item) => sum + item.captures.filter((capture) => ['failed', 'blocked', 'unavailable'].includes(capture.outcome)).length + (item.id === website.id && item.state === 'failed' ? 1 : 0), 0),
      manualInterventionsRequired: run.checks.filter((item) => ['interactive_review_required', 'failed', 'not_checked'].includes(item.state)).length,
      providerEscalations: run.checks.filter((item) => item.captures.some((capture) => capture.method === 'rendered_browser')).length,
      candidateFindings: 0,
      customerApprovedFindings: 0,
    }
    publish()
    return run
  }
}
