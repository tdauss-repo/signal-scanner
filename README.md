# Business Scanner Tool

Business Scanner Tool is Street & Signal's private internal operator application
for preparing local visibility work.

**Street & Signal**
*Helping local businesses get found in search, maps, and AI.*

Its established workflow is **Business → Scan → Review → Package → Customer
Review → Verification**. Operators work in an isolated business workspace, run
available checks, review evidence, approve customer findings, prepare a bounded
package, and export a sanitized Customer Visibility Review JSON payload.

Street & Signal is a service-led business, not a public scanner SaaS. The
Business Scanner Tool is not the public website or the polished customer
presentation. The repository currently owns the reviewed customer-safe JSON
export boundary; the public Street & Signal website and customer-facing review
presentation are separate. This repository does not implement or imply an
external Lovable Customer Review JSON loader.

## Document Authority

- [`docs/STREET_SIGNAL_DOCTRINE.md`](docs/STREET_SIGNAL_DOCTRINE.md) governs current product strategy, scope, boundaries, service design, and prioritization.
- [`docs/architecture.md`](docs/architecture.md) is the current implementation Source of Truth for architecture, workflow, constraints, and operational state.
- [`docs/branding/branding.md`](docs/branding/branding.md) governs approved identity, visual language, and the distinction between approved and proposed marketing language.
- [`docs/FOUND_LOCAL_DOCTRINE.md`](docs/FOUND_LOCAL_DOCTRINE.md) is retained as a historical pre-rebrand doctrine.

If implementation drifts from the doctrine, record and address the conflict; do not change the doctrine silently to match implementation.

Automatic first-party website auditing is limited to the website entered by the
customer or otherwise authorized for scanning. Third-party destination
observations use only the bounded acquisition routes documented in the
architecture; their provider, verification, evidence, and uncertainty rules
remain in force. Acquisition failure is neutral and is never proof of absence.

## What Runs Locally

- React + TypeScript frontend with localStorage persistence
- Small Node/Express API for authorized website acquisition and bounded
  third-party observations

The website auto-audit fetches only the authorized business website URL entered
in the intake form. It analyzes the homepage and bounded supporting files and
checks signals such as title, meta description, headings, visible text, phone
matches, service phrases, service-area phrases, JSON-LD schema, FAQ indicators,
contact links, social links, sitemap.xml, and robots.txt.

## Compatibility Boundaries

Customer Review exports remain JSON-driven. Version `1.0` is supported, and
`confirmedIssues[].foundLocalAction` remains the legacy contract property even
though newly generated wording uses Street & Signal. The optional
`business.websitePreview.imageUrl` field may be absent.

Workspace envelope identifiers, LocalStorage keys, provider IDs, and evidence
fingerprints intentionally retain their established values. Legacy Found Local
workspace files remain importable regardless of filename, and historical
Customer Review JSON remains valid under the v1.0 contract. The scanner does
not import Customer Review JSON.

## Install

```cmd
npm install
```

## Local Development

The frontend runs on `http://localhost:5173`. The API backend listens on `http://localhost:5174`.

Option 1, run both in one Command Prompt:

```cmd
npm run dev:all
```

Option 2, run two Command Prompt windows from `C:\Projects\local-signal-scanner`.

Terminal 1, start the backend:

```cmd
npm run server
```

Terminal 2, start the frontend:

```cmd
npm run dev
```

Open the Vite URL shown in the frontend terminal, usually:

```text
http://localhost:5173/
```

The frontend proxies `/api` requests to the backend at `http://localhost:5174`.

Frontend API calls should use relative URLs such as `/api/audit-website`; Vite handles the local proxy during development.

## Build

```cmd
npm run build
```

## Website Auto-Audit Endpoint

```http
POST /api/audit-website
Content-Type: application/json
```

Example body:

```json
{
  "website": "https://www.jemcamera.com",
  "businessName": "JEM Photography",
  "phone": "419.410.4974",
  "services": [
    "wedding photographer",
    "senior pictures",
    "business portraits",
    "branding photography",
    "family photographer"
  ],
  "serviceAreas": [
    "Sylvania",
    "Toledo",
    "Northwest Ohio",
    "Southeast Michigan"
  ]
}
```

The endpoint uses a timeout, limits homepage HTML size, and does not crawl beyond the homepage in this version.

Success responses and error responses are returned as JSON.

If the homepage returns HTTP 403, the API treats that as a blocked automated
scan rather than an SEO failure. The frontend shows “Website blocked automated
scan — manual review required,” records the requested URL, HTTP status,
redirect URL, timestamp, and recommended next step, and leaves manual Website
SEO overrides available.
