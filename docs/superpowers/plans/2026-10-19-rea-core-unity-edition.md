# REA Core Unity Edition Implementation Plan

**Goal:** Make REA the required complete foundation and add Unity-domain capabilities.
**Architecture:** Required pinned upstream runtime, transparent session-preserving stdio broker, original CLI forwarding and namespaced Unity additions.
**Spec:** ../specs/2026-10-19-rea-core-unity-edition.md

User has already selected autonomous implementation. Preserve the original reference repository, existing evidence workspaces and imported skill bytes. No publishing or commits.

## Review focus

- Core tools, output schemas and Evidence metadata must remain unmodified.
- Both directions of callbacks, progress and cancellation must route to the owning backend.
- Init/discovery failure must not silently advertise a subset as the complete core.
- CLI command collisions must not replace core analysis with domain inventory.
- Process exit, partial output and cleanup must not leave an invisible replacement session.

## Tasks

- [x] Write failing real-core integration tests and command-routing tests. Pin complete REA 6.7.0 and adopt its Node engine constraints.
- [x] Implement the CLI dispatcher and persistent JSON-RPC broker; preserve upstream envelopes and merge domain discovery. Verify actual upstream analysis and domain intake through one endpoint.
- [x] Integrate Unity serialized-object inspection and feature-oriented domain guidance with the core's existing investigation tools. Test available capabilities and honest missing-tool behavior.
- [x] Rewrite product docs around the REA-based edition. Run full regression, actual-core MCP/CLI and packed-install checks; independently review and resolve material findings.
