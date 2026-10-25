# Street & Signal Agent Guidance

## Required context order

Before planning or changing Street & Signal work, read in this order:

1. `docs/STREET_SIGNAL_DOCTRINE.md`
2. `docs/architecture.md`
3. `docs/branding/branding.md` when work affects visible branding or customer
   presentation

The doctrine governs product strategy, scope, boundaries, service design, and
feature prioritization. The architecture document records current
implementation, workflow, constraints, and operational state. When they
conflict, preserve the doctrine and surface the implementation conflict; do not
silently redefine the doctrine to match drift.

`docs/FOUND_LOCAL_DOCTRINE.md` is the preserved pre-rebrand doctrine. It is a
historical reference, not the current naming or branding authority.

## Street & Signal rules

- “Local for Local” governs feature decisions.
- Evaluate proposed capabilities against Found, Understood, Trusted, and
  Contacted.
- Follow the operating doctrine: Find → Prove → Explain → Fix → Verify.
- The Business Scanner Tool is a private internal operator system.
- Street & Signal is a service-led business, not a public scanner SaaS.
- The public Street & Signal website and customer-facing review presentation
  are separate from this repository. Customer Review JSON is the handoff
  boundary; do not assume or claim that an external loader is implemented.
- Preserve the reviewed customer-safe JSON boundary between them.
- Automatically scan only customer-entered or otherwise authorized websites.
- Preserve evidence, uncertainty, and human approval gates. Acquisition or
  provider failure is never proof of absence, and candidate findings are not
  customer findings.
- Do not expand toward generic enterprise SEO, public self-service SaaS, or
  competitor parity without explicit strategic justification and approval.
- Report conflicts between implementation and doctrine as follow-up work.

## Repository safety

Preserve unrelated work. Do not rewrite history, discard changes, stage,
commit, or push unless the user explicitly authorizes it.
