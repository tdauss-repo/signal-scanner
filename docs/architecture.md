# Architecture

## Document Authority

[`FOUND_LOCAL_DOCTRINE.md`](FOUND_LOCAL_DOCTRINE.md) governs product strategy,
scope, operator/customer boundaries, service design, and prioritization. This
document is the implementation Source of Truth: it records current architecture,
workflow, constraints, and operational state. When implementation conflicts
with doctrine, the conflict must be surfaced as follow-up work rather than
silently changing the doctrine.

## Overview
The current repository contains Found Local's private/internal Business Scanner
Tool, built with React, TypeScript, Vite, and a small Express API. It supports
operator-managed business profiles, bounded evidence acquisition, findings
review, customer-finding approval, package preparation, saved operational state,
and a sanitized Customer Visibility Review JSON export.

The scanner is not the external customer-presentation surface. Found Local
Sites consumes the reviewed customer-safe JSON contract and presents the
Customer Visibility Review. Scanner/provider/debug evidence remains internal.

## Current Stack
- Frontend: React 19 with TypeScript
- Build tool: Vite
- Styling: CSS with component-level styles
- Runtime: Browser-based operator client plus a small Node/Express API

## Target Architecture
The product follows a bounded handoff architecture:

1. Internal Business Scanner Tool
   - Maintains reviewed business and operational state
   - Acquires and reviews evidence
   - Promotes approved customer findings
   - Prepares packages and customer-safe exports

2. API layer
   - Supports bounded, authorized acquisition
   - Returns structured evidence without redefining finding truth

3. Customer Visibility Review / Sites
   - Receives sanitized Customer Visibility Review JSON
   - Presents strengths, confirmed issues, local relevance, and recommended work
   - Does not receive raw provider, matcher, capture, or operator-only data

4. Storage
   - Preserves saved scans and operator state
   - Keeps internal evidence separate from customer presentation data

## Suggested Frontend Structure
A future frontend structure could look like this:
- src/components: shared UI building blocks
- src/pages: top-level routes and screen-level views
- src/features: domain-specific areas such as audits, reports, and recommendations
- src/services: API communication and data transformations
- src/types: shared TypeScript models

## Data Flow
The primary operator workflow is `Business → Scan → Review → Package → Customer
Review → Verification`:

1. **Business** selects or creates an isolated workspace and keeps seed facts,
   the reviewed Business Profile, profile completeness, and Full Scan JSON
   operations together. Reviewed profile facts are the authoritative source for
   customer projection; a new workspace clears prior evidence, decisions, and
   customer wording.
2. **Scan** runs bounded acquisition and shows operational progress and evidence
   health. Acquisition failure remains neutral.
3. **Review** combines the evidence summary, candidate findings, optional
   customer-wording refinement, and explicit approve/dismiss/reopen decisions.
   Raw evidence remains immutable and detailed provider data is a Workbench
   drill-down.
4. **Package** derives scope only from explicitly approved effective customer
   findings.
5. **Customer Review** is the final operator quality gate and previews the exact
   reviewed business identity, area-specific status, findings, package, and
   sanitized version 1.0 JSON handoff.
6. **Verification** records completed outcomes only after execution and a
   follow-up check.

Found Local Sites then renders the external Customer Visibility Review. The
Workbench remains available as a secondary internal evidence/configuration
surface and Settings contains runtime configuration rather than ordinary
business workflow.

## Design Principles
- Keep the operator workflow efficient and evidence-preserving
- Keep customer presentation clear, local, and actionable
- Separate UI rendering from data collection logic
- Preserve the internal scanner / external presentation boundary
- Design for future integrations without overcomplicating the initial version
- Protect privacy and minimize unnecessary data collection

## Deployment Considerations
The internal scanner and bounded API may be operated separately from Found
Local Sites. The customer-safe JSON contract is the handoff boundary; direct
exposure of scanner state is not required.

## Evolution Path
The current scanner can evolve through stronger local-intent evidence,
remediation verification, rescanning, and later monitoring without becoming a
public self-service scanner or generic enterprise SEO platform.

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
