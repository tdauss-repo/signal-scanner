import type { BusinessProfile, CorroborationRecord, CustomerQuestion, EntityClarityFinding, FixItem, SalesReadinessState } from '../types/audit'

const now = () => new Date().toISOString()
const id = (prefix: string, value: string) => `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

export const emptySalesReadiness = (): SalesReadinessState => ({ entityClarity: [], customerQuestions: [] })

const seededEntityClarity = (profile: BusinessProfile): EntityClarityFinding[] => [
  ['Business name', profile.businessName], ['Primary offering', profile.primaryCategory || profile.primaryServices], ['Location/service area', profile.targetLocation || profile.serviceArea || [profile.city, profile.state].filter(Boolean).join(', ')], ['Primary contact/enrollment action', profile.phone],
].map(([dimension, expectedValue]) => ({ id: id('entity', dimension), dimension: dimension as EntityClarityFinding['dimension'], observedValue: '', expectedValue, sourceEvidence: '', sourceUrl: '', recordedAt: '', confidence: 'manual_needs_confirmation', result: 'Unable to verify', operatorNotes: '', reviewed: false }))

/** Montessori questions are editable sample content, never inferred business facts. */
export const seededCustomerQuestions = (profile: BusinessProfile): CustomerQuestion[] => {
  if (!/montessori/i.test(`${profile.businessName} ${profile.primaryCategory} ${profile.primaryServices}`)) return []
  return [
    ['How can a family begin an inquiry or enrollment process?', 'Inquiry / enrollment'],
    ['Which age ranges or programs are served?', 'Programs / ages'],
    ['Where is the school located or which area does it serve?', 'Location'],
    ['Where can a family verify schedule or hours?', 'Schedule / hours'],
    ['Where can a family verify tuition or the enrollment process?', 'Tuition / process'],
  ].map(([question, category]) => ({ id: id('question', question), question, category, status: 'Unable to verify', supportingEvidence: '', sourceUrl: '', recordedAt: '', confidence: 'manual_needs_confirmation', operatorNotes: '', reviewed: false, packageFit: 'later', recommendedAction: 'Review the public website and confirm the current answer with the owner before publishing or changing it.', verificationMethod: 'Re-check the cited public page after owner confirmation.' }))
}

export const normalizeSalesReadiness = (state: Partial<SalesReadinessState> | undefined, profile: BusinessProfile): SalesReadinessState => ({
  entityClarity: state?.entityClarity === undefined ? seededEntityClarity(profile) : state.entityClarity.map((finding) => ({ ...finding })),
  customerQuestions: state?.customerQuestions === undefined ? seededCustomerQuestions(profile) : state.customerQuestions.map((question) => ({ ...question })),
})

type CorroborationRow = { directoryName: string; listingUrl: string; publicEvidenceNotes: string; lastCheckedAt: string; evidenceConfidence: CorroborationRecord['confidence']; ownerAdminAccessStatus: string; listingResult?: string; provenance?: CorroborationRecord['provenance'] }
const fields: Array<[CorroborationRecord['field'], (profile: BusinessProfile) => string, string]> = [
  ['Business name', (profile) => profile.businessName, 'business name'], ['Primary category', (profile) => profile.primaryCategory, 'category'], ['Phone', (profile) => profile.phone, 'phone'], ['Website URL', (profile) => profile.website, 'website'], ['Address/service area', (profile) => profile.streetAddress || profile.serviceArea || profile.targetLocation, 'address'], ['Hours', () => '', 'hours'],
]
const valueFromEvidence = (evidence: string, label: string) => {
  const match = evidence.match(new RegExp(`(?:${label}|${label.replace(' ', '\\s+')})\\s*[:=-]\\s*([^\\n;]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}
const normalizedValue = (value: string) => value.toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]+/g, '')
const corroborationResult = (expected: string, observed: string, row: CorroborationRow, evidence: string): CorroborationRecord['result'] => {
  if (/acquisition unavailable|blocked|unable to acquire/i.test(evidence)) return 'Acquisition unavailable'
  if (row.listingResult === 'not_found') return 'Not found'
  if (!expected) return 'Owner confirmation needed'
  if (!observed) return 'Unable to verify'
  if (/conflict|inaccurate/i.test(evidence)) return 'Conflict'
  if (normalizedValue(expected) === normalizedValue(observed)) return 'Match'
  return 'Partial match'
}
/** Derives only explicitly recorded field values; absence stays unable to verify. */
export const deriveCorroboration = (profile: BusinessProfile, rows: CorroborationRow[]): CorroborationRecord[] => rows.flatMap((row) => {
  const evidence = row.publicEvidenceNotes
  if (!evidence && row.listingResult !== 'not_found') return []
  return fields.map(([field, expectedFor, evidenceLabel]) => {
    const expectedValue = expectedFor(profile)
    const observedValue = valueFromEvidence(evidence, evidenceLabel)
    return { id: id('corroboration', `${row.directoryName}-${field}`), destination: row.directoryName, field, expectedValue, observedValue, sourceUrl: row.listingUrl, sourceEvidence: evidence, recordedAt: row.lastCheckedAt, confidence: row.evidenceConfidence, result: corroborationResult(expectedValue, observedValue, row, evidence), provenance: row.provenance ?? 'operator_observation', notes: '', reviewed: false }
  })
})

export const effectivePackageFit = (fix: FixItem): NonNullable<FixItem['salesPackageFit']> => {
  if (fix.salesPackageFit) return fix.salesPackageFit
  if (/owner/i.test(fix.packageFit ?? '')) return 'owner_action'
  if (/later|monthly|implementation/i.test(fix.packageFit ?? '')) return 'later'
  if (/exclude/i.test(fix.packageFit ?? '')) return 'excluded'
  return 'starter'
}
export const packageFitLabel = (fix: FixItem) => ({ starter: 'Starter', owner_action: 'Owner action', later: 'Later', excluded: 'Excluded' })[effectivePackageFit(fix)]

const salesConfidenceFor = (fix: FixItem): NonNullable<FixItem['salesConfidence']> => fix.evidenceConfidence === 'owner_confirmed' ? 'confirmed' : fix.evidenceConfidence === 'manual_needs_confirmation' || !fix.evidenceNote ? 'uncertain' : 'supported'
/** Projects existing audit fixes into bounded Packet B action metadata. */
export const classifyAuditFixForSales = (fix: FixItem): FixItem => {
  const text = `${fix.area} ${fix.issue} ${fix.fix}`.toLowerCase()
  if (/voice-search readiness fixes|voice search readiness/.test(text)) return { ...fix, area: 'Profile Management', salesPackageFit: 'excluded', sourceArea: 'profile_management', reviewed: false, salesConfidence: 'unable_to_verify', evidenceSummary: fix.evidenceNote ?? '', verificationMethod: '' }
  if (fix.status === 'pass' || /no action needed|maintain the reviewed source signals/.test(text)) return { ...fix, salesPackageFit: 'later', impact: 'low', salesEffort: 'small', reviewed: false, sourceArea: 'public_presence', verificationMethod: '' }
  if (fix.area.toLowerCase().includes('website') && (fix.status === 'fail' || fix.status === 'partial')) {
    const critical = /https|secure|certificate|connection/.test(text)
    return { ...fix, evidenceSummary: fix.evidenceNote ?? '', evidenceSources: fix.sources ? [fix.sources] : [], salesConfidence: salesConfidenceFor(fix), impact: critical ? 'high' : 'medium', salesEffort: critical ? 'medium' : 'small', salesPackageFit: 'starter', dependencies: [], verificationMethod: critical ? 'Verify a valid HTTPS response, certificate, canonical secure URL, HTTP-to-HTTPS redirect, and secure canonical/internal links.' : 'Re-check the cited website evidence after the corrective change.', sourceArea: 'website', reviewed: Boolean(fix.evidenceNote || fix.evidenceConfidence) }
  }
  return fix
}
export const isStarterEligible = (fix: FixItem) => effectivePackageFit(fix) === 'starter' && fix.reviewed === true && (fix.status === 'fail' || fix.status === 'partial') && Boolean(fix.evidenceSummary || fix.evidenceNote) && Boolean(fix.verificationMethod) && !/no action needed|voice-search readiness fixes/i.test(`${fix.issue} ${fix.fix}`)

const fitRank: Record<NonNullable<FixItem['salesPackageFit']>, number> = { starter: 0, owner_action: 1, later: 2, excluded: 3 }
const impactRank: Record<NonNullable<FixItem['impact']>, number> = { high: 0, medium: 1, low: 2 }
const confidenceRank: Record<NonNullable<FixItem['salesConfidence']>, number> = { confirmed: 0, supported: 1, uncertain: 2, unable_to_verify: 3 }
const effortRank: Record<NonNullable<FixItem['salesEffort']>, number> = { small: 0, medium: 1, large: 2 }
export const sortSalesActions = (fixes: FixItem[]) => [...fixes].sort((a, b) => {
  const compare = (x: number, y: number) => x - y
  const critical = (fix: FixItem) => fix.sourceArea === 'website' && /https|secure|certificate|connection/i.test(`${fix.issue} ${fix.fix}`) && fix.status === 'fail' ? 0 : 1
  return compare(fitRank[effectivePackageFit(a)], fitRank[effectivePackageFit(b)]) || compare(critical(a), critical(b)) || compare(impactRank[a.impact ?? 'low'], impactRank[b.impact ?? 'low']) || compare(confidenceRank[a.salesConfidence ?? 'uncertain'], confidenceRank[b.salesConfidence ?? 'uncertain']) || compare((a.dependencies ?? []).length, (b.dependencies ?? []).length) || compare(effortRank[a.salesEffort ?? 'medium'], effortRank[b.salesEffort ?? 'medium']) || a.id.localeCompare(b.id)
})

export const entityAction = (finding: EntityClarityFinding): FixItem | null => !finding.reviewed || ['Clear', 'Unable to verify'].includes(finding.result) ? null : ({ id: `entity-${finding.id}`, priority: finding.result === 'Conflicting' ? 'High' : 'Medium', area: 'Entity Clarity', issue: `${finding.dimension}: ${finding.result}`, fix: finding.operatorNotes || `Resolve the specific ${finding.dimension.toLowerCase()} gap using the cited source.`, status: finding.result === 'Conflicting' ? 'fail' : 'partial', evidenceNote: finding.sourceEvidence, sources: finding.sourceUrl, evidenceSummary: finding.sourceEvidence, evidenceSources: finding.sourceUrl ? [finding.sourceUrl] : [], salesConfidence: finding.confidence === 'owner_confirmed' ? 'confirmed' : finding.confidence === 'manual_needs_confirmation' ? 'uncertain' : 'supported', impact: 'high', salesEffort: 'small', salesPackageFit: finding.result === 'Owner confirmation needed' ? 'owner_action' : 'starter', packageFit: finding.result === 'Owner confirmation needed' ? 'Owner confirmation needed' : 'Starter Visibility Cleanup', verificationMethod: 'Re-check the cited public page and compare it with the confirmed Business Profile fact.', sourceArea: 'entity_clarity', reviewed: true })

export const questionAction = (question: CustomerQuestion): FixItem | null => !question.reviewed || question.status === 'Answered' || question.status === 'Unable to verify' ? null : ({ id: `question-${question.id}`, priority: question.status === 'Not found' ? 'High' : 'Medium', area: 'Customer Question', issue: question.question, fix: question.recommendedAction, status: question.status === 'Not found' ? 'fail' : 'partial', evidenceNote: question.supportingEvidence, sources: question.sourceUrl, evidenceSummary: question.supportingEvidence, evidenceSources: question.sourceUrl ? [question.sourceUrl] : [], salesConfidence: question.confidence === 'owner_confirmed' ? 'confirmed' : question.confidence === 'manual_needs_confirmation' ? 'uncertain' : 'supported', impact: 'high', salesEffort: 'small', salesPackageFit: question.packageFit, packageFit: question.packageFit === 'starter' ? 'Starter Visibility Cleanup' : question.packageFit === 'owner_action' ? 'Owner confirmation needed' : 'Later recommendation', verificationMethod: question.verificationMethod, sourceArea: 'customer_question', reviewed: true })
export { now }
