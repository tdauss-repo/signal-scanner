# Packet D — finding intelligence and acquisition foundation

As of 2026-09-16 America/Detroit (proving attempts 2026-09-17 UTC).

**Implementation validated; live acquisition proving incomplete. SCHEDULE_MARY = NO on the evidence available in this run.**

## Architecture and boundaries

Packet C remains the presentation layer and its CSS is unchanged. Existing detailed Workbench workflows, LocalStorage layout, manual Public Presence fallback and Vite LAN settings remain. No production dependency or lockfile change, customer action, model inference, staging or commit.

- `FindingIntelligence` is optional on existing `FixItem`. The versioned knowledge table supplies customer wording and operator guidance; only captured evidence activates a rule. No runtime LLM.
- Server audit now retains **all** meta-description elements and explicit HTTP/HTTPS probe errors. Existing fetch strategy and legacy scalar fields remain; the bounded transport moved into `pageTransport.ts` without replacing the audit engine.
- Generic rules derive unreviewed candidates for certificate-validation/secure-redirect observations and duplicate descriptions. WordPress placeholder wording is conditional on actual captured text. DNS/timeouts/access denial are not HTTPS findings. An absent H1 has no independent detector.
- Older records lacking multiplicity/transport evidence remain usable in the Workbench; they do not retroactively prove the new conditions. Legacy HTTPS summary recommendations are superseded by evidence-specific candidates. A legacy missing-description recommendation remains unless a duplicate-description candidate supersedes it.
- Workbench → Overall → Customer presentation review exposes provenance, observations, confidence, rule/condition, technical steps, access, owner input, dependencies, scope and verification criteria. Approval reviews evidence **and** customer wording; it is not permission to change assets.
- Customer Findings/Action Plan read customer copy, understandable evidence/source references and customer verification summary. Raw delivery steps remain internal. Existing Starter eligibility still applies. Conditional hosting/settings cleanup does not authorize migration, spend, custom development or a broadened Starter package.
- Exact-evidence presentation signatures cover the current profile/workspace and scan data. Stable object-key serialization avoids false invalidation on save/load; actual changes invalidate approval. Packet C signatures from before this change can require one fresh review (safe withdrawal, not data loss).
- The lifecycle type represents all eight requested states. Detection records **Evidence captured**; current presentation approval supports **Reviewed / Action proposed**. Nothing advances to Approved, Implemented, Re-scanned or Verified. Results remains empty because actual implementation/verification records do not yet exist.
- Newer browser evidence takes precedence for description multiplicity; pending browser edits suppress generated candidates. Newer rendered evidence defers old transport findings until a fresh transport probe. Scalar description edits clear the old multiplicity claim. Host mismatch blocks reuse across business profiles.

## Acquisition boundary

`AcquisitionProvider.acquire(url)` returns a provider-neutral capture: requested/final URL, provider/method, timestamp, outcome, status, optional HTML/text/screenshot reference, notes/error and confidence. Existing server/operator/browser-assisted provenance has an additive adapter. Missing fields remain missing; an acquisition outcome is not an SEO verdict.

Tier 1 remains the existing server audit. The separate comparison CLI uses the same bounded HTTP transport with redirects disabled so new targets require explicit review. Tier 2 is an **optional Playwright/Chromium** adapter, not an automatic escalation or a LAN endpoint. Tier 3 remains operator/browser-assisted observation.

Rendered capture uses a fresh context, TLS validation, no account/session reuse, no interactions or challenge bypass, only GET/HEAD, an explicit hostname allowlist, public-address checks, 15-second launch/navigation limits and a 1 MB HTML cap. Service workers/download acceptance are disabled. Blocked cross-host resources make capture partial. This CLI is not a hardened arbitrary-URL proxy: do not expose it as a public API. DNS checks do not substitute for deployment-level egress controls.

No new Playwright package was installed. The proving command used an already installed external Playwright module supplied explicitly by path; application startup has no dependency on that path. Deployment packaging/version selection for this optional provider remains unproven.

```bash
# Run only from an authorized network-enabled execution context.
# Set these to an existing compatible local installation, not a customer browser/profile.
FOUND_LOCAL_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
FOUND_LOCAL_CHROMIUM=/absolute/path/to/chromium \
npm run prove:acquisition -- 'http://www.montessoridownriver.com/' 'https://www.montessoridownriver.com/' 'https://mmsoc.org/accredited-schools/'
```

The CLI accepts 1–3 explicit targets per invocation; it compares both tiers when Playwright is supplied, even if Tier 1 succeeds. Output is unreviewed capture JSON. For a fully successful rendered capture, copy its `browserEvidence` object into the **existing** Website SEO browser-evidence import workflow, inspect it and analyze it. Provider/method/timestamp and all captured description elements survive import. Partial/blocked captures intentionally do not provide an importable finding payload. This handoff is still manual; there is no new acquisition orchestration.

### Packet D.1 — explicit Studio-node sandbox opt-out

A subsequent live Studio-node attempt reported Chromium aborting before navigation with “No usable sandbox.” The proving CLI now accepts `FOUND_LOCAL_CHROMIUM_SANDBOX=false` to pass Playwright's typed `chromiumSandbox: false` launch option. Only the exact lowercase value `false` disables it; unset, empty, `true`, or any other value preserves `chromiumSandbox: true`. Direct provider callers also default to sandboxing unless they explicitly pass the boolean `false`.

This opt-out removes Chromium's process-sandbox protection for that proving invocation. Use only deliberately in the bounded proving environment; it is not a recommended universal default. It does not change Ubuntu, AppArmor, user namespaces, TLS validation, headless operation, request restrictions, redirect policy, provenance, or project dependencies. It does not resolve separate DNS/network failures.

From the Found Local repository, the Studio-node command is:

```bash
FOUND_LOCAL_PLAYWRIGHT_MODULE=/home/tdauss/Projects/family-creator-lab/node_modules/playwright/index.mjs \
FOUND_LOCAL_CHROMIUM=/home/tdauss/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome \
FOUND_LOCAL_CHROMIUM_SANDBOX=false \
npm run prove:acquisition -- \
  'http://montessoridownriver.com/' \
  'https://montessoridownriver.com/' \
  'https://mmsoc.org/accredited-schools/'
```

Packet D.1's launch-option tests use a mock browser; the command above remains the next live proving step. The original blocked acquisition evidence below is preserved.

## Packet D.2 — HTTPS integration correction (2026-09-18)

User-reported live proving obtained HTTP 200 while HTTPS failed with Chromium `ERR_CONNECTION_RESET`. The raw **current** API response was not available to this coding run. A full historical API response was recovered from `/tmp/found-local-mary/website-audit.json` (2026-09-16), together with captured homepage description elements. It is retained in `scripts/fixtures/website-audit-montessori-2026-09-16.json`, with source hash and provenance. It predates Packet D detailed transport fields; it is not a fresh scan.

Code-confirmed path: Express serializes `auditWebsite()` directly → `runWebsiteAutoAudit()` preserves the fields → App stores the result and maps `httpsAvailable:false` to a failed website-https check → `mergeIntelligentFindings()` suppresses the old generic HTTPS recommendation → `deriveWebsiteFindings()` previously accepted only certificate failures or secure redirect problems → no reset/refusal candidate reached CustomerFindingReview. Duplicate-description detection does not depend on transport classification.

The historical payload has `ok:true`, `homepageStatus:200`, `httpAvailable:true`, `httpStatus:200`, `httpsAvailable:false`, `httpsStatus:null`, `httpRedirectsToHttps:false`, with **no transportEvidence**. That remains insufficient to reconstruct a cause.

Before D.2, current server code serialized a Node ECONNRESET as `{available:false, status:null, finalUrl:<secure URL>, errorType:'connection_error'}`. It discarded the specific code; the same type also covered timeouts and unreachable-network errors. The original positive synthetic test used tls_certificate, not a reset.

D.2 preserves errorCode on failed connection probes. The real serializer/client replay yields this fragment:

```json
{
  "httpAvailable": true,
  "httpsAvailable": false,
  "httpsStatus": null,
  "transportEvidence": {
    "http": { "available": true, "status": 200, "finalUrl": "http://montessoridownriver.com/" },
    "https": { "available": false, "status": null, "finalUrl": "https://montessoridownriver.com/", "errorType": "connection_error", "errorCode": "ECONNRESET" }
  }
}
```

This is **controlled serializer-replay output**, not a fresh captured live response. The regression invokes the actual server evaluator, response JSON serialization, API client, storage normalization, check mapper, finding derivation and rendered review/customer components. It does not hand-build a simplified WebsiteAuditResult. Historical captured metadata grounds the fixture; reset/refusal transport is explicitly mocked. A fresh current API export is still needed to confirm whether the live backend emits ECONNRESET or another code.

The added rule requires a usable same-audit HTTP homepage, HTTP 2xx control, the corresponding failed HTTPS URL (same host/path, only scheme changed), and **ECONNRESET or ECONNREFUSED**. It creates an unreviewed candidate, not an asserted certificate/hosting root cause. DNS, timeouts, unreachable-network, permissions/executor failure, ambiguous UND_ERR_SOCKET, bare legacy connection_error and whole-audit failure stay excluded. No rule parses notes or promotes a failed check alone. Existing review, freshness, Starter and verification gates remain unchanged.

### Operator validation

1. Restart the existing API process with updated code using the normal project workflow (no scheduled-job changes). Open the isolated Montessori workspace, not an edited JEM workspace; verify the intended website address.
2. In Scan, choose **Scan website** and wait for the new result. Rescanning is required to capture errorCode; older boolean-only records are not upgraded into facts.
3. Choose **Open Workbench → Review customer findings** (Overall).
4. Verify **Secure website connection** and **Homepage search description** are unreviewed candidates if current evidence supports both. Inspect the paired URLs and specific reset/refusal evidence; root cause still requires inspection.
5. If HTTPS is missing, inspect/export the browser Network response for `/api/audit-website`: transportEvidence/errorCode, HTTP control and current timestamps. Do not substitute a generic failure. Newer or pending browser observations can also intentionally defer older server evidence.
6. Before approval, neither candidate should appear in customer Findings/Action Plan. After evidence, access and scope review, choose **Approve evidence & customer wording** for each intended recommendation. The HTTPS item should appear as proposed Starter work, not completed Results.

`npm run test:packet-d` includes `test-live-https-integration.ts`: reset/refusal positives; DNS/network/executor/ambiguous/legacy/other-target negatives; working HTTPS; duplicates; no independent H1 finding; actual component gates; and changed-HTTPS-evidence approval invalidation. No fresh live Mary success is claimed from this restricted execution context.

## Actual Mary proving result (original Packet D run)

See [machine-readable attempt record](packet-d-acquisition-proving.json). The provisional identity remains **Montessori Center of Downriver — confirm with Mary before delivery/remediation**.

Four distinct URLs were attempted: HTTP and HTTPS homepage, one initially guessed auxiliary hostname, then the correct Michigan Montessori Society source from the existing baseline (`mmsoc.org/accredited-schools/`). The guessed hostname is explicitly excluded from identity evidence; correcting it is one target-selection correction, not a customer finding.

All eight provider calls failed public DNS preflight (`EAI_AGAIN`), before HTTP transfer or browser launch. The execution environment reports `CODEX_SANDBOX_NETWORK_DISABLED=1`. This does **not** establish a node-wide outage, broken customer HTTPS, or a registry defect. No security/network setting was altered.

| Measure | Observed result |
|---|---|
| Distinct target URLs attempted | 4; 3 intended evidence URLs + 1 discarded guessed auxiliary URL |
| Tier-1 provider attempts / successes | 4 / 0 |
| Rendered provider attempts / actual browser launches | 4 / 0 (DNS preflight blocked) |
| Additional rendered evidence | None obtained; incremental value unmeasured |
| Browser-assisted/manual acquisitions | 0 this run |
| Current evidence completeness | No new usable live capture; existing customer workspace not exported/accessed |
| Live false positives / negatives | Not measurable without acquisition and independent comparison |
| Target-selection corrections | 1; no customer evidence corrections |
| Human acquisition interventions | 0 performed; future manual capture/review remains required |
| Provider-command acquisition elapsed time | 534 ms total across two attempts; not an end-to-end scan-time estimate |
| Synthetic finding-flow checks | 2 candidates → 0 customer findings before review → 2 after review; no verified Results |

Tests using Montessori-named and second-profile fixtures are explicitly synthetic. They are not evidence of Mary's live site or owner-confirmed business facts. Existing Knowledge baseline/recovery records remain historical inputs and were not rewritten.

Manual Public Presence work still includes destination-specific Google Search/Maps, Bing/Maps and Apple Maps observations, public listing/NAP/category/hours/website comparison, relevant public-profile corroboration, Entity Clarity and customer-question review. No AI answer or maps visibility check was performed by this homepage acquisition attempt.

## Scrapling capability evaluation

**Recommendation: EXTRACT the acquisition/extraction separation now; do not ADOPT in production.** Consider an isolated ADAPT comparison only after baseline Playwright obtains real evidence and a specific public acquisition gap is measured. Resilience features are not intrinsically disqualifying; authentication/private data remain outside scope.

| Requirement | Primary-source capability | Found Local assessment |
|---|---|---|
| Deterministic HTTP | Fetcher/AsyncFetcher and response selectors | Fits behind normalized capture; no LLM needed. [HTTP docs](https://scrapling.readthedocs.io/en/latest/fetching/static.html) |
| Rendered/dynamic, visible DOM/text | DynamicFetcher, Playwright page hooks, wait controls | Could return HTML/text behind the same boundary. Not proven better than native Playwright for Mary. [Dynamic docs](https://scrapling.readthedocs.io/en/latest/fetching/dynamic.html) |
| Screenshots, CDP | Page hook allows a Playwright screenshot; documented CDP connection | Optional evidence reference; no need to attach to a personal/authenticated browser. [Dynamic docs](https://scrapling.readthedocs.io/en/latest/fetching/dynamic.html) |
| Adaptive/durable extraction | Remembers element properties and relocates similar elements | Potentially reduces selector maintenance; a relocated element must be revalidated, never treated as accepted business truth. [Adaptive docs](https://scrapling.readthedocs.io/en/latest/parsing/adaptive.html) |
| Blocked pages | Separate resilient/dynamic fetcher families | Preserve blocked outcome and source; do not turn a challenge page into “business not found.” No bypass was tested. [Project](https://github.com/D4Vinci/Scrapling) |
| Operational cost | Python ≥3.10; optional fetchers bring curl_cffi, Playwright, Patchright and additional packages in reviewed source | A second runtime/browser toolchain is material overhead for this TypeScript app. [Dependency manifest](https://github.com/D4Vinci/Scrapling/blob/main/pyproject.toml) |

**Spike limitation:** source/API/dependency evaluation completed; runtime comparison not completed. `pip show scrapling` reports not installed; `pip cache list scrapling` reports no local wheel. The execution context cannot resolve public targets. No package was installed globally or in production and no success-rate/latency claim is made. A future isolated venv comparison must use the same target list, preserve raw capture/status and measure extra evidence versus native Playwright before adoption.

## Firecrawl and CUA

**Firecrawl: candidate adapter, not integration.** Its documented scrape/extraction facilities could be a hosted/self-hosted alternative when local rendered acquisition demonstrably lacks usable evidence. Compare provenance/HTML fidelity, account/data boundaries, dependency/service cost and success on the same targets first. No paid API was called. [Official documentation](https://docs.firecrawl.dev/introduction)

**CUA: candidate Tier 3 only.** Specific Mary steps that could need interactive observation: opening the correct Google Maps place result and expanding public hours/details; inspecting the matching Bing/Apple map card where a static URL omits displayed information; navigating a public profile panel to distinguish a same-name school before recording its phone/address/site. These are candidate gaps, not newly observed failures in this blocked run. Manual Public Presence remains usable. No login, customer-account action, credential request or customer communication is authorized by such a capture.

## Claude SEO capability-gap / extraction matrix

Recommendation: **EXTRACT bounded rules and verification patterns, not the agent/skill stack, broad scoring system or its unverified commercial claims.** Primary sources reviewed as references, not executed instructions. Matrix entries below are our assessment of commercial fit; they do not establish ranking effects.

| Capability | Current Found Local | Reference pattern | Remediation value | Recommendation / phase |
|---|---|---|---|---|
| Technical security / metadata | Server checks + two evidence-specific Packet D rules | HTTPS, canonical and rendered/source checks | Concrete settings changes with reproducible verification | BUILD now; extend only from real defects. [Technical](https://github.com/AgriciDaniel/claude-seo/blob/main/skills/seo-technical/SKILL.md) |
| Local NAP consistency | Packet B corroboration of explicitly recorded fields | Compare visible site, structured data and public GBP values | Resolve proven name/phone/address conflicts with owner authority | EXTRACT comparison rules after Mary evidence. [Local](https://github.com/AgriciDaniel/claude-seo/blob/main/skills/seo-local/SKILL.md) |
| GBP/maps | Manual destination evidence; no admin automation | Profile completeness/category/citation review | Correct confirmed public-profile errors, not sell ranking estimates | ADAPT checklist only, next real delivery. [Local](https://github.com/AgriciDaniel/claude-seo/blob/main/skills/seo-local/SKILL.md) |
| Schema/entity clarity | JSON-LD capture/types, Entity Clarity review | Type/property consistency and entity identity | Repair incorrect/missing confirmed structured facts, verify output | EXTRACT targeted validators after authority/facts confirmed. [Local](https://github.com/AgriciDaniel/claude-seo/blob/main/skills/seo-local/SKILL.md) |
| GEO/AI citability | Manual AI observations and source signals | Distinguish platform observations and content extractability | Improve factual clarity; do not promise AI inclusion | EXTRACT evidence distinctions, later; no speculative score. [GEO](https://github.com/AgriciDaniel/claude-seo/blob/main/skills/seo-geo/SKILL.md) |
| Prioritization/remediation | Reviewed Starter gate, impact/confidence/effort, new delivery templates | Categorized issue/recommendation patterns | Sell bounded work with understood access and verification | BUILD on existing gate; no imported ranking weights. [Technical](https://github.com/AgriciDaniel/claude-seo/blob/main/skills/seo-technical/SKILL.md) |
| Verification/baseline drift | Saved scans and criteria; no completed-fix ledger | Source/render comparisons can be repeated | Prove agreed changes and detect recurrence | BUILD a bounded evidence-linked before/after record only after an approved real fix; not another broad audit. [Technical](https://github.com/AgriciDaniel/claude-seo/blob/main/skills/seo-technical/SKILL.md) |

## Validation and remaining delivery gate

Passed: lint, build/typecheck, profile-separation, visibility-workflow, packet-a, packet-b, packet-c, packet-d, proving-001 and proving-002. Existing test assertions were retained. Packet D covers source multiplicity/placeholder, TLS vs DNS failure, missing H1, explicit review, Starter eligibility, fresh evidence, JSON persistence, isolated profiles, normalized provenance, acquisition failures, optional rendered provider behavior (mocked), customer rendering and empty Results.

Remaining limitations: no live HTML/DOM/browser comparison, no accessible current customer LocalStorage export, no operational packaging proof for optional Playwright, simple bounded HTML extraction (not a general DOM parser), no completed-remediation ledger, and source-level rather than runtime Scrapling evaluation. Strict rendered host boundaries can deliberately produce partial pages; expanding those boundaries requires evidence and explicit targets, not bypassing protections.

Before **SCHEDULE_MARY = YES**:

1. Run the existing server audit and bounded provider comparison from an authorized network-enabled context; establish current provisional site association. Do not change security policy to make this run succeed.
2. Load the isolated Montessori workspace (not an edited JEM workspace); import successful browser evidence where useful and review the actual HTTPS/description conditions. Public identity remains provisional pending Mary confirmation.
3. Finish relevant public-presence observations; approve only findings with credible evidence, correct wording and bounded scope. Check hosting/CMS access requirements and implementation feasibility without logging into customer accounts.
4. Produce the real delivery draft and pre-remediation baseline with implementation and verification criteria for every proposed action. No known live finding is claimed from this blocked run.

**Next bounded packet:** complete Mary evidence acquisition and operator delivery review using this implementation; fix only observed blocking defects. Do not add another provider, redesign the UI or build monitoring automation before that evidence exists.

## Packet D changed-file inventory

New: `src/types/acquisition.ts`, `src/types/findingIntelligence.ts`, `src/utils/acquisition.ts`, `src/utils/findingIntelligence.ts`, `src/utils/findingKnowledge.ts`, `server/acquisition.ts`, `server/pageTransport.ts`, `scripts/prove-acquisition.ts`, `scripts/test-packet-d.ts`, this document and `docs/packet-d-acquisition-proving.json`.

Extended: `package.json` (scripts only), `server/websiteAudit.ts`, `scripts/browser-website-evidence-helper.js`, `src/types/audit.ts`, `src/types/websiteAudit.ts`, `src/utils/browserWebsiteObservation.ts`, `src/utils/customerScan.ts`, `src/components/CustomerFindingReview.tsx`, `src/components/CustomerScanView.tsx`, `src/App.tsx`.

Existing uncommitted Packet C work remains. Its CSS, workspace-profile helper, IntakeForm, SavedScansPanel, Packet C tests and documentation were not rewritten by Packet D. No unrelated Studio Knowledge or project files were changed.
