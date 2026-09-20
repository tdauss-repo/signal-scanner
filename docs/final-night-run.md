# Final night run checkpoint

Recorded 2026-09-20 from the current Packet E working tree.

## Fresh Mary acceptance

The network-enabled Studio Node acceptance used the production visibility orchestrator and the reviewed identity below. It did not load the stale Northville value.

- Montessori Center of Downriver
- 15575 Northline Road
- Southgate, MI 48195
- 734-282-6465
- http://www.montessoridownriver.com/

The fresh production scan confirmed:

| Observation | Live result |
| --- | --- |
| Google Search Brand | Found / high confidence / automatic / no review |
| Google Search Location | Found / high confidence / automatic / no review |
| Google Maps Brand | Found / high confidence / automatic / no review |
| Google Maps Location | Found / high confidence / automatic / no review |
| Bing Search Brand | Found / high confidence / automatic / no review |
| Bing Search Location | Review required / `multiple_entities` |

Google Search and Google Maps used the configured Bright Data acquisition ladder. Bing used Found Local's native acquisition. The Bing Location aggregation is the explicit open point at this checkpoint; the accepted result is retained for review rather than forced to found or not-found.

`scripts/prove-visibility-scan.ts` calls the same dedicated Google Search and Google Maps runtime providers as the application. `docs/mary-acceptance-profile.json` is the reviewed, non-secret acceptance input. Customer-export JSON and raw provider/debug artifacts are not committed.

## Effective acquisition matrix

| Destination | Preferred | Fallback | Production state | Auto found | Auto not-found | Main unresolved blockers |
| --- | --- | --- | --- | --- | --- | --- |
| Google Search | Bright Data SERP API | Bright Data Browser API | Production when configured | Yes | Yes, only after inspection | Provider failure, challenge, unusable result region |
| Google Maps | Bright Data Maps parsed acquisition | Bright Data Browser API | Production when configured | Yes | Yes, only after inspection | Provider failure, consent/challenge, Maps shell |
| Bing Search | Found Local server fetch | Found Local rendered browser | Production | Yes | Yes, only after inspection | Transport/access failure, unusable result region |
| Apple Maps | Operator public observation | Open Apple Maps | Manual fallback | No | No | Application shell, interaction, no live-validated adapter |
| Yelp | Operator public observation | Open Yelp | Manual fallback | No | No | HTTP 403/access restrictions, no live-validated adapter |
| Facebook | Operator public observation | Open Facebook | Manual fallback | No | No | Login wall, public page unavailable |
| DuckDuckGo | Operator public observation | Open DuckDuckGo | Manual fallback | No | No | Official Bright Data SERP path identified but not live-proven in this runtime |
| Instagram | Operator public observation | Open Instagram | Manual fallback | No | No | Login wall, unreliable public search/profile access |

The executable source of truth is `src/utils/acquisitionCapabilities.ts`.

## Invariants retained

- Provider failure, challenge, login wall, consent wall, and application shell do not mean `not_found`.
- `not_found` requires a successful acquisition and an inspected normal result region.
- Unrelated competitors do not invalidate a strong selected business match.
- Records that plausibly claim the reviewed identity and conflict on strong identifiers still require review.
- A result or publisher URL remains separate from an explicitly observed business website.
- Production captures retain provider provenance and bounded evidence, never provider credentials.

## Destination proving decision

The next bounded task is Apple Maps Bright Data proving. It should establish whether a public place/result region can be acquired repeatedly and normalized without treating an application shell as evidence. Yelp follows only after that checkpoint. Facebook and Instagram remain public-only evaluations; login walls remain unavailable rather than absence.
