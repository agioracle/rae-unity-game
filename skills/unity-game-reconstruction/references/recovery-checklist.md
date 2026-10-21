# Recovery Checklist

Use this checklist to record coverage.
Apply `package-recovery.md` for procedures, recovery gates, gap handling, and unchanged-output reuse.
Complete accounted recovery before first implementation, unless the user explicitly overrides scope.

## Intake

- Record authorization, reuse scope, package paths, target project, and output roots.
- Hash every original package and split before extraction.
- Preserve originals unchanged.
- Apply workspace and archive gates from `package-safety-and-tooling.md`.
- Check package ID, version, signer, ABI, and base and split roles.
- Mark weak or manual identity assumptions.

## External recovery coverage

### Package and code

- Inventory manifests, permissions, entrypoints, services, libraries, assets, splits, versions, backend, serialization, delivery, encryption, and SDKs.
- Preserve Mono assemblies and available bodies.
- Preserve IL2CPP metadata and binaries that match version and ABI.
- Label dummy DLLs, stubs, and pseudocode as derived indexes or inferences.
- Index boot, config, loading, persistence, core flow, UI, lifecycle, reusable instances, and platform adapters.

### Objects and configuration

- Preserve Raw bytes for every readable serialized object.
- Record decoded-export attempts for every supported object.
- Catalog scenes, prefabs, sprites and textures, audio, fonts, materials, shaders, animations, skeleton data, and effects.
- Catalog hierarchy, fields, anchors, pivots, bindings, events, and material slots.
- Record locator domains and old-to-new GUID and fileID mappings.
- Record deterministic compatibility transforms.
- Record config schemas, encrypted originals, authorized decoded forms, counts, defaults, references, and selection conditions.
- Record persistent-key readers and writers.

### Maps and accounting

- Map source data IDs and selection IDs to runtime structures, states, presentation, and outputs.
- Map UI states to hierarchy, input, animation, and assets.
- Trace source objects through decoded objects and compatibility copies to runtime assets.
- Key indexes by source hash, tool and generator versions, schema version, and scope.
- Apply query budgets and scoped-count rules from `token-efficient-evidence-retrieval.md`.
- Apply claim records from `evidence-claims-and-acceptance.md`.
- Reconcile successful, failed, skipped, and unsupported outcomes across supplied leaves.
- Publish catalogs, dependency maps, warnings, and degradation records.
- Account for every omission under the recovery gate.
- Provide regeneration instructions and coverage classified as exact, derived, inferred, missing, corrupt or blocked.

## Evidence packet after recovery

- Select one bounded core flow.
- Identify entry, input, authoritative state change, outcome, and retry or continuation.
- Record exact locators for code, configuration and assets and hashes.
- Assign `exact`, `derived`, `inferred`, or `temporary_approximation` verdicts.
- Resolve material unknowns.
- Record blocked dependencies or explicitly accepted temporary approximations for remaining unknowns.
- Scope the dependency closure and promotion manifest.
- Promote only dependencies that consumers require under `workspace-layout-and-asset-promotion.md`.
- Name the handoff precisely, such as “Editor first playable.”
- State exclusions.

## Phase-specific validation

- Check production-loader resolution without Editor-only APIs.
- Check imported scripts, references, IDs, bindings, event receivers, and copied dependencies.
- Apply separate gates for content completeness, original parity, and release readiness.

Recovery coverage proves none of these later outcomes.
