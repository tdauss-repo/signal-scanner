# Architecture

## Overview
The current repository is an initial frontend shell for Local Signal Scanner, built with React, TypeScript, and Vite. The architecture is intentionally simple at this stage and is designed to support a future split between a user-facing web app and a backend scanning service.

## Current Stack
- Frontend: React 19 with TypeScript
- Build tool: Vite
- Styling: CSS with component-level styles
- Runtime: Browser-based client app

## Target Architecture
The product will eventually follow a layered architecture:

1. Frontend application
   - Renders the audit experience
   - Collects business inputs
   - Displays reports and recommendations

2. API layer
   - Accepts scan requests
   - Orchestrates data collection and enrichment
   - Returns structured audit results

3. Data and integration services
   - Website crawlers
   - Listing and review data providers
   - Search and SEO signal sources
   - Optional AI summarization or recommendation services

4. Storage
   - User sessions and saved audits
   - Historical report snapshots
   - Configuration for integrations and preferences

## Suggested Frontend Structure
A future frontend structure could look like this:
- src/components: shared UI building blocks
- src/pages: top-level routes and screen-level views
- src/features: domain-specific areas such as audits, reports, and recommendations
- src/services: API communication and data transformations
- src/types: shared TypeScript models

## Data Flow
A typical audit flow would be:
1. User submits a business or website input.
2. The frontend sends the request to the API layer.
3. The backend gathers signals from multiple sources.
4. The system normalizes and scores the results.
5. The frontend renders a report with insights and recommended actions.

## Design Principles
- Keep the user experience simple and guided
- Make reports clear and actionable
- Separate UI rendering from data collection logic
- Design for future integrations without overcomplicating the initial version
- Protect privacy and minimize unnecessary data collection

## Deployment Considerations
The frontend can be deployed as a static site, while the scan engine and API services can be hosted separately as needed. This separation supports future scaling and easier maintenance.

## Evolution Path
The current app is the foundation for a more complete product. Over time, the architecture can evolve from a single-page frontend into a connected experience with background scanning, saved reports, and richer integrations.

## Proving Run Records

### 001 - Website Evidence Acquisition and Provenance
Baseline commit: `947bb83` (`Preserve validated Found Local audit and evidence updates`)

Final commit: `fd86f70` (`Add website evidence provenance contract`)

Task selected: add a persisted website acquisition/provenance contract across automated server fetches and manual operator observations, without changing existing website scoring or customer-facing finding logic.

Problem solved: Found Local previously interpreted website evidence without a durable record of how that evidence was acquired. Proving Run 001 added an additive acquisition record that can distinguish captured evidence from legacy-reconstructed state and prevents absent acquisition facts from being presented as captured facts.

Implemented contract: `WebsiteAcquisitionProvenance` records provider, acquisition method, outcome, requested URL when known, source/final URL when known, occurrence timestamp, bounded attempt summary, capture version, and record origin. Current methods are `server_fetch` and `operator_observation`, with `rendered_browser` reserved for a future acquisition source returning the same contract.

Behavior intentionally preserved: server-side homepage acquisition still owns URL normalization, protocol fallback, `www`/non-`www` fallback, path/trailing-slash handling, request/header strategy retries, redirect handling, meaningful failure selection, website SEO extraction, blocked/unavailable acquisition handling, and last-successful preservation. Interpretation remains in `mapAutoAuditToWebsiteChecks()` and `analyzeManualWebsiteObservation()`, and provenance does not influence scoring.

Corrections after review: manual operator evidence now records `recordedAt` rather than implying the original browser observation time; editing analyzed manual evidence clears prior provenance and analysis timestamps until Analyze is run again; legacy automated-result normalization now rejects malformed automated records instead of casting them into valid audit results.

Validation result: `npm.cmd run test:proving-001` and `npm.cmd run build` passed. `npm.cmd run lint` remains blocked only by known baseline issues in `DirectoryAuditPanel.tsx` and `ReportView.tsx`. `git diff --check` reported only line-ending warnings, not whitespace errors.

Adjacent backlog: SSRF hardening is tracked as future security work before expanding server-side acquisition beyond the current authorized homepage scan.

Resulting architecture: future acquisition providers can fit by returning the same `WebsiteAuditResponse` shape with truthful `WebsiteAcquisitionProvenance`, allowing acquisition to evolve without creating a separate interpretation or scoring path.
