/** Stable across JSON save/load and harmless property ordering; array order remains evidence. */
const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, ordered(child)])) : value
export const evidenceFingerprint = (value: unknown) => JSON.stringify(ordered(value))
/** Accept earlier JSON fingerprints without reinterpreting their facts. */
export function matchesEvidenceFingerprint(key: string | undefined, value: unknown): boolean {
  if (!key) return false
  if (key === evidenceFingerprint(value)) return true
  try { return evidenceFingerprint(JSON.parse(key)) === evidenceFingerprint(value) } catch { return false }
}
