import type {
  AIAnswerPlatform,
  AIAnswerTestState,
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

export const aiAnswerPlatforms: AIAnswerPlatform[] = [
  'ChatGPT',
  'Gemini',
  'Perplexity',
  'Copilot',
  'Claude',
  'Grok',
]

export const scoreAIAnswerPlatform = (test: AIAnswerTestState): number => {
  if (
    test.resultStatus === 'unknown' ||
    test.resultStatus === 'signin_required'
  ) {
    return 0
  }

  if (test.resultStatus === 'pass') {
    if (test.priority === 'High') return 70
    if (test.priority === 'Medium') return 85
    return 100
  }

  if (test.resultStatus === 'partial') {
    if (test.priority === 'High') return 40
    if (test.priority === 'Medium') return 55
    return 70
  }

  if (test.priority === 'High') return 0
  if (test.priority === 'Medium') return 20
  return 35
}

export const scoreAIAnswers = (
  tests: Record<AIAnswerPlatform, AIAnswerTestState>,
): ScoreResult => {
  const platformScores = aiAnswerPlatforms.map((platform) =>
    scoreAIAnswerPlatform(tests[platform]),
  )
  const checked = aiAnswerPlatforms.filter(
    (platform) =>
      tests[platform].resultStatus !== 'unknown' &&
      tests[platform].resultStatus !== 'signin_required',
  ).length
  const unchecked = aiAnswerPlatforms.length - checked
  const score =
    platformScores.reduce((sum, platformScore) => sum + platformScore, 0) /
    aiAnswerPlatforms.length

  if (checked === 0) {
    return {
      score,
      status: 'Gray',
      statusLabel: 'Not tested',
      earned: score,
      possible: 100,
      checked,
      unchecked,
    }
  }

  if (checked < aiAnswerPlatforms.length) {
    return {
      score,
      status: 'Yellow',
      statusLabel: 'Partial coverage',
      earned: score,
      possible: 100,
      checked,
      unchecked,
    }
  }

  const status = score >= 80 ? 'Green' : score >= 50 ? 'Yellow' : 'Red'

  return {
    score,
    status,
    earned: score,
    possible: 100,
    checked,
    unchecked,
  }
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
      return status === 'fail' || status === 'partial'
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 9)
    .map((item) => {
      const status = checks[item.id] ?? 'unknown'
      return {
        id: item.id,
        priority:
          status === 'fail' ? 'High' : item.weight >= 10 ? 'Medium' : 'Low',
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
