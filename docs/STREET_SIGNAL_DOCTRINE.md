# Street & Signal — Local for Local Doctrine

**Effective date:** 2026-10-25
**Status:** Current product and service doctrine

This document governs Street & Signal product direction, scope, operator and
customer boundaries, service design, and feature prioritization. The preserved
[`FOUND_LOCAL_DOCTRINE.md`](FOUND_LOCAL_DOCTRINE.md) records the pre-rebrand
doctrine and remains useful historical context, but this document is the
current authority.

## Identity and mission

**Business brand:** Street & Signal

**Primary tagline:** Helping local businesses get found in search, maps, and AI.

**Internal application:** Business Scanner Tool

Street & Signal helps locally operated businesses get found, understood,
trusted, and contacted in their local market. It is a service-led business that
uses software to support operator judgment and delivery. It is not a public
self-service scanner SaaS, generic agency suite, enterprise SEO platform, or
customer acquisition automation product.

The “Local for Local” principle remains authoritative. Primary customers are
independently owned, owner-operated, locally managed, single-location, and small
regional businesses whose revenue depends on a defined service area or nearby
community.

## Product decision filter

Every capability must materially support at least one outcome:

1. **Found** — Can people in the relevant local market discover the business?
2. **Understood** — Do public systems correctly understand who the business is,
   what it does, and where it operates?
3. **Trusted** — Are public signals current, credible, and sufficiently aligned?
4. **Contacted** — Can a prospective customer take the appropriate next step?

Competitor features do not define the roadmap. Ranking measurements,
conversion scoring, competitor scanning, lead generation, customer acquisition,
and other new capabilities require separate strategic approval; the rebrand is
not authorization to add them.

## Established workflow and operating doctrine

The internal operator workflow is:

**Business → Scan → Review → Package → Customer Review → Verification**

The service doctrine is:

**Find → Prove → Explain → Fix → Verify**

Evidence-backed remediation and follow-up verification are central. Diagnosis
alone is not the complete service, and a proposed or performed change is not a
verified outcome until the agreed follow-up check is complete.

## Approved and proposed messaging

The approved identity consists of the Street & Signal name, primary tagline,
Business Scanner Tool product name, logo direction, and palette documented in
[`branding/branding.md`](branding/branding.md).

The following marketing language is under consideration:

- **Customer-facing positioning:** Help More Local Customers Find Your Business.
- **Customer journey:** Get Found → Build Trust → Get Contacted

This proposed language may inform future public-site and presentation work. It
is not an instruction to alter scanner logic, add required export fields, or
hardcode the language throughout the internal application.

## Product and presentation boundaries

### Street & Signal

Street & Signal owns the service relationship: visibility diagnosis,
evidence-backed recommendations, approved remediation, and verification.

### Business Scanner Tool

The Business Scanner Tool is a private internal operator application. It owns:

- reviewed business profiles and authorized scan targets;
- bounded evidence acquisition and acquisition exceptions;
- findings review, customer wording, and approval decisions;
- package scope and commercial presentation data;
- customer-safe JSON export;
- workspace persistence and reconciliation; and
- verification records.

Customers do not buy access to the scanner, and scanner state is not the public
presentation layer.

### Public website and Customer Review presentation

The public Street & Signal website and customer-facing review presentation are
separate from this scanner repository. The scanner produces reviewed
Customer Review JSON as a handoff boundary. This repository does not implement
or imply an external Lovable Customer Review JSON loader.

## Acquisition and evidence doctrine

Only a website entered by the customer or otherwise authorized may be
automatically scanned. Third-party observations must use the bounded routes,
verification thresholds, provenance, and evidence restrictions documented in
[`architecture.md`](architecture.md).

The governing rules are:

- acquisition or provider failure is never proof of absence;
- a candidate finding is not a customer finding;
- human/operator approval remains the customer-presentation gate;
- uncertainty stays visible until evidence supports a decision;
- raw captures, provider internals, matcher details, and operator notes remain
  outside customer exports; and
- completed results require execution and verification.

Brand discovery and local-intent discovery remain separate. Finding a correct
known-business identity does not prove performance for a local-intent query,
and an unresolved local-intent check does not erase valid brand evidence.

## Customer Review contract and compatibility

Customer Review exports remain JSON-driven and customer-safe. The current
contract continues to support `reviewVersion: "1.0"`.

The following compatibility boundaries are intentional:

- `confirmedIssues[].foundLocalAction` remains the legacy property name, even
  when newly generated content refers to Street & Signal;
- workspace `fileType`, `app`, and version identifiers remain stable;
- LocalStorage keys, provider IDs, finding IDs, and evidence fingerprints remain
  stable;
- historical Found Local workspace files remain importable and are not renamed
  on import;
- historical Customer Review JSON remains valid under the v1.0 contract; the
  scanner does not provide a Customer Review JSON import path;
- historical operator-authored wording is not silently rewritten; and
- `business.websitePreview.imageUrl` is optional, so exports without a website
  image remain valid.

These legacy names are contract identifiers, not current brand guidance. A
future schema migration would require explicit versioning and compatibility
planning; the brand transition does not create a new schema version.

## Customer presentation doctrine

Customer-facing output should clearly communicate:

- what is working;
- which issues are confirmed;
- why those issues matter locally;
- what Street & Signal recommends and can deliver;
- what still needs review; and
- what the next approved step is.

It must not expose raw provider or acquisition details, confidence mechanics,
debug data, unresolved evidence disputes, unapproved candidate findings, or
operator-only notes. The customer buys clarity, judgment, execution, and
verification—not scanner access.

## Service and claims boundaries

Starter Visibility Cleanup remains a bounded implementation package containing
only evidence-backed, operator-approved work. Platform ownership,
authorization, access, delivery responsibility, scope, and pricing must remain
explicit. Commercial edits do not change evidence or finding truth.

Street & Signal must not claim guaranteed rankings, guaranteed AI
recommendations, direct submission to AI systems, listing ownership without
authorization, absence when acquisition failed, remediation that has not
occurred, or success that has not been verified.

Allowed framing includes identifying supported visibility gaps, proposing
bounded cleanup, performing approved work with appropriate access, and
verifying the agreed post-change state.

## North star

The core customer question is:

> Can people around here find my business, understand what I do, trust what
> they see, and contact me—and if something is getting in the way, can Street &
> Signal prove it, fix the approved issue, and verify the result?

Implementation drift must be surfaced and corrected. It must never silently
redefine this doctrine.
