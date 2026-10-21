# Package Recovery Module

Create reproducible evidence from authorized packages.
Infer domain concepts from evidence.
Do not impose predefined domain categories.

## Recovery pass

1. Reuse established authorization, paths, package type, target engine and platform, reuse scope, and prohibited operations.
2. Resolve material missing information.
3. Apply container and workspace rules from `package-safety-and-tooling.md` and `workspace-layout-and-asset-promotion.md`.
4. Record manifests, libraries, loaders, asset systems, SDKs, build metadata, ABIs, bundles, OBBs, and asset packs.
5. Identify source Unity version, authoring-editor version, scripting backend, serialization and metadata versions, delivery system, and third-party runtimes.
6. Apply the Mono or IL2CPP routing rules in `package-safety-and-tooling.md`.
7. Complete extraction and supported recovery and export across all supplied leaves under the gate below.
8. Preserve every packaged managed assembly and Android DEX file.
9. Decompile supported method bodies.
10. Preserve matching IL2CPP metadata and native binaries.
11. Generate complete available metadata and address indexes.
12. Catalog other native binaries separately.
13. Save independent Raw bytes for every readable Unity object before typed conversion.
14. Attempt every supported decoded export.
15. Preserve discoverable configs, schemas, catalogs, and encrypted originals.
16. Attempt supported decoding within authorization.
17. Record blocked or unsupported formats without guessing contents.
18. Build deterministic catalogs and coverage records across the package.
19. Reconcile successful, failed, skipped, and unsupported outcomes across all supplied leaves.
20. Publish the recovery gate below.
21. Derive the formal roadmap and the core-flow evidence packet.
22. Apply `workspace-layout-and-asset-promotion.md` to promote only dependencies for current milestone consumers.
23. Check representative fields, selective import, production-path resolution, and paired runtime cases as the delivery phase requires.

Inventory, planning, and independent exports may overlap.
Do not defer secondary extraction until implementation needs it.
Deep function analysis can follow recovery.
Use `recovery-checklist.md` to track coverage.
Use `token-efficient-evidence-retrieval.md` to query the complete corpus.
Bounded retrieval does not reduce extraction scope.

## Evidence products

Publish pass records with original hashes, extraction manifests, and leaf provenance.
Include package ID, version, signer, base and split roles, and weak or manual identity assumptions.
Use tool records from `package-safety-and-tooling.md`.

Include these catalog fields:

- Object IDs, applicable GUIDs, fileIDs and PathIDs, bundle paths, and hashes.
- Config tables, decoding and decryption notes, row counts, and reference checks.
- Dependencies for resources, bundles, addressables, custom catalogs, and platform SDKs.
- Selection IDs and conditions identify runtime structures, states and outputs.
- Interaction IDs identify controllers, objects, prefabs, components and feedback.
- Object IDs and variants identify prefabs, animations, lifecycles and presentation.
- UI windows and states identify prefabs, hierarchy, assets, animations and events.
- Animation events identify receiver types, methods and audio keys.
- Persistent keys identify writers, readers, defaults and migrations.
- Import risks from missing scripts, proprietary shaders, unsupported runtimes, invalid required references and package-only component identities.
- Warnings, failed objects, skipped processors, clipped indexes, and unsupported types.

Use `evidence-claims-and-acceptance.md` for claims and validation markers.

## Recovery gates

### Accounted recovery before P1 and P2 implementation

Require the recovery pass above before first implementation, unless the user explicitly overrides scope.
An accounted pass records every required outcome. It does not imply that every export succeeds.

1. Check representative typed fields beyond exporter counters.
2. Investigate failures.
3. Try safe compatible fallbacks.
4. Record each unresolved item's source, reason, recovery attempts, retained Raw evidence, and affected consumers.
5. Report coverage gaps explicitly.

Unexplained skips and convenience-deferred extraction and export leave the pass incomplete.
Documented unsupported formats remain coverage gaps.
Accounting alone proves neither recovery of failed items nor playability.

After an accounted pass, unaffected implementation backed by original evidence can proceed.
A gap that can materially change the MVP blocks dependent exact implementation.
Recover the evidence.
Alternatively, obtain user approval for an approximation or scope change.
Never call a degraded pass “fully recovered” or “100% restored.”

This gate excludes exhaustive native semantics, conversion of every asset, and unavailable server content.
Reuse completed outputs only when source, tool and schema identity and coverage remain valid.
Resume missing or failed stages.
Do not repeat unchanged completed extraction.

### MVP evidence gate

MVP means minimum viable product.
Select one core flow after recovery.
Record entry, input, state owner, lifecycle owner, outcome, retry and required runtime dependencies.
Record exact provenance for code, configuration and assets.
Resolve material gaps.
Alternatively, obtain explicit approval for labeled approximations.
This packet permits scoped implementation. It does not prove broad original parity.

## Recovery-specific rules

- Preserve original paths and stable mappings before renaming or normalization.
- Treat decompiler output as evidence, not automatically compilable source.
- Label dummy DLLs, declarations, placeholder IL, and pseudocode as derived navigation evidence.
- Treat broad exporter output as derived evidence, not the original project.
- Require backend and version checks and representative field samples before accepting exporter output.
- Preserve runtime conditions and variant selection.
- Do not substitute assets because they look similar.
- Capture component ownership, relative hierarchy paths, material slots, effect links, and animation bindings.
- Record references that need target-component rebinding.
- Distinguish disk presence from production runtime availability.
- Keep regeneration deterministic.
- Never mutate Raw evidence.
- Apply identifier-domain and scoped-count rules from `evidence-claims-and-acceptance.md` and `token-efficient-evidence-retrieval.md`.

## Implementation handoff

For each feature, provide:

- Source chain, evidence verdict, concrete IDs, and paths.
- Runtime selection conditions and third-party and runtime dependencies.
- Serialization and import hazards.
- Package or build identity, tool versions, source hashes, and exact locator domains.
- Clipped or degraded evidence, representative acceptance state, and unresolved gaps.
- Promotion-manifest entries and the exact dependency closure approved for the current MVP or ledger item.

A dependency closure contains the selected runtime consumers and all dependencies they require.
