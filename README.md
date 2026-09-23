# Business Scanner Tool

Business Scanner Tool v02 is Found Local's private/internal operator system for preparing local visibility work. Operators can enter a business profile, run available checks and guided scans, review evidence, approve customer findings, prepare a bounded package, and export a sanitized Customer Visibility Review JSON payload.

The Business Scanner Tool is not the polished customer-presentation surface. The current handoff is: reviewed scanner state → customer-safe JSON → Found Local Sites → customer presentation and sales conversation.

## Document Authority

- [`docs/FOUND_LOCAL_DOCTRINE.md`](docs/FOUND_LOCAL_DOCTRINE.md) governs product strategy, scope, boundaries, service design, and prioritization.
- [`docs/architecture.md`](docs/architecture.md) is the current implementation Source of Truth for architecture, workflow, constraints, and operational state.

If implementation drifts from the doctrine, record and address the conflict; do not change the doctrine silently to match implementation.

The app keeps third-party platform checks manual with generated evidence links. It does not scrape Google, Apple, Bing, Yelp, Facebook, Instagram, ChatGPT, Gemini, Claude, Perplexity, Copilot, or Grok.

## What Runs Locally

- React + TypeScript frontend with localStorage persistence
- Small Node/Express API for an authorized customer website scan
- One backend endpoint: `POST /api/audit-website`

The website auto-audit fetches only the business website URL entered in the intake form. It analyzes the homepage only and checks signals such as title, meta description, headings, visible text, phone matches, service phrases, service-area phrases, JSON-LD schema, FAQ indicators, contact links, social links, sitemap.xml, and robots.txt.

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
