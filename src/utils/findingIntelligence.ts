import type { AuditState, FixItem } from '../types/audit'
import { findingKnowledge } from './findingKnowledge'

const host = (value: string) => {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** A reset/refusal is actionable only alongside this scan's usable HTTP homepage,
 * with the failed probe targeting its corresponding secure URL. A broad
 * connection_error alone also includes network outages and is not enough.
 */
const pairedSecureEndpoint = (httpUrl: string, httpsUrl: string, fetchedUrl: string) => {
  try {
    const http = new URL(httpUrl)
    const secure = new URL(httpsUrl)
    if (http.protocol !== 'http:' || http.href !== new URL(fetchedUrl).href || secure.protocol !== 'https:') return false
    http.protocol = 'https:'
    return http.href === secure.href
  } catch { return false }
}

/** Pure evaluation of captured evidence. Failed acquisition never proves an SEO defect.
 * A saved successful scan from another profile or a failed subsequent attempt is not current evidence.
 */
export function deriveWebsiteFindings(state: AuditState): FixItem[] {
  const result = state.websiteAudit.lastSuccessful
  const browser = state.websiteAudit.browserObservation
  const profileHost = host(state.profile.website)
  if (!profileHost) return []
  const serverCurrent = result && state.websiteAudit.latestAttempt?.ok !== false && host(result.fetchedUrl) === profileHost ? result : null
  const browserCurrent = browser?.acquisition && host(browser.sourceUrl) === profileHost ? browser : null
  if (browser && !browser.acquisition && host(browser.sourceUrl) === profileHost) return [] // pending operator edits
  const browserNewer = browserCurrent && (!serverCurrent || Date.parse(browserCurrent.capturedAt) >= Date.parse(serverCurrent.analyzedAt))
  const source = browserNewer ? { url: browserCurrent.sourceUrl, at: browserCurrent.capturedAt, acquisition: browserCurrent.acquisition!, metaDescriptions: browserCurrent.metaDescriptions }
    : serverCurrent ? { url: serverCurrent.fetchedUrl, at: serverCurrent.analyzedAt, acquisition: serverCurrent.acquisition, metaDescriptions: serverCurrent.metaDescriptions } : null
  if (!source || !source.acquisition.occurredAt || Date.parse(state.websiteAudit.manualObservation.analyzedAt) > Date.parse(source.at)) return []
  const descriptions = Array.isArray(source.metaDescriptions) && source.metaDescriptions.every((text) => typeof text === 'string') ? source.metaDescriptions : undefined
  const found: FixItem[] = []
  const add = (rule: keyof typeof findingKnowledge, checkId: string, observations: string[], condition: string) => {
    const guidance = structuredClone(findingKnowledge[rule])
    guidance.customer.evidenceSummary = observations.join(' ')
    if (rule === 'duplicateDescription' && descriptions?.some((text) => /just another wordpress site/i.test(text))) {
      guidance.customer.found += ' One contains the default “Just another WordPress site” text.'
    }
    found.push({
      id: `finding-${checkId}`, priority: rule === 'secureConnection' ? 'High' : 'Medium',
      area: 'Website', status: 'fail', issue: guidance.customer.title, fix: guidance.customer.recommendation,
      whyItMatters: guidance.customer.why, evidenceNote: observations.join('\n'), evidenceSummary: observations.join('\n'),
      evidenceSources: [source.url], evidenceConfidence: 'scanner_detected_public_page', salesConfidence: 'supported',
      sourceArea: 'website', salesPackageFit: guidance.delivery.scope,
      verificationMethod: guidance.verification.method, dependencies: guidance.delivery.dependencies,
      reviewed: false,
      intelligence: { ruleVersion: 1, checkId, condition,
        evidence: { provenance: rule === 'secureConnection' ? serverCurrent!.acquisition : source.acquisition, observations, confidence: 'supported' },
        ...guidance, lifecycle: 'Evidence captured' },
    })
  }
  // A newer rendered observation can contradict earlier transport results. Re-probe,
  // rather than carry an old TLS finding into the new observation's presentation.
  const transport = !browserNewer ? serverCurrent?.transportEvidence : undefined
  if (transport?.http.available) {
    const secure = transport.https
    // TLS validation failure is an observation from this runtime, not an asserted root cause.
    // DNS, timeout, 403/429/challenge or generic fetch failures remain acquisition unknowns.
    if (secure.errorType === 'tls_certificate') {
      add('secureConnection', 'website-https', ['HTTP returned usable content.', 'The HTTPS certificate could not be validated by the scanner; independent review is required.'], 'tls_validation_failed')
    } else if (!secure.available && secure.status === null && secure.errorType === 'connection_error' &&
      ['ECONNRESET', 'ECONNREFUSED'].includes(secure.errorCode || '') &&
      serverCurrent?.httpAvailable && serverCurrent.homepageStatus >= 200 && serverCurrent.homepageStatus < 300 &&
      transport.http.status !== null && transport.http.status >= 200 && transport.http.status < 300 &&
      pairedSecureEndpoint(transport.http.finalUrl, secure.finalUrl, serverCurrent.fetchedUrl)) {
      add('secureConnection', 'website-https', [
        `HTTP homepage returned usable content (HTTP ${serverCurrent.homepageStatus}): ${transport.http.finalUrl}`,
        `The corresponding HTTPS connection ${secure.errorCode === 'ECONNRESET' ? 'was reset' : 'was refused'} during the same audit (${secure.errorCode}): ${secure.finalUrl}`,
        'The cause is not established; inspect hosting/TLS and independently verify before remediation.',
      ], 'https_endpoint_connection_failed')
      found[found.length - 1].intelligence!.customer.found = 'The secure HTTPS version of the website is not currently functioning correctly in the recorded checks.'
    } else if (secure.available && !secure.errorType &&
      (!/^https:/i.test(secure.finalUrl) || !/^https:/i.test(transport.http.finalUrl))) {
      add('secureConnection', 'website-https', [`HTTP final URL: ${transport.http.finalUrl}`, `HTTPS final URL: ${secure.finalUrl}`], 'secure_redirect_not_established')
    }
  }
  if (descriptions && descriptions.length > 1) {
    add('duplicateDescription', 'website-meta-description', descriptions.map((text, i) => `Description ${i + 1}: ${text || '(empty)'}`), 'multiple_meta_descriptions')
  }
  return found
}

/** Suppress legacy recommendation duplicates for the two supported rules. Missing H1
 * has no standalone detector here; homepage context remains in the Workbench.
 */
export function mergeIntelligentFindings(state: AuditState, existing: FixItem[]) {
  const derived = deriveWebsiteFindings(state)
  return [...existing.filter((fix) => fix.id !== 'website-https' &&
    !(fix.id === 'website-meta-description' && derived.some((finding) => finding.intelligence?.checkId === fix.id))), ...derived]
}
