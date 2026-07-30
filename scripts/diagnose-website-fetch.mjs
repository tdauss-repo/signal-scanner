const timeoutMs = 8000
const maxPreviewBytes = 250000

const target = process.argv[2]

if (!target) {
  console.error('Usage: npm run diagnose:website -- https://example.com')
  process.exit(1)
}

const ensureUrl = (raw) => {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const url = new URL(withProtocol)
  url.hash = ''
  return url
}

const toggleProtocol = (url) => {
  const toggled = new URL(url.toString())
  toggled.protocol = url.protocol === 'https:' ? 'http:' : 'https:'
  return toggled
}

const toggleWww = (url) => {
  const toggled = new URL(url.toString())
  toggled.hostname = /^www\./i.test(toggled.hostname)
    ? toggled.hostname.replace(/^www\./i, '')
    : `www.${toggled.hostname}`
  return toggled
}

const urlVariants = (raw) => {
  const normalized = ensureUrl(raw)
  const bases = [
    normalized,
    toggleProtocol(normalized),
    toggleWww(normalized),
    toggleProtocol(toggleWww(normalized)),
  ]
  const variants = new Set()

  for (const base of bases) {
    variants.add(base.toString())
    const alternate = new URL(base.toString())
    if (base.pathname === '' || base.pathname === '/') {
      alternate.pathname = base.pathname === '/' ? '' : '/'
    } else if (base.pathname.endsWith('/')) {
      alternate.pathname = base.pathname.replace(/\/+$/, '')
    } else {
      alternate.pathname = `${base.pathname}/`
    }
    variants.add(alternate.toString())
  }

  return [...variants]
}

const strategies = [
  {
    name: 'plain fetch',
    headers: undefined,
  },
  {
    name: 'v01 scanner headers',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'BusinessScannerTool/1.0 authorized-customer-website-audit',
    },
  },
  {
    name: 'compatible scanner browser-like headers',
    headers: {
      'user-agent': 'Mozilla/5.0 compatible LocalSignalScanner/0.1',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    },
  },
  {
    name: 'Chrome-like browser headers',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
    },
  },
]

const titleFromHtml = (html) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 160) || ''
}

const fetchPreview = async (url, strategy) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: strategy.headers,
    })

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()
    const preview = text.slice(0, maxPreviewBytes)

    return {
      strategy: strategy.name,
      requestedUrl: url,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      redirected: response.redirected,
      contentType,
      bytesRead: text.length,
      title: titleFromHtml(preview),
    }
  } catch (error) {
    return {
      strategy: strategy.name,
      requestedUrl: url,
      error: error instanceof Error ? error.message : String(error),
      causeCode: error?.cause?.code,
      causeMessage: error?.cause?.message,
    }
  } finally {
    clearTimeout(timeout)
  }
}

console.log(`Website fetch diagnostics for ${target}`)
console.log('This only tests homepage fetch strategies. It does not crawl, log in, or bypass protection.')

for (const variant of urlVariants(target)) {
  console.log(`\nURL variant: ${variant}`)
  for (const strategy of strategies) {
    const result = await fetchPreview(variant, strategy)
    if (result.error) {
      console.log(
        `- ${result.strategy}: ERROR ${result.error}${
          result.causeCode ? ` (${result.causeCode})` : ''
        }${result.causeMessage ? ` - ${result.causeMessage}` : ''}`,
      )
      continue
    }

    console.log(
      `- ${result.strategy}: ${result.status} ${result.statusText} | final ${result.finalUrl} | type ${
        result.contentType || 'n/a'
      } | title ${result.title || 'n/a'}`,
    )
  }
}
