# REA Unity Edition: corrected architecture

## User intent

The user clarified that REA already supplies the general reverse-engineering capabilities. The product must specialize that complete foundation with Unity tools and reconstruction experience. It must not replace REA with a small ledger application, reimplement general agent reasoning or require users to switch to a separately configured optional REA server.

Keep the user-supplied sibling REA checkout unchanged. Pin the full matching REA 6.7.0 runtime as a required dependency and retain its original CLI/MCP contracts, evidence and session lifecycle. A versioned runtime dependency avoids maintaining a divergent copy of thousands of upstream source modules. The existing Unity-domain package becomes an additive edition of REA.

## Deliverable

- One CLI accepts the complete upstream REA command surface unchanged. Unity-specific commands use `unity <operation>` to avoid hiding upstream commands such as analyze/inspect/doctor/setup.
- One stdio MCP endpoint exposes all original REA tools plus Unity domain tools, resources and prompts. Calls reach a persistent real REA session. Preserve JSON schemas, content, structuredContent, errors, evidence metadata, pagination, callbacks, progress and cancellation instead of converting every upstream tool to a handoff string.
- The broker preserves raw JSON-RPC envelopes and isolates IDs for server-to-client callbacks. Merge discovery; route resource/prompt/tool calls by exact domain ownership; preserve all unrelated traffic to the core. Initialize both backends; fail honestly if core cannot start. Close owned backend processes on session exit.
- Keep current evidence intake/accounting as Unity additions. Update the domain skill to use core tools directly for searches, xrefs, native decompilation and feature tracing, then Unity tools for package structure, serialized data and target integration. The host agent owns reasoning and authoring.
- Verify with the actual pinned REA process: full tool discovery, an actual static SQLite or artifact analysis, session routing and original errors; also exercise domain intake in the same MCP endpoint.
- Add concrete Unity serialized-object inspection if supported without guessing exporter CLI flags. Keep optional analyzers discoverable and domain-specific preparation explicit.

## Proof limits

A successful core integration proves the edition inherits REA's interface and routes to its actual implementation. It does not prove every optional engine is installed or every APK's Unity function can be recovered. Do not claim real-game feature parity without real target evidence and runtime checks. Local synthetic transport tests do not become native-engine validations.
