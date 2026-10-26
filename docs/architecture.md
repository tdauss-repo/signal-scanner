# Architecture

## Document Authority

[`STREET_SIGNAL_DOCTRINE.md`](STREET_SIGNAL_DOCTRINE.md) governs current product strategy,
scope, operator/customer boundaries, service design, and prioritization. This
document is the implementation Source of Truth: it records current architecture,
workflow, constraints, and operational state. When implementation conflicts
with doctrine, the conflict must be surfaced as follow-up work rather than
silently changing the doctrine.

[`FOUND_LOCAL_DOCTRINE.md`](FOUND_LOCAL_DOCTRINE.md) is a preserved historical
pre-rebrand reference. It is not the current naming authority.

## Overview
The current repository contains Street & Signal's private internal Business Scanner
Tool, built with React, TypeScript, Vite, and a small Express API. It supports
operator-managed business profiles, bounded evidence acquisition, findings
review, customer-finding approval, package preparation, saved operational state,
and a sanitized Customer Visibility Review JSON export.

Street & Signal is a service-led business, not a public scanner SaaS. The
scanner is not the public website or external customer-presentation surface.
It produces the reviewed customer-safe JSON handoff, while the public Street &
Signal website and customer-facing review presentation remain separate from
this repository. No external Lovable Customer Review JSON loader is implemented
or implied here. Scanner, provider, and debug evidence remains internal.

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
   - Automatically scans only customer-entered or otherwise authorized websites
   - Supports bounded third-party observations under their existing provider,
     evidence, and verification restrictions
   - Returns structured evidence without redefining finding truth

3. External Customer Review presentation
   - May receive sanitized Customer Visibility Review JSON through a separately
     implemented integration
   - Presents strengths, confirmed issues, local relevance, and recommended work
   - Does not receive raw provider, matcher, capture, or operator-only data

4. Storage
   - Uses explicit local Workspace JSON as the authoritative operator-controlled snapshot
   - Treats browser LocalStorage as best-effort convenience/cache, not a reliable durable save
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

1. **Business** presents one consolidated reviewed-business form. Seed and
   reviewed-profile provenance remain internal compatibility concepts, while a
   compact Change business control owns legacy browser-cached workspaces. `Save
   Business` confirms reviewed profile fields only; it does not silently save a
   scan. `Save Workspace` downloads the complete normalized operator snapshot,
   and `Open Workspace` validates, migrates, and restores that local JSON without
   uploading it or running acquisition. The snapshot includes the business,
   latest run and technical evidence, finding decisions and refinements, package
   scope and pricing, retained verification, and Customer Review state. Browser
   auto-save continues as a convenience; quota failure leaves memory intact and
   directs the operator to `Save Workspace` before closing or refreshing.
   Business name, website, and primary category are required to begin. Reviewed
   profile facts are authoritative for customer projection; a new workspace
   clears prior evidence, decisions, and customer wording.
2. **Scan** runs bounded acquisition and shows operational progress and evidence
   health. Each run records an explicit running/completed/completed-with-review/
   failed lifecycle, individual operations and the overall run are time-bounded,
   and unfinished checks are terminalized before Review becomes available.
   Acquisition failure remains neutral. A newly started run immediately owns an
   empty current-candidate projection, so findings from an earlier run are not
   labeled as rediscovered while acquisition is in progress. On completion the
   run records the exact candidate finding IDs supported by its evidence. Scan
   and Review counts use that set; prior decisions remain in history for the
   existing reconciliation rules: an unchanged finding keeps its prior decision,
   materially changed evidence requires reconfirmation, and an unsupported old
   finding remains historical rather than counting as a current-run finding.
3. **Review** combines the evidence summary, business-information gaps,
   verified-strength inclusion and optional customer wording, candidate
   findings, optional customer-wording refinement, and explicit
   approve/dismiss/reopen decisions. Raw evidence remains immutable and
   detailed provider data is a Workbench drill-down. Approval, dismissal, and
   customer wording are bound to a finding-scoped material-evidence identity:
   substantive observations, interpretation, reviewed business context, and
   verification remain significant, while scan timestamps, run IDs, provider
   request metadata, and unrelated findings do not. Materially refreshed
   evidence retains the previous decision as history and requires explicit
   operator reconfirmation; it is never presented as a current approval.
   Strength presentation state follows the same material-evidence boundary:
   historical workspaces include generated strengths by default, hidden
   strengths remain verified internally, and stale inclusion or wording is
   withheld from customer output until reconciled.
4. **Package** derives scope only from explicitly approved effective customer
   findings. Its existing defaults remain available until the operator assigns
   an approved finding to Starter, separate scope, customer/third-party action,
   or no proposed scope, records delivery-planning detail, and optionally
   refines the concise customer-facing Included scope label. The detailed
   customer action, displayed as `Street & Signal will`, remains owned by the
   effective Review wording and is stored under the retained
   `foundLocalAction` contract property. It is not overwritten by Package
   fields. Overrides are bound to the finding evidence identity;
   stale overrides cannot enter active package scope. Previous scope remains
   visible in a separate reconciliation queue until the current finding and
   its delivery scope are reconfirmed. Snapshot-backed decisions also keep a
   prior finding visible when it no longer appears in the latest candidate set.
   Internal scope notes stay inside the operator workspace. Operator-controlled
   package pricing is stored separately from evidence-bound scope overrides, so
   a commercial edit never changes finding truth, approval, wording, or scope
   reconciliation. `Included scope` is the concise customer-facing package
   inclusion shown under what is included. `pricingNote` is optional commercial
   or pricing context, not an alternate place to enter inclusion bullets. The
   Review `foundLocalAction`, Package `included[]`, and commercial `pricingNote`
   remain independently editable and independently projected.
5. **Customer Review** is the final operator quality gate. Its human-readable
   QA frame, copyable review text, and sanitized version 1.0 JSON are all built
   from the same customer-safe projection of reviewed identity, area-specific
   status, approved effective findings, and approved-only effective package
   scope. The version 1.0 contract keeps Starter line items in
   `recommendedPackage.included`; separate assignments use each approved
   issue's existing customer-safe package label and delivery-action fields, so
   separate work is not misrepresented as Starter scope. The retained v1.0
   `confirmedIssues[].foundLocalAction` property comes from Review while
   `recommendedPackage.included[]` comes from Package; editing either concept
   never rewrites the other. Additive optional pricing fields carry the exact operator-entered offer without changing the
   version 1.0 customer contract or requiring historical workspaces to invent a
   zero price.
6. **Verification** records completed outcomes only after execution and a
   follow-up check.

The public Street & Signal website and customer-facing review presentation are
separate implementation concerns. This repository ends at the JSON handoff and
does not contain a Lovable Customer Review loader. The Workbench remains
available as a secondary internal evidence/configuration surface. Legacy
Business Profile and Settings routes remain compatibility details and are
hidden from normal navigation.

## Compatibility Boundaries

The Street & Signal brand transition does not redefine persisted or exported
contracts:

- Customer Review `reviewVersion: "1.0"` remains supported.
- `confirmedIssues[].foundLocalAction` remains the legacy field name while its
  newly generated value may use Street & Signal wording.
- `business.websitePreview.imageUrl` is optional; exports without an image
  remain valid.
- `localPresence` is an optional additive v1.0 projection. Historical exports
  omit it and remain valid.
- Workspace envelope `fileType`, `app`, and version identifiers are preserved.
- LocalStorage keys, provider IDs, finding IDs, evidence fingerprints, approval
  identity, reconciliation, and verification behavior are preserved.
- Legacy Found Local workspaces remain importable regardless of exported
  filename. Historical Customer Review JSON remains valid under the v1.0
  contract; the scanner does not provide a Customer Review JSON import path.
- Historical operator-authored customer wording is not silently rewritten.

New Customer Review and workspace downloads use Street & Signal filenames, but
the JSON structure and compatibility identifiers remain unchanged.

## Design Principles
- Keep the operator workflow efficient and evidence-preserving
- Keep customer presentation clear, local, and actionable
- Separate UI rendering from data collection logic
- Preserve the internal scanner / external presentation boundary
- Design for future integrations without overcomplicating the initial version
- Protect privacy and minimize unnecessary data collection

## Package Pricing Model

Package pricing is operator-controlled proposal and presentation metadata. It
does not influence evidence, finding truth, approval, verification, customer
wording identity, package-scope classification, or any reconciliation
fingerprint. Prices are not global Street & Signal defaults; each workspace records
only the commercial terms the operator intentionally enters for that customer.

Internal amounts use integer cents and the bounded v1 currency `USD`. A price
has a billing type of `one_time`, `monthly`, `annual`, or `custom`. The Package
screen accepts ordinary dollar input, validates and converts it once, and uses
one shared formatter for operator and customer projections. Blank means absent,
including for recurring terms; an absent price is never rendered as `$0`.
Explicit zero remains a valid entered price.

Pricing is attached to effective package identity rather than individual
findings. Starter Visibility Cleanup has one package price regardless of how
many approved findings it includes. Active separate-scope assignments are
grouped by their concise customer package name and may each carry their own
one-time price, optional recurring price, customer-facing pricing note, and
operator-only internal note. Customer/third-party action and not-included scope
do not create a Street & Signal price. If separate scope leaves the offer, its price
does not contribute; the keyed terms may be reused if the same material package
identity is restored.

The initial project total is the sum of each effective package's explicit
one-time price, counted once per package. Recurring terms are always presented
separately and never enter that total. The total is omitted until every
effective package has an explicit one-time price, preventing a partial sum from
being presented as the complete offer.

Customer Review operator QA text and Customer Visibility Review JSON are built
from the same customer-safe projection. Version 1.0 keeps its existing fields
and adds optional package price, additional recommended work, and pricing
summary fields. Exported amounts use customer-readable dollar values and
display strings; cents storage, pricing state keys, and internal pricing notes
never cross the customer JSON boundary.

Missing pricing produces an operator warning rather than blocking Ready for
Customer Presentation. This allows Street & Signal to review or present approved
scope before commercial terms are finalized while making the omission clear.
No subscription billing, payment processing, or invoicing is part of this
model.

## Customer-safe Local Presence publication

Local Presence publication is a distinct operator approval boundary layered on
top of reviewed Business Profile identity and effective Brand Presence
verification. The initial implementation supports one `primary` location while
the optional Customer Review `localPresence.locations[]` shape permits future
multi-location exports. A current operator-reviewed or owner-confirmed business
name, street address, city, and state establish the location candidate. The
address, each verified platform presence, and each canonical profile URL remain
separate publication choices.

Publication decisions are persisted in the workspace and bound to material
location and listing evidence keys. Changed reviewed identity, changed listing
evidence, a stale verification, or a no-longer-effective positive destination
cannot inherit a prior customer-publication decision. The prior decision remains
available for operator reconciliation, while the stale detail is omitted from
Customer Review JSON. Existing approved findings may be linked only through an
explicit operator selection and are re-filtered against current effective
finding approvals during export.

The customer projection contains only a stable location ID, public label,
approved reviewed address, approved effective listing status, an independently
approved safe canonical profile URL, customer-safe source label and date, and
current approved finding IDs. Coordinates are not modeled or inferred. Raw
captures, providers, evidence fingerprints and keys, run IDs, credentials,
private notes, and raw provider payloads remain inside the scanner workspace.

## Brand Presence Evidence URL Contract

Each destination observation keeps operator navigation, acquired evidence, and
known platform identity separate:

- `verificationUrl` is the clean destination/query URL intentionally generated
  for operator verification. Google Search uses
  `https://www.google.com/search?q=<encoded reviewed business name and bounded location>`
  and never persists transient session or tracking parameters.
- `observedResultUrl` is the result destination actually returned by acquired
  evidence. It may be an ordinary business website page and is shown only in
  operator evidence/acquisition detail.
- `canonicalProfileUrl` is a genuine platform-specific business, listing, or
  entity URL. It is populated only when the acquired candidate explicitly
  identifies such a URL; an arbitrary organic result is never inferred to be a
  profile.
- `observedAt` is stored as UTC ISO-8601 and rendered in the operator/browser
  local timezone. On load, legacy timezone-less datetime values are interpreted
  as local wall-clock values and normalized to UTC without changing the time the
  operator originally entered. Unparseable legacy values are retained for
  operator review rather than assigned a guessed timezone.

Generated verification destinations, acquired result URLs, and canonical
platform profiles are separate concepts and must never be conflated. Legacy
workspaces may conservatively reconstruct observed and canonical URLs from
retained matcher evidence, but generated acquisition/query URLs never become
observed results.

## Automation-assisted Brand Presence Verification Contract

Unresolved Brand Presence observations use the existing destination record as
one evidence envelope. Automated acquisition remains unchanged inside that
record; an optional `operatorVerification` augments it with a structured
outcome (`found_correct`, `found_correction_needed`, `not_found`, or
`unable_to_determine`), `operator_verified` provenance, UTC review time,
material-evidence fingerprint, bounded mismatches, optional operator-observed
URL, and optional internal note. The comparison panel shows only current
operator-reviewed or owner-confirmed Business Profile facts.

The effective destination state follows these rules:

- conclusive automated identity evidence may remain automatically verified;
- a current operator `found_correct` result is verified by operator;
- `found_correction_needed` and `not_found` may generate Review candidates but
  never approve or package them;
- `unable_to_determine`, acquisition failure, timeout, restriction, and an
  automated no-match remain neutral;
- if reviewed identity or material destination evidence changes, the prior
  operator decision is preserved as history but becomes reconfirmation-needed.

Material reconciliation excludes run IDs, timestamps, provider identity,
transient request URLs, and capture metadata. It includes destination/query,
reviewed business identity, acquired result/profile URLs, and semantic matcher
evidence. Generated verification URLs are operator navigation, not acquired
evidence. Operator-observed URLs do not overwrite `observedResultUrl`, and are
classified as canonical profiles only when the destination-specific URL shape
supports that classification. Operator review augments rather than overwrites
raw acquisition evidence.

Automation failure is not absence. Only an explicit operator `not_found`
result is observed absence evidence. Positive operator verification enters the
existing generated-strength include/hide/refine workflow; negative outcomes
enter the existing candidate-to-approval Review workflow. The customer-safe
projection exposes only approved wording and effective strengths: fingerprints,
provider details, timestamps, operator notes, mismatch metadata, and internal
URLs remain in the scanner workspace.

Brand Presence Review maintains a presentation boundary inside the operator
workspace as well: the normal evidence disclosure is a concise projection of
decision-relevant acquisition state, observed/canonical URLs, local display
time, destination, and interpretation. It is not the raw acquisition record.
Full provider captures, request/debug metadata, and matcher evidence remain
available for diagnosis in a nested, collapsed, bounded technical disclosure.
Operator evidence summary and raw acquisition/provider evidence are distinct
presentation layers; technical data remains secondary to assisted verification.

### Google Search automatic identity verification

Google Search acquisition applies a deterministic identity decision against the
current reviewed Business Profile. Automatic verification requires at least two
independent strong matched identifier groups from business name, official
website domain, phone, or address; one must be business name or official domain.
Category and locality fragments may explain evidence but do not independently
meet the threshold. HTTP/HTTPS and `www` differences, phone punctuation, common
street suffixes, case, punctuation, spacing, and state names/abbreviations are
normalized conservatively.

Knowledge-panel, local-place, and organic candidates retain their provider
shape as provenance. Consistent representations may contribute together only
when they share an asserted identity field. A lone domain result, name-only
result, category, city, rating, or review count cannot verify identity. Any
material conflicting identifier or multiple plausible entity blocks automatic
verification and produces an explainable review-needed state.

Full-address identity comparison treats punctuation, whitespace, common US
street-suffix abbreviations, state names/abbreviations in the address tail,
optional `United States`/`USA`/`US` suffixes, and ZIP+4 versus its five-digit
base as formatting equivalents. This normalization is token-bounded and exact
after equivalence mapping: house number, street name and type, city, state, and
five-digit ZIP remain material. Formatting equivalence must not create a false
conflict, while a materially different location identity remains conflicting.

Organic document titles are not automatically business-name assertions. A
nonmatching title on the reviewed official domain (for example, an About page)
does not conflict with an otherwise matched knowledge-panel entity, and an
ordinary nearby competitor result does not contradict that entity unless it
plausibly claims the reviewed identity through a material identifier.

The objective of automated acquisition is to eliminate operator verification
when acquired evidence is sufficient. Assisted verification is a fallback for
incomplete, ambiguous, conflicting, or unavailable evidence. Generated Google
verification URLs remain navigation only, and raw acquisition candidates are
never overwritten by the identity decision. Automatically verified Google
Search evidence may generate the existing Google-only strength candidate, but
it still passes through include/hide/refine controls; matcher details and
provider metadata never enter customer JSON.

The current explicit Google assessment is authoritative for destination
presentation. A `verified` identity decision is effective only when the same
assessment records a found automatic observation, no required operator review,
and no blocker. That state takes precedence over retained compatibility fields
such as an earlier `manual_review_needed` result, operator-observation
provenance, or a stale prior verification. Conflicts take precedence over
generic review-needed states; unavailable acquisition remains neutral. Current
operator-assisted outcomes retain their existing semantics, while historical
operator records remain stored without overriding newer conclusive automation.

### Bing Search Brand Presence verification

Brand Presence destination dispatch is explicit:

| Destination | Acquisition route |
| --- | --- |
| Google Search | Dedicated Google Search acquisition |
| Google Maps | Dedicated Google Maps acquisition |
| Bing Search | Dedicated bounded native Bing acquisition |
| Apple Maps | Dedicated bounded native Apple Maps acquisition |
| DuckDuckGo | Dedicated bounded native DuckDuckGo HTML acquisition |
| Yelp | Dedicated bounded native Yelp search acquisition with optional one-profile enrichment |
| Facebook | Explicit-profile discovery, then dedicated bounded native Facebook page acquisition |
| Instagram | Explicit-profile discovery, then dedicated bounded native Instagram profile acquisition |

Bing Search Brand Presence must not fall through to generic public acquisition
or its rendered-browser fallback. Missing dedicated wiring and native Bing
failures produce one Bing-specific neutral capture instead. Native Bing work
uses a separate bounded runtime lane from the existing shared Google and
generic/browser lane, so a late or active unrelated request does not report
Bing as busy while the existing Google/generic concurrency protection remains
unchanged.

Production visibility-scan dependencies are constructed by the single
`createApplicationVisibilityScanDependencies()` composition used by `App` and
the production-composition regression test. Its production contract requires
the dedicated Bing, Apple Maps, DuckDuckGo, Yelp, Facebook, and Instagram adapters, which post to
`/api/acquire-bing-search`, `/api/acquire-apple-maps`, and
`/api/acquire-duckduckgo-search`, `/api/acquire-yelp-search`, and
`/api/acquire-facebook-page`, and `/api/acquire-instagram-profile`. The
general scan contract remains injectable for fixtures and CLI tools, but a
missing Bing adapter fails closed as `bing_acquisition_not_configured`; it can
never select generic public acquisition or rendered-browser acquisition. The
Apple Maps, DuckDuckGo, Yelp, Facebook, and Instagram adapters follow the same fail-closed composition rule
with `apple_maps_acquisition_not_configured` and
`duckduckgo_acquisition_not_configured`, and
`yelp_acquisition_not_configured`, and
`facebook_acquisition_not_configured`, and
`instagram_acquisition_not_configured`.

Bing Brand Presence is a provider-specific adapter. It starts with one bounded
native server request to the clean `bing.com/search?q=...` verification query.
The request does not execute scripts, follow an unreviewed redirect, launch a
browser, maintain a profile, or bypass an access restriction. A normal Bing
result region is normalized into the common candidate contract; transport,
HTTP, access, and missing-result-region failures retain distinct internal
blockers and remain neutral.

The native request preserves the clean reviewed-identity query while adding a
stable US-English public-result context (`cc=us`, `setlang=en-us`, and
`mkt=en-US`), an ordinary desktop user agent, and standard HTML/English accept
headers. It sends no authenticated state, copied browser cookies, transient
headers, or exact-location personalization. Provider normalization recognizes
bounded Bing local/entity scopes in addition to JSON-LD and organic result
rows, retaining asserted name, website, phone, address, category, Maps URL, and
entity identity fields without fabricating absent values. Organic extraction
remains independent and additive.

Bing may select a different public result surface for that stateless server
request than for an interactive desktop browser carrying browser/session and
locality context. The observed Montessori server response was a normal generic
SERP and contained no hidden matching local entity in the bounded result
markup; the existing local-card parser was therefore not the failing boundary.
The scanner does not copy personal cookies, spoof geolocation, or add browser
automation to force the interactive variant.

When the primary Search response is a normal result region but does not expose
a strongly aligned local identity, the adapter makes one Bing-owned consumer
Maps business search using Microsoft's documented route:
`https://www.bing.com/maps/default.aspx?ss=yp.<reviewed-query>`. The adapter
does not issue another ordinary Search query. It accepts only explicit Bing
local/business HTML or bounded structured page/bootstrap records and
normalizes their asserted name, official website, phone, address, category,
Maps URL, and entity identifier. A Bing entity identifier alone is not
verification evidence.

If that Maps response is still insufficient and exposes exactly one approved
HTTPS Bing-owned Maps/entity detail URL carrying a public entity or location
identity, the adapter may make one final detail request. It never invents that
URL, follows an external or ambiguous target, performs arbitrary crawling, or
makes more than this Search → Maps → optional detail chain. Restricted,
empty, conflicting, and insufficient responses remain neutral. The provider
adapter uses reviewed identity only to stop the bounded chain when a candidate
is clearly aligned; the unchanged shared strong matcher remains the sole
verification decision. There is no browser automation or intended manual
fallback, and no other provider's acquisition behavior is changed by this
chain.

A successfully inspected Bing Brand result region with no matching business
candidate is `review_required` with blocker `no_match`; it is neutral and is
never automatic absence evidence. Only the existing explicit operator Not
found outcome may establish Bing Brand absence for customer-review purposes.

The Bing identity decision reuses the reviewed Business Profile comparison and
normalization contract. Automatic verification requires at least two distinct
strong matched groups from business name, official domain, phone, or address;
one group must be business name or official domain, and no material conflict or
second plausible identity may exist. Result rank, snippet text, a title alone,
a domain alone, category, and third-party publisher identity are insufficient.
The acquired result URL remains observed evidence and is not promoted to a
canonical profile URL.

A verified Bing Brand result is presented as “Verified automatically,” removes
the required assisted-verification control, and may support the destination-
specific Bing Search strength through the existing include/hide/refine flow.
It does not prove Bing Maps presence, ranking, or broad search performance.
Brand Presence neutral counts and customer “Still being verified” output use
the Brand query only; unresolved Location Diagnostic or Core Local Discovery
queries remain separate and cannot override the Brand identity result.
Successful Brand Presence identity verification is separate from local-intent
discovery performance. Candidate details, matcher decisions, provider names,
blockers, and acquisition metadata remain outside customer JSON.

Bing Brand uses the shared retained Brand Presence state and the centrally
defined seven-day automatic-evidence freshness window and material reviewed-
identity fingerprint.
When a later native Bing refresh is unavailable or successfully inspects a
normal result region but produces only `review_required` / `no_match`, the
current refresh remains the current technical destination observation while a
separate, bounded workspace-level last-known-verification record may remain
effective as “Verified from recent evidence.” The retained record contains the
verified time, material name/domain/address/phone identity key, source run,
result/profile identity, compact material identity assessment, and an evidence
fingerprint. It excludes raw HTML, captures, and provider payloads. A no-match
result variant is inconclusive, not contradictory, and does not erase the
earlier verified fact or become direct verification itself. Retained evidence
is never represented as fresh.

The shared bounded record is written as soon as a Bing Brand acquisition verifies
automatically, survives normal current-workspace and Saved Scan JSON
save/reload cycles, and is reattached only as the effective customer projection
when the latest acquisition is eligible for retention. Workspace hydration is
pure and makes no Bing request. For compatible older saved workspaces,
load-time normalization may migrate the former Bing-specific record or the same
fact from a recent verified Bing assessment already present in visibility-run
history. Historical runs are a
compatibility source, not the durable retention mechanism. Migration compares
the same material reviewed name, domain, address, and phone identity rather
than full profile or review-record fingerprints, which may differ only in
category, notes, timestamps, or other non-identity metadata. A newer conflict
is a hard barrier.

Retention requires a prior successful automatic Bing acquisition with an
explicit verified identity decision, an unchanged reviewed business name,
domain, address, and phone fingerprint, and evidence within the freshness
window. A current material identity conflict, expiry, reviewed-identity
change, or explicit operator correction blocks and clears the retained positive
interpretation.
Operator-only verification is preserved under operator provenance and is never
relabeled as retained automatic evidence. While valid, retained Bing evidence
continues to support the stable Bing strength and stays outside neutral and
customer “Still being verified” counts; provider history and retention
metadata remain operator-only.

### Apple Maps Brand Presence verification

Apple Maps Brand Presence uses this deterministic acquisition order:

1. an explicit canonical Apple Place URL already surfaced by trustworthy
   automated evidence;
2. one official Apple Maps Server API search when server credentials exist;
3. the anonymous public `maps.apple.com/?q=...` reviewed-identity search; and
4. a neutral, review-required result when none exposes sufficient identity.

It runs in a dedicated native runtime lane, does not execute scripts, launch a
browser, retain session state, guess a Place ID, or bypass an access
restriction. The production anonymous-search URL and operator verification URL
use the same `brandVerificationQuery()` contract: reviewed business name plus
reviewed city and state.

Explicit-place discovery is limited to `https://maps.apple.com/place` URLs
with an asserted `place-id` (or an already-supported equivalent identity
parameter) found in a successfully acquired first-party website or an
automatically verified search/listing observation. Current direct verification
or a still-valid shared retained verification may establish the source's
trustworthiness; unverified candidates and operator-synthesized URLs do not.
The bounded discovery record stores its source, source destination/URL when
available, canonical Place URL, Place ID, explicitly asserted name, address,
coordinate/provider metadata, and a material evidence fingerprint. It never
constructs an Apple URL from a business name, coordinate, or manually copied
identifier. Canonical identity retains Place ID plus asserted name/address;
presentation-only coordinate and provider parameters remain provenance and do
not enter the canonical profile or material identity fingerprint.

Apple Maps public place resolution permits exactly one 301, 302, 303, 307, or
308 redirect when its `Location` is HTTPS, remains on `maps.apple.com`, and is
exactly a supported public `/search` or `/place` route rather than an
authentication or arbitrary Apple route. A `/search` redirect is accepted only
when its decoded `query` is materially the same as the requested reviewed-
identity query after bounded case and whitespace normalization. A missing,
external, insecure, unrelated-query, arbitrary-route, or second redirect stops
neutral.

The anonymous public sequence is search query → one approved `/search`
redirect → structured public place evidence or an explicit canonical `/place`
URL in the returned page. The `/search` redirect itself is not evidence that a
listing exists. The search response is inspected only for bounded JSON-LD,
public `application/json`, canonical/Open Graph metadata, and explicit public
place links. A `/place` URL found in that response is parsed as evidence without
a second network request, preserving the one-redirect boundary. If the search
page is only an application shell, acquisition is completed but insufficient:
the destination remains neutral and requires review rather than being labeled
unavailable.

A discovered or server-provided public `/place` target receives at most one
bounded Apple-owned request and is acquired as structured place evidence.
Public `place-id`, `name`, and `address` parameters are normalized as a local-
place candidate; `coordinate` is retained only in raw technical redirect
evidence and is excluded from the canonical profile and material fingerprint.
Place identity alone is provenance, not business-identity proof.

Apple's public search shell does not consistently expose a result Place ID or
structured place record before its application executes. The scanner inspects
redirect `Location`, canonical/Open Graph URLs, JSON-LD, public JSON bootstrap
state, preload/link targets, and explicit `/place` links, but it does not treat
Apple corporate application metadata as the searched business. When no public
Place ID or place URL is actually surfaced, none is guessed and the shell
remains neutral. When a legitimate public `/place?place-id=...` target is
surfaced by the server response, the existing single Apple-owned follow/parse
boundary applies.

The official Apple Maps Server API is the second acquisition stage after an
explicit discovered Place URL and the preferred structured path when no
explicit Place URL verifies.
When `APPLE_MAPS_SERVER_TOKEN` (or the equivalent
`APPLE_MAPS_SERVER_ACCESS_TOKEN`) is present in server process configuration,
the runtime makes one bounded `GET https://maps-api.apple.com/v1/search`
request using the reviewed name/locality query, `limitToCountries=US`,
`resultTypeFilter=Poi`, and `lang=en-US`. Returned `Place` fields—name,
formatted/structured address, telephone, URLs, category, and Place ID when
asserted—are normalized and passed to the same strong Apple identity matcher.
The bearer token is never included in capture data, browser code, local
workspace state, or customer output. Missing credentials skip this stage.
Authorization failure, an empty/malformed result, or a fast official-service
failure falls back to the existing anonymous public Maps URL path and remains
neutral when that path is only a shell. Sanitized diagnostics report discovery
source, explicit Place/ID presence, public-place and Server API attempt state,
configured/unconfigured state, returned candidate count, matched identity
fields, and final automatic decision; tokens and authorization data are never
logged.

Production token provisioning remains a server-operations responsibility.
Apple requires an Apple Developer Maps identifier and private key to sign the
server-scoped JWT and obtain/refresh a Maps access token; the private key must
remain in a server secret manager and is deliberately not accepted from or
stored in Scanner workspace data. A deployment may inject a refreshed access
token through the environment variables above. This repository does not ship
an Apple private key, sign tokens in the browser, or require Apple credentials
for normal Scanner operation.

The final public place response is optional enrichment. JSON-LD, embedded
public JSON, canonical metadata, and explicit place metadata may add asserted
phone, website, category, address, name, or canonical URL only when they refer
to the same place identity. Final HTML enrichment is additive, not mandatory:
the redirect may establish identity when its public name/address fields satisfy
the normal matcher. A sparse application shell does not erase sufficient
redirect evidence. The normalizer never fabricates absent identity data.
Apple Maps application/page-owner metadata—such as an Apple or Apple Inc.
`parentOrganization` that identifies `apple.com` rather than the searched
place—is excluded from place candidates. This exclusion is scoped to Apple
Maps host metadata and does not globally suppress businesses with “Apple” in
their names.

The existing reviewed-identity matcher is authoritative. Automatic Apple Maps
verification requires at least two strong identifier groups from name,
official domain, phone, or address; one must be name or official domain, and
no material conflict or second plausible Apple entity may exist. Matching name
plus phone or name plus address is sufficient. Name-only evidence, a map pin,
an Apple URL without matching identity, or an application shell is not.

A verified result is presented as “Verified automatically,” removes the
required assisted-verification control, and may support the Apple Maps
destination strength through the existing include/hide/refine workflow. This
proves listing presence and identity consistency only—not ownership, ranking,
completeness, or optimization quality. Provider, place-identity, matcher, and
raw acquisition details remain outside customer JSON.

Fresh Apple verification retains its canonical Place ID/profile on the normal
destination observation and in compact matcher evidence. Apple Maps is not
added to the shared seven-day retained-verification destinations by this
change; a later inconclusive Apple check therefore keeps the current Apple
behavior until that lifecycle is separately authorized.

HTTP/network failure, access restriction, and a response without supported
public place structure remain distinct neutral outcomes. When the bounded
public search resolves and returns HTTP 200 but exposes only the Apple Maps
application shell, acquisition is complete but identity evidence is
insufficient: the effective state is “Verification needed,” not unavailable or
absent. A usable Apple Maps
result with no sufficient match is `review_required` with blocker `no_match`;
it is not absence evidence. Only an explicit operator Not found result may
establish absence. Assisted verification remains the fallback for incomplete,
ambiguous, conflicting, restricted, or unavailable public evidence.

Apple Maps is a candidate for a future operator browser-assisted evidence
helper when the operator-opened rendered public page exposes place information
that is absent from bounded native HTML. That helper is outside the native
acquisition boundary and is not implemented here.

### DuckDuckGo Brand Presence verification

DuckDuckGo Brand Presence uses one bounded native request to DuckDuckGo's
public server-rendered HTML search surface. The operator verification URL stays
the clean `duckduckgo.com/?q=...` reviewed-identity query; the server uses the
same decoded business-and-locality query on `html.duckduckgo.com/html/` with a
stable US-English context. The response is bounded to one megabyte and twelve
seconds. It does not execute scripts, launch a browser, retain cookies, use
authenticated state, bypass a challenge, or fall through to rendered-browser
acquisition.

Only explicit public result-title/link rows and bounded structured business
data are normalized. Organic snippets remain evidence excerpts and are not
promoted into asserted phone, address, or identity fields. Result destinations
remain `observedResultUrl` evidence; DuckDuckGo has no canonical business
profile URL contract. Automatic verification reuses the established reviewed-
identity rule: at least two strong groups from name, official domain, phone, or
address; one must be name or official domain; and no material conflict or
second plausible entity may exist.

A normal inspected DuckDuckGo result region with no sufficient identity match
is `review_required` with blocker `no_match`. It is neutral and never automatic
absence. Transport, timeout, HTTP, challenge, and missing-result-region failures
remain separately classified and neutral. Only an explicit operator Not found
outcome can establish absence. A verified result may support the independent
DuckDuckGo strength through the existing include/hide/refine workflow, while
provider, matcher, candidate, and diagnostic metadata remain outside customer
JSON.

DuckDuckGo automatic verification participates in the shared seven-day
retained lifecycle. A later unavailable, no-match, or otherwise inconclusive
bounded HTML acquisition remains the current technical observation but does not
erase a recent trustworthy automatic verification. Material identity change,
same-entity conflict, explicit operator correction, and expiry remain hard
barriers.

### Yelp Brand Presence verification

Yelp Brand Presence uses a dedicated bounded native route rather than the
generic public-acquisition/rendered-browser ladder. The authoritative operator
and acquisition URL is `yelp.com/search` with the reviewed business name in
`find_desc` and reviewed city, state, and ZIP in `find_loc`. Production posts
that URL to `/api/acquire-yelp-search`; missing composition fails closed as
`yelp_acquisition_not_configured`. Yelp native acquisition has its own bounded
runtime lane and never launches a browser or inherits a busy generic browser
lane.

The native contract performs one public HTML search request with an ordinary
desktop user agent, US-English HTML accept headers, a twelve-second transport
limit, and a one-megabyte response limit. It sends no copied cookies,
authenticated state, private-API request, or challenge bypass. Explicit JSON-LD
business records and public `/biz/` result links may become search candidates;
ratings and review counts are non-identity metadata and are not proof.

When search evidence contains one strongly name-matching, unambiguous public
`/biz/` link but not yet enough identity fields, the runtime may make exactly
one additional HTTPS request to the exact `www.yelp.com` `/biz/<slug>` route.
No recursive profile following, login/auth redirect, external host, or rendered
fallback is permitted. Bounded business JSON-LD, canonical metadata, and
explicitly asserted fields may add name, address, phone, official website,
category, and canonical Yelp profile URL. Strong structured search-page
identity can verify without the profile request.

The shared reviewed-identity matcher remains authoritative: automatic Yelp
verification requires at least two strong groups from name, official domain,
phone, or address; one must be name or official domain, with no material
conflict or competing plausible entity. A canonical Yelp link plus name alone
is insufficient. A material identifier conflict requires review.

A normal inspected result region without a sufficient match is
`review_required` with blocker `no_match`, never automated absence. HTTP and
network failures, explicit access restriction, challenges, and unsupported
result structure retain bounded internal failure classifications and remain
neutral. Only explicit operator Not found evidence can support absence.
Verified Yelp evidence may support the destination-specific Yelp strength
through include/hide/refine controls. Profile URLs, provider/follow details,
matcher decisions, candidates, and raw acquisition evidence remain outside
customer JSON.

### Facebook Brand Presence verification

Facebook Brand Presence is profile-URL first. The Business Scanner Tool never constructs or
guesses a Facebook handle from a business name. It first looks for an explicit
public Facebook URL in the latest successful first-party website audit, then
in current automatically verified search evidence whose candidate name matches
the reviewed business. A website link proves only that the business website
links to that destination; it is discovery evidence, not proof that the current
Facebook page exists or remains identity-consistent.

An explicit discovered URL is canonicalized to an HTTPS public Facebook
profile route with tracking parameters removed, then sent to the dedicated
`/api/acquire-facebook-page` route. The `facebook-native-fetch` adapter makes
one bounded public HTML request with ordinary desktop and US-English headers,
a twelve-second timeout, and a one-megabyte response limit. It may follow at
most one approved same-host public-profile redirect. Search, login, account,
sharing, arbitrary-host, and non-HTTPS targets are rejected. It uses no copied
cookies, authenticated state, private API, challenge bypass, or rendered-
browser fallback. Missing discovery or missing production composition fails
closed and cannot enter generic acquisition.

Only bounded canonical/Open Graph business metadata and business JSON-LD are
normalized. Public name, official website, phone, address, category, and
canonical page URL are accepted only when explicitly asserted. Timelines,
comments, reviews, follower or engagement counts, and login-gated content are
outside the evidence contract. Automatic verification reuses the established
reviewed-identity threshold: at least two strong groups from name, official
domain, phone, or address; one must be name or official domain; and no material
conflict or competing plausible entity may exist. A page URL plus name alone
is insufficient.

Login walls, auth redirects, challenges, 403/access denials, and public pages
without enough structured identity remain neutral. When an explicit profile
was discovered but its current details cannot be acquired, operator UI uses
“Profile discovered — verification needed,” retains the canonical page link,
and does not create a strength or absence finding. Only an explicit operator
Not found result may establish absence. Verified Facebook evidence may support
the Facebook presence-and-identity strength through normal include/hide/refine
controls; discovery sources, URLs, provider data, matcher decisions, and raw
page evidence remain outside customer JSON.

The bounded URL canonicalizer, material explicit social-profile discovery
record, login/access classifier, and public Open Graph/business-metadata and
JSON-LD normalizer are shared Meta primitives. Facebook keeps its platform-
specific public route and one-approved-redirect policy.

### Instagram Brand Presence verification

Instagram Brand Presence follows the same profile-URL-first architecture as
Facebook. The Business Scanner Tool never derives or guesses an Instagram handle from a
business name. It discovers only an explicit public Instagram profile link in
the latest successful first-party website audit, in current automatically
verified search evidence whose candidate name matches the reviewed business,
or in already modeled operator-reviewed business-profile URL metadata.
Icon-only markup, plain-text references to Instagram, keyword similarity, and
non-profile routes such as `/explore/`, `/accounts/`, `/reel/`, `/p/`,
`/stories/`, and `/direct/` are not profile discovery. A discovered link is
canonicalized to `https://www.instagram.com/<handle>` with query and fragment
noise removed. The retained discovery record includes the canonical URL,
source, source URL when available, and a material evidence fingerprint.
Discovery proves only that trusted public evidence linked to the profile; it
does not prove current profile identity.

The exact discovered profile is sent to `/api/acquire-instagram-profile`. The
`instagram-native-fetch` adapter makes exactly one public HTML request with an
ordinary desktop user agent, US-English headers, a twelve-second timeout, and
a one-megabyte response limit. Redirects are classified but not followed. The
adapter uses no cookies, login state, copied operator cookies, private Meta
API, challenge bypass, local browser, or rendered-browser fallback. Missing
production composition fails closed as
`instagram_acquisition_not_configured`; missing discovery makes no Instagram
request and remains neutral.

Only bounded public profile identity metadata is normalized: canonical and
Open Graph profile URL and title, meta description as bounded supporting
evidence, explicitly linked website, public business category and contact
fields when structurally exposed, and clearly public business JSON-LD. Posts,
comments, followers, likes, stories, private content, and interaction feeds are
outside the contract. Follower counts are never identity proof.

Automatic Instagram verification reuses the reviewed-identity matcher and its
existing threshold: at least two strong groups from name, official domain,
phone, or address; one must be name or official domain; and no material
conflict or competing plausible entity may exist. Profile URL, handle, and
business name alone are insufficient. A matching public profile name plus the
reviewed official domain can verify. A materially different asserted domain
is conflicting evidence and requires operator review.

Login walls, auth redirects, challenges, HTTP 403/access denial, and accessible
profiles without enough stable identity metadata remain neutral. When an
explicit profile was discovered, the operator surface says “Profile discovered
— verification needed,” retains the canonical profile link, and offers manual
verification. Without an explicit profile, it says “Verification needed” and
makes no guessed request. Only explicit operator `not_found` evidence may
establish absence. Only fully verified automatic or operator evidence may
support the Instagram customer strength; discovery, URLs, acquisition details,
matcher decisions, and blockers remain outside Customer Visibility Review
JSON.

### Meta future authenticated operator assistance

Facebook and Instagram are candidates for a future authenticated operator-
assisted verification layer using the operator's normal logged-in browser
context. That future capability would sit above the current bounded public
acquisition layer and is not implemented. The Business Scanner Tool stores no Meta
credentials and performs no automated login. No guessed handles are permitted
in either the public or future operator-assisted flow.

### Configured Google acquisition runtime

`npm run dev:configured` is the authoritative local development launch. Node
loads `.env.runtime.local` into the parent process, and `scripts/dev-all.mjs`
inherits that environment into both Express on port 5174 and Vite on port 5173;
Vite proxies `/api` to Express. The API health response and startup log expose
only whether Google Search acquisition configuration is configured, partial, or
unconfigured. They never expose credential values.

Google Brand acquisition has a 155-second scan-operation boundary and a
165-second frontend API boundary. Production SERP attempts are individually
bounded to 52 seconds; the optional remote-browser navigation and settle stages
are bounded to 35 and 5 seconds. The ordinary 30-second operation boundary
still applies elsewhere, and the existing 180-second overall scan boundary is
unchanged. This keeps the complete retry/fallback ladder finite while retaining
scan finalization and late-response safeguards.

Provider authentication, zone configuration, timeout, network, HTTP, response
shape, missing-result-region, and access failures remain distinct bounded
diagnostic classes. Operator presentation stays neutral, but may show the
sanitized failure category. Raw response bodies, headers, tokens, and zones are
not part of the operator summary or customer export. The safe
`diagnose:google-acquisition` command uses the configured structured SERP path,
does not launch local Chromium, and prints bounded attempt, count, and field
availability summaries rather than raw provider data.

### Shared retained Brand Presence verification

Google Search, direct Google Maps, Bing Search, and DuckDuckGo use one bounded
workspace lifecycle for automatically verified Brand Presence identity. The
latest acquisition and the last known trustworthy verification are separate
facts. `searchDestinationObservations` always keeps the latest technical
capture and assessment, including `unavailable`, `no_match`, or candidate
ambiguity. `brandPresenceLastKnownVerified` keeps at most one compact automatic
verification per supported destination. Each record contains its destination,
verified time and source run, direct-automatic method, normalized reviewed
business-identity key, compact matched entity/result material, customer-
strength material fields, and an integrity fingerprint. It never contains raw
HTML, captures, full provider payloads, or unnecessary request diagnostics.

The shared record is effective for seven days, inclusive, and only while the
reviewed business name, official domain, normalized address, and phone remain
unchanged. Notes, category wording, services, timestamps, and unrelated
workspace metadata are non-material. Normal save, close, and reload is pure:
hydration reconciles the bounded record with the latest observation and makes
no destination request. A later inconclusive acquisition remains visible as
the current technical result while customer and Review projections may say
“Verified from recent evidence.” Expiry returns the destination to the latest
acquisition state.

Candidate-set ambiguity is not automatically a material conflict. Generic
SERPs, no match, several possible businesses, insufficient structured fields,
and provider/access failures are inconclusive and may use a valid recent fact.
A hard conflict requires a material mismatch tied to the selected reviewed or
same canonical business entity—for example a different official domain,
address, or phone—or explicit evidence that the entity is not the reviewed
business. A current explicit operator correction or Not found decision is also
a hard barrier. These barriers clear or suppress retained positivity; they do
not weaken the matcher or make an ambiguous acquisition freshly verified.

Legacy workspaces migrate conservatively from compatible verified visibility-
run history, the earlier embedded Google retained record, or the Bing-specific
`bingLastKnownVerified` / embedded Bing record. Only successful automatic
verification with matching material identity is eligible. Once reconciled,
the compact shared map is persisted and legacy fields are omitted. Run history
remains a migration source, not the durable mechanism.

Review summaries, public-presence counts, customer strength eligibility, and
Customer Visibility Review `needsReview` use the effective destination state.
Provider names, fingerprints, retained-state internals, and raw captures remain
outside customer JSON.

### Google Brand acquisition resilience

Google Brand acquisition uses the existing provider path in this order:

1. Bright Data SERP attempt;
2. one retry after a deterministic 250-millisecond delay when the first failure
   is transient (`embedded_5xx`, HTTP 5xx, network failure, provider timeout,
   provider failure, provider captcha, or a SERP-route Google challenge); and
3. the existing Browser API fallback once, only when the final SERP result is
   fallback-eligible.

Authentication, zone/configuration, ordinary HTTP 4xx, malformed response, and
structural parsing failures are not retried. Browser fallback may still serve
its existing bounded compatibility role for a failed response shape, but a
Browser `google_sorry` or other challenge is never repeated in the same scan.
Attempt stages and elapsed times are retained as sanitized diagnostics. The
same clean verification query is used for both SERP attempts.

When the current refresh is unavailable or inconclusive, Google Search uses the
shared seven-day retained-verification lifecycle. A multiple-candidate result
still cannot verify freshly, but it does not erase an earlier verification
unless the evidence establishes a true material identity conflict.

The current failed automation and the retained successful verification remain
separate records. Operator UI labels the effective result “Verified from recent
evidence,” shows the local last-verified time and the current refresh failure,
and never calls it fresh. While current, retained evidence remains a positive
Google-only destination and may support the existing strength
include/hide/refine flow; it is excluded from neutral and “Still being
verified” counts. Expiry or material identity change removes that eligibility.
Provider and retention metadata remain outside customer JSON and package scope.

A transient acquisition failure does not erase recent trustworthy verified
evidence, but retained evidence must never be represented as fresh.

### Cross-destination Google Maps verification

A verified Google Search knowledge panel or local-place candidate may establish
Google Maps presence without requiring a separate successful Maps acquisition.
This derived result is allowed only when the current Google Search identity
decision is verified, the same candidate contains a real Maps place identity or
canonical `google.com/maps/place` URL, the candidate matches the reviewed
business name plus phone, address, or official domain, and no material conflict
or second plausible Maps entity exists. The source Google acquisition must use
the current reviewed-identity fingerprint and remain inside the same seven-day
Google Brand freshness window.

The projection records `derived_from_google_search` provenance, a material key
formed from reviewed identity, place identity/canonical Maps URL, and matched
identity signals, and a reference to the Search candidate. It does not copy the
Search provider payload into the Maps observation and never represents the
derived result as a successful direct Maps acquisition. Tracking-only Maps URL
parameters, timestamps, run IDs, and provider request metadata are excluded
from material reconciliation.

Maps precedence is fresh direct verification, recent retained direct
verification, valid derived Google Search verification, then neutral. A current
direct Maps identity conflict or explicit current operator correction blocks
both retained and derived positivity. A direct unavailable or inconclusive
refresh does not destroy a still-current direct or derived verification.
Qualifying fresh Search evidence produces “Verified automatically”; qualifying
retained Search evidence produces “Verified from recent evidence” and preserves
the current Maps and Search refreshes as separate facts. Expiry, reviewed
business identity changes, or a later true conflict remove eligibility and
restore assisted verification.

Derived Maps verification proves only that a matching Maps entity is present
and identity-consistent. It does not prove profile ownership, claimed status,
ranking, optimization quality, or completeness. It may support the separate
Google Maps strength through the normal include/hide/refine workflow; place
identity, provider details, fingerprints, provenance internals, and acquisition
history remain outside Customer Visibility Review JSON.

## Deployment Considerations
The internal scanner and bounded API operate separately from the public Street
& Signal website and customer-facing review presentation. The customer-safe
JSON contract is the handoff boundary; direct exposure of scanner state is not
required. Any external loader or presentation integration must be implemented
and validated separately.

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
