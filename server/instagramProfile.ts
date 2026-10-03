import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate } from '../src/types/entityMatch.ts'
import { canonicalMetaProfileUrl, classifyMetaPublicAccess } from '../src/utils/metaPublicEvidence.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { normalizeMetaProfileCandidates } from './metaProfileCandidates.ts'
import { fetchPage } from './pageTransport.ts'

export interface InstagramTransportResult {
  status: number
  finalUrl: string
  body: string
  location?: string
}

export interface InstagramAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<InstagramTransportResult>
  timeoutMs?: number
}

export const instagramRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

const redirectStatuses = new Set([301, 302, 303, 307, 308])
const safeHttpsUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(typeof value === 'string' ? value.trim().slice(0, 3000) : '', base)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}

export function normalizeInstagramProfileCandidates(html: string, sourceUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  return normalizeMetaProfileCandidates(html, sourceUrl, acquiredAt, {
    platform: 'Instagram', provider: 'instagram-native-fetch', candidatePrefix: 'instagram',
  })
}

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<InstagramTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', instagramRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body, location: response.headers.get('location') || undefined }
}
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  if (/larger than/i.test(detail)) return 'response_too_large'
  return 'acquisition_failure'
}

/** Exactly one bounded public profile request. Redirects are classified but never followed. */
export async function acquireInstagramProfile(value: string, options: InstagramAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'instagram-native-fetch', checkedDestination: 'Instagram',
    method: 'server_fetch', outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [], requestAttempted: true,
  }
  try {
    const canonical = canonicalMetaProfileUrl('Instagram', value)
    if (!canonical) throw new Error('Instagram acquisition requires an explicit public Instagram profile URL.')
    const requested = publicUrl(canonical)
    const verifyDns = options.verifyDns || checkPublicDns
    const transport = options.transport || defaultTransport
    await verifyDns(requested)
    const response = await transport(requested, AbortSignal.timeout(options.timeoutMs ?? 12_000))
    const redirectTarget = response.location ? safeHttpsUrl(response.location, requested.href) : ''
    const finalUrl = response.finalUrl || requested.href
    if (redirectStatuses.has(response.status)) {
      const access = classifyMetaPublicAccess('Instagram', response.status, redirectTarget || finalUrl, '')
      if (access) return { ...base, initialStatusCode: response.status, statusCode: response.status, finalUrl: redirectTarget || finalUrl,
        redirectUrl: redirectTarget || undefined, redirectAccepted: false, blocker: access, outcome: 'blocked',
        error: 'Instagram requires login or restricted public access.', notes: ['No redirect, login, session, challenge, or access-control bypass was attempted. This is not evidence that the business is absent.'] }
      return { ...base, initialStatusCode: response.status, statusCode: response.status, finalUrl,
        redirectUrl: redirectTarget || undefined, redirectAccepted: false, blocker: response.location ? 'redirect_not_allowed' : 'missing_redirect_location', outcome: 'unavailable',
        error: 'Instagram returned a redirect; acquisition stopped after the single public request.', notes: ['No redirect was followed. This is not evidence that the business is absent.'] }
    }
    const access = classifyMetaPublicAccess('Instagram', response.status, finalUrl, response.body)
    if (access) return { ...base, initialStatusCode: response.status, statusCode: response.status, finalUrl, blocker: access,
      outcome: 'blocked', html: response.body, error: 'Instagram requires login or restricted public access.',
      notes: ['No login, session, challenge, or access-control bypass was attempted. This is not evidence that the business is absent.'] }
    if (response.status < 200 || response.status >= 300) return { ...base, initialStatusCode: response.status, statusCode: response.status, finalUrl,
      blocker: response.status >= 500 ? 'http_5xx' : 'http_error', outcome: 'unavailable', error: `Instagram returned HTTP ${response.status}.`,
      notes: ['This is not evidence that the business is absent.'] }
    const candidates = normalizeInstagramProfileCandidates(response.body, finalUrl, acquiredAt)
    return { ...base, initialStatusCode: response.status, statusCode: response.status, finalUrl,
      outcome: 'success', confidence: 'captured', html: response.body, normalizedSearchCandidates: candidates,
      resultRegionInspected: true, blocker: 'none', notes: [candidates.length
        ? 'Bounded public Instagram profile metadata was captured.'
        : 'Instagram returned a public page, but no supported structured business identity was exposed.'],
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    return { ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['Instagram native acquisition could not complete. This is not evidence that the business is absent.'] }
  }
}
