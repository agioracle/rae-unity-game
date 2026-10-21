# REA Unity Game Implementation Plan

**Goal:** Deliver a standalone evidence-driven Unity reconstruction CLI/MCP package.
**Architecture:** Shared named operations use domain schemas and a persistent ledger. Python providers reuse the supplied recovery helpers and add transactional workspace intake.
**Tech Stack:** Node >=22.19, TypeScript, MCP SDK, Zod, Python >=3.10, node:test.
**Spec:** ../specs/2026-10-19-rea-unity-game-design.md

## Global constraints

- Keep implementation in the existing `rea-unity-game` repository.
- Preserve the reference `rea` project and original skill.
- Keep source evidence outside authored Unity assets.
- No automatic installation of unrelated software, target execution, publishing or commits.
- User selected autonomous implementation; execute inline without another approval round.

## Review focus

- Malformed or hostile archives must fail without writing outside a fresh output root.
- Incomplete intake and concurrent writers must not silently replace evidence or ledger state.
- Missing or truncated evidence must not become recovery/parity claims.
- Test markers cannot impersonate first-playable user acceptance.
- Installed npm package must not rely on this checkout or the original skill path.

## Tasks

- [x] 1. Write public CLI boundary tests and generate Mono/IL2CPP and hostile package fixtures. Run RED. Implement pinned package/build configuration, vendored helpers with hashes, bounded process execution, package inspection and workspace intake. Verify intake and hostile-input tests GREEN.
- [x] 2. Write recovery/claim/marker/acceptance tests RED. Implement versioned schemas, transactional locked ledger storage, recovery accounting, roadmap gates, claims and validation. Verify workflow tests GREEN.
- [x] 3. Write shared-contract CLI/MCP parity tests RED. Implement a named operation catalog, strict CLI parser, SDK stdio server, provider diagnostics, evidence queries and handoff plans. Verify public boundaries GREEN.
- [x] 4. Package agent skill, usage guides, synthetic demo, CI and provenance. Build, typecheck, run all tests including helper regressions, pack and smoke test the installed artifact. Obtain one independent final code review and fix material findings with regressions.

## Verification record

Results and implementation decisions are recorded in docs/implementation-log.md. No commit or publication is authorized by this plan.
