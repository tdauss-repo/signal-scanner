# Street & Signal Brand Direction

## Authority and status

This document is the current identity and visual-language source of truth for
Street & Signal and the internal Business Scanner Tool.

The business name, tagline, internal product name, logo direction, and palette
below are approved. The customer-facing headline and journey are marketing
language under consideration; they are not required application fields and
must not be hardcoded across scanner screens or exports.

## Approved identity

**Business brand:** Street & Signal

**Tagline:** Helping local businesses get found in search, maps, and AI.

**Internal application:** Business Scanner Tool

Street & Signal is a service-led local visibility business. It helps locally
operated businesses identify, prioritize, correct, and verify practical
visibility gaps. It is not positioned as a public self-service scanner SaaS.

The Business Scanner Tool is the private operator application used to manage
reviewed business information, acquire bounded evidence, approve findings,
prepare packages, export customer-safe JSON, and support verification.

## Established workflow and doctrine

The operator workflow is:

**Business → Scan → Review → Package → Customer Review → Verification**

The operating doctrine is:

**Find → Prove → Explain → Fix → Verify**

These are established product concepts, not optional marketing copy.

## Marketing language under consideration

**Customer-facing positioning:** Help More Local Customers Find Your Business.

**Customer journey:** Get Found → Build Trust → Get Contacted

This language may guide future public-site and customer-presentation work, but
it is not yet a required Customer Review JSON field. It must not alter scan
logic, evidence interpretation, package calculations, or verification behavior.

## Approved logo direction

The approved mark combines:

- a precise street-grid or intersection motif;
- a bright-blue location pin; and
- restrained signal-green arcs.

The mark should communicate local place, signal visibility, and practical
guidance. It should remain recognizable at favicon and sidebar sizes. Use the
shared React/SVG implementation for scanner UI rather than maintaining divergent
marks.

Avoid robot heads, generic AI brains, neon/cyberpunk styling, or imagery that
implies a public software platform.

## Approved palette

| Role | Color | Hex |
| --- | --- | --- |
| Primary foundation | Deep navy | `#0B2D5B` |
| Search/location accent | Bright blue | `#2563EB` |
| Signal/success accent | Signal green | `#22C55E` |
| Primary light surface | Warm off-white | `#FAF9F6` |

Issue, warning, review, and verified-status colors retain their semantic
meaning. The brand palette does not turn every status into a brand color.

## Brand hierarchy

1. **Street & Signal** — service and business brand
2. **Business Scanner Tool** — internal operator application
3. **Customer Review** — reviewed customer-safe presentation and JSON handoff
4. **Starter Visibility Cleanup** — bounded initial implementation package

The public Street & Signal website and customer-facing review presentation are
separate from this scanner repository. The scanner produces the JSON contract;
this repository does not contain or claim an implemented Lovable JSON loader.

## Voice and visual character

Use language and presentation that are:

- clear, practical, and evidence-led;
- approachable to a local business owner;
- professional without enterprise-software jargon;
- careful about uncertainty and verification; and
- focused on useful action rather than scores or promises.

Useful phrases include “get found,” “fix visibility gaps,” “search, maps, and
AI,” “business information cleanup,” and “verify the result.” Explain technical
terms when they are necessary.

Do not claim guaranteed rankings, guaranteed AI recommendations, direct control
of third-party platforms, or completed remediation before verification.

## Compatibility and historical identity

The Street & Signal transition changed visible operator branding, newly
generated customer wording, and new export filenames. It did not rename
compatibility identifiers.

In particular:

- Customer Review `reviewVersion: "1.0"` remains supported.
- `confirmedIssues[].foundLocalAction` remains the legacy property name.
- Workspace envelope identifiers, LocalStorage keys, provider IDs, finding IDs,
  and evidence fingerprints remain stable.
- Historical Found Local workspaces, Customer Review JSON, operator-authored
  wording, proving records, and acceptance artifacts are not rewritten.
- `business.websitePreview.imageUrl` is optional and is not fabricated when no
  screenshot source exists.

These retained identifiers describe compatibility, not the current business
brand.
