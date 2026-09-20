import type { MachineReadabilityCapture } from '../src/types/machineReadability.ts'
import { parseJsonLdBlocks } from '../src/utils/structuredEntities.ts'

const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? '')]))
export function captureMachineMetadata(html: string, sourceUrl: string, headers: Headers): Omit<MachineReadabilityCapture, 'robots'> {
  const source = html.replace(/<!--[\s\S]*?-->/g, '')
  const tags = source.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  const meta = [...tags.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map((match) => attrs(match[0]))
  const openGraph: Record<string, string[]> = {}
  for (const tag of meta) {
    const property = (tag.property || tag.name || '').toLowerCase()
    if (/^(og:|twitter:)/.test(property)) (openGraph[property] ||= []).push((tag.content || '').slice(0, 1500))
  }
  const internalLinks = [...tags.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap((match) => {
    try {
      const href = attrs(match[1]).href
      if (!href) return []
      const url = new URL(href, sourceUrl)
      return url.origin === new URL(sourceUrl).origin ? [{ url: url.href, text: decode(match[2].replace(/<[^>]*>/g, ' ')).slice(0, 200) }] : []
    } catch { return [] }
  }).slice(0, 100)
  return { version: 1, titles: [...tags.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((match) => decode(match[1])).slice(0, 20),
    canonicals: [...tags.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map((match) => attrs(match[0])).filter((tag) => tag.rel?.toLowerCase().split(/\s+/).includes('canonical')).map((tag) => tag.href || '').slice(0, 20),
    metaRobots: meta.filter((tag) => /^(robots|googlebot|bingbot)$/i.test(tag.name || '')).map((tag) => ({ agent: tag.name.toLowerCase(), content: tag.content || '' })), xRobotsTag: headers.get('x-robots-tag') || '', openGraph,
    visibleText: decode(tags.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '').replace(/<[^>]*>/g, ' ')).slice(0, 20000), internalLinks, jsonLdParseErrors: parseJsonLdBlocks(source).invalid }
}
