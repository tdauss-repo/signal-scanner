import assert from 'node:assert/strict'
import { auditWebsite, buildWebsiteUrlVariants } from '../server/websiteAudit.ts'

const baseRequest = {
  businessName: 'Example Business',
  phone: '419-555-1212',
  services: ['preschool'],
  serviceAreas: ['Southgate'],
}

const originalFetch = globalThis.fetch
const originalInfo = console.info
console.info = () => undefined

const fetchError = (code: string, message: string) =>
  Object.assign(new TypeError('fetch failed'), {
    cause: { code, message },
  })

try {
  const explicitHttp = buildWebsiteUrlVariants('http://montessoridownriver.com')
    .map((url) => url.toString())
  assert.equal(explicitHttp[0], 'http://montessoridownriver.com/')
  assert(explicitHttp.includes('https://montessoridownriver.com/'))
  assert(explicitHttp.includes('http://www.montessoridownriver.com/'))
  assert(explicitHttp.includes('https://www.montessoridownriver.com/'))

  const bareDomain = buildWebsiteUrlVariants('montessoridownriver.com')
    .map((url) => url.toString())
  assert.equal(bareDomain[0], 'https://montessoridownriver.com/')
  assert(bareDomain.includes('http://montessoridownriver.com/'))

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (init?.method === 'HEAD') return new Response('', { status: 404 })
    if (url.startsWith('https://legacy.example')) {
      throw fetchError('ENOTFOUND', 'getaddrinfo ENOTFOUND legacy.example')
    }
    if (url.startsWith('http://legacy.example')) {
      return new Response(
        '<html><head><title>Example Business</title></head><body>Example Business preschool Southgate 419-555-1212</body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      )
    }
    return new Response('', { status: 404 })
  }

  const legacyResult = await auditWebsite({
    ...baseRequest,
    website: 'legacy.example',
  })
  assert.equal(legacyResult.ok, true)
  if (legacyResult.ok) {
    assert.equal(legacyResult.fetchedUrl, 'http://legacy.example/')
    assert.equal(legacyResult.title, 'Example Business')
    assert.equal(legacyResult.homepageStatus, 200)
    assert.equal(legacyResult.httpsAvailable, false)
    assert.equal(legacyResult.httpAvailable, true)
    assert.equal(legacyResult.httpRedirectsToHttps, false)
  }


  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.startsWith('http://secure.example')) {
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    if (url.startsWith('https://secure.example')) {
      return new Response(
        '<html><head><title>Example Business</title></head><body>Example Business preschool Southgate</body></html>',
        { status: 200 },
      )
    }
    return new Response('', { status: 404 })
  }
  const secureResult = await auditWebsite({
    ...baseRequest,
    website: 'https://secure.example',
  })
  assert.equal(secureResult.ok, true)
  if (secureResult.ok) {
    assert.equal(secureResult.httpsAvailable, true)
    assert.equal(secureResult.httpAvailable, true)
  }


  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.startsWith('https://www.www-only.example') || url.startsWith('http://www.www-only.example')) {
      return new Response(
        '<html><head><title>Example Business</title></head><body>Example Business preschool Southgate</body></html>',
        { status: 200 },
      )
    }
    throw fetchError('ENOTFOUND', 'getaddrinfo ENOTFOUND www-only.example')
  }
  const wwwFallbackResult = await auditWebsite({
    ...baseRequest,
    website: 'www-only.example',
  })
  assert.equal(wwwFallbackResult.ok, true)
  if (wwwFallbackResult.ok) {
    assert.match(wwwFallbackResult.fetchedUrl, /:\/\/www\.www-only\.example\//)
  }

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.startsWith('https://mixed.example')) {
      return new Response('Forbidden', { status: 403, statusText: 'Forbidden' })
    }
    throw fetchError('ENOTFOUND', 'getaddrinfo ENOTFOUND alternate-host')
  }
  const mixedFailureResult = await auditWebsite({
    ...baseRequest,
    website: 'mixed.example',
  })
  assert.equal(mixedFailureResult.ok, false)
  if (!mixedFailureResult.ok) {
    assert.equal(mixedFailureResult.errorType, 'http_forbidden')
    assert.equal(mixedFailureResult.blocked, true)
  }

  globalThis.fetch = async () => new Response('Forbidden', { status: 403, statusText: 'Forbidden' })
  const forbiddenResult = await auditWebsite({
    ...baseRequest,
    website: 'https://blocked.example',
  })
  assert.equal(forbiddenResult.ok, false)
  if (!forbiddenResult.ok) {
    assert.equal(forbiddenResult.errorType, 'http_forbidden')
    assert.equal(forbiddenResult.blocked, true)
    assert.equal(forbiddenResult.error, 'Automated homepage access blocked')
    assert.equal(forbiddenResult.protocolFallbackTried, true)
    assert.equal(forbiddenResult.wwwFallbackTried, true)
  }

  globalThis.fetch = async () => {
    throw fetchError('ENOTFOUND', 'getaddrinfo ENOTFOUND missing.example')
  }
  const dnsResult = await auditWebsite({
    ...baseRequest,
    website: 'missing.example',
  })
  assert.equal(dnsResult.ok, false)
  if (!dnsResult.ok) {
    assert.equal(dnsResult.errorType, 'dns_resolution')
    assert.equal(dnsResult.blocked, false)
    assert.equal(dnsResult.error, 'Website hostname could not be resolved')
    assert.match(dnsResult.recommendedNextStep, /could not resolve/i)
  }



  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (init?.method === 'HEAD') return new Response('', { status: 404 })
    if (url.startsWith('https://links.example')) {
      return new Response(
        `<html><body>
          <nav>
            <a href="/contact-us">Contact Us</a>
            <a href="/registration">Registration</a>
          </nav>
          <a href="tel:4195551212">Call now</a>
          <a href="https://www.cpsc.gov/Recalls?tabset=on&search_combined_fields=example">Safety recall information</a>
          <a href="https://external.example/path?callback=1">External callback parameter</a>
        </body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      )
    }
    return new Response('', { status: 404 })
  }
  const linkResult = await auditWebsite({ ...baseRequest, website: 'https://links.example' })
  assert.equal(linkResult.ok, true)
  if (linkResult.ok) {
    assert.equal(linkResult.hasContactLink, true)
    assert(linkResult.contactLinks.some((url) => url.endsWith('/contact-us')))
    assert(linkResult.contactLinks.some((url) => url.endsWith('/registration')))
    assert(linkResult.contactLinks.some((url) => url.startsWith('tel:')))
    assert(!linkResult.contactLinks.some((url) => url.includes('cpsc.gov/Recalls')))
    assert(!linkResult.contactLinks.some((url) => url.includes('callback=1')))
    const contact = linkResult.contactLinkEvidence.find((link) => link.url.endsWith('/contact-us'))
    assert.equal(contact?.anchorText, 'Contact Us')
    assert.equal(contact?.sourceRegion, 'navigation')
    assert.equal(contact?.internal, true)
    assert(linkResult.rejectedContactCandidates.some((link) => link.url.includes('cpsc.gov/Recalls')))
    assert(linkResult.rejectedContactCandidates.some((link) => link.url.includes('callback=1')))
  }

  console.log('Website audit compatibility tests passed.')
} finally {
  globalThis.fetch = originalFetch
  console.info = originalInfo
}
