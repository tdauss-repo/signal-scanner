import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { discoverDirectoryCandidates } from './directoryCandidates.ts'
import type { DirectoryCandidateRequest } from './directoryCandidates.ts'
import { checkPublicDirectoryPage } from './publicPageCheck.ts'
import type { PublicPageCheckRequest } from './publicPageCheck.ts'
import { auditWebsite, WebsiteAuditError } from './websiteAudit.ts'
import type { WebsiteAuditRequest } from './websiteAudit.ts'

const app = express()
const port = Number(process.env.PORT ?? 5174)

app.use(express.json({ limit: '32kb' }))

app.post('/api/audit-website', async (request, response) => {
  try {
    const body = request.body as Partial<WebsiteAuditRequest>
    const audit = await auditWebsite({
      website: String(body.website ?? ''),
      businessName: String(body.businessName ?? ''),
      phone: String(body.phone ?? ''),
      services: Array.isArray(body.services) ? body.services.map(String) : [],
      serviceAreas: Array.isArray(body.serviceAreas)
        ? body.serviceAreas.map(String)
        : [],
    })

    response.json(audit)
  } catch (error) {
    if (error instanceof WebsiteAuditError) {
      response.status(error.statusCode).json({ error: error.message })
      return
    }

    response.status(500).json({ error: 'Website audit failed.' })
  }
})

app.post('/api/check-public-directory-page', async (request, response) => {
  try {
    const body = request.body as Partial<PublicPageCheckRequest>
    const result = await checkPublicDirectoryPage({
      listingUrl: String(body.listingUrl ?? ''),
      businessName: String(body.businessName ?? ''),
      website: String(body.website ?? ''),
      phone: String(body.phone ?? ''),
      phoneNumbers: Array.isArray(body.phoneNumbers)
        ? body.phoneNumbers.map(String)
        : [],
      contactStructureNote: String(body.contactStructureNote ?? ''),
      localMarket: String(body.localMarket ?? ''),
      serviceArea: String(body.serviceArea ?? ''),
      primaryCategory: String(body.primaryCategory ?? ''),
      secondaryCategories: String(body.secondaryCategories ?? ''),
      industryTags: String(body.industryTags ?? ''),
      primaryServices: String(body.primaryServices ?? ''),
      targetLocation: String(body.targetLocation ?? ''),
    })

    response.json(result)
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Public directory page check failed.',
    })
  }
})

app.post('/api/directory-candidates', async (request, response) => {
  try {
    const body = request.body as Partial<DirectoryCandidateRequest>
    const result = await discoverDirectoryCandidates({
      businessName: String(body.businessName ?? ''),
      websiteDomain: String(body.websiteDomain ?? ''),
      localMarket: String(body.localMarket ?? ''),
      state: String(body.state ?? ''),
      primaryCategory: String(body.primaryCategory ?? ''),
      serviceTags: Array.isArray(body.serviceTags)
        ? body.serviceTags.map(String)
        : [],
      directoryName: String(body.directoryName ?? ''),
      expectedDirectoryDomain: String(body.expectedDirectoryDomain ?? ''),
      directoryType: body.directoryType ?? 'Other',
      checkMethod: body.checkMethod ?? 'Manual verification only',
      existingDirectoryUrls: String(body.existingDirectoryUrls ?? ''),
    })

    response.json(result)
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Directory candidate lookup failed.',
    })
  }
})

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.' })
})

const jsonErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (response.headersSent) return

  if (error instanceof SyntaxError) {
    response.status(400).json({ error: 'Request body must be valid JSON.' })
    return
  }

  response.status(500).json({ error: 'API request failed.' })
}

app.use(jsonErrorHandler)

app.listen(port, () => {
  console.log(`Business Scanner Tool API listening on http://localhost:${port}`)
})
