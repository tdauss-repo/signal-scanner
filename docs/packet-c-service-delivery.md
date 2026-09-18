# Packet C — Service-delivery cockpit

The default surface is now the customer Scan View. It presents the active
workspace's business name, website, four visibility areas, actual check counts,
and reviewed recommendations. Open Workbench returns to the existing detailed
application. All existing Website SEO, Public Presence, Profile Management, AI
Visibility, Sales Readiness, Reports, Business Profile, Settings, manual fallback,
and evidence tools remain available.

## Customer surfaces

- **Scan:** a light, green-accented overview with Website & Technical, Search &
  Maps, Business Information, and AI Discovery. Website scans use the existing
  handler; only that area reports scan progress. The counters explicitly separate
  website check results from reviewed improvements and customer-input items.
  A failed latest acquisition remains a confirmation need even when older
  website results exist. No numeric visibility score is shown.
- **Findings:** explicitly approved observations, recommendations, priority,
  available rationale, scope/access caveats, and optional evidence/verification.
  Missing rationale stays visibly missing; no impact claim is generated.
- **Action Plan:** the same approved findings grouped into Found Local can help
  fix, customer input needed, and future/additional opportunity. Future work is
  outside initial scope. Presentation approval never authorizes remediation.
- **Results:** an honest empty state and before/change/after structure. The
  lifecycle is explained as a process, not displayed as fabricated achievements.

The customer shell uses whitespace, compact area badges, responsive cards,
keyboard focus states, a skip link, and navigation with `aria-current`.

## Review and persistence

In the Workbench, choose **Review customer findings** (also on Overall).
Read the evidence and wording, then explicitly approve a finding for customer
presentation. Withdraw it with the same control.

Packet B's `isStarterEligible` gate remains in force. Every presented finding
also requires `reviewed: true`, a failed/partial result, nonblank evidence,
a recommendation, and a verification method. Excluded findings cannot be
presented. Old automatic website classifications can set `reviewed: true`, so
that flag alone is insufficient for Packet C: presentation approval is separate.

The optional `AuditState.customerFindingReviews` map records the reviewed
context for each finding. Existing saved scans need no migration or schema
version change; absent approvals mean no customer findings. Approvals survive
save/export/import and loading an unchanged workspace. Any change to profile,
source evidence, or a recommendation invalidates the corresponding snapshot
conservatively. A later scan therefore cannot silently inherit presentation
approval. No approval/implementation/verification status is inferred.

This context snapshot is deliberately simple. It duplicates source context per
approved finding; a compact versioned evidence reference can be considered if
large real workspaces approach LocalStorage capacity. No new data service is
introduced here.

## Business isolation

Use **New business scan**, then enter the new business's seed. Editing a seed
continues to edit the existing workspace and now explicitly warns about retaining
its evidence. Loading partial legacy profiles fills missing fields with blanks,
never JEM's contact details, services, or market. The initial demo is unchanged.

Loading or starting a workspace clears transient browser-import text and errors.
In-flight website results are discarded if the business changes, a different
workspace is loaded, or a newer request supersedes the previous one. Presentation
approval is also bound to business identity and evidence. These guards prevent
late website responses from contaminating another business.

## Validation

Run the existing lint, build, profile-separation, visibility-workflow, Packet A,
Packet B, proving-001, and proving-002 commands, plus `npm run test:packet-c`.
Packet C tests exercise empty/partial/failed states, explicit presentation review,
Starter eligibility, stale evidence, profile isolation, JSON round trips, and
actual React markup for Scan, Findings, Action Plan, and Results using separate
Montessori Center of Downriver and JEM profiles. All test observations are
synthetic; they are not customer findings or a real scan.
The actual App LocalStorage-loading path is also rendered with each profile,
including a partial legacy Montessori profile and a persisted internal tab.

On 2026-09-16 these checks passed. Browser inspection could not run in the agent
execution context: Vite's local listener was denied (`EPERM`) and existing
Chromium failed on socket creation. React rendering was exercised without a
browser. No current exported Montessori workspace was available in the project
checkout or the bounded Downloads/Documents search. Tom's browser LocalStorage
was not read or overwritten. Exact live-workspace visual acceptance remains
unverified; the fixture verifies presentation from separate business state.

### Browser acceptance checklist

On the normal existing LAN development surface:

1. Save the current workspace before switching businesses. Reload; confirm Scan
   is the default even if the last Workbench screen was internal.
2. Load the current Montessori workspace using Workbench → Settings → Load scan.
   Return to Scan View. Check the name, URL, area states, and counts. Confirm no
   JEM contact details or findings appear in any customer tab.
3. In Workbench → Review customer findings, approve an eligible finding after
   reading it. Confirm Findings and Action Plan show it with its correct group;
   Results must still show no completed work. Withdraw it and verify removal.
4. Change a source observation and confirm the old presentation approval expires.
5. Save and load the separate JEM workspace. Check all four customer views, then
   load Montessori again and verify its own state returns. Export/import an
   unchanged scan and check presentation approval remains compatible.
6. Start a new business scan; check empty results and no inherited contacts,
   browser payload, or findings. Start a website scan and switch workspace before
   its response; confirm the late response does not populate the new workspace.
7. Review at desktop and narrow mobile width, keyboard navigation, error/progress
   states, and every original Workbench workflow.

## Limits and Packet D candidates (not implemented)

- Packet B findings do not consistently store customer wording, rationale,
  access requirements, implementation instructions, or provenance timestamps.
  Missing fields remain missing. Some legacy promoted findings lack `reviewed`
  or verification and are kept internal; no review evidence is backfilled.
- Directory corroboration is currently a derived, unreviewed comparison. It
  stays internal instead of being promoted to customer truth automatically.
- There is no durable approval, implementation, rescan-comparison, or verification
  record. Results cannot yet prove completed service work.
- Customer view is a presentation mode, not an access-control boundary. It is
  intended for an operator-led meeting, not an unattended customer portal.
- The new views cannot repair already mixed historical workspaces. They preserve
  source state and require use of the isolated business workspace.

For Packet D, consider evidence-linked customer wording and access/implementation
fields, explicit approval records, and a before/after verification receipt. Choose
the smallest next change from actual delivery experience. No monitoring service,
subscription, acquisition provider, or Packet D behavior is included here.
