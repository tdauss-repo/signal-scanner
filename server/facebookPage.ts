import type { AcquisitionResult } from '../src/types/acquisition.ts'
import type { BusinessResultCandidate } from '../src/types/entityMatch.ts'
import { canonicalMetaProfileUrl, classifyMetaPublicAccess } from '../src/utils/metaPublicEvidence.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { normalizeMetaProfileCandidates } from './metaProfileCandidates.ts'
import { fetchPage } from './pageTransport.ts'

export interface FacebookTransportResult {
  status: number
  finalUrl: string
  body: string
  location?: string
}

export interface FacebookAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<FacebookTransportResult>
  timeoutMs?: number
}

export const facebookRequestHeaders = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

const facebookRedirectStatuses = new Set([301, 302, 303, 307, 308])
const safeHttpsUrl = (value: unknown, base: string) => {
  try {
    const url = new URL(typeof value === 'string' ? value.trim().slice(0, 3000) : '', base)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
/** Extract only canonical/Open Graph business metadata and bounded JSON-LD. */
export function normalizeFacebookPageCandidates(html: string, sourceUrl: string, acquiredAt: string): BusinessResultCandidate[] {
  return normalizeMetaProfileCandidates(html, sourceUrl, acquiredAt, {
    platform: 'Facebook', provider: 'facebook-native-fetch', candidatePrefix: 'facebook',
  })
}

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<FacebookTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', facebookRequestHeaders, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body, location: response.headers.get('location') || undefined }
}
const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  if (/larger than/i.test(detail)) return 'response_too_large'
  return 'acquisition_failure'
}

/** One public profile request and at most one approved same-host public-profile redirect. */
export async function acquireFacebookPage(value: string, options: FacebookAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1, requestedUrl: value, acquiredAt, provider: 'facebook-native-fetch', checkedDestination: 'Facebook',
    method: 'server_fetch', outcome: 'failed', confidence: 'unavailable', resultRegionInspected: false, notes: [], requestAttempted: true,
  }
  try {
    const canonical = canonicalMetaProfileUrl('Facebook', value)
    if (!canonical) throw new Error('Facebook acquisition requires an explicit public Facebook profile URL.')
    const requested = publicUrl(canonical)
    const verifyDns = options.verifyDns || checkPublicDns
    const transport = options.transport || defaultTransport
    const timeoutMs = options.timeoutMs ?? 12_000
    await verifyDns(requested)
    let response = await transport(requested, AbortSignal.timeout(timeoutMs))
    let redirectUrl: string | undefined
    let redirectAccepted: boolean | undefined
    const initialStatusCode = response.status
    if (facebookRedirectStatuses.has(response.status)) {
      const target = response.location ? safeHttpsUrl(response.location, requested.href) : ''
      const access = target ? classifyMetaPublicAccess('Facebook', response.status, target, '') : undefined
      if (access) return { ...base, statusCode: response.status, initialStatusCode, finalUrl: target || requested.href, blocker: access, outcome: 'blocked', error: 'Facebook requires login or restricted public access.', notes: ['No login or access-control bypass was attempted. This is not evidence that the business is absent.'] }
      const approved = canonicalMetaProfileUrl('Facebook', target, requested.href)
      if (!approved) return { ...base, statusCode: response.status, initialStatusCode, redirectUrl: target || undefined, redirectAccepted: false, outcome: 'unavailable', blocker: response.location ? 'redirect_not_allowed' : 'missing_redirect_location', error: 'Facebook returned an unsupported public redirect.', notes: ['No unsafe redirect was followed.'] }
      redirectUrl = approved
      redirectAccepted = true
      await verifyDns(publicUrl(approved))
      response = await transport(publicUrl(approved), AbortSignal.timeout(timeoutMs))
      if (facebookRedirectStatuses.has(response.status)) return { ...base, initialStatusCode, statusCode: response.status, redirectUrl, redirectAccepted, finalUrl: response.finalUrl, outcome: 'unavailable', blocker: 'redirect_limit', error: 'Facebook returned a second redirect; acquisition stopped at the one-hop limit.', notes: ['No second redirect was followed.'] }
    }
    const finalUrl = response.finalUrl || redirectUrl || requested.href
    const access = classifyMetaPublicAccess('Facebook', response.status, finalUrl, response.body)
    if (access) return { ...base, initialStatusCode, statusCode: response.status, ...(redirectUrl ? { redirectUrl, redirectAccepted } : {}), finalUrl, blocker: access, outcome: 'blocked', html: response.body, error: 'Facebook requires login or restricted public access.', notes: ['No login, session, challenge, or access-control bypass was attempted. This is not evidence that the business is absent.'] }
    if (response.status < 200 || response.status >= 300) return { ...base, initialStatusCode, statusCode: response.status, ...(redirectUrl ? { redirectUrl, redirectAccepted } : {}), finalUrl, blocker: response.status >= 500 ? 'http_5xx' : 'http_error', outcome: 'unavailable', error: `Facebook returned HTTP ${response.status}.`, notes: ['This is not evidence that the business is absent.'] }
    const candidates = normalizeFacebookPageCandidates(response.body, finalUrl, acquiredAt)
    return { ...base, initialStatusCode, statusCode: response.status, ...(redirectUrl ? { redirectUrl, redirectAccepted } : {}), finalUrl,
      outcome: 'success', confidence: 'captured', html: response.body, normalizedSearchCandidates: candidates,
      resultRegionInspected: true, blocker: 'none', notes: [candidates.length
        ? 'Bounded public Facebook profile metadata was captured.'
        : 'Facebook returned a public page, but no supported structured business identity was exposed.'],
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    return { ...base, blocker, error: error instanceof Error ? error.message : String(error), notes: ['Facebook native acquisition could not complete. This is not evidence that the business is absent.'] }
  }
}
