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
  `Browser storage is full. Your current work remains open, but automatic saving is unavailable. Save this workspace to a local JSON file before closing or refreshing.${detail ? ` (${detail})` : ''}`
