import express from 'express'
import type { ErrorRequestHandler } from 'express'
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
