# Overnight acquisition expansion checkpoint

Recorded 2026-09-20 from baseline `f5d8ec46808784f6fc334f23263883273eceb593` on `proving/browser-assisted-evidence-002`.

## Decision

No destination was added to the production visibility scan. The new code is a proving-only adapter and CLI. Production integration remains gated on a repeatable network-enabled result with a defensible inspected region and matcher-ready evidence.

The existing `AcquisitionResult` remains the common handoff. It separately records provider outcome, inspected-region truth, normalized candidates, matcher outcome, and review state. The proving adapter adds no second customer observation model.

## Actual provider attempts

| Destination | Business/query | Provider | Outcome | Inspected | Candidates | Blocker | Decision |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| Apple Maps | Mary Brand | Bright Data Browser API | provider rejected target before navigation | No | 0 | `provider_permission_blocked` (`brob`) | Keep manual; account access expansion required |
| Apple Maps | Mary Location | Bright Data Browser API | provider rejected target before navigation | No | 0 | `provider_permission_blocked` (`brob`) | Do not retry current account |
| Yelp | Mary Brand search | Bright Data Browser API | HTTP 403 without page evidence | No | 0 | `access_blocked` | Keep manual; search route unavailable |
| Yelp | Mary discovered public profile | Bright Data Browser API | HTTP 403 without page evidence | No | 0 | `access_blocked` | Keep manual; direct profile also unavailable |
| DuckDuckGo | Mary Brand | Bright Data SERP API | embedded HTTP 502 | No | 0 | `provider_upstream_failure` | Keep proving-only; bounded repeatability incomplete |
| DuckDuckGo | Mary Location | Bright Data SERP API | embedded HTTP 502 | No | 0 | `provider_upstream_failure` | Stop bounded sequence; JEM continuation gate not met |

The Studio Node Apple attempts completed in about 3.1 and 2.3 seconds. Yelp completed in about 17.4 seconds. DuckDuckGo returned its embedded 502 in about 19.3 seconds. No timing represents business visibility.

Studio Node completed the bounded alternate checks after the initial results: the discovered public Yelp profile also returned HTTP 403 with no usable result region, and Mary Location on DuckDuckGo also returned embedded HTTP 502. JEM was not run because the DuckDuckGo continuation gate requires a useful Mary Location provider response. These outcomes remain unavailable/review-required and are not evidence of business absence.

Ignored artifacts:

- `debug/destination-proving/2026-09-20T03-30-44-636Z-apple/diagnostic.json`
- `debug/destination-brightdata/2026-09-20T03-37-29-849Z-duckduckgo/`
- `debug/destination-brightdata/2026-09-20T04-41-55-407Z-apple-maps/`
- `debug/destination-brightdata/2026-09-20T04-41-57-897Z-apple-maps/`
- `debug/destination-brightdata/2026-09-20T04-42-44-892Z-yelp/`
- `debug/destination-brightdata/2026-09-20T04-43-04-384Z-duckduckgo/`
- `debug/destination-brightdata/2026-09-20T04-49-09-890Z-yelp/`
- `debug/destination-brightdata/2026-09-20T04-49-10-056Z-duckduckgo/`

No credential is stored in either artifact. Browser connection errors are redacted.

## Proving paths now available

`npm run prove:destination-brightdata` provides one bounded attempt per invocation:

- Apple Maps, Yelp, Facebook, Instagram: Bright Data Browser API over the configured CDP URL.
- DuckDuckGo: Bright Data SERP API using the documented DuckDuckGo query route.

The Browser path extracts bounded semantic cards and business JSON-LD only. Platform place/profile URLs populate `resultUrl`/`publicProfileUrl`; only a separately and explicitly asserted external website may populate `website`. Provider permission restrictions, HTTP access blocks, shells, navigation failures, and missing result regions use top-level outcome `unavailable`; login walls and challenges use `blocked`. Every one remains operator-review-required and can never become `not_found` without an inspected normal result region.

The DuckDuckGo path accepts structured organic result arrays, preserves organic destinations as `resultUrl`, and lets the existing matcher establish the reviewed official domain. HTTP or embedded 5xx responses become `provider_upstream_failure`; provider errors or missing result arrays remain unavailable. An inspected, normal empty result array is the only structured zero-result shape that can reach normal absence evaluation.

Existing Google evidence discovered `https://www.yelp.com/biz/montessori-center-of-downriver-southgate` with Mary's name, reviewed address, reviewed phone and website in the result snippet. This is represented only as `profile_discovered`; it was a safe input for one bounded direct-profile proving attempt, which returned HTTP 403. Neither the discovery nor the failed attempt is Yelp verification.

## Capability matrix

| Destination | Production provider | Proving provider | Production state | Auto found | Auto not-found | Principal blockers |
| --- | --- | --- | --- | --- | --- | --- |
| Google Search | Bright Data SERP, Browser fallback | same | Production | Yes | After inspected region only | provider/challenge/malformed region |
| Google Maps | Bright Data Maps parsed, Browser fallback | same | Production | Yes | After inspected region only | provider/consent/challenge/Maps shell |
| Bing Search | Found Local fetch, rendered fallback | same | Production | Yes | After inspected region only | transport/access/uninspected region |
| Apple Maps | Operator observation | Bright Data Browser | Manual fallback | No | No | provider permission blocked; account expansion required |
| Yelp | Operator observation | Bright Data Browser | Manual fallback | No | No | search and direct discovered-profile HTTP 403 |
| Facebook | Operator observation | Bright Data Browser | Manual fallback | No | No | login wall/public search; live proof pending |
| DuckDuckGo | Operator observation | Bright Data SERP | Manual fallback | No | No | Mary Brand and Location embedded provider 502; JEM gate not met |
| Instagram | Operator observation | Bright Data Browser | Manual fallback | No | No | login wall/public profile; live proof pending |

## Bing Location open point

No Mary customer export or Bing capture payload exists in this workspace, so the exact candidate that triggered `multiple_entities` cannot be identified from repository evidence. No matcher or Bing behavior was changed.

An independent current public-search check exposed at least one same-name Mary directory record with the reviewed Northline address but a different phone. That pattern would be a genuine strong-identifier conflict if it occurred in the Bing capture. It reinforces the decision to retain review until the actual capture is available rather than weakening ambiguity rules.

## Network-enabled proving commands

Use the gitignored `.env.runtime.local` on Studio Node only for a future controlled reproving run after provider conditions change. Do not retry Apple Maps until Bright Data confirms target access for the configured account. The Yelp direct-profile and DuckDuckGo Mary Location commands below have already been attempted and should not be replayed merely to confirm the recorded result.

```bash
npm run prove:destination-brightdata -- "Yelp" "Montessori Center of Downriver" docs/mary-acceptance-profile.json brand "https://www.yelp.com/biz/montessori-center-of-downriver-southgate"
npm run prove:destination-brightdata -- "DuckDuckGo" "Montessori Center of Downriver Southgate MI" docs/mary-acceptance-profile.json location
```

Do not run the JEM DuckDuckGo command: Mary Location returned embedded 502, so its continuation gate was not met. Facebook and Instagram remain manual; their alternate products are not configured for this project.

For a fresh Mary production acceptance after any future integration:

```bash
npm run prove:visibility-scan -- docs/mary-acceptance-profile.json /tmp/mary-visibility-acceptance.json
```
