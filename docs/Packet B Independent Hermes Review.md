# Packet B — Independent Hermes Review

Repository: C:\Projects\local-signal-scanner  
Branch: proving/browser-assisted-evidence-002  
HEAD: a63e561beb0aafa2694e2aeee07aebd31537a37a  
Review mode: read-only  
Scope: working-tree diff against Packet A baseline (a3c3f64)

---

## Verdict

**PASS WITH CORRECTIONS**

Packet B implements the core sales-readiness capability without inventing facts, duplicating evidence, or weakening Packet A state integrity. The schema, normalization, UI, and Action Plan integration are materially sound. There are important presentation gaps and edge-case failures that should be corrected before the Montessori proving run, but none are blockers.

## Safe for Montessori Proving Run

**Yes**, with operator awareness of:
- FixPlan fallback behavior when no Starter actions exist
- Corroboration currently evaluates only Business name
- No duplicate detection across areas

## Packet A Integrity Preserved

**Yes.** The added `salesReadiness` state is additive, normalized through existing save/reload/import/export paths, and does not mutate Packet A profile, website, public-presence, AI, or browser/server evidence contracts. One minor concern: `normalizeSalesReadiness` blankets defaults over existing items, which could mask partial legacy data during import.

## Commit Structure

**One commit.** The changes are cohesive: types, state normalization, UI panel, FixPlan integration, tests, and documentation. Splitting would be artificial.

**Recommended message:**  
`Add Packet B sales-readiness capability`

---

## Findings

### BLOCKER

None.

### IMPORTANT

**IM-1 — FixPlan fallback exposes non-Starter work when no Starter actions exist**  
- **File/location:** `src/App.tsx:741`, `src/components/FixPlan.tsx:64-67`  
- **Failure mode:** `const visible = starter.length ? starter : fixes` causes the operator to see owner_action, later, and excluded work in the default Action Plan view when no reviewed Starter actions have been added yet.  
- **Practical consequence:** During the Mary sales conversation, the default view could surface work outside Starter scope, confusing the offer boundary.  
- **Smallest correction:** Replace the fallback with an explicit empty-state message such as "No Starter actions yet. Review findings in Sales Readiness and add verified fixes to build the Starter recommendation."  
- **Required test:** Render `FixPlan` with mixed `salesPackageFit` values and zero `starter` items; assert no raw fix cards render for later/excluded/owner_action work.

**IM-2 — Corroboration evaluates only Business name and never shows observed value**  
- **File/location:** `src/utils/salesReadiness.ts:29-35`, `src/components/SalesReadinessPanel.tsx:15`  
- **Failure mode:** `deriveCorroboration` creates only Business-name records, always with `observedValue: ''`, and the result classifier never reaches 'Match', 'Not found', 'Acquisition unavailable', 'Owner confirmation needed', or 'Unable to verify'.  
- **Practical consequence:** The operator cannot see source-specific discrepancies for category, phone, address, or hours. The corroboration panel shows partial-match text without the actual observed business name from the directory row.  
- **Smallest correction:** Either extend derivation to additional fields present in directory rows, or explicitly limit the UI to "Business name corroboration only" and populate `observedValue` from row data or `publicEvidenceNotes`.  
- **Required test:** Corroboration fixture with known directory rows for multiple fields; assert rendered output includes observed values and field-specific results.

**IM-3 — Displayed package fit uses legacy field while filtering uses new field**  
- **File/location:** `src/components/FixPlan.tsx:17-29` vs `src/components/FixPlan.tsx:64`  
- **Failure mode:** `packageFitForFix` reads `fix.packageFit`, but the Starter/owner/later buckets read `fix.salesPackageFit`. Packet B action creators set both fields, but future fixes or Packet A fixes that only populate one field will display inconsistent package-fit labels.  
- **Practical consequence:** Operator sees mismatched package-fit text vs actual bucket placement.  
- **Smallest correction:** Read `salesPackageFit` first in `packageFitForFix`, falling back to `packageFit`.  
- **Required test:** Render `FixPlan` with a fix having only `salesPackageFit`; assert displayed text matches bucket label.

### MINOR

**MN-1 — normalizeSalesReadiness silently defaults existing fields**  
- **File/location:** `src/utils/salesReadiness.ts:24-27`  
- **Failure mode:** Blanket nullish coalescing overwrites intentionally blank imported fields with defaults.  
- **Practical consequence:** Partial legacy scans lose intentional emptiness.  
- **Smallest correction:** Preserve existing values when present; only default truly missing fields during initial seed, not during normalize.  
- **Required test:** Normalize partial `salesReadiness` fixture; assert existing `recordedAt`, `operatorNotes`, and `packageFit` are preserved.

**MN-2 — Corroboration observedValue is always empty**  
- **File/location:** `src/utils/salesReadiness.ts:34`  
- **Failure mode:** `observedValue: ''` removes the actual observed business name from the record.  
- **Practical consequence:** Operator must infer observed value from source evidence text.  
- **Smallest correction:** Populate `observedValue` from the directory row business name or evidence note.  
- **Required test:** Assert `deriveCorroboration` output contains non-empty `observedValue`.

**MN-3 — Seeded customer questions default to owner_action, reducing Starter visibility**  
- **File/location:** `src/utils/salesReadiness.ts:21`  
- **Failure mode:** Every seeded question starts as `owner_action`, so none appear in the Starter bucket until the operator explicitly reclassifies them.  
- **Practical consequence:** Fewer Starter actions than warranted; operator may overlook reclassification step.  
- **Smallest correction:** Default to `later` or leave blank and require explicit operator classification before adding to Action Plan.  
- **Required test:** Assert seeded question packageFit; verify operator can change before Action Plan insertion.

**MN-4 — No duplicate detection across entity, question, and existing fix areas**  
- **File/location:** `src/utils/salesReadiness.ts`, `src/App.tsx`  
- **Failure mode:** Operator can add overlapping findings from Entity Clarity, Customer Questions, and existing audit fixes.  
- **Practical consequence:** Redundant recommendations in Mary conversation.  
- **Smallest correction:** Deduplicate by normalized text or dimension before inserting into `manualFixes`, or warn on near-duplicate.  
- **Required test:** Add overlapping entity and question; assert single Action Plan entry or warning.

**MN-5 — Sales Readiness panel lacks reviewed-progress indicator**  
- **File/location:** `src/components/SalesReadinessPanel.tsx`  
- **Failure mode:** Long flat scroll with no summary of reviewed vs unreviewed items.  
- **Practical consequence:** Operator may miss unreviewed items before Mary call.  
- **Smallest correction:** Add reviewed-count badge per section.  
- **Required test:** UI snapshot with mixed reviewed state; assert counts visible.

**MN-6 — deriveCorroboration result classifier is incomplete**  
- **File/location:** `src/utils/salesReadiness.ts:33`  
- **Failure mode:** Only 'Conflict' and 'Partial match' are reachable; the type declares six other results that can never be produced.  
- **Practical consequence:** Misleading type definition; future maintenance confusion.  
- **Smallest correction:** Expand inference logic or remove unreachable union members.  
- **Required test:** Unit test for each evidence pattern asserting expected result type.

### NOTE

**NT-1 — Sales Summary copy still implies broad AI testing**  
- **File/location:** `src/App.tsx:1657-1660`  
- **Failure mode:** Pre-existing copy says "optional manual AI evidence readiness," which is truthful but could be misread during the Mary conversation.  
- **Practical consequence:** Minor framing risk.  
- **Smallest correction:** Update copy to "optional manual AI presence evidence."  
- **Required test:** None required for Packet B; note as pre-existing.

**NT-2 — No Packet A regression test for new state in save/reload/JSON round-trip**  
- **File/location:** `scripts/test-packet-a.ts`  
- **Failure mode:** Packet A tests cover profile, search, AI, voice, and public-presence state integrity, but do not exercise `salesReadiness` through localStorage save/reload or JSON import/export.  
- **Practical consequence:** Undetected migration or serialization regression.  
- **Smallest correction:** Add one Packet A regression test that creates state with `salesReadiness`, serializes to JSON, round-trips through `normalizeAuditState` / `parseImportedScanFile`, and asserts `salesReadiness` survives unchanged.  
- **Required test:** New regression in `test-packet-a.ts`.

---

## Exact Findings Summary

| ID | Severity | File | Failure Mode | Practical Consequence | Smallest Correction | Required Test |
|---|---|---|---|---|---|---|
| IM-1 | IMPORTANT | `src/App.tsx:741`, `src/components/FixPlan.tsx:64-67` | FixPlan fallback exposes all fixes when no Starter actions exist | Mary sees non-Starter work in default view | Empty-state message when `starter.length === 0` | Render test with zero starter actions |
| IM-2 | IMPORTANT | `src/utils/salesReadiness.ts:29-35`, `src/components/SalesReadinessPanel.tsx:15` | Corroboration evaluates only Business name; observedValue always empty | Operator cannot see source-specific discrepancies or observed values | Extend field evaluation or limit UI scope; populate observedValue | Corroboration fixture with multiple fields |
| IM-3 | IMPORTANT | `src/components/FixPlan.tsx:17-29` vs `:64` | Displayed package fit reads legacy `packageFit` while filtering uses `salesPackageFit` | Mismatched labels vs bucket placement | Read `salesPackageFit` first, fallback to `packageFit` | Render test with only `salesPackageFit` |
| MN-1 | MINOR | `src/utils/salesReadiness.ts:24-27` | Blanket defaults overwrite intentional blanks during normalize | Partial legacy scans lose intentional emptiness | Preserve existing values when present | Normalize partial fixture; assert preservation |
| MN-2 | MINOR | `src/utils/salesReadiness.ts:34` | `observedValue` always empty | Operator cannot see observed business name | Populate from directory row or evidence note | Assert non-empty observedValue |
| MN-3 | MINOR | `src/utils/salesReadiness.ts:21` | Seeded questions default to `owner_action` | Fewer Starter actions; operator may skip reclassification | Default to `later` or blank; require explicit classification | Assert default and reclassification flow |
| MN-4 | MINOR | `src/utils/salesReadiness.ts`, `src/App.tsx` | No duplicate detection across areas | Redundant recommendations | Deduplicate or warn before Action Plan insert | Add overlapping entity and question |
| MN-5 | MINOR | `src/components/SalesReadinessPanel.tsx` | No reviewed-progress indicator | Operator may miss unreviewed items | Add reviewed-count badge per section | UI snapshot with mixed state |
| MN-6 | MINOR | `src/utils/salesReadiness.ts:33` | Result classifier incomplete | Misleading type definition | Expand inference or remove unreachable types | Unit test for each evidence pattern |
| NT-1 | NOTE | `src/App.tsx:1657-1660` | Pre-existing summary copy implies broad AI testing | Minor framing risk | Clarify copy | Not required for Packet B |
| NT-2 | NOTE | `scripts/test-packet-a.ts` | No Packet A regression for `salesReadiness` save/reload | Undetected serialization regression | Add round-trip regression test | New Packet A test |

---

## Residual Risks

1. **FixPlan fallback behavior** could still confuse operators if not corrected before the Mary call.
2. **Corroboration scope limitation** means third-party validation is currently name-only; category, phone, address, and hours discrepancies are not surfaced.
3. **Duplicate findings** across Entity Clarity, Customer Questions, and existing audit fixes may create Action Plan clutter.
4. **Missing regression coverage** for Packet A save/reload with new `salesReadiness` state leaves serialization behavior unverified.

---

## Smallest Correction Packet

If corrections are desired before the proving run, the minimal set is:

1. `src/components/FixPlan.tsx` — replace `visible = starter.length ? starter : fixes` with explicit empty-state for missing Starter actions.
2. `src/components/FixPlan.tsx` — read `salesPackageFit` before `packageFit` in `packageFitForFix`.
3. `src/utils/salesReadiness.ts` — populate `observedValue` in `deriveCorroboration`.
4. `src/utils/salesReadiness.ts` — preserve existing normalized fields instead of blanket defaulting.
5. `scripts/test-packet-b.ts` — add tests for IM-1, IM-2, IM-3, MN-1, MN-2.
6. `scripts/test-packet-a.ts` — add one regression test for `salesReadiness` JSON round-trip through `normalizeAuditState`.
