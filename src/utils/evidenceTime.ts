const hasExplicitTimezone = (value: string) => /(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim())

/**
 * Evidence is stored as UTC ISO-8601. Legacy timezone-less values are treated
 * as the operator's local wall-clock time, matching datetime-local semantics.
 */
export function normalizeEvidenceTimestamp(value: string | undefined): string {
  const trimmed = value?.trim() || ''
  if (!trimmed) return ''
  const local = !hasExplicitTimezone(trimmed)
    ? trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/)
    : null
  const date = local
    ? new Date(
      Number(local[1]), Number(local[2]) - 1, Number(local[3]),
      Number(local[4]), Number(local[5]), Number(local[6] || 0),
      Number((local[7] || '').padEnd(3, '0') || 0),
    )
    : new Date(trimmed)
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString()
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Convert stored UTC evidence time to the browser-local datetime input value. */
export function evidenceTimestampToLocalInput(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Convert a browser-local datetime input value back to UTC storage. */
export function localInputToEvidenceTimestamp(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/** Human-readable evidence time in the operator/browser timezone. */
export function formatEvidenceTimestamp(value: string): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp'
  return date.toLocaleString([], {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: '2-digit',
  })
}
