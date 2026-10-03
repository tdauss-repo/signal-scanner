export type MetaPlatform = 'Facebook' | 'Instagram'
export type MetaAccessBlocker = 'login_required' | 'access_restricted' | 'challenge'

const safeHttpsUrl = (value: unknown, base?: string) => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.trim(), base)
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined
  } catch { return undefined }
}

/** Canonical public Meta profile URLs only. Search, auth, content and sharing routes are excluded. */
export function canonicalMetaProfileUrl(platform: MetaPlatform, value: unknown, base?: string) {
  const url = safeHttpsUrl(value, base)
  if (!url) return ''
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const expectedHost = platform === 'Facebook' ? 'facebook.com' : 'instagram.com'
  if (host !== expectedHost && host !== `m.${expectedHost}`) return ''
  const path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
  if (platform === 'Facebook') {
    if (path === '/' || /^\/(?:search|login|help|share|sharer(?:\.php)?|dialog|plugins|groups|events|marketplace|watch)(?:[/?#]|$)/i.test(path)) return ''
    if (/^\/profile\.php$/i.test(path)) {
      const id = url.searchParams.get('id')?.trim()
      return id && /^\d+$/.test(id) ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}` : ''
    }
    return `https://www.facebook.com${path}`
  }
  if (path === '/' || /^\/(?:accounts|explore|reels?|p|stories|direct)(?:[/?#]|$)/i.test(path)) return ''
  const segments = path.split('/').filter(Boolean)
  return segments.length === 1 && /^[A-Za-z0-9._]+$/.test(segments[0]) ? `https://www.instagram.com/${segments[0]}` : ''
}

export function classifyMetaPublicAccess(platform: MetaPlatform, status: number, finalUrl: string, html: string): MetaAccessBlocker | undefined {
  const page = `${finalUrl}\n${html.slice(0, 200_000)}`
  const metadata = extractMetaPublicMetadata(html)
  const publicTitle = metadata['og:title'] || ''
  const hasPublicPageIdentity = Boolean(
    publicTitle && !/^(?:facebook|instagram|meta)(?:\s*[|—-].*)?$/i.test(publicTitle) &&
    canonicalMetaProfileUrl(platform, metadata.canonical || metadata['og:url'] || '', finalUrl),
  )
  if (/\/(?:accounts\/)?(?:login|signin)(?:[/?#]|$)/i.test(finalUrl) ||
    /<form\b[^>]*action=["'][^"']*(?:login|signin)/i.test(page) ||
    (!hasPublicPageIdentity && new RegExp(`(?:log in|sign in) to ${platform}`, 'i').test(page))) return 'login_required'
  if (!hasPublicPageIdentity && (/\/(?:consent|privacy\/consent)(?:[/?#]|$)/i.test(finalUrl) ||
    /(?:before you continue|allow (?:all|essential|optional) cookies|consent required)/i.test(page))) return 'access_restricted'
  if ([401, 403, 407, 429].includes(status) || /\b(?:access denied|forbidden|request blocked)\b/i.test(page)) return 'access_restricted'
  if (/captcha|verify (?:that )?you are human|not a robot|unusual traffic|automated quer/i.test(page)) return 'challenge'
  return undefined
}

const decodeHtml = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
const attributes = (value: string) => Object.fromEntries([...value.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
  .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? '')]))

/** Bounded Open Graph/business metadata shared by public Meta-page adapters. */
export function extractMetaPublicMetadata(html: string) {
  const values: Record<string, string> = {}
  for (const match of [...html.matchAll(/<(meta|link)\b([^>]*)>/gi)].slice(0, 300)) {
    const attrs = attributes(match[2])
    const canonical = (attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')
    const key = (attrs.property || attrs.name || (canonical ? 'canonical' : '')).toLowerCase()
    const value = (attrs.content || attrs.href || '').replace(/\s+/g, ' ').trim().slice(0, 3000)
    if (key && value && !values[key]) values[key] = value
  }
  return values
}
