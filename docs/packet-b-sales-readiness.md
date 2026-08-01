# Packet B — Sales Readiness Capability

Entity Clarity stores reviewed, source-cited comparisons without changing
Business Profile facts. Customer questions are independently editable; the
Montessori sample questions are suggestions only and begin unable to verify.

Corroboration is derived from existing Profile Management public evidence. It
does not create new scanning, infer owner access, or duplicate discovery rows.

Sales actions sort deterministically by package fit, impact, confidence,
dependencies, effort, then stable ID. Starter actions require reviewed evidence
and a verification method. Owner actions remain separate; later/excluded work
is not presented as Starter deliverables.

The Starter view never falls back to owner, later, excluded, or unreviewed
findings. Those groups require an explicit operator filter. `salesPackageFit`
is canonical; legacy `packageFit` is used only when the canonical value is
absent.

Corroboration derives source-level expected versus explicitly recorded observed
values for business name, category, phone, website, address/service area, and
hours. Missing values are `Unable to verify`, a recorded not-found outcome is
`Not found`, and acquisition failures remain distinct. It never overwrites
Business Profile truth. Review progress is neutral and never affects scoring.

Migration adds empty or editable sales-readiness state to existing scans. It is
idempotent and preserves Packet A profile, website, public-presence, AI, and
browser/server evidence contracts.

Montessori validation: record cited observations for identity, offering,
location, and contact/enrollment path; review editable customer questions;
check corroboration sources; then add only reviewed findings with a verification
method to the Starter recommendation.

Deferred: provider APIs, automated AI/voice scans, ranking forecasts, recurring
monitoring, backlink/review analysis, and all Packet B exclusions.
Cross-area duplicate detection (Entity Clarity, Customer Questions, and audit
fixes) is also deferred pending a deliberate canonical issue model.
