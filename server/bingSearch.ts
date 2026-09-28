import type { AcquisitionResult } from '../src/types/acquisition.ts'
import { checkPublicDns, publicUrl } from './acquisition.ts'
import { fetchPage } from './pageTransport.ts'

export interface BingSearchTransportResult {
  status: number
  finalUrl: string
  body: string
}

export interface BingSearchAcquisitionOptions {
  verifyDns?: (url: URL) => Promise<void>
  transport?: (url: URL, signal: AbortSignal) => Promise<BingSearchTransportResult>
  timeoutMs?: number
}

const bingHost = (value: string) => value.replace(/^www\./, '').toLowerCase() === 'bing.com'
const resultRegion = (html: string) => /<(?:main)\b|\bid=["']b_results["']|\bclass=["'][^"']*\bb_algo\b/i.test(html)
const blockedPage = (status: number, html: string) => [401, 403, 429].includes(status) ||
  /<title[^>]*>[^<]*(?:access denied|verify you are human|unusual traffic|captcha)/i.test(html)

const defaultTransport = async (url: URL, signal: AbortSignal): Promise<BingSearchTransportResult> => {
  const { response, body } = await fetchPage(url, 'GET', {
    'user-agent': 'Mozilla/5.0 (compatible; FoundLocalEvidence/1.0)',
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'en-US,en;q=0.9',
  }, signal, 1_000_000, 'manual')
  return { status: response.status, finalUrl: response.url || url.href, body }
}

const failureBlocker = (error: unknown) => {
  const detail = `${error instanceof Error ? error.name : ''} ${error instanceof Error ? error.message : String(error)}`
  if (/timeout|aborted/i.test(detail)) return 'provider_timeout'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network_failure'
  return 'acquisition_failure'
}

/**
 * One bounded, read-only Bing HTML request. It does not follow redirects,
 * execute scripts, maintain a browser profile, or bypass access controls.
 */
export async function acquireBingSearch(value: string, options: BingSearchAcquisitionOptions = {}): Promise<AcquisitionResult> {
  const acquiredAt = new Date().toISOString()
  const base: AcquisitionResult = {
    version: 1,
    requestedUrl: value,
    acquiredAt,
    provider: 'bing-native-fetch',
    checkedDestination: 'Bing Search',
    method: 'server_fetch',
    outcome: 'failed',
    confidence: 'unavailable',
    resultRegionInspected: false,
    notes: [],
  }
  try {
    const url = publicUrl(value)
    if (!bingHost(url.hostname) || url.pathname !== '/search' || !url.searchParams.get('q')?.trim()) {
      throw new Error('Bing acquisition requires a clean Bing Search query URL.')
    }
    await (options.verifyDns || checkPublicDns)(url)
    const result = await (options.transport || defaultTransport)(url, AbortSignal.timeout(options.timeoutMs ?? 12_000))
    const final = publicUrl(result.finalUrl)
    if (!bingHost(final.hostname)) return {
      ...base,
      finalUrl: result.finalUrl,
      statusCode: result.status,
      blocker: 'redirect_not_allowed',
      error: 'Bing redirected outside the approved search host.',
      notes: ['The redirected target was not acquired. This is not evidence that the business is absent.'],
    }
    if (blockedPage(result.status, result.body)) return {
      ...base,
      finalUrl: final.href,
      statusCode: result.status,
      outcome: 'blocked',
      blocker: 'access_blocked',
      error: 'Bing restricted the bounded public request.',
      notes: ['No challenge bypass was attempted. This is not evidence that the business is absent.'],
    }
    if (result.status < 200 || result.status >= 300) return {
      ...base,
      finalUrl: final.href,
      statusCode: result.status,
      blocker: result.status >= 500 ? 'http_5xx' : 'http_error',
      error: `Bing returned HTTP ${result.status}.`,
      notes: ['The request did not produce usable public evidence. This is not evidence that the business is absent.'],
    }
    if (!result.body.trim()) return {
      ...base,
      finalUrl: final.href,
      statusCode: result.status,
      outcome: 'partial',
      blocker: 'missing_result_region',
      error: 'Bing returned an empty response.',
      notes: ['No usable result region was captured. This is not evidence that the business is absent.'],
    }
    const inspected = resultRegion(result.body)
    return {
      ...base,
      finalUrl: final.href,
      acquiredAt: new Date().toISOString(),
      statusCode: result.status,
      outcome: inspected ? 'success' : 'partial',
      confidence: 'captured',
      html: result.body,
      resultRegionInspected: inspected,
      blocker: inspected ? 'none' : 'missing_result_region',
      notes: inspected ? ['Bounded Bing public result region captured.'] : ['HTML was captured, but a standard Bing result region was not established. Assisted verification remains available.'],
    }
  } catch (error) {
    const blocker = failureBlocker(error)
    return {
      ...base,
      blocker,
      error: error instanceof Error ? error.message : String(error),
      notes: ['Bing native acquisition could not complete. This is not evidence that the business is absent.'],
    }
  }
}
