import type { AuditState, SavedScanFile, SavedScanRecord } from '../types/audit'
import { recoverRetainedBrandPresenceFromWorkspace } from './brandPresenceWorkspaceRetention'

export const WORKSPACE_FILE_TYPE = 'found-local-scan' as const
export const WORKSPACE_FILE_VERSION = 1 as const

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const slugify = (value: string) => value.trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-business'

const dateSlug = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'undated' : date.toISOString().slice(0, 10)
}

export function workspaceRecordFromState(
  state: AuditState,
  options: { existing?: SavedScanRecord; id: string; now: string },
): SavedScanRecord {
  const retained = recoverRetainedBrandPresenceFromWorkspace(
    state,
    Date.parse(options.now),
    options.existing?.payload,
  )
  const payload = clone({ ...retained, lastUpdated: options.now })
  return {
    id: options.existing?.id ?? options.id,
    businessName: payload.profile.businessName || 'Untitled business',
    website: payload.profile.website,
    localMarket: payload.profile.localMarket || payload.profile.targetLocation,
    createdAt: options.existing?.createdAt ?? options.now,
    updatedAt: options.now,
    scanDate: payload.visibilityRuns?.at(-1)?.endedAt || payload.visibilityRuns?.at(-1)?.startedAt || payload.lastUpdated,
    notes: options.existing?.notes ?? '',
    payload,
  }
}

export const buildWorkspaceFile = (scan: SavedScanRecord, exportedAt = new Date().toISOString()): SavedScanFile => ({
  app: 'Found Local Business Scanner Tool',
  fileType: WORKSPACE_FILE_TYPE,
  version: WORKSPACE_FILE_VERSION,
  exportedAt,
  scan: clone(scan),
})

export const serializeWorkspaceFile = (scan: SavedScanRecord, exportedAt = new Date().toISOString()) =>
  JSON.stringify(buildWorkspaceFile(scan, exportedAt), null, 2)

export const workspaceFilename = (scan: SavedScanRecord) =>
  `found-local-${slugify(scan.businessName)}-${dateSlug(scan.scanDate || scan.updatedAt)}.json`

const objectValue = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const savedRecordShape = (value: unknown): value is Partial<SavedScanRecord> => objectValue(value) && objectValue(value.payload) &&
  objectValue(value.payload.profile)

export type WorkspaceFileParseResult =
  | { ok: true; scan: Partial<SavedScanRecord>; legacyRecord: boolean }
  | { ok: false; error: string }

/** Parse and structurally validate only. Application migration/normalization follows this boundary. */
export function parseWorkspaceFile(text: string): WorkspaceFileParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The selected file is not valid JSON.' }
  }
  if (!objectValue(parsed)) return { ok: false, error: 'The selected file is not a Found Local workspace.' }

  if (parsed.fileType === WORKSPACE_FILE_TYPE) {
    if (parsed.version !== WORKSPACE_FILE_VERSION) {
      return { ok: false, error: `Workspace version ${String(parsed.version)} is not supported by this version of Found Local.` }
    }
    if (parsed.app !== 'Found Local Business Scanner Tool' || !savedRecordShape(parsed.scan)) {
      return { ok: false, error: 'The Found Local workspace header or payload is incomplete.' }
    }
    return { ok: true, scan: parsed.scan, legacyRecord: false }
  }

  // Earlier operator exports may contain the SavedScanRecord without its v1 envelope.
  if (savedRecordShape(parsed)) return { ok: true, scan: parsed, legacyRecord: true }
  return { ok: false, error: 'The selected file is not a supported Found Local workspace export.' }
}
