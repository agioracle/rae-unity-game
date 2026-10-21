# Third-party notices and provenance

REA Unity Game is MIT licensed; see LICENSE (Copyright © 2026 Agi).

## REA

Architectural reference: the user-supplied sibling `rea` checkout, package `rea-agents` 6.7.0, https://github.com/morluto/rea. REA is MIT licensed, Copyright © 2026 morluto. The complete pinned REA runtime is a required npm dependency. Its shipped CLI/MCP, engines, bridges, notices and license remain owned by the upstream package. The edition forwards original contracts instead of copying a reduced engine implementation. A managed PE test fixture was derived from the supplied MIT-licensed REA source using TypeScript transpilation; its copyright/source hash is retained in tests/support/managed-pe-fixture.mjs. The complete upstream MIT notice is retained in licenses/REA-MIT.txt.

## Unity Game Reconstruction practice materials

The user explicitly supplied their local `wefund-unity-game-reconstruction` skill for reuse in this project. Original helper scripts, reference modules, project guidance and the original skill workflow were imported on 2026-10-19. SHA-256 provenance is recorded in `docs/vendor-provenance.json`. Original helper/reference bytes are retained; test adaptations change repository-relative helper paths; the agent default prompt uses the portable skill name. The new SKILL.md integrates them with this product's CLI/MCP.

The supplied skill did not include a separate upstream LICENSE. This repository records the user's supplied source and reuse instruction; it does not invent a separate upstream license grant. Review redistribution rights for those materials before publishing a public release.

## Dependencies

REA, the official MCP TypeScript SDK and Zod are runtime dependencies. UnityPy 1.25.4 is an optional separately installed domain parser; its source/license is supplied by the installed Python package. TypeScript and Node typings are development dependencies. Their license files accompany installed packages. Exact versions and integrity digests are pinned in npm-shrinkwrap.json. Unity and external analyzers/exporters are not redistributed or automatically installed.
