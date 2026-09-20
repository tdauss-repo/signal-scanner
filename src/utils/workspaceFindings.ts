import { deriveMachineFindings, machineIdentityTitle } from './machineReadability'
import type { AuditItem, AuditState } from '../types/audit'
import { buildAuditItems } from '../data/auditCatalog'
import { applyCurrentCatalogMetadata } from './catalogMetadata'
import { mergeIntelligentFindings } from './findingIntelligence'
import { buildFixPlan } from './scoring'
import { classifyAuditFixForSales } from './salesReadiness'

/** The existing Workbench evaluator, shared with scan-run accounting. */
export function workspaceFindings(state: AuditState, items: AuditItem[] = buildAuditItems(state.profile, state.businessProfile).map(applyCurrentCatalogMetadata)) {
  const machine = deriveMachineFindings(state)
  const latest = state.websiteAudit.latestAttempt
  const robotsNeedsVerification = latest?.ok && latest.machineReadabilityCapture?.robots.status === 406
  const specificEntityFinding = machine.some((fix) => ['missing_business_entity', 'incomplete_business_identity', 'location_not_represented'].includes(fix.intelligence?.condition || ''))
  return mergeIntelligentFindings(state, [
    ...buildFixPlan(items.filter((item) => item.area !== 'ai' && !item.id.startsWith('voice-prompt-')), state.checks)
      .map((fix) => ({ ...fix, evidenceNote: state.notes[fix.id], evidenceConfidence: state.evidenceConfidence[fix.id] }))
      .map(classifyAuditFixForSales)
      .map((fix) => {
        if (fix.id === 'website-schema') return { ...fix, issue: machineIdentityTitle }
        if (fix.id === 'website-homepage-clarity') return { ...fix, salesPackageFit: 'later' as const, reviewed: false }
        if (fix.id === 'website-sitemap-robots' && robotsNeedsVerification) return { ...fix, salesPackageFit: 'later' as const, reviewed: false, verificationMethod: '',
          evidenceSummary: `${fix.evidenceSummary || ''} Robots.txt returned HTTP 406; targeted acquisition/crawler verification is required. This does not establish that ordinary search crawlers are blocked.` }
        return fix
      })
      .filter((fix) => !(specificEntityFinding && fix.id === 'website-schema')),
    ...state.manualFixes,
    ...machine,
  ])
}
