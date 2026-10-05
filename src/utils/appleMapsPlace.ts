export interface ApplePlaceUrlIdentity {
  canonicalUrl: string
  placeId: string
  name?: string
  address?: string
  coordinate?: string
  providerIdentifier?: string
}

const clean = (value: string | null, max = 1000) => value?.replace(/\s+/g, ' ').trim().slice(0, max) || ''

/**
 * Parse only Apple's documented public unified Maps place route. The returned
 * identity is asserted by the URL; it is not by itself a verified business.
 */
export function parseApplePlaceUrl(value: unknown, base = 'https://maps.apple.com/'): ApplePlaceUrlIdentity | undefined {
  try {
    const url = new URL(typeof value === 'string' ? value : '', base)
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'maps.apple.com' || url.pathname !== '/place' || url.username || url.password) return undefined
    const placeId = clean(url.searchParams.get('place-id') || url.searchParams.get('mapitemguid') || url.searchParams.get('id'), 300)
    if (!placeId) return undefined
    const canonical = new URL('https://maps.apple.com/place')
    canonical.searchParams.set('place-id', placeId)
    const name = clean(url.searchParams.get('name'), 300)
    const address = clean(url.searchParams.get('address'), 500)
    const coordinate = clean(url.searchParams.get('coordinate'), 100)
    const providerIdentifier = clean(url.searchParams.get('_provider') || url.searchParams.get('provider'), 100)
    if (name) canonical.searchParams.set('name', name)
    if (address) canonical.searchParams.set('address', address)
    return {
      canonicalUrl: canonical.href,
      placeId,
      ...(name ? { name } : {}),
      ...(address ? { address } : {}),
      ...(coordinate ? { coordinate } : {}),
      ...(providerIdentifier ? { providerIdentifier } : {}),
    }
  } catch {
    return undefined
  }
}

export const canonicalApplePlaceUrl = (value: unknown, base = 'https://maps.apple.com/') =>
  parseApplePlaceUrl(value, base)?.canonicalUrl || ''
