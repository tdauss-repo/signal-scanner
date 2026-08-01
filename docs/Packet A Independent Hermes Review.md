# Packet A — Independent Hermes Review

Repository: C:\Projects\local-signal-scanner
Branch: proving/browser-assisted-evidence-002
Review mode: Read-only
Date: 2026-08-01

## Verdict

**PASS WITH CORRECTIONS**

Packet A is materially closer to product-truth behavior than the prior state. The core architecture improvements—destination-specific search evidence, explicit evidence semantics, business-profile provenance separation, inert AI adapter, and removal of Voice from scored/navigation views—are implemented correctly and reduce overclaiming.

There is one blocking behavioral defect in the Search Visibility -> Action Plan path that can produce edit-order-dependent aggregate conclusions. There are also two important presentation issues where stale Voice/AI framing can still appear in reports and summaries despite the intended removal.

---

## BLOCKER

### 1. Search Action Plan aggregates the first reviewed destination observation, creating edit-order-dependent results
- **Files/locations:**
  - `src/App.tsx:836-914` (`addSearchVisibilityToActionPlan`)
- **Failure mode:**
  - When adding a Search Visibility query to the Action Plan, the code filters to reviewed observations and then selects `reviewed[0]` as the primary observation. The aggregate check status, evidence notes, recommended action, and evidence confidence are derived from that single first-reviewed observation.
  - If the operator reviews Google Search first and it is `found_prominently`, the Action Plan item becomes a pass/low-priority maintenance note. If they review Bing first and it is `not_found`, the same underlying multi-destination evidence becomes a fail/high-priority fix. The mixed-result meaning changes based on review/editing order rather than the actual set of destination evidence.
- **Practical consequence:**
  - Operators can silently change Action Plan priority, status, and recommended action without changing any observed facts.
  - Stale Action Plan items can misrepresent what was actually reviewed when a later edit changes the review order.
- **Smallest correction:**
  - Make the aggregate deterministic and semantically explicit. Options include:
    1. Require all enabled destinations to be reviewed before adding to Action Plan, and derive status from the full set (e.g., mixed, worst-case, or per-destination evidence).
    2. If partial review is allowed, record the aggregate rule explicitly and label it in the Action Plan item.
- **Required test:**
  - Create two reviewed destination observations with conflicting results; assert that the resulting Action Plan item is identical regardless of which destination is edited/reviewed first.

---

## IMPORTANT

### 2. AI Visibility section still appears in report/overall summaries as if it were a scored/checked area
- **Files/locations:**
  - `src/App.tsx:676-681` (`ai` score object)
  - `src/App.tsx:696` (`Overall` checked count includes `ai.checked`)
  - `src/App.tsx:699` (`AI Answers` remains a returned score view)
  - `src/components/ReportView.tsx:25-31, 156-159`
- **Failure mode:**
  - The Packet A documentation states AI Visibility has no numeric score. The implementation does set AI to Gray/null in scoring, but the report and overall summaries still include an `AI Answers` section card with status copy such as “AI answer tests are recognizing useful business facts across checked platforms,” and `Overall.checked` includes AI checks.
  - This can imply AI has been assessed when it has not.
- **Practical consequence:**
  - Customer-facing reports can overstate AI verification. Untested AI does not reduce scores, but it can still be presented as a visibility area that needs strengthening.
- **Smallest correction:**
  - Remove `AI Answers` from report section summaries and Overall checked counts, or explicitly label it “Manual evidence only / not tested” whenever `ai.score === null`.
- **Required test:**
  - Assert that with all AI platforms untested, the report does not include AI-specific “opportunity” copy and `Overall.checked` does not increase from AI items.

### 3. Voice wording still appears in report copy despite removal from top-level scoring/navigation
- **Files/locations:**
  - `src/components/ReportView.tsx:160-163`
  - `src/App.tsx:648` (`voice` still exists in `groups` even though it is not in `views`)
  - `src/components/ReportView.tsx:47`
- **Failure mode:**
  - Voice is correctly absent from top-level scored views and navigation, but report section copy still says “Voice source-readiness signals look strong...” and still routes fixes into a `Voice` section.
  - `groups.voice` is still built from `auditItems` even though no top-level view renders it.
- **Practical consequence:**
  - Customer reports and Action Plan section labels can still mention Voice readiness, which contradicts the Packet A claim that Voice is not a top-level scored view.
- **Smallest correction:**
  - Replace report Voice section copy with entity/listings framing, or remove the Voice report section card entirely. Update `fixSection` to route `voice` items into `Listings`.
- **Required test:**
  - Assert that the report does not contain a Voice section heading when Voice is not in the active scored views.

---

## MINOR

### 4. Destination evidence UI does not enforce `reviewed` from `evidenceKind` or `overallResult`
- **Files/locations:**
  - `src/components/SearchVisibilityPanel.tsx:14`
- **Failure mode:**
  - The UI patch function sets `evidenceKind` based on `overallResult`, but does not set `reviewed: true` automatically. The operator must also toggle reviewed status explicitly for `addSearchVisibilityToActionPlan` to accept it.
- **Practical consequence:**
  - Slight usability friction; if an operator records a result but forgets to mark reviewed, the Action Plan gate rejects it with no indication why.
- **Smallest correction:**
  - Auto-set `reviewed: true` when `overallResult` changes from `not_checked` to a concrete result, or surface the reviewed checkbox prominently next to the result selector.

### 5. AI readiness labels are coarse and can imply capabilities not present
- **Files/locations:**
  - `src/components/AIAnswerVisibilityTest.tsx:25-31`
- **Failure mode:**
  - Readiness categories return `Ready`, `Partial`, or `Unable to verify`. `Ready` for “Identity clarity” is based solely on `profile.businessName && profile.website`, which is owner-confirmed input rather than public evidence.
  - This blurs the line between entered business seed facts and public visibility readiness.
- **Practical consequence:**
  - Operators may interpret `Ready` as “this is verified externally” when it is only “the profile has a value.”
- **Smallest correction:**
  - Rename or annotate readiness categories so `Ready` means reviewed public evidence, not merely a populated profile field. For profile-dependent categories, add a secondary label such as “Profile fact present; public evidence not yet assessed.”

### 6. Report customer summary is static and not driven by evidence
- **Files/locations:**
  - `src/components/ReportView.tsx:169-171`
- **Failure mode:**
  - `generateExecutiveSummary` returns a hard-coded paragraph that does not reflect actual findings, destination mix, or evidence confidence.
- **Practical consequence:**
  - The customer report can claim “solid local foundation” even when most checks are unchecked or failing.
- **Smallest correction:**
  - Make executive summary generation conditional on actual scores/checks/evidence, or remove the auto-generated paragraph and require operator review.

---

## NOTE

### 7. `searchDestinationObservations` is a two-level record keyed by query ID then destination
- **Files/locations:**
  - `src/types/audit.ts:122-125`
  - `src/utils/searchVisibility.ts:61-78`
- **Observation:**
  - This is a sound design for independent destination evidence. Migration projects legacy single-destination records into this shape without duplication. `normalizeSearchResultTypes` correctly enforces `Not found` exclusivity.
  - The only caution is that `searchDestinationObservations` and legacy `searchVisibilityTests` coexist; downstream code must continue treating `searchDestinationTests` as legacy projection data. Current code does this correctly.

### 8. Business profile state separation preserves legacy data without overwriting
- **Files/locations:**
  - `src/utils/businessProfileState.ts`
  - `src/App.tsx:445-469`
- **Observation:**
  - `normalizeBusinessProfileState` adds provenance to legacy fields; `recordOperatorProfileChanges` stamps operator edits; `preserveOwnerConfirmedValues` is present for future research merges. This satisfies the stated owner-confirmed preservation requirement.

### 9. AI provider adapter remains inert and UI does not imply automated scanning
- **Files/locations:**
  - `src/utils/aiProviderAdapter.ts`
  - `src/components/AIAnswerVisibilityTest.tsx:25-35`
- **Observation:**
  - The adapter reports `connected: false`. The UI presents AI Presence as manual observations plus qualitative readiness. No numeric AI score is computed. This satisfies the requirement.

### 10. Browser/server website evidence behavior is preserved
- **Files/locations:**
  - `src/utils/websiteAuditState.ts`
  - `src/utils/websiteAutoAudit.ts`
  - `src/App.tsx:1338-1404`
- **Observation:**
  - `browserObservation` persists separately. Server precedence is preserved through `mergeBrowserMappingWithServerPrecedence`. Website manual observation draft invalidation still resets `analyzedAt`/`recordedAt` and clears operator-observation website checks/notes/confidence when evidence changes.

### 11. Voice is correctly removed from scored/navigation views
- **Files/locations:**
  - `src/App.tsx:155-176`
  - `src/App.tsx:667-700`
  - `src/components/VoiceReadinessPanel.tsx`
- **Observation:**
  - Voice is no longer in `views`/`ScoreView`. It is not included in `scores` or Overall weighting. Entity readiness and optional assistant observations remain available under Listings. Untested assistants do not reduce scores.

---

## Test Quality

### Covered well
- Canonical brand query construction and optional diagnostic flag.
- Legacy search migration preserves destination, notes, result types.
- Destination-specific `Not found` exclusivity.
- `controlledScanConnection()` remains disconnected.
- Profile normalization, operator edits, and owner-confirmed preservation.
- Website browser/server evidence coexistence and precedence.

### Missing or weak
1. **Search Action Plan edit-order independence** — no test asserts deterministic aggregate when destinations have conflicting results.
2. **Report/overall AI suppression when untested** — no test asserts `Overall.checked` and report section behavior with zero tested AI platforms.
3. **Voice removal from report/summary** — no test asserts report copy does not mention Voice when Voice is untested/unscored.
4. **Search observation review gating** — no test asserts that unreviewed observations cannot enter the Action Plan, or that reviewed state is preserved across save/load.

---

## Migration and Round-Trip Safety

- Legacy scan normalization remains idempotent for existing fields.
- Legacy search observations are projected to per-destination records with `legacy_imported` provenance.
- Legacy AI raw responses migrate into observations without discarding original fields.
- Legacy voice prompt tests migrate into assistant observations.
- `businessProfile` state augments rather than replaces `profile`.
- Server and browser website evidence survive normalization, save, reload, and JSON import/export.
- No duplicate observations are created on repeated normalization.

---

## Residual Risks

- **Medium:** Edit-order-dependent Search Action Plan behavior can mislead operators during the Montessori proving run if they review destinations in different sequences.
- **Low:** Report/overall wording can still imply Voice/AI assessment when those areas are untested.
- **Low:** AI readiness “Ready” status may be misinterpreted as external verification rather than profile-fact presence.

---

## Recommended Corrections Before Final Validation

1. **Blocking:** Change Search Visibility Action Plan aggregation to deterministic, explicit multi-destination semantics. Either require all-destination review or document and label the chosen aggregate rule.
2. **Important:** Remove or conditionally suppress AI and Voice report sections when they are untested, and prevent AI from contributing to `Overall.checked`.
3. **Minor:** Auto-set `reviewed` when an operator records a concrete search result, or make reviewed state more discoverable in the UI.

## Commit Boundary Guidance

If corrections are made:
- **Commit 1:** Evidence semantics, search destination model, migration/normalization, AI adapter inertness, business profile provenance split.
- **Commit 2:** UI updates for Search Visibility, AI Visibility, Listings/Voice presentation, report adjustments.
- **Commit 3:** Tests for Packet A behavior, migration fixtures, edit-order stability, and report/summary assertions.

If no corrections are made:
- Split into at least two commits: model/migration/utilities first, UI/components second. Do not package the current blocking Search Action Plan behavior into the final Packet A commit without explicit operator guidance.
