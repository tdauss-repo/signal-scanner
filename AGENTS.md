# Found Local Agent Guidance

## Required context order

Before planning or changing Found Local work, read in this order:

1. `docs/FOUND_LOCAL_DOCTRINE.md`
2. `docs/architecture.md`

The doctrine governs product strategy, scope, boundaries, service design, and
feature prioritization. The architecture document records current
implementation, workflow, constraints, and operational state. When they
conflict, preserve the doctrine and surface the implementation conflict; do not
silently redefine the doctrine to match drift.

## Found Local rules

- “Local for Local” governs feature decisions.
- Evaluate proposed capabilities against Found, Understood, Trusted, and
  Contacted.
- The Business Scanner Tool is a private internal operator system.
- Customer Visibility Review / Sites is the external presentation layer.
- Preserve the reviewed customer-safe JSON boundary between them.
- Preserve evidence, uncertainty, and human approval gates. Acquisition or
  provider failure is never proof of absence, and candidate findings are not
  customer findings.
- Do not expand toward generic enterprise SEO, public self-service SaaS, or
  competitor parity without explicit strategic justification and approval.
- Report conflicts between implementation and doctrine as follow-up work.

## Repository safety

Preserve unrelated work. Do not rewrite history, discard changes, stage,
commit, or push unless the user explicitly authorizes it.
