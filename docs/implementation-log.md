# Historical 0.1 implementation and verification record

Superseded for product architecture by [the 0.2 REA-based edition record](rea-edition-verification.md). The results below document the initial domain infrastructure only.

Date: 2026-10-19. User requested implementation from the local REA project and the practical Unity Game Reconstruction skill, then explicitly selected autonomous execution (“直接做”).

## Delivered

- Independent TypeScript package with 18 shared CLI/MCP operations and official SDK stdio transport.
- Python intake for Android containers/splits and extracted desktop players, source snapshots, safe complete bounded raw extraction and provenance manifests.
- Persistent strict-schema ledger, atomic publication and exclusive writer lock; independent recovery/evidence/validation/user gates.
- Fixed-string evidence retrieval with bounded scope and retained reports; exact-ID/paged records.
- Optional bounded REA static managed analysis adapter, full output retention and tool/source hashes.
- Portable reconstruction skill with original practice references/helpers and SHA-256 provenance.
- English/Chinese usage, record examples, architecture and verification boundaries, synthetic demo, CI matrix and npm artifact smoke script.

## Executed checks

- `npm run check` on Node 22.23.1, Python 3.13.2: formatting and strict typecheck passed; 15 JavaScript integration tests passed; 25 Python tests passed; 32 imported file digests verified. Full output: [check.log](verification-results/check.log).
- Real SDK MCP client: tool/schema discovery, shared CLI/MCP result equivalence, strict invalid input rejection, reference resource retrieval and prompt discovery.
- `npm run demo` on Node 22.23.1: generated a synthetic package and completed inspection, intake, planning, query, manifest verification and status. Recovery gates correctly remained blocked.
- `node scripts/package-smoke.mjs`: fresh tarball extracted outside this checkout; runtime dependencies installed offline with its own shrinkwrap; packaged capabilities, Python diagnostic, workspace intake, query and standalone helper availability passed. Full result: [package.log](verification-results/package.log).
- Dependency installation/audit after updating the MCP SDK to 1.32.1 and adding the pinned formatter reported zero vulnerabilities. This is a point-in-time registry report, not a future guarantee.
- The sibling REA checkout was checked and remained unchanged. The original skill outside this repository was not modified. No commits, pushes, publication or deployment were performed.

## Independent review and fixes

A fresh review agent inspected the implementation. All three material findings were reproduced with failing regressions, then fixed:

1. Stale evidence could pass acceptance or P3 advancement. Shared readiness validation now rechecks selected claims, recovery artifacts and version-matched runtime marker hashes at readiness, acceptance and advancement. Regression: `acceptance and advancement reject evidence changed after readiness or acceptance`.
2. P3 roadmap changes and reused version strings could retain/reactivate old acceptance or waivers. Every readiness-affecting ledger change archives and clears acceptance, resets the checkpoint and requires new explicit acceptance for the current scope. Regressions cover changed P3 roadmap and same-version waiver reuse.
3. ZIP central-directory limits ran after Python had allocated member objects. Both inspection preflight and extraction now apply central-directory limits before constructing ZipFile. Two Python regressions verify constructor non-invocation when declared entry count exceeds a reduced test limit.

No review findings remain deferred.

## Implementation decisions and limits

The existing directory spelling `rae-unity-game` is retained; product/package/CLI use `rea-unity-game`. REA is an optional companion, not a copied native engine graph. `project/` is an empty reserved root until an agent creates a real compatible Unity project. External decompilers/exporters and Editor/device work are explicit handoffs. No real-game parity is claimed.

Source snapshots and scope records are local evidence, not independent attestations. Caller-provided validation/acceptance records require truthful authorized reporting. Stale lock removal and incomplete-intake retry require inspection; the tool does not delete existing workspaces automatically.

For the packed-artifact test, use its extracted shrinkwrap with `npm ci`: npm 10 local-file dependency installation was observed resolving fresh transitive ranges even with a nested shrinkwrap. The smoke test therefore installs the packed artifact as a project in a new location, using its exact graph. Normal network installation remains a separate package-manager workflow.

Original practice materials were supplied for reuse without a separate upstream license file. Provenance is retained; public redistribution rights should be reviewed before publication. Nothing was published during implementation.
