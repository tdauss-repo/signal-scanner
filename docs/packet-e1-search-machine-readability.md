# Packet E.1 — Automated Search/Maps and Machine Readability

Implementation is complete in the uncommitted Packet E working tree. All requested regressions and the new E.1 tests pass. **Mary live acceptance remains blocked by this execution environment's network restriction; SCHEDULE_MARY = NO.** No current public facts or new live Mary findings were established. This report supersedes Packet E's coverage description; the older report remains a historical record.

## Architecture and observation behavior

The customer and Workbench use the same `runVisibilityScan` runner. All application and proving entry points select the version-2 automation contract. The existing dependency contract without a version retains version-1 behavior for backward compatibility, including unchanged Packet E tests. There is no second customer scan implementation.

One application scan now runs Brand and Location queries across all eight destinations when location is available. They persist as separate observations, so a recorded Brand URL cannot replace a Location query. Approved additional category/service queries retain their existing primary-destination checks. Both query families contribute to Public Presence counts: attempted, evidence, automatic, reviewed and review required. An attempted acquisition that failed now contributes to **Needs review**, not **Not tested**.

The acquisition ladder remains server fetch, optional rendered capture, then an explicit review exception. It escalates when the first capture cannot establish a trustworthy match, except that explicit access blocks/challenges stop escalation. Failures never become business absence. Semantic extraction reads bounded JSON-LD, microdata, result links, public result cards and explicit place-card attributes. Hidden subtrees and unrelated nested entity facts are excluded. Extractors sit behind a boundary so source-specific adaptation can be isolated. There are no visual coordinates, CUA actions, authentication, challenge bypasses or persistent browser profiles.

The provider-neutral matcher records observed candidates, matched/conflicting/missing/unreviewed fields, confidence, ambiguity and source/method/timestamp/excerpt references. Comparison normalizes names, US regions, phones, domains and common address suffixes. A high-confidence observation requires a matching **reviewed** name, strong reviewed location, a supporting phone/domain, and no conflicts or competing entity. Where a street is reviewed, locality alone is insufficient. Explicitly reviewed alternative phones can match. Provisional profile facts can help identify a relevant candidate but cannot authorize a high-confidence match. Review status must refer to the current profile value.

High-confidence evidence prepopulates the existing Public Presence model as `found_match`. This does not claim rank or prominence. It remains inspectable and **does not set Reviewed for Action Plan, customer presentation approval or implementation state**. Partial results expose the particular missing evidence; conflicting addresses, phones or domains are surfaced without reconciliation. Consistent partial links do not manufacture duplicate competing businesses. Public evidence never overwrites the Business Profile.

Existing manual destination links, result controls, timestamps, notes, competitors, recommended action and Action Plan review remain. Manual corrections take precedence over an earlier automated conclusion. New evidence invalidates review; profile changes invalidate automatic conclusions. Canonical evidence fingerprints survive save/load key reordering and accept earlier stored fingerprints, while still invalidating genuinely changed evidence. Workspace request guards, profile identity and review fingerprints isolate updates.

## Machine Readability and proposed remediation

The website audit accepts an additive machine-readability option. It captures metadata from the same homepage response and obtains bounded robots text. Existing transport/errorCode, HTTPS fallback, description-duplication detection and Packet D mapping remain intact.

The deterministic evaluator covers:

- Technical accessibility: observed indexability directives, general robots rules, sitemap availability, canonical, HTTPS and availability of relevant rendered evidence.
- Metadata: titles/descriptions, duplicate/conflicting metadata, canonical consistency and observed Open Graph/Twitter metadata.
- Entities: JSON-LD types, business/organization identity, referenced addresses/locations, phone, URL, logo, sameAs, opening hours and represented service/location relationships.
- Semantics: visible identity, location, reviewed services, headings and internal supporting links.
- Consistency: only observed fields compared with current reviewed profile facts.

JSON-LD references resolve within the captured graph. A single explicitly associated location can supply its address; multiple locations are not silently merged. Generic WebSite/WebPage/BreadcrumbList types do not count as a complete business entity. Unknown schema types, incomplete parsing and insufficient reviewed identity suppress speculative absence findings. Optional logo, hours or sameAs absence alone is not a finding. Captured hours are not automatically owner-verified.

Meaningful conditions can create review candidates for missing business entity schema, incomplete business identity, profile conflicts or missing structured location. A specific entity finding replaces an overlapping legacy schema suggestion. Proposed remediation records the change, access, implementation mechanism, expected state, verification, rollback/recovery and lifecycle. It stops at evidence/proposal; no customer website changes or executable deployment actions were added. Schema recommendations are generic and based on actual profile/evidence, with no school-specific requirement or ranking/citation guarantee.

Customer AI Discovery derives from actual machine-readability evidence and uses plain language. The existing internal AI tab now separates **Machine Readability / AI Readiness** from **AI Presence / Answer Testing**; answer testing remains external/manual. Workbench exposes checks, parsed entities, comparisons and remediation criteria. Progress remains driven by actual task starts/results. Results remains empty without implementation and verification.

Scope limits: general robots rules are interpreted deterministically; named-bot policy can still require review. Unavailable, non-text or truncated robots responses never establish access-clear. Source HTML is not proof of full rendered readability. Redirect-wrapper result URLs and unsupported DOM structures can require review. Host restrictions can yield partial rendered pages. The runner remains browser-session driven, not a durable server background job.

## Mary proving: actual results

Artifact: [packet-e1-mary-proving.json](packet-e1-mary-proving.json). Actual run began **2026-09-19T00:03:15.163Z**, ending **00:03:15.427Z** (September 18 in Detroit). Input was the provisional name, homepage, Southgate MI and recorded MMS directory URL. No phone, street address, services or reviewed profile facts were invented. The CLI also accepts a saved workspace with its real Business Profile review provenance.

Brand query: `Montessori Center of Downriver`.
Location query: `Montessori Center of Downriver Southgate, MI`.

All entries below attempted Tier 1 and reached Tier 2's provider entry, but both failed DNS preflight with `EAI_AGAIN`. **Chromium did not navigate.** No usable evidence, candidate, matched field or automatic observation was obtained; confidence is unavailable. Every entry requires review. This is an acquisition blocker, not evidence that the business is absent. No actual Tier-3 interaction blocker was established.

| Destination | Brand outcome / time | Location outcome / time | Evidence / auto observation | Review / Tier-3 established |
|---|---|---|---|---|
| Google Search | DNS failed / 227 ms | DNS failed / 1 ms | None / no | Required / no |
| Google Maps | DNS failed / 1 ms | DNS failed / <1 ms | None / no | Required / no |
| Bing Search | DNS failed / 1 ms | DNS failed / 1 ms | None / no | Required / no |
| Apple Maps | DNS failed / <1 ms | DNS failed / <1 ms | None / no | Required / no |
| DuckDuckGo | DNS failed / 1 ms | DNS failed / 1 ms | None / no | Required / no |
| Yelp | DNS failed / <1 ms | DNS failed / <1 ms | None / no | Required / no |
| Facebook | DNS failed / 1 ms | DNS failed / <1 ms | None / no | Required / no |
| Instagram | DNS failed / <1 ms | DNS failed / 1 ms | None / no | Required / no |

Times measure immediate environment rejection, not destination latency; the first rendered attempt includes module loading. `CODEX_SANDBOX_NETWORK_DISABLED=1` was reported. The website's four normal URL-variant attempts also failed DNS. MMS `https://mmsoc.org/accredited-schools/` attempted both providers, failed DNS in <1 ms, and supplied no Business Information facts.

Public Presence correctly aggregates **16 attempted, 0 evidence, 0 automatic, 0 reviewed, 16 needing review: Needs review**. That derived summary was computed from the stored run without adding a new acquisition. The run contains 20 attempted logical tasks, 0 successful/evidence-bearing tasks, 18 operator-review tasks, 17 interactive-review tasks, 35 acquisition failures, 17 escalation attempts and 0 candidates/customer approvals. The broader 21 manual-intervention count also includes unsupported or evidence-unavailable work; it is not a customer score or a statement that all such work must be sold. Website internal subrequests are counted as one audit task; escalation means provider attempt, not browser launch.

| Machine-readability item | Current Mary result |
|---|---|
| Metadata, crawler access, sitemap, canonical, HTTPS | Unavailable: no page captured |
| Current JSON-LD/schema types | Unavailable; historical generic schema is not a fresh measurement |
| Business entity, address, phone, sameAs | Unobserved; no absence inferred |
| Identity/location/service clarity | Not measurable in this attempt |
| Comparison against reviewed Business Profile | No current source facts; proving input remains provisional |
| New reviewable Mary findings | None from this run |

The known **Secure website connection** and **Homepage search description** cases remain covered by the existing Packet D/D.2 tests and E.1 audit/client replay. That replay uses historical description/schema elements with controlled transport and synthetic supporting facts. It preserves detection, but is **not** a successful Mary live rescan. A missing-business-entity candidate is demonstrated by fixtures, not asserted as a newly verified Mary condition.

## Runtime configuration

Use the existing gitignored `.env.runtime.local` for this Studio Node installation:

```dotenv
FOUND_LOCAL_PLAYWRIGHT_MODULE=/home/tdauss/Projects/family-creator-lab/node_modules/playwright/index.mjs
FOUND_LOCAL_CHROMIUM=/home/tdauss/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome
FOUND_LOCAL_CHROMIUM_SANDBOX=false
FOUND_LOCAL_PUBLIC_DIRECTORY_HOSTS=mmsoc.org
```

`npm run dev:configured` starts the configured application; `npm run server:configured` starts the API only. Portable defaults remain in `.env.runtime.example`. Only literal `false` opts out of Chromium sandboxing; headless operation, TLS validation and bounded read-only capture remain. These are configuration paths, not business logic. No existing server was restarted or customer workspace modified.

Repeat proving from a network-enabled runtime using the reviewed workspace export:

```bash
node --env-file=.env.runtime.local --import tsx scripts/prove-visibility-scan.ts \
  /path/to/reviewed-workspace.json /path/to/proving-output.json
```

## Tests and changed files

Complete final command output and exit codes: [packet-e1-test-results.txt](packet-e1-test-results.txt).

| Command | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run test:profile-separation` | PASS |
| `npm run test:visibility-workflow` | PASS |
| `npm run test:packet-a` | PASS |
| `npm run test:packet-b` | PASS |
| `npm run test:packet-c` | PASS |
| `npm run test:packet-d` | PASS, including D.2 audit/client replay |
| `npm run test:packet-e` | PASS, unchanged assertions |
| `npm run test:proving-001` | PASS, audit and evidence contract |
| `npm run test:proving-002` | PASS, browser observation |
| `npm run test:packet-e1` | PASS, all 16 acceptance cases plus negative/freshness cases |

E.1 also tests unreviewed/changed profile provenance, competing and hidden entities, no cross-card merging, robots group boundaries and truncation, JSON-LD references/linked locations, manual override, stale evidence, persistence key ordering, remediation lifecycle and real React Scan/Results/Public Presence surfaces. Existing test files were not weakened or changed. Build splits the orchestration chunk from the initial UI bundle. CSS, dependencies and lockfile are unchanged.

Files added for E.1:

- `src/types/entityMatch.ts`, `src/types/machineReadability.ts`
- `src/utils/entityMatcher.ts`, `src/utils/searchResultExtraction.ts`, `src/utils/structuredEntities.ts`, `src/utils/machineReadability.ts`, `src/utils/evidenceFingerprint.ts`, `src/utils/visibilityScanState.ts`
- `server/machineReadabilityCapture.ts`
- `src/components/MachineReadabilityPanel.tsx`
- `scripts/test-packet-e1.ts`
- `docs/packet-e1-search-machine-readability.md`, `docs/packet-e1-mary-proving.json`, `docs/packet-e1-test-results.txt`

Files updated for E.1, including files introduced by the already-uncommitted Packet E:

- `package.json`, `server/index.ts`, `server/websiteAudit.ts`
- `src/App.tsx`
- `src/types/audit.ts`, `src/types/websiteAudit.ts`, `src/types/visibilityScan.ts`, `src/types/findingIntelligence.ts`
- `src/utils/visibilityScan.ts`, `src/utils/workspaceFindings.ts`, `src/utils/websiteAutoAudit.ts`, `src/utils/customerScan.ts`, `src/utils/publicPresence.ts`, `src/utils/searchVisibility.ts`, `src/utils/searchAggregation.ts`
- `src/components/CustomerScanView.tsx`, `src/components/SearchVisibilityPanel.tsx`, `src/components/CustomerFindingReview.tsx`, `src/components/VisibilityRunReview.tsx`
- `scripts/prove-visibility-scan.ts`

The other visible working-tree changes are inherited Packet E implementation/configuration/report files, documented in [the Packet E inventory](packet-e-visibility-orchestrator.md). No staging or commits were performed.

## Remaining interventions, scheduling gate and next packet

First confirm/review Mary's Business Profile and rerun from the network-enabled configured application. Review actual transport and metadata evidence, assess all Brand/Location outcomes, and inspect the MMS candidate if captured. Resolve only the resulting ambiguities with the retained manual forms. Review meaningful machine-readability candidates and proposed customer wording; then prepare the bounded delivery proposal with access requirements, approval and verification criteria. Customer implementation remains outside this packet.

**Specific Tier-3/CUA candidates based on this live attempt: none established.** DNS failure is not an interaction blocker. The implementation recognizes captured public place-picker/interactive-card controls with unresolved identity as potential Tier-3 work; fixture tests demonstrate that classification. Only a future successful capture can identify which Mary destination actually warrants it. Login/challenge pages remain manual exceptions, never bypass tasks.

**SCHEDULE_MARY = NO** until current network-enabled acceptance succeeds, reviewed profile/source identity is established, necessary evidence gaps and conflicting facts are resolved, and the reviewed customer delivery proposal is ready. No scheduling or customer communication was performed.

Recommended next bounded packet: **E.2 — Network-enabled Mary acceptance and delivery proposal**. Run both query families and machine-readability capture, retain real evidence fixtures, calibrate only extractors justified by observed blockers, resolve review exceptions, and assemble the proposal. Defer CUA implementation and customer changes until actual blockers and approvals support them.
