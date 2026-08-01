# Visibility Test Workflow Cleanup

Search Visibility separates Brand Presence, Core Local Discovery, and Supporting
Discovery. Google Search, Google Maps, and Bing are primary actions; Apple Maps
and DuckDuckGo are secondary checks. Local category and service queries require
operator-reviewed or owner-confirmed Business Profile facts.

AI Visibility records repeatable, contextual manual evidence and never claims a
stable rank. The provider adapter seam remains inert in
`src/utils/aiProviderAdapter.ts`; it has no configured providers, API keys, or
normal-workflow controls.

Entity/listing readiness is a source-information assessment. Optional consumer
assistant observations are separate device/interface records and do not affect
readiness as an untested failure.

Legacy search locations, AI raw responses, and voice prompt tests are retained.
On normalization, legacy search locations gain a multi-result-type projection;
legacy AI and voice evidence gain `legacy_imported` provenance records without
discarding the original fields.

Deferred controlled automation: OpenAI, Gemini, Perplexity, Claude, xAI, and
Copilot adapters; secure key configuration; cost and rate controls; controlled
location; scheduling; deterministic analysis; and a human review gate.
