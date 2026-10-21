# Repository guidance

The product, CLI and checkout directory are named `rea-unity-game`.
Keep the sibling `rea` reference checkout unchanged.

Use named shared operations for CLI and MCP. Validate untrusted inputs at their owner boundary. Preserve original evidence and qualified locator domains. Keep reported evidence, independently executed verification and human acceptance separate.

Run `npm run check` for runtime changes. Use `npm run demo` for the synthetic public workflow. Do not claim real-provider, real-game or Unity Editor coverage from fixtures. The complete REA core is a required pinned runtime. Keep Unity-specific external analyzers local and capability-driven. Target execution uses the core authority contracts and the established user scope; never execute package content as setup code.

Vendored practice materials live in `skills/unity-game-reconstruction/`. Their recorded hashes are in `docs/vendor-provenance.json`. Preserve original bytes or explicitly record adaptations. Do not modify the original skill installed outside this repository.
