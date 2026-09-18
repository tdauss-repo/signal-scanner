/* global console, document, navigator, window */

(() => {
  const schema = 'found-local-browser-website-evidence'
  const limits = {
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

  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const boundedText = (value, max) => cleanText(value).slice(0, max)
  const sourceUrl = window.location.href
  const sourceHost = window.location.hostname.replace(/^www\./i, '')

  const sourceRegionFor = (element) => {
    if (element.closest('nav')) return 'navigation'
    if (element.closest('header')) return 'header'
    if (element.closest('footer')) return 'footer'
    return 'body'
  }

  const metaDescription =
    document.querySelector('meta[name="description" i]')?.getAttribute('content') || ''

  const links = Array.from(document.querySelectorAll('a[href]'))
    .slice(0, limits.linksCount)
    .map((element) => {
      const url = new URL(element.getAttribute('href') || '', sourceUrl)
      const host = url.hostname.replace(/^www\./i, '')
      return {
        url: url.toString().slice(0, limits.linkUrl),
        anchorText: boundedText(element.innerText || element.textContent || '', limits.linkAnchor),
        sourceRegion: sourceRegionFor(element),
        internal: Boolean(host && host === sourceHost),
      }
    })
    .filter((link) => /^(https?:|tel:|mailto:)/i.test(link.url))

  const payload = {
    schema,
    captureVersion: 1,
    capturedAt: new Date().toISOString(),
    sourceUrl,
    title: boundedText(document.title, limits.title),
    metaDescription: boundedText(metaDescription, limits.metaDescription),
    metaDescriptions: Array.from(document.querySelectorAll('meta[name="description" i]')).slice(0, 30)
      .map((element) => boundedText(element.getAttribute('content') || '', limits.metaDescription)),
    h1Text: Array.from(document.querySelectorAll('h1'))
      .slice(0, limits.h1TextCount)
      .map((element) => boundedText(element.innerText || element.textContent || '', limits.headingText))
      .filter(Boolean),
    h2Text: Array.from(document.querySelectorAll('h2'))
      .slice(0, limits.h2TextCount)
      .map((element) => boundedText(element.innerText || element.textContent || '', limits.headingText))
      .filter(Boolean),
    visibleText: boundedText(document.body?.innerText || '', limits.visibleText),
    links,
    jsonLdTextBlocks: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .slice(0, limits.jsonLdBlockCount)
      .map((element) => boundedText(element.textContent || '', limits.jsonLdBlockText))
      .filter(Boolean),
  }

  const json = JSON.stringify(payload, null, 2)
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).catch(() => undefined)
  }
  console.log(json)
  return json
})()
