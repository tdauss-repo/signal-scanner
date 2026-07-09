import type {
  AuditItem,
  CheckStatus,
  FixItem,
  ScoreResult,
  TrafficStatus,
} from '../types/audit'

const statusPoints: Record<CheckStatus, number | null> = {
  pass: 1,
  partial: 0.55,
  fail: 0,
  unknown: null,
}

export const trafficStatusForScore = (score: number | null): TrafficStatus => {
  if (score === null) return 'Gray'
  if (score >= 80) return 'Green'
  if (score >= 55) return 'Yellow'
  return 'Red'
}

export const scoreItems = (
  items: AuditItem[],
  checks: Record<string, CheckStatus>,
): ScoreResult => {
  let earned = 0
  let possible = 0
  let checked = 0

  for (const item of items) {
    const status = checks[item.id] ?? 'unknown'
    const points = statusPoints[status]

    possible += item.weight
    if (points !== null) {
      checked += 1
      earned += item.weight * points
    }
  }

  const score = checked === 0 || possible === 0 ? null : (earned / possible) * 100

  return {
    score,
    status: trafficStatusForScore(score),
    earned,
    possible,
    checked,
  }
}

export const weightedAverage = (
  weightedScores: Array<{ score: number | null; weight: number }>,
) => {
  const scored = weightedScores.filter(
    (item): item is { score: number; weight: number } => item.score !== null,
  )

  if (scored.length === 0) return null

  const possible = scored.reduce((sum, item) => sum + item.weight, 0)
  const earned = scored.reduce(
    (sum, item) => sum + item.score * item.weight,
    0,
  )

  return earned / possible
}

export const buildFixPlan = (
  items: AuditItem[],
  checks: Record<string, CheckStatus>,
): FixItem[] => {
  const areaLabels: Record<AuditItem['area'], string> = {
    website: 'Website SEO fixes',
    keywords: 'Search visibility fixes',
    listings: 'Listing consistency fixes',
    ai: 'AI answer/source clarity fixes',
    voice: 'Voice-search readiness fixes',
  }

  const fixes = items
    .filter((item) => {
      const status = checks[item.id] ?? 'unknown'
      return status === 'fail' || status === 'partial' || status === 'unknown'
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 9)
    .map((item) => {
      const status = checks[item.id] ?? 'unknown'
      return {
        id: item.id,
        priority:
          status === 'fail' ? 'High' : status === 'partial' ? 'Medium' : 'Watch',
        area: areaLabels[item.area],
        issue: item.label,
        fix: item.fix,
        status,
      } satisfies FixItem
    })

  return fixes
}

export const formatScore = (score: number | null) =>
  score === null ? '--' : Math.round(score).toString()
