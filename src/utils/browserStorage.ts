export interface StorageWriteResult {
  ok: boolean
  error?: string
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** Browser storage can reject large evidence-rich workspaces. Never let that exception escape React. */
export function writeStorageText(storage: Pick<Storage, 'setItem'>, key: string, value: string): StorageWriteResult {
  try {
    storage.setItem(key, value)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

export function writeStorageJson(storage: Pick<Storage, 'setItem'>, key: string, value: unknown): StorageWriteResult {
  try {
    return writeStorageText(storage, key, JSON.stringify(value))
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

export const workspaceStorageFailureMessage = (detail?: string) =>
  `Found Local could not save this workspace in browser storage. The current page and captured evidence have been preserved. Export Full Scan JSON or remove an older saved workspace before retrying.${detail ? ` (${detail})` : ''}`
