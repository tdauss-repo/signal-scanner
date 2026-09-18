import type { AcquisitionResult } from '../types/acquisition.js'
import type { WebsiteAcquisitionProvenance } from '../types/websiteAudit.js'

/** Additive adapter for existing server, browser-assisted and operator records.
 * Unknown legacy dates stay unknown; normalization does not assert a successful check.
 */
export function normalizeAcquisition(provenance: WebsiteAcquisitionProvenance, content: {
  html?: string; visibleText?: string; statusCode?: number; screenshotReference?: string
} = {}): AcquisitionResult {
  const usable = ['success', 'observed'].includes(provenance.outcome)
  return {
    version: 1, provider: provenance.provider,
    method: provenance.method === 'browser_assisted_observation' ? 'browser_assisted' : provenance.method,
    requestedUrl: provenance.requestedUrl || provenance.sourceUrl || '', finalUrl: provenance.sourceUrl,
    acquiredAt: provenance.occurredAt || '',
    outcome: provenance.outcome === 'blocked' ? 'blocked' : !usable ? 'failed' : content.html || content.visibleText ? 'success' : 'partial',
    confidence: !usable ? 'unavailable' : provenance.method === 'operator_observation' ? 'operator_supplied' : 'captured',
    notes: [`Provenance origin: ${provenance.recordOrigin}`],
    ...content,
  }
}

/** Retain multiplicity and order. Do not mistake commented examples or scripts for tags. */
export const metaDescriptionsFromHtml = (html: string): string[] => {
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  const attribute = (tag: string, name: string) => {
    const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    return match ? match[1] ?? match[2] ?? match[3] ?? '' : ''
  }
  return [...source.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .map((match) => match[0]).filter((tag) => attribute(tag, 'name').toLowerCase() === 'description')
    .map((tag) => attribute(tag, 'content'))
}
