# Packet E.1a — Mary finding quality cleanup

Completed in the existing E/E.1 working tree on September 19, 2026. No customer website changes, providers, CUA, CSS changes, staging or commits. This packet changes finding presentation and deterministic review behavior; it does not claim a new live Mary scan or alter a saved customer workspace.

## Resulting initial finding set

The intended initial Mary Starter set is:

1. Secure website connection
2. Homepage search description
3. Incomplete machine-readable business identity

Each must have current supporting evidence and explicit operator presentation approval. Nothing is automatically approved. Presentation approval does not authorize implementation. Results remains empty until implementation and verification are recorded by a future delivery workflow.

The HTTPS and duplicate-description detection rules, identifiers, findings and delivery guidance are unchanged. The new focused test replays captured historical metadata through the real website auditor with controlled transport and synthetic profile review. It demonstrates all three candidates and the exact selected customer set after explicit test approval. This is a regression fixture, not new public evidence or an approval written to Mary's workspace.

## Wording and delivery fields

Customer-facing machine-identity findings and the legacy `website-schema` recommendation use **Incomplete machine-readable business identity**. Internal check IDs and the legacy audit catalog label remain stable for compatibility. Specific machine findings still replace the overlapping generic schema recommendation.

For captured generic WebSite/WebPage schema with sufficiently corroborated reviewed identity, the finding explains that general page/website structured data was observed but no explicit organization/business entity was observed connecting the real-world business to its confirmed location, contact information and related profiles. The generic-schema claim is conditional on actually captured types; it is not inserted when no such schema was seen.

The explanation describes how structured and visible information help search engines and AI systems identify the organization and reduce ambiguity. It explicitly disclaims guaranteed rankings, AI citations and rich-result eligibility. The recommendation calls for confirmed facts and an appropriate organization/entity type, without forcing LocalBusiness.

The proposal retains remediation, authorized access, customer input, implementation mechanism, expected corrected state, rollback/recovery and lifecycle. Customer input remains in the existing delivery model; no disconnected representation was added. Lifecycle remains **Evidence captured**. Verification now explicitly requires:

- Refetch the homepage and parse JSON-LD after approved implementation.
- Verify the expected entity type and confirmed name/address/phone/URL fields against the approved proposal; do not invent unconfirmed fields.
- Check for contradictory or duplicate structured identity.
- Rescan Machine Readability / AI Readiness and inspect unrelated page/metadata regressions.

Changed wording participates in the existing evidence/presentation signature, so an earlier approval cannot silently approve changed machine-finding copy.

## Customer-review behavior

Homepage SEO clarity remains available internally with its source observations, is classified as later/unreviewed, and is excluded from the customer-presentation gate. A previously saved composite approval cannot bypass that gate. Separate specific findings remain the path to useful bounded remediation.

Contact info visibility, Social profile links and Homepage title quality retain their evidence and explicit approval controls in a collapsed **Supporting observations — operator review required** section of the existing review panel. They are not automatically customer-approved. Operators can supplement evidence and explicitly promote them later. No scanner observations or manual fallback controls were deleted.

This is a generic finding-quality policy keyed to existing check identifiers, not customer names or industry-specific rules.

## AI Visibility summary

Workbench and customer Scan now use the same normalized machine-readability summary. Workbench reports:

`N evaluated · E with evidence · R need review · U unavailable · A AI answer observations reviewed`

Evaluated is the actual current report's check count. Evidence counts recorded check outcomes other than unavailable; it does not mean the business passed. Review-required counts explicit `needs_review` outcomes, while unavailable checks remain separately visible. An observed absence can be evidence without automatically becoming a defect finding. AI answer observations remain a separate count, and no numerical visibility score is introduced.

The state label is **Evidence captured — awaiting review**, consistent with the customer view. Stale or foreign workspace reports contribute no current evaluated checks. The former combination of readability evidence captured with zero checked AI-answer observations is removed.

## robots.txt HTTP 406

A 406 response remains acquisition/crawler evidence requiring targeted verification. It does not establish that ordinary search crawlers are blocked. Machine evaluation records an unavailable robots interpretation with an explicit clarification note and creates no robots defect condition.

The legacy combined sitemap/robots recommendation is also held as later/unreviewed evidence with no customer-presentation eligibility for that captured 406 response. This closes the alternate promotion path while preserving the original scan notes. A later successful capture and specific reviewed evidence can support a new conclusion; this packet neither changes robots.txt nor asserts its contents.

## Changed files for E.1a

The working tree also contains earlier E/E.1 changes. This packet changes only:

| File | Change |
|---|---|
| `src/utils/machineReadability.ts` | Customer identity wording, explicit verification, shared evidence summary, targeted 406 interpretation |
| `src/utils/workspaceFindings.ts` | Legacy customer label, internal composite classification, hold 406-derived recommendation |
| `src/utils/customerScan.ts` | Composite presentation exclusion, supporting-item classification, shared AI summary |
| `src/components/CustomerFindingReview.tsx` | Retain weaker findings in supplemental review controls |
| `src/App.tsx` | Truthful Workbench readability/AI-answer counts and normalized label |
| `package.json` | Add `test:packet-e1a` |
| `scripts/test-packet-e1a.ts` | All ten requested focused cases, real auditor replay and rendered review/customer/card checks |
| `docs/packet-e1a-test-results.txt` | Full regression output and exit codes |
| `docs/packet-e1a-finding-quality.md` | This report |

## Full regression results

[Full output](packet-e1a-test-results.txt). All exited successfully:

| Command | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run test:profile-separation` | PASS |
| `npm run test:visibility-workflow` | PASS |
| `npm run test:packet-a` | PASS |
| `npm run test:packet-b` | PASS |
| `npm run test:packet-c` | PASS |
| `npm run test:packet-d` | PASS, including D.2 integration replay |
| `npm run test:packet-e` | PASS |
| `npm run test:packet-e1` | PASS |
| `npm run test:packet-e1a` | PASS, all ten requested cases |
| `npm run test:proving-001` | PASS |
| `npm run test:proving-002` | PASS |

The existing catalog-migration test also passed unchanged. Existing tests were not edited or weakened. Focused coverage also confirms that weaker findings remain promotable by explicit review, old composite approval cannot bypass the gate, raw observations survive, and profile facts are not overwritten.

## Remaining scheduling blockers

**SCHEDULE_MARY = NO based on evidence available in this workspace.** The earlier E.1 proving attempt was DNS-blocked; this cleanup does not establish current network-enabled acceptance. The user-reported current 406 is handled conservatively and reproduced by the new fixture, not independently live-reverified here.

Before changing the scheduling gate: obtain/review current evidence from the network-enabled application and the confirmed Business Profile; independently verify the secure-connection and description conditions; inspect the supported structured-identity finding; record robots as a targeted-verification exception without presenting it as a business defect, and resolve acquisition exceptions needed to support the agreed delivery scope; explicitly approve the three findings' customer presentation; and prepare the bounded Starter proposal with access, customer input, approval and verification requirements. No scheduling, customer communication or implementation occurred.
