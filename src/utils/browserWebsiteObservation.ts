import type {
  BrowserObservedLink,
  BrowserWebsiteEvidencePayload,
  BrowserWebsiteObservation,
} from '../types/websiteAudit'

export const browserWebsiteEvidencePayloadSchema =
  'found-local-browser-website-evidence'

export const browserWebsiteObservationLimits = {
  rawJsonBytes: 256 * 1024,
  sourceUrl: 2048,
  title: 300,
  metaDescription: 1000,
  visibleText: 12000,
  h1TextCount: 20,
  h2TextCount: 40,
  headingText: 300,
  linksCount: 150,
  linkUrl: 2048,
  linkAnchor: 300,
  jsonLdBlockCount: 10,
  jsonLdBlockText: 5000,
}

type BrowserWebsiteEvidenceImportResult =
  | { ok: true; payload: BrowserWebsiteEvidencePayload }
  | { ok: false; error: string }

const sourceRegions = ['header', 'navigation', 'footer', 'body'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isString = (value: unknown): value is string => typeof value === 'string'

const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim()

const textBytes = (value: string) => new TextEncoder().encode(value).byteLength

const unique = <T>(items: T[]) => [...new Set(items)]

const validIsoLikeTimestamp = (value: string) =>
  Boolean(value.trim()) && !Number.isNaN(Date.parse(value))

const validateBoundedString = (
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; error: string } => {
  if (!isString(value)) return { ok: false, error: `${field} must be a string.` }
  const cleaned = cleanText(value)
  if (cleaned.length > maxLength) {
    return { ok: false, error: `${field} exceeds the ${maxLength} character limit.` }
  }
  return { ok: true, value: cleaned }
}

const validateStringArray = (
  value: unknown,
  field: string,
  maxCount: number,
  maxLength: number,
): { ok: true; value: string[] } | { ok: false; error: string } => {
  if (!Array.isArray(value)) return { ok: false, error: `${field} must be an array.` }
  if (value.length > maxCount) {
    return { ok: false, error: `${field} exceeds the ${maxCount} item limit.` }
  }

  const normalized: string[] = []
  for (const item of value) {
    const result = validateBoundedString(item, field, maxLength)
    if (!result.ok) return result
    if (result.value) normalized.push(result.value)
  }

  return { ok: true, value: normalized }
}

const validateSourceUrl = (
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } => {
  const result = validateBoundedString(
    value,
    'sourceUrl',
    browserWebsiteObservationLimits.sourceUrl,
  )
  if (!result.ok) return result

  try {
    const url = new URL(result.value)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, error: 'sourceUrl must use http or https.' }
    }
    return { ok: true, value: url.toString() }
  } catch {
    return { ok: false, error: 'sourceUrl must be a valid URL.' }
  }
}

const validateObservedLink = (
  value: unknown,
  sourceUrl: string,
): { ok: true; value: BrowserObservedLink } | { ok: false; error: string } => {
  if (!isRecord(value)) return { ok: false, error: 'Each link must be an object.' }

  const urlResult = validateBoundedString(
    value.url,
    'link.url',
    browserWebsiteObservationLimits.linkUrl,
  )
  if (!urlResult.ok) return urlResult

  let href: string
  try {
    const url = new URL(urlResult.value, sourceUrl)
    if (!['http:', 'https:', 'tel:', 'mailto:'].includes(url.protocol)) {
      return { ok: false, error: 'link.url has an unsupported protocol.' }
    }
    href = url.toString()
  } catch {
    return { ok: false, error: 'link.url must be a valid URL.' }
  }

  const anchorResult = validateBoundedString(
    value.anchorText,
    'link.anchorText',
    browserWebsiteObservationLimits.linkAnchor,
  )
  if (!anchorResult.ok) return anchorResult

  if (!sourceRegions.includes(value.sourceRegion as BrowserObservedLink['sourceRegion'])) {
    return { ok: false, error: 'link.sourceRegion is unsupported.' }
  }
  if (typeof value.internal !== 'boolean') {
    return { ok: false, error: 'link.internal must be boolean.' }
  }

  return {
    ok: true,
    value: {
      url: href,
      anchorText: anchorResult.value,
      sourceRegion: value.sourceRegion as BrowserObservedLink['sourceRegion'],
      internal: value.internal,
    },
  }
}

const validateObservedLinks = (
  value: unknown,
  sourceUrl: string,
): { ok: true; value: BrowserObservedLink[] } | { ok: false; error: string } => {
  if (!Array.isArray(value)) return { ok: false, error: 'links must be an array.' }
  if (value.length > browserWebsiteObservationLimits.linksCount) {
    return {
      ok: false,
      error: `links exceeds the ${browserWebsiteObservationLimits.linksCount} item limit.`,
    }
  }

  const links: BrowserObservedLink[] = []
  for (const item of value) {
    const result = validateObservedLink(item, sourceUrl)
    if (!result.ok) return result
    links.push(result.value)
  }
  return { ok: true, value: links }
}

const collectSchemaTypes = (value: unknown, found = new Set<string>()) => {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, found)
    return found
  }

  if (!isRecord(value)) return found
  const type = value['@type']
  if (typeof type === 'string') found.add(type)
  if (Array.isArray(type)) {
    for (const item of type) {
      if (typeof item === 'string') found.add(item)
    }
  }

  for (const nested of Object.values(value)) {
    collectSchemaTypes(nested, found)
  }
  return found
}

const detectedSchemaTypesFor = (jsonLdTextBlocks: string[]) =>
  unique(
    jsonLdTextBlocks.flatMap((block) => {
      try {
        return [...collectSchemaTypes(JSON.parse(block))]
      } catch {
        return []
      }
    }),
  ).slice(0, 20)

const faqIndicatorsFor = (
  visibleText: string,
  h2Text: string[],
  detectedSchemaTypes: string[],
) =>
  unique([
    ...detectedSchemaTypes.filter((type) => /faq/i.test(type)),
    ...(visibleText.match(/\b(faq|frequently asked questions)\b/gi) ?? []),
    ...h2Text.filter((heading) => /\?/.test(heading)),
  ]).slice(0, 12)

const contactPathPattern =
  /(?:^|[-_/])(contact(?:-us)?|book(?:ing)?|schedule|appointment|inquir(?:e|y)|call|register|registration)(?:[-_/]|$)/i

const contactLinksFor = (links: BrowserObservedLink[]) =>
  unique(
    links
      .filter((link) => {
        if (/^(tel:|mailto:)/i.test(link.url)) return true
        try {
          const url = new URL(link.url)
          return contactPathPattern.test(url.pathname) ||
            /\b(contact(?: us)?|book(?:ing)?|schedule|appointment|inquir(?:e|y)|call|register|registration)\b/i.test(
              link.anchorText,
            )
        } catch {
          return false
        }
      })
      .map((link) => link.url),
  ).slice(0, 12)

const socialProfileLinksFor = (links: BrowserObservedLink[]) =>
  unique(
    links
      .map((link) => link.url)
      .filter((url) =>
        /facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com|x\.com|twitter\.com/i.test(
          url,
        ),
      ),
  ).slice(0, 12)

export const parseBrowserWebsiteEvidencePayload = (
  rawJson: string,
): BrowserWebsiteEvidenceImportResult => {
  if (textBytes(rawJson) > browserWebsiteObservationLimits.rawJsonBytes) {
    return { ok: false, error: 'Browser evidence payload exceeds the 256 KB limit.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return { ok: false, error: 'Browser evidence payload is not valid JSON.' }
  }

  if (!isRecord(parsed)) return { ok: false, error: 'Browser evidence payload must be an object.' }
  if (parsed.schema !== browserWebsiteEvidencePayloadSchema) {
    return { ok: false, error: 'Browser evidence payload has the wrong schema.' }
  }
  if (parsed.captureVersion !== 1) {
    return { ok: false, error: 'Browser evidence payload version is unsupported.' }
  }
  if (!isString(parsed.capturedAt) || !validIsoLikeTimestamp(parsed.capturedAt)) {
    return { ok: false, error: 'capturedAt must be a valid timestamp.' }
  }

  const sourceUrl = validateSourceUrl(parsed.sourceUrl)
  if (!sourceUrl.ok) return sourceUrl
  const title = validateBoundedString(parsed.title, 'title', browserWebsiteObservationLimits.title)
  if (!title.ok) return title
  const metaDescription = validateBoundedString(
    parsed.metaDescription,
    'metaDescription',
    browserWebsiteObservationLimits.metaDescription,
  )
  if (!metaDescription.ok) return metaDescription
  const metaDescriptions = parsed.metaDescriptions === undefined ? undefined : validateStringArray(parsed.metaDescriptions, 'metaDescriptions', 30, 1000)
  if (metaDescriptions && !metaDescriptions.ok) return metaDescriptions
  if (parsed.captureMethod !== undefined && !['rendered_browser', 'browser_assisted_observation'].includes(String(parsed.captureMethod))) return { ok: false, error: 'Unsupported captureMethod.' }
  if (parsed.captureProvider !== undefined && (typeof parsed.captureProvider !== 'string' || parsed.captureProvider.length > 100)) return { ok: false, error: 'Invalid captureProvider.' }
  const h1Text = validateStringArray(
    parsed.h1Text,
    'h1Text',
    browserWebsiteObservationLimits.h1TextCount,
    browserWebsiteObservationLimits.headingText,
  )
  if (!h1Text.ok) return h1Text
  const h2Text = validateStringArray(
    parsed.h2Text,
    'h2Text',
    browserWebsiteObservationLimits.h2TextCount,
    browserWebsiteObservationLimits.headingText,
  )
  if (!h2Text.ok) return h2Text
  const visibleText = validateBoundedString(
    parsed.visibleText,
    'visibleText',
    browserWebsiteObservationLimits.visibleText,
  )
  if (!visibleText.ok) return visibleText
  const links = validateObservedLinks(parsed.links, sourceUrl.value)
  if (!links.ok) return links
  const jsonLdTextBlocks = validateStringArray(
    parsed.jsonLdTextBlocks,
    'jsonLdTextBlocks',
    browserWebsiteObservationLimits.jsonLdBlockCount,
    browserWebsiteObservationLimits.jsonLdBlockText,
  )
  if (!jsonLdTextBlocks.ok) return jsonLdTextBlocks

  return {
    ok: true,
    payload: {
      schema: browserWebsiteEvidencePayloadSchema,
      captureVersion: 1,
      capturedAt: new Date(parsed.capturedAt).toISOString(),
      sourceUrl: sourceUrl.value,
      title: title.value,
      metaDescription: metaDescription.value,
      ...(metaDescriptions?.ok ? { metaDescriptions: metaDescriptions.value } : {}),
      ...(parsed.captureProvider ? { captureProvider: String(parsed.captureProvider) } : {}),
      ...(parsed.captureMethod ? { captureMethod: parsed.captureMethod as BrowserWebsiteEvidencePayload['captureMethod'] } : {}),
      h1Text: h1Text.value,
      h2Text: h2Text.value,
      visibleText: visibleText.value,
      links: links.value,
      jsonLdTextBlocks: jsonLdTextBlocks.value,
    },
  }
}

export const browserWebsiteObservationFromPayload = (
  payload: BrowserWebsiteEvidencePayload,
  recordedAt: string,
): BrowserWebsiteObservation => {
  const detectedSchemaTypes = detectedSchemaTypesFor(payload.jsonLdTextBlocks)
  const faqIndicators = faqIndicatorsFor(
    payload.visibleText,
    payload.h2Text,
    detectedSchemaTypes,
  )

  return {
    captureVersion: 1,
    sourceUrl: payload.sourceUrl,
    capturedAt: payload.capturedAt,
    recordedAt,
    analyzedAt: recordedAt,
    acquisition: {
      captureVersion: 1,
      provider: payload.captureProvider || 'found-local-browser-helper',
      method: payload.captureMethod || 'browser_assisted_observation',
      outcome: 'observed',
      sourceUrl: payload.sourceUrl,
      occurredAt: payload.captureMethod === 'rendered_browser' ? payload.capturedAt : recordedAt,
      recordOrigin: 'captured',
    },
    title: payload.title,
    metaDescription: payload.metaDescription,
    ...(payload.metaDescriptions ? { metaDescriptions: payload.metaDescriptions } : {}),
    h1Text: payload.h1Text,
    h2Text: payload.h2Text,
    visibleText: payload.visibleText,
    links: payload.links,
    jsonLdTextBlocks: payload.jsonLdTextBlocks,
    faqIndicators,
    detectedSchemaTypes,
    contactLinks: contactLinksFor(payload.links),
    socialProfileLinks: socialProfileLinksFor(payload.links),
  }
}

export const captureBrowserWebsiteObservationProvenance = (
  observation: BrowserWebsiteObservation,
  recordedAt: string,
): BrowserWebsiteObservation => {
  const payload: BrowserWebsiteEvidencePayload = {
    schema: browserWebsiteEvidencePayloadSchema,
    captureVersion: 1,
    capturedAt: observation.capturedAt,
    sourceUrl: observation.sourceUrl,
    title: observation.title,
    metaDescription: observation.metaDescription,
    // Editing/re-recording is operator-assisted evidence, not a fresh rendered acquisition.
    ...(observation.metaDescriptions ? { metaDescriptions: observation.metaDescriptions } : {}),
    h1Text: observation.h1Text,
    h2Text: observation.h2Text,
    visibleText: observation.visibleText,
    links: observation.links,
    jsonLdTextBlocks: observation.jsonLdTextBlocks,
  }

  return browserWebsiteObservationFromPayload(payload, recordedAt)
}

type BrowserEvidenceDraftField =
  | 'sourceUrl'
  | 'capturedAt'
  | 'title'
  | 'metaDescription'
  | 'h1Text'
  | 'h2Text'
  | 'visibleText'
  | 'links'
  | 'jsonLdTextBlocks'

export const updateBrowserWebsiteObservationDraft = (
  currentObservation: BrowserWebsiteObservation,
  updates: Partial<Pick<BrowserWebsiteObservation, BrowserEvidenceDraftField>>,
): BrowserWebsiteObservation => {
  const nextObservation = {
    ...currentObservation,
    ...updates,
  }
  const evidenceChanged = Object.keys(updates).some(
    (field) =>
      updates[field as BrowserEvidenceDraftField] !==
      currentObservation[field as BrowserEvidenceDraftField],
  )

  if (!evidenceChanged) return nextObservation

  return {
    ...nextObservation,
    // A scalar edit cannot establish how many elements the source now contains.
    ...(updates.metaDescription !== undefined ? { metaDescriptions: undefined } : {}),
    acquisition: null,
    recordedAt: '',
    analyzedAt: '',
  }
}
