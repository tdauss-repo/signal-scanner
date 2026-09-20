# Packet E — Visibility Scan orchestration

Implementation and regression validation completed on 2026-09-18. **Live Mary coverage remains unvalidated; SCHEDULE_MARY = NO.** The proving attempt ran in a network-restricted execution environment. It does not contradict the previously reported Studio Node browser success, and it does not establish a visibility problem at any destination.

## Architecture and behavior

`runVisibilityScan()` is the single runner for customer Scan, Workbench reruns, and the proving CLI. App's existing request-generation guard cancels delivery of stale results when the operator replaces/changes the workspace. Every update also checks the complete profile identity. Directory rows are selected by their existing business ID. No shared server-side customer state was introduced.

The runner executes the unchanged website API client and mapper first. It then acquires Public Presence evidence and recorded public-directory sources, compares extracted identity fields, and evaluates website candidates with the same evaluator used by the Workbench. AI Discovery has no new acquisition capability and remains `not_checked`; existing reviewed manual AI observations remain visible.

Coverage scope is explicit: all eight destinations for the existing canonical brand query; the recorded location diagnostic, when one exists; and the three primary destinations for additional queries generated from approved category/service facts. Supporting destinations for other queries retain their existing manual forms. Up to eight recorded directory URLs are acquired per run; additional recorded URLs are explicitly marked for interactive review. No new directories, business facts, or service queries are guessed. Destination-specific recorded URLs can replace the corresponding generated query URL; a Google Maps URL cannot replace Google Search.

The runner is browser-session driven, with incremental workspace persistence through the existing LocalStorage/save/export mechanism. It is not a durable background server job. Reloaded unfinished runs mark the interrupted check for interactive review and unstarted checks `not_checked`; they do not resume silently or claim completion. Historical run details remain in workspace exports. Long-term retention/quota management is not added by this packet.

**Acquisition:** server fetch first; optional rendered capture follows insufficient evidence. Explicit access blocks/challenges stop escalation. Missing Playwright leaves interactive review work and does not abort other scan areas. The API permits the fixed destination hosts (including normal www aliases) and explicitly configured directory hosts; public DNS validation, standard HTTP(S) ports, bounded GET/HEAD capture, hostname boundaries, fresh browser contexts, headless operation, TLS validation, download/service-worker restrictions, no login, and no challenge bypass remain. The existing website audit transport and fallback semantics are unchanged. Its manual/browser-assisted import remains available.

The runtime does not become an unrestricted URL proxy. Directory hosts must be explicitly configured, and redirects to unapproved hosts remain unavailable for automatic capture. This is an internal Studio/LAN runtime, not a new authenticated public SaaS API. Existing browser hostname restrictions can produce partial pages; there is no automatic expansion to third-party resource hosts.

**Observation mapping:** captures attach to the existing `SearchDestinationObservation`. Supported result types come from identified direct result links or matching structured business-record candidates, not a search query echoed in a title. Redirect wrappers, unidentifiable dynamic panels and ambiguous pages require review. There is no ranking, ownership, absence or business-failure inference from acquisition. Captured snippets, identifying links/records, provider, method, source URL, timestamp, outcome and diagnostics survive normalization. Bounded text excerpts are retained; full raw HTML is not duplicated indefinitely in LocalStorage.

Automated observations use `manual_review_needed`, keep `reviewed=false`, and do not promote an Action Plan. Original destination links, timestamps, result controls, evidence notes, competitors, recommendations and the Reviewed for Action Plan checkbox remain. Operator edits require fresh explicit review. Rescans preserve operator correction fields and supplemental notes, attach the latest capture separately, and invalidate review. Changed evidence also invalidates customer-presentation signatures.

**Business Information:** `IdentityExtractor` separates extraction from acquisition. The initial generic extractor reads matching Organization/Business/School/Place-family JSON-LD records. A directory or website can also supply an exact visible name candidate; search-page query echoes cannot. Only observed name, phone, URL and address fields become existing `CorroborationRecord` objects in Sales Readiness. Missing expected values require owner confirmation. Incomplete/nonidentical aggregate addresses require confirmation rather than an asserted conflict. Differences never overwrite the Business Seed. Comparisons, sources, timestamps and operator notes are available in the existing Sales Readiness surface with an explicit review checkbox. No MMS selectors or Montessori-specific evaluation logic were added.

**States and customer surface:** checks use `queued`, `scanning`, `awaiting_review`, `interactive_review_required`, `failed` and `not_checked` as the evidence warrants. The shared state vocabulary also supports `evidence_captured`, `checked_clear` and `needs_attention` for applicable evidence/review projections. Customer labels come from normalized states. A provider failure says that a check could not complete or needs a closer review. Progress advances only when work starts/returns; there are no animation timers. The old combined status string survives only inside the legacy summary compatibility field required by unchanged Packet C assertions; it is never customer-rendered. No CSS was changed.

Website evidence, errorCode, duplicate descriptions, Packet D rules, changed-evidence invalidation, presentation approval and empty Results behavior remain. Client/API failure preserves the last successful website evidence but records a failed latest attempt, withdrawing stale current candidates. Website blocked-response notes retain their previous content.

**Run accounting:** start/end timestamps and per-task elapsed time accompany logical tasks: one website audit, one query/destination acquisition task, each recorded directory task, and one identity comparison task. Internal website subchecks and each HTTP fallback request are not independently counted as orchestrator tasks. `successful` means usable evidence was captured, not that the business passed. Acquisition failures count failed/blocked provider responses or acquisition-request failures plus a failed website audit. Escalations count rendered acquisition attempts, not necessarily browser launches. Manual interventions include failed/interactive/not-checked tasks, including AI. Candidate count includes newly evaluated website candidates from the shared Workbench evaluator, excludes independent H1 suggestions and existing manual fixes, and is zero after failed website acquisition. Customer-approved count is zero because the application has no customer implementation-approval ledger; operator presentation review is not customer authorization.

## Application runtime configuration

`.env.runtime.example` provides portable empty path/host settings and sandboxing enabled. The local, gitignored `.env.runtime.local` is prepared for the supplied Studio Node installation:

```dotenv
FOUND_LOCAL_PLAYWRIGHT_MODULE=/home/tdauss/Projects/family-creator-lab/node_modules/playwright/index.mjs
FOUND_LOCAL_CHROMIUM=/home/tdauss/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome
FOUND_LOCAL_CHROMIUM_SANDBOX=false
FOUND_LOCAL_PUBLIC_DIRECTORY_HOSTS=mmsoc.org
```

These paths occur in configuration/documentation, not business logic. Only the literal `false` disables Chromium's sandbox. The module was successfully imported and the executable's existence verified during Packet E. Public network/browser navigation was not verified here.

From the repository, start the configured application with `npm run dev:configured`. For API-only operation use `npm run server:configured`. These scripts explicitly load `.env.runtime.local` through Node's `--env-file`; existing `dev:all` and `server` commands continue using their inherited shell environment. Replace/restart the existing API through the normal deployment workflow before expecting new code/configuration to serve requests; this packet did not kill or replace running processes. No dependency installation, paid API, lockfile change, global browser setting, or persistent browser profile was introduced.

To reproduce a proving run, create an explicit profile JSON and run:

```bash
node --env-file=.env.runtime.local --import tsx scripts/prove-visibility-scan.ts \
  /path/to/provisional-profile.json /path/to/output.json
```

The CLI does not have a default customer and never modifies a saved customer workspace.

## Mary proving results

The complete actual attempt is [packet-e-mary-proving.json](packet-e-mary-proving.json). Provisional profile: Montessori Center of Downriver, HTTP homepage at montessoridownriver.com, Southgate MI, and the recorded MMS public directory URL. No phone/address or approved service facts were invented. Start **2026-09-18T19:15:33.442Z**; end **2026-09-18T19:15:33.693Z**.

The execution environment reported `CODEX_SANDBOX_NETWORK_DISABLED=1`. All public acquisitions failed DNS preflight with `EAI_AGAIN`. “Tier 2 attempted” below means the configured rendered provider reached its DNS preflight, **not** that Chromium launched or loaded the destination. Times measure this immediate restricted-environment failure, not real destination latency; 0 ms means below millisecond resolution. The first rendered attempt includes module-load overhead.

| Destination | Tier 1 attempted / outcome | Tier 2 attempted / outcome | Usable evidence | Automatic interpretation | Operator review | Interactive review | Approx. time |
|---|---|---|---|---|---|---|---|
| Google Search | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | 220 ms |
| Google Maps | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | <1 ms |
| Bing Search | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | 1 ms |
| Apple Maps | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | <1 ms |
| DuckDuckGo | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | 1 ms |
| Yelp | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | <1 ms |
| Facebook | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | <1 ms |
| Instagram | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | <1 ms |
| MMS public directory | Yes / DNS failed | Yes / DNS failed | No | No | Required | Required | <1 ms |

The existing website audit also failed DNS, retaining its normal four URL-variant attempts. Across the run: 11 logical tasks attempted; 0 successful/evidence-bearing tasks; 10 failed or evidence-review acquisition tasks needing operator attention; 9 interactive acquisition tasks; 19 failed acquisition outcomes (18 public-provider attempts + one aggregate website audit); 9 rendered escalations; 0 candidate findings; 0 customer approvals. The broader manual-intervention count is 12 because it additionally includes the unsupported AI check and identity comparison without source evidence.

**Business Information captured for Mary in this packet: none.** MMS supplied no current record candidate in this environment. Generic directory extraction, phone differences, incomplete-address handling, wrong-entity rejection and seed preservation passed controlled fixture tests; those are implementation results, not Mary's public facts.

## Remaining manual work and next packet

Re-run from the network-enabled Studio Node application using the isolated Mary workspace. Confirm the intended public identity and URLs, review the actual website transport/metadata findings, review the eight destination observations, and confirm any MMS identity candidate. Complete ambiguous/unavailable destinations through the retained forms. Record AI consumer observations separately if they are in delivery scope. Review scope, access and customer wording before presentation; obtain authorization before implementation. Results remain empty until a later implementation/verification ledger exists.

Strong **candidate** Tier-3/CUA tasks are opening/disambiguating a Google Maps or Apple Maps place card, expanding public hours/contact fields, inspecting a Bing business panel, following identifiable public Yelp/search result cards, and inspecting public Facebook/Instagram profile details where a static capture cannot associate the business confidently. Public directory navigation to the matching record can also qualify. These are capability-based candidates, not observed destination-specific live failures; this run cannot distinguish genuine interaction needs from the environment-wide DNS restriction. Login walls/challenges require manual fallback and are not bypass tasks.

Before **SCHEDULE_MARY = YES**, obtain current live coverage and a reliable website baseline, resolve identity/record ambiguity, complete necessary manual evidence, review all proposed findings, and produce the bounded delivery draft with access/owner dependencies and verification criteria. No scheduling or customer communication occurred.

Recommended next bounded packet: **E.1 — network-enabled Mary acceptance and delivery review**. Run the existing configured application and the same proving CLI, compare the eight outcomes with an operator, add only a narrowly justified extractor/approved resource host if actual captured evidence warrants it, then prepare the reviewable delivery package. No provider expansion or UI redesign is needed before that evidence exists.

## Validation and file inventory

All existing test files and assertions remain unchanged. Full output: [packet-e-test-results.txt](packet-e-test-results.txt). Passed:

| Command | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS — TypeScript and Vite |
| `npm run test:profile-separation` | PASS |
| `npm run test:visibility-workflow` | PASS |
| `npm run test:packet-a` | PASS |
| `npm run test:packet-b` | PASS |
| `npm run test:packet-c` | PASS |
| `npm run test:packet-d` | PASS — includes full D.2 serializer/client replay |
| `npm run test:proving-001` | PASS — website audit and evidence contract |
| `npm run test:proving-002` | PASS — browser observation |
| `npm run test:packet-e` | PASS |

Packet E covers all fifteen requested cases, plus query-echo rejection, directory entity association, missing/partial fields, no seed mutation, challenge escalation stopping, absent runtime, allowed-host policy, www aliases, destination-specific recorded URL selection, pending-promise progress, cancellation, interruption recovery, persistence and withdrawing candidates on a new client failure. Real React Scan, Results and Public Presence components are rendered in tests. No successful public navigation or interactive live browser UI session is claimed from this restricted environment.

New files: `.env.runtime.example`; `server/acquisitionRuntime.ts`; `src/types/visibilityScan.ts`; `src/utils/visibilityScan.ts`; `src/utils/presenceExtraction.ts`; `src/utils/workspaceFindings.ts`; `src/components/VisibilityRunReview.tsx`; `scripts/prove-visibility-scan.ts`; `scripts/test-packet-e.ts`; this report; `docs/packet-e-mary-proving.json`; `docs/packet-e-test-results.txt`. Local configuration: `.env.runtime.local` (gitignored).

Updated files: `package.json`; `server/index.ts`; `server/acquisition.ts` (caller-boundary comment only); `src/App.tsx`; `src/types/audit.ts`; `src/utils/customerScan.ts`; `src/utils/searchVisibility.ts`; `src/utils/salesReadiness.ts`; `src/components/CustomerScanView.tsx`; `src/components/SearchVisibilityPanel.tsx`; `src/components/SalesReadinessPanel.tsx`.

No CSS, existing tests, website audit/acquisition engine behavior, customer saved workspaces, or lockfile were changed. Nothing was staged or committed.
