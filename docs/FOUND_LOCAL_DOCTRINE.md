# Found Local — Local for Local Doctrine v1.0

**Effective date:** 2026-09-22

> This document governs Found Local product direction, feature prioritization,
> operator/customer boundaries, service design, and competitive evaluation.
> When older project documentation conflicts with this doctrine, this doctrine
> takes precedence.

## Mission

Found Local helps locally operated businesses get found, understood, trusted,
and contacted by customers in their local market across search, maps, and AI.

The primary tagline remains:

> Helping local businesses get found in search, maps, and AI.

Found Local is built **local for local**. Its primary customers are independently
owned, owner-operated, locally managed, single-location, and small regional
businesses whose revenue depends primarily on a defined service area or
surrounding community.

Found Local is not primarily an enterprise SEO platform, national-brand tool,
large-chain governance system, generic agency suite, or public self-service
SaaS product.

## Product decision filter

Every capability should materially support at least one of four outcomes:

1. **Found** — Can people in the business's actual local market discover it?
2. **Understood** — Do websites, search engines, maps, directories, and AI
   systems correctly understand who the business is, what it does, and where it
   operates?
3. **Trusted** — Do public signals agree enough for the business to appear
   legitimate, current, and credible?
4. **Contacted** — Once discovered, can a prospective customer easily call,
   visit, inquire, enroll, book, request a quote, or otherwise convert?

If a proposed capability does not materially improve one of these outcomes for
a locally operated business, it does not belong on the current roadmap without
explicit strategic approval.

## Product and presentation boundaries

### Found Local

Found Local is the service and business brand. It owns visibility diagnosis,
evidence-backed recommendations, remediation, verification, and future
monitoring.

### Business Scanner Tool

The Business Scanner Tool is a **private, internal operator system**. It owns:

- reviewed business profiles;
- scans and evidence acquisition;
- acquisition exceptions and uncertainty;
- findings review and customer-finding approval;
- package preparation;
- customer-safe review export; and
- saved scans and operational state.

It is not the polished external customer-presentation surface, and customers do
not buy access to the scanner.

### Customer Visibility Review / Sites

Customer Visibility Review / Sites is the external customer-facing presentation
layer. It receives sanitized Customer Visibility Review JSON and communicates:

- what is working;
- what needs attention;
- why it matters locally;
- what Found Local recommends; and
- what Found Local can fix.

It must not expose scanner, provider, acquisition, matcher, debug, or other
operator-only internals.

The current MVP handoff is:

**Business Scanner Tool → reviewed customer-safe JSON → Found Local Sites →
customer presentation and sales conversation**

The JSON contract is the boundary between internal operational truth and the
external customer presentation.

## Operating lifecycle

The current operating model is:

**Business Profile → Discover → Prove → Review → Approve → Package → Export →
Customer Visibility Review → Sell → Execute → Verify → Monitor**

This supersedes older assumptions that customer presentation should live inside
the Business Scanner Tool.

## Local discovery doctrine

Found Local keeps two discovery classes separate.

### Brand and identity discovery

Brand discovery asks whether someone who already knows the business can clearly
find the correct entity and accurate information. Examples include searches for
the business's name, such as “Montessori Center of Downriver” or “JEM
Photography.” It validates identity.

### Local-intent discovery

Local-intent discovery asks whether someone looking for the service in the
local market can discover the business. Examples include “montessori school
Southgate MI,” “family photographer Sylvania Ohio,” and “plumber Monroe MI.” It
validates commercial visibility.

Brand discovery must not be treated as proof of local-intent visibility, and
an unresolved local-intent check must not erase valid brand evidence.

## The local entity ecosystem

Found Local treats the website, search, maps and business profiles, listings and
citations, reviews and activity, structured data, and AI discovery as one
connected local entity system.

- The website establishes the canonical business story.
- Maps and business profiles establish local presence.
- Listings corroborate identity.
- Reviews and activity contribute trust.
- Structured data improves machine readability.
- AI systems synthesize public signals.

Found Local identifies where these signals are aligned, incomplete,
contradictory, or weak. It does not treat them as unrelated modules.

## Evidence and approval doctrine

Found Local does not sell assumptions. It maintains explicit separation among:

- **Verified Strength** — evidence supports that a signal is working correctly.
- **Confirmed Issue** — evidence supports a material local visibility or
  conversion gap.
- **Needs Review** — evidence is ambiguous, unavailable, blocked, incomplete,
  or insufficient.
- **Not Found** — trustworthy acquisition successfully inspected the relevant
  result region and found no sufficient business match.

The governing rules are:

- Acquisition failure is never evidence of absence.
- Provider failure is never “not found.”
- Candidate findings are not customer findings.
- Human/operator approval remains the promotion gate.
- Findings must be evidence-backed.
- Completed Results require execution and verification.
- Findings must never be auto-approved.

## Customer presentation doctrine

Customer-facing output should answer:

- How visible are you today?
- What is already working?
- What confirmed gaps matter?
- Why do they matter locally?
- What can Found Local fix?
- What is the recommended next step?

Customer-facing output must not expose provider names, acquisition internals,
raw captures, confidence mechanics, debugging data, unresolved evidence
disputes, raw candidate findings, or operator notes unless those notes are
intentionally reviewed and promoted.

The customer buys **clarity, judgment, and execution**, not scanner access.

## Service doctrine

Found Local must not become another diagnostic-only SEO dashboard. Its core
service loop is:

**Find it → Prove it → Explain it → Fix it → Verify it**

Remediation is central. Diagnosis without an evidence-backed path to action is
not the complete Found Local service.

## Starter Visibility Cleanup

Starter Visibility Cleanup is the first bounded implementation package. It may
contain only evidence-backed, operator-approved work.

Typical eligible work includes:

- HTTPS and website trust issues;
- homepage title, metadata, and search-description cleanup;
- local-business structured data;
- business identity consistency;
- service and location clarity;
- obvious, verified listing or profile corrections;
- search and maps consistency;
- AI-readable entity clarity; and
- contact and conversion-path issues.

Starter must not become a generic SEO retainer. Platform ownership, customer
authorization, access, and delivery responsibility must remain explicit.

## Competitive and roadmap doctrine

Competitor features do not define the roadmap. Evaluate external capabilities
as:

- **Core — Build**
- **Useful — Integrate or Buy**
- **Later — Monitor**
- **Outside Scope — Ignore**

The deciding question is:

> Would this materially help a locally operated business get found,
> understood, trusted, or contacted in its market?

Do not pursue enterprise dashboards, huge keyword databases, backlink
intelligence, mass AI content generation, national SEO tooling, large
multi-location governance, broad agency infrastructure, or arbitrary scores
merely because competitors offer them.

### Core now

- reviewed business profile;
- website technical and local audit;
- business identity consistency;
- branded search and Maps visibility;
- local-intent search testing;
- evidence provenance;
- operator findings review and customer approval;
- customer package and export; and
- remediation verification.

### Strengthen next

- local competitor observation;
- service and geography query testing;
- review and reputation signals;
- AI local-discovery and cited-source observation;
- business-profile completeness and consistency; and
- post-remediation rescanning.

### Later

- geo-grid Maps visibility;
- recurring monitoring and drift detection;
- scheduled reports;
- historical local-visibility trends; and
- recurring AI-visibility testing.

### Outside current strategic direction

- enterprise SEO platforms;
- generic marketing automation;
- national keyword-research suites;
- backlink-intelligence platforms;
- bulk content generation;
- ad-management platforms;
- large multi-location governance; and
- public self-service SaaS unless deliberately approved later.

## Truth and claims doctrine

Found Local must not claim guaranteed rankings, guaranteed AI recommendations,
direct submission to ChatGPT or similar systems, listing ownership without
authorization, absence when acquisition failed, remediation that has not
occurred, or success that has not been verified.

Allowed framing includes:

- public visibility gaps were identified;
- evidence supports a finding;
- Found Local can improve relevant public signals;
- Found Local can perform defined cleanup work;
- Found Local can verify completed remediation; and
- Found Local can monitor where that service is offered.

## North star

The core customer question is:

> Can people around here find my business, understand what I do, trust what
> they see, and contact me — and if something is getting in the way, can Found
> Local fix it?

The desired customer narrative is:

> Here is how your business appears locally today. Here is what is already
> working. Here are the confirmed gaps that matter. Here is why they matter.
> Here is what Found Local can fix. Here is proof after we fixed it.

This is the Local-for-Local direction. Implementation drift must be surfaced
and corrected; it must never silently redefine this doctrine.
