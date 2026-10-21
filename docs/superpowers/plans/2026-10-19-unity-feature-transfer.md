# Unity Feature Transfer Implementation Plan

> Use superpowers:executing-plans inline; retain the existing checkout and do not commit or publish.

**Goal:** Connect qualified IL2CPP addresses, serialized resource dependencies and additive target adaptation to the complete REA investigation runtime.
**Architecture:** Shared strict CLI/MCP operations retain hashed reports. Optional parsers supply structural evidence; REA and the host agent own reasoning and implementation. Authoring happens in a new target feature folder, with freshness checks before writes.
**Tech stack:** TypeScript, Python stdlib, pinned UnityPy, installed Unity Editor.
**Spec:** The user's request in this conversation; existing `../specs/2026-10-19-rea-core-unity-edition.md` remains the foundation.

## Constraints and review focus

- Keep `rea` and existing Siege Squad sources/projects unchanged. Use a new verification workspace/target.
- Never conflate ELF VA, provider RVA, file offset, runtime VA, managed token or Unity GUID/PathID. Preserve shared code aliases, absent pointers and unresolved references.
- Hash all admitted sources; imported analyzer output is attributed evidence, not independently proven metadata/code association.
- Bound parser input, recursion, graph size and output. Never let external resource paths cause automatic file reads.
- Inspect target version, packages, input, pipeline, assemblies and GUID inventory. Refuse stale plans, overwrites, traversal and unresolved serialized GUID dependencies.
- Distinguish real APK static analysis, prior external index provenance, fresh Editor execution and device parity. No Android module/device is currently available.

## Tasks

- [x] 1. RED: test ELF load-segment conversions, ARM Thumb, shared aliases, malformed/stale inputs and absent pointers. Implement `map-il2cpp` for Il2CppDumper script JSON and attributed LibCpp2IL JSONL, with selection/paging and retained source hashes. GREEN: focused tests.
- [x] 2. RED: test real SerializedFile PPtr traversal including cross-file ID resolution, cycles, missing targets and unavailable TypeTrees. Implement `trace-references` over explicitly admitted serialized files, qualified by path/hash/PathID and field path. GREEN: parser/graph tests.
- [x] 3. RED: test target profile and plan/apply operations, stale source/target rejection, GUID rewriting, unresolved dependencies and existing-folder preservation. Implement `inspect-target`, `plan-transfer`, `apply-transfer` with create-only feature folders and explicit adaptation decisions. GREEN: transfer tests.
- [x] 4. Run the complete shared CLI/MCP workflow against controlled fixtures, real existing APK static evidence, and a fresh isolated Unity target. Retain exact evidence and missing steps, update feature guidance/docs/doctor, full check/demo/packed install. One independent final review; fix material findings with RED→GREEN tests.

## Progress

Initial inspection: UnityPy installed; Unity 2022.3.62f3 Editor available; no Android PlaybackEngine installed. Existing source APK and prior LibCpp2IL catalog discovered in sibling Siege Squad practice workspace; caller's preferred inputs still pending. No user target has been mutated.

Final review fixed: pre-allocation decoder budgets (ordinary and load-time AssetBundle), exact 2,000-edge truncation, ELF32 address-width overflow, and orphan metadata GUID dependencies. Each has a reproduced RED→GREEN regression. Deferred disclosed limitations: basename-only external association, size/mtime fingerprints for non-text assets, and importer/subasset fidelity; they require exact binding/provider extensions and Editor checks.
Task 4 validation boundary: no successful fresh metadata39 extraction or original Android/hardware/visual parity. Existing exact-hash LibCpp2IL index was imported; new native-byte interpretation and ten actual Unity PlayMode cases were independently executed. This does not establish a fully automatic arbitrary-APK pipeline.

Final executed checks: 32 JS +29 Python passed;33 vendor hashes passed; demo and packed install passed; actual unified MCP235 tools, real-data map/reference/profile calls passed; final fresh Unity target10 PlayMode checks passed with transferred hashes unchanged. User-level APK-only automatic extraction and original Android parity remain unverified as documented above. No other plan rulings were required.
