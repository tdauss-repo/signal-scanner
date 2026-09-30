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

1. **Business** presents one consolidated reviewed-business form. Seed and
   reviewed-profile provenance remain internal compatibility concepts, while a
   compact Change business control owns saved workspaces and Full Scan JSON.
   Business name, website, and primary category are required to begin. Reviewed
   profile facts are authoritative for customer projection; a new workspace
   clears prior evidence, decisions, and customer wording.
2. **Scan** runs bounded acquisition and shows operational progress and evidence
   health. Each run records an explicit running/completed/completed-with-review/
   failed lifecycle, individual operations and the overall run are time-bounded,
   and unfinished checks are terminalized before Review becomes available.
   Acquisition failure remains neutral.
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
   or no proposed scope and optionally refines the customer-safe delivery and
   line-item wording. Overrides are bound to the finding evidence identity;
   stale overrides cannot enter active package scope. Previous scope remains
   visible in a separate reconciliation queue until the current finding and
   its delivery scope are reconfirmed. Snapshot-backed decisions also keep a
   prior finding visible when it no longer appears in the latest candidate set.
   Internal scope notes stay inside the operator workspace.
5. **Customer Review** is the final operator quality gate. Its human-readable
   QA frame, copyable review text, and sanitized version 1.0 JSON are all built
   from the same customer-safe projection of reviewed identity, area-specific
   status, approved effective findings, and approved-only effective package
   scope. The version 1.0 contract keeps Starter line items in
   `recommendedPackage.included`; separate assignments use each approved
   issue's existing customer-safe package label and delivery-action fields, so
   separate work is not misrepresented as Starter scope.
6. **Verification** records completed outcomes only after execution and a
   follow-up check.

Found Local Sites then renders the external Customer Visibility Review. The
Workbench remains available as a secondary internal evidence/configuration
surface. Legacy Business Profile and Settings routes remain compatibility
details and are hidden from normal navigation.

## Design Principles
- Keep the operator workflow efficient and evidence-preserving
- Keep customer presentation clear, local, and actionable
- Separate UI rendering from data collection logic
- Preserve the internal scanner / external presentation boundary
- Design for future integrations without overcomplicating the initial version
- Protect privacy and minimize unnecessary data collection

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
| Facebook, Instagram | Existing destination/generic path |

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
the dedicated Bing, Apple Maps, DuckDuckGo, and Yelp adapters, which post to
`/api/acquire-bing-search`, `/api/acquire-apple-maps`, and
`/api/acquire-duckduckgo-search`, and `/api/acquire-yelp-search`. The
general scan contract remains injectable for fixtures and CLI tools, but a
missing Bing adapter fails closed as `bing_acquisition_not_configured`; it can
never select generic public acquisition or rendered-browser acquisition. The
Apple Maps, DuckDuckGo, and Yelp adapters follow the same fail-closed composition rule
with `apple_maps_acquisition_not_configured` and
`duckduckgo_acquisition_not_configured`, and
`yelp_acquisition_not_configured`.

Bing Brand Presence uses one bounded native server request to the clean
`bing.com/search?q=...` verification query. The request does not execute
scripts, follow an unreviewed redirect, launch a browser, maintain a profile,
or bypass an access restriction. A normal Bing result region is normalized by
the shared structured, semantic, and result-link extractors; transport, HTTP,
access, and missing-result-region failures retain distinct internal blockers
and remain neutral. Assisted verification is the fallback when this bounded
acquisition is unavailable or insufficient.

The native request preserves the clean reviewed-identity query while adding a
stable US-English public-result context (`cc=us`, `setlang=en-us`, and
`mkt=en-US`), an ordinary desktop user agent, and standard HTML/English accept
headers. It sends no authenticated state, copied browser cookies, transient
headers, or exact-location personalization. Provider normalization recognizes
bounded Bing local/entity scopes in addition to JSON-LD and organic result
rows, retaining asserted name, website, phone, address, category, Maps URL, and
entity identity fields without fabricating absent values. Organic extraction
remains independent and additive.

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

Bing Brand uses the same centrally defined seven-day automatic-evidence
freshness window and material reviewed-identity fingerprint as Google Brand.
When a later native Bing refresh is unavailable or successfully inspects a
normal result region but produces only `review_required` / `no_match`, the
current refresh remains stored while a recent prior provider-acquired Bing
identity decision may remain effective as “Verified from recent evidence.” A
no-match result variant is inconclusive, not contradictory, and does not erase
the earlier verified fact. Retained evidence is never represented as fresh.
For compatible saved workspaces created before this retention projection was
available, the next scan may reconstruct the same bounded fact from a recent
verified Bing assessment already present in visibility-run history. A newer
conflicting run is a hard barrier to that recovery.

Retention requires a prior successful automatic Bing acquisition with an
explicit verified identity decision, an unchanged reviewed business name,
domain, address, and phone fingerprint, and evidence within the freshness
window. A current material identity conflict, expiry, reviewed-identity
change, or operator correction blocks the retained positive interpretation.
Operator-only verification is preserved under operator provenance and is never
relabeled as retained automatic evidence. While valid, retained Bing evidence
continues to support the stable Bing strength and stays outside neutral and
customer “Still being verified” counts; provider history and retention
metadata remain operator-only.

### Apple Maps Brand Presence verification

Apple Maps Brand Presence uses one bounded public HTTP request to the clean
`maps.apple.com/?q=...` reviewed-identity query. It runs in a dedicated native
runtime lane, does not execute scripts, launch a browser, use authenticated or
private endpoints, retain session state, or bypass an access restriction. The
production acquisition URL and operator verification URL use the same
`brandVerificationQuery()` contract: reviewed business name plus reviewed city
and state.

Apple Maps public place resolution permits exactly one 301, 302, 303, 307, or
308 redirect when its `Location` is HTTPS, remains on `maps.apple.com`, and is
exactly a supported public `/search` or `/place` route rather than an
authentication or arbitrary Apple route. A `/search` redirect is accepted only
when its decoded `query` is materially the same as the requested reviewed-
identity query after bounded case and whitespace normalization. A missing,
external, insecure, unrelated-query, arbitrary-route, or second redirect stops
neutral.

The permitted public sequence is search query → one approved `/search`
redirect → structured public place evidence or an explicit canonical `/place`
URL in the returned page. The `/search` redirect itself is not evidence that a
listing exists. The search response is inspected only for bounded JSON-LD,
public `application/json`, canonical/Open Graph metadata, and explicit public
place links. A `/place` URL found in that response is parsed as evidence without
a second network request, preserving the one-redirect boundary. If the search
page is only an application shell, acquisition is completed but insufficient:
the destination remains neutral and requires review rather than being labeled
unavailable.

A server-provided public `/place` target is acquired structured place evidence.
Public `place-id`, `name`, and `address` parameters are normalized as a local-
place candidate; `coordinate` is retained only in raw technical redirect
evidence and is excluded from the canonical profile and material fingerprint.
Place identity alone is provenance, not business-identity proof.

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

When the current refresh remains unavailable, the workspace may retain a prior
Google Search automatic verification for seven days. Retention requires a
successful prior acquisition, an explicit verified identity decision, the same
material reviewed identity (normalized business name, primary domain, address,
and phone), and no intervening conflicting Google assessment. Operator-only,
ambiguous, expired, or conflicting evidence cannot become retained automatic
evidence. New scans stamp the material identity key directly; compatible older
runs may use their reviewed-profile fingerprint conservatively.

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

Fresh direct Maps verification has first precedence. A current direct Maps
identity conflict or explicit current operator correction blocks a derived
positive result. When direct Maps acquisition is unavailable, qualifying Search
evidence produces “Verified automatically”; qualifying retained Search evidence
produces “Verified from recent evidence” and preserves the failed current
refresh as a separate fact. Expiry, reviewed business identity changes, or a
later conflict remove the derived eligibility and restore assisted verification.

Derived Maps verification proves only that a matching Maps entity is present
and identity-consistent. It does not prove profile ownership, claimed status,
ranking, optimization quality, or completeness. It may support the separate
Google Maps strength through the normal include/hide/refine workflow; place
identity, provider details, fingerprints, provenance internals, and acquisition
history remain outside Customer Visibility Review JSON.

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
