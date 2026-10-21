# Token-Efficient Evidence Retrieval

Query large exports and decompiler trees.

## Retrieval procedure

1. Identify the locator domain under `evidence-claims-and-acceptance.md`, including configuration, audio, UI and validation identifiers when applicable.
2. Query a compact catalog or bounded exact search.
3. Open only matched objects, methods, functions, hierarchy blocks, or nearby lines.
4. Follow required references within a fixed limit.
5. Save the query, scope, hashes, and truncation state in an evidence pack.

Use `scripts/evidence_query.py` when no stronger domain index exists:

```bash
python3 scripts/evidence_query.py EVIDENCE_ROOT EXACT_ID --fixed --max-results 20 --context 3 --timeout-seconds 30 --max-files 5000 --max-total-scan-bytes 268435456 --json
```

The scanner defaults to time, file-count, and scan-byte limits.
Treat `stop_reason`, `scanned_files`, `scanned_bytes`, and `unscanned_scope_exists` as scope evidence.
A budget stop cannot prove zero matches in unscanned data.

Review default and explicit exclusions against supplied roots.
Do not classify ambiguous directory names as caches.
Keep Unity data under `assets/bin/Data` searchable.

## Deterministic indexes

Prefer compact machine-readable catalogs for:

- Package and split hashes and identities.
- Object types, GUIDs, fileIDs and PathIDs, bundles, hierarchy, and dependencies.
- Mappings for assembly, type, method, token and native address information.
- Config schemas, row IDs, references, defaults, and decoded hashes.
- Dependency chains for prefabs, variants, materials, animations, visual effects and audio.
- UI roots, relative paths, and structural signatures.
- Validation markers by case, build, module and result.

Include source hashes, generator and tool versions, schema and mode versions, and inclusion, exclusion and query options in cache keys.
Regenerate indexes when any key changes.

## Query limits

- Set result, context, character, file-size, recursion, reference, caller and callee, and runtime-duration limits before queries.
- Prefer exact IDs and fixed strings before regex.
- Prefer symbols before abstract syntax trees (ASTs).
- Prefer ASTs before semantic retrieval.
- Mark clipped, filtered, sampled, skipped, failed, and truncated results.
- Report counts within their globs and exclusions, never as corpus totals.
- Do not send complete exports, assemblies, databases, traces, or screenshot collections to the model.
- Inspect one known native function or RVA with bounded cross-references.
- Do not request whole-binary pseudocode.
- Capture the smallest runtime case.
- Summarize traces by timestamps, events, or SQL before reading raw data.

## Stop conditions

Stop expanding a query when:

- The locator and source chain support the acceptance case.
- The index is stale or its scope is unknown.
- Generated compatibility output dominates Raw evidence.
- The query mixes locator domains or package versions.
- The next step needs authorization or an unapproved runtime observation.

End each evidence pack with unresolved questions and the next narrow query.

## First-playable budget

Apply the complete-recovery gate in `package-recovery.md` before implementation, unless the user explicitly overrides scope.
Retrieve only evidence that can change the next player-facing decision in the core-flow packet defined there.
Defer deeper semantics and later compatibility work under that gate.

Keep one player outcome per packet.
Report progress as change, gate, blocker, and next action.
Link operation IDs and full logs.
Run focused implementation tests.
Broaden tests for milestone acceptance, shared changes, failures, or unresolved concerns.
