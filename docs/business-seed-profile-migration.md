# Business Seed and Profile migration

Saved scans remain version-1 Found Local scan files. On load or import, the
existing flat `payload.profile` is preserved exactly and continues to power the
website audit, listings, scoring, reports, and Action Plan.

The workspace now also normalizes `payload.businessProfile`. Every non-empty
flat profile field receives a provenance record if one was not already saved:

- `source: "legacy_imported"`
- `status: "legacy_imported"`
- `confidence: "low"`
- `recordedAt`: the saved workspace update time

New operator edits are saved with `source: "operator_entered"`,
`status: "operator_reviewed"`, and high confidence. The state model also
supports observed, inferred, and owner-confirmed facts. A future research merge
must retain `owner_confirmed` values; this slice's Research business action only
runs the current authorized website scan and writes no profile facts.

The later Discovered Profile Review slice should add evidence-to-profile mapping,
field-level source presentation and confirmation controls, and a reviewed merge
workflow for website/listing discoveries. It should not infer values from scan
results or replace owner-confirmed facts automatically.
