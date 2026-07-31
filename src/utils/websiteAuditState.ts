import type { WebsiteAuditWorkspaceState } from '../types/audit'
import type {
  ManualWebsiteObservation,
  WebsiteAcquisitionProvenance,
  WebsiteAuditBlockedResult,
  WebsiteAuditResponse,
  WebsiteAuditResult,
} from '../types/websiteAudit'

export const defaultManualWebsiteObservation = (): ManualWebsiteObservation => ({
  sourceUrl: '',
  recordedAt: '',
  acquisition: null,
  observedTitle: '',
  observedMetaDescription: '',
  visibleHomepageText: '',
  observedLinks: '',
  observedSchemaSnippet: '',
  notes: '',
  analyzedAt: '',
})

const reconstructedSuccessfulAcquisition = (
  result: WebsiteAuditResult,
): WebsiteAcquisitionProvenance => ({
  captureVersion: 1,
  provider: 'found-local-server',
  method: 'server_fetch',
  outcome: 'success',
  sourceUrl: result.fetchedUrl || undefined,
  occurredAt: result.analyzedAt || undefined,
  attemptSummary: {
    selectedUrl: result.fetchedUrl || undefined,
    selectedStrategy: result.fetchStrategyUsed || undefined,
    selectedStatus: result.homepageStatus || undefined,
  },
  recordOrigin: 'legacy_reconstructed',
})

const reconstructedFailedAcquisition = (
  result: WebsiteAuditBlockedResult,
): WebsiteAcquisitionProvenance => ({
  captureVersion: 1,
  provider: 'found-local-server',
  method: 'server_fetch',
  outcome: result.blocked ? 'blocked' : 'unavailable',
  requestedUrl: result.requestedUrl || undefined,
  occurredAt: result.timestamp || undefined,
  attemptSummary: {
    selectedUrl: result.finalUrl || result.redirectUrl || undefined,
    selectedStrategy: result.fetchStrategyUsed || undefined,
    selectedStatus: result.status || undefined,
    errorType: result.errorType || undefined,
    protocolFallbackTried: result.protocolFallbackTried,
    wwwFallbackTried: result.wwwFallbackTried,
  },
  recordOrigin: 'legacy_reconstructed',
})

const manualEvidenceFields = [
  'sourceUrl',
  'observedTitle',
  'observedMetaDescription',
  'visibleHomepageText',
  'observedLinks',
  'observedSchemaSnippet',
  'notes',
] as const

type ManualEvidenceField = (typeof manualEvidenceFields)[number]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isString = (value: unknown): value is string => typeof value === 'string'

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isWebsiteAcquisitionMethod = (
  value: unknown,
): value is WebsiteAcquisitionProvenance['method'] =>
  value === 'server_fetch' ||
  value === 'operator_observation' ||
  value === 'rendered_browser'

const isWebsiteAcquisitionOutcome = (
  value: unknown,
): value is WebsiteAcquisitionProvenance['outcome'] =>
  value === 'success' ||
  value === 'blocked' ||
  value === 'unavailable' ||
  value === 'observed'

const isWebsiteAcquisitionRecordOrigin = (
  value: unknown,
): value is WebsiteAcquisitionProvenance['recordOrigin'] =>
  value === 'captured' || value === 'legacy_reconstructed'

const isWebsiteAttemptSummary = (
  value: unknown,
): value is NonNullable<WebsiteAcquisitionProvenance['attemptSummary']> => {
  if (!isRecord(value)) return false

  return (
    (!('attemptedCount' in value) || isNumber(value.attemptedCount)) &&
    (!('selectedUrl' in value) || isString(value.selectedUrl)) &&
    (!('selectedStrategy' in value) || isString(value.selectedStrategy)) &&
    (!('selectedStatus' in value) || isNumber(value.selectedStatus)) &&
    (!('errorType' in value) || isString(value.errorType)) &&
    (!('protocolFallbackTried' in value) || isBoolean(value.protocolFallbackTried)) &&
    (!('wwwFallbackTried' in value) || isBoolean(value.wwwFallbackTried))
  )
}

const isWebsiteAcquisitionProvenance = (
  value: unknown,
): value is WebsiteAcquisitionProvenance => {
  if (!isRecord(value)) return false

  return (
    value.captureVersion === 1 &&
    isString(value.provider) &&
    isWebsiteAcquisitionMethod(value.method) &&
    isWebsiteAcquisitionOutcome(value.outcome) &&
    (!('requestedUrl' in value) || value.requestedUrl === undefined || isString(value.requestedUrl)) &&
    (!('sourceUrl' in value) || value.sourceUrl === undefined || isString(value.sourceUrl)) &&
    (!('occurredAt' in value) || value.occurredAt === undefined || isString(value.occurredAt)) &&
    (!('attemptSummary' in value) ||
      value.attemptSummary === undefined ||
      isWebsiteAttemptSummary(value.attemptSummary)) &&
    isWebsiteAcquisitionRecordOrigin(value.recordOrigin)
  )
}

const isRecognizableSuccessfulAuditResult = (
  value: unknown,
): value is WebsiteAuditResult => {
  if (!isRecord(value) || value.ok !== true) return false

  return (
    isString(value.normalizedUrl) &&
    isString(value.fetchedUrl) &&
    isString(value.fetchStrategyUsed) &&
    isNumber(value.redirectCount) &&
    isNumber(value.homepageStatus) &&
    isString(value.analyzedAt)
  )
}

const isRecognizableFailedAuditResult = (
  value: unknown,
): value is WebsiteAuditBlockedResult => {
  if (!isRecord(value) || value.ok !== false) return false

  return (
    isNumber(value.status) &&
    isString(value.error) &&
    isString(value.errorType) &&
    isString(value.details) &&
    isString(value.recommendedNextStep) &&
    isString(value.requestedUrl) &&
    isString(value.redirectUrl) &&
    isBoolean(value.redirectOccurred) &&
    isNumber(value.redirectCount) &&
    isBoolean(value.blocked) &&
    isString(value.fetchStrategyUsed) &&
    isBoolean(value.httpsFallbackTried) &&
    isBoolean(value.protocolFallbackTried) &&
    isBoolean(value.wwwFallbackTried) &&
    isString(value.timestamp)
  )
}

const normalizeAutomatedResult = (
  result: unknown,
): WebsiteAuditResponse | null => {
  if (isRecognizableSuccessfulAuditResult(result)) {
    if (isWebsiteAcquisitionProvenance(result.acquisition)) return result

    return {
      ...result,
      acquisition: reconstructedSuccessfulAcquisition(result),
    }
  }

  if (isRecognizableFailedAuditResult(result)) {
    if (isWebsiteAcquisitionProvenance(result.acquisition)) return result

    return {
      ...result,
      acquisition: reconstructedFailedAcquisition(result),
    }
  }

  return null
}

const normalizeManualObservation = (
  observation: unknown,
): ManualWebsiteObservation => {
  const defaults = defaultManualWebsiteObservation()
  if (!isRecord(observation)) return defaults

  const recordedAt =
    isString(observation.recordedAt)
      ? observation.recordedAt
      : isString(observation.observedAt)
        ? observation.observedAt
        : ''

  return {
    ...defaults,
    sourceUrl: isString(observation.sourceUrl) ? observation.sourceUrl : '',
    recordedAt,
    acquisition: isWebsiteAcquisitionProvenance(observation.acquisition)
      ? observation.acquisition
      : null,
    observedTitle: isString(observation.observedTitle)
      ? observation.observedTitle
      : '',
    observedMetaDescription: isString(observation.observedMetaDescription)
      ? observation.observedMetaDescription
      : '',
    visibleHomepageText: isString(observation.visibleHomepageText)
      ? observation.visibleHomepageText
      : '',
    observedLinks: isString(observation.observedLinks)
      ? observation.observedLinks
      : '',
    observedSchemaSnippet: isString(observation.observedSchemaSnippet)
      ? observation.observedSchemaSnippet
      : '',
    notes: isString(observation.notes) ? observation.notes : '',
    analyzedAt: isString(observation.analyzedAt) ? observation.analyzedAt : '',
  }
}

export const normalizeWebsiteAuditWorkspaceState = (
  state: Partial<WebsiteAuditWorkspaceState> | undefined,
): WebsiteAuditWorkspaceState => ({
  lastSuccessful:
    normalizeAutomatedResult(state?.lastSuccessful) as WebsiteAuditResult | null,
  latestAttempt: normalizeAutomatedResult(state?.latestAttempt),
  manualObservation: normalizeManualObservation(state?.manualObservation),
})

export const updateManualWebsiteObservationDraft = (
  currentObservation: ManualWebsiteObservation,
  updates: Partial<Pick<ManualWebsiteObservation, ManualEvidenceField>>,
): ManualWebsiteObservation => {
  const nextObservation = {
    ...currentObservation,
    ...updates,
  }

  const evidenceChanged = manualEvidenceFields.some(
    (field) =>
      Object.prototype.hasOwnProperty.call(updates, field) &&
      updates[field] !== currentObservation[field],
  )

  if (!evidenceChanged) return nextObservation

  return {
    ...nextObservation,
    acquisition: null,
    recordedAt: '',
    analyzedAt: '',
  }
}

export const captureManualObservationProvenance = (
  observation: ManualWebsiteObservation,
  recordedAt: string,
): ManualWebsiteObservation => {
  const sourceUrl = observation.sourceUrl.trim()

  return {
    ...observation,
    sourceUrl,
    recordedAt,
    analyzedAt: recordedAt,
    acquisition: {
      captureVersion: 1,
      provider: 'operator',
      method: 'operator_observation',
      outcome: 'observed',
      ...(sourceUrl ? { sourceUrl } : {}),
      occurredAt: recordedAt,
      recordOrigin: 'captured',
    },
  }
}
