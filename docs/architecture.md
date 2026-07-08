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
