# Workspace Layout and Asset Promotion

Use this module before recovery, Unity bootstrap, broad import, or project-structure cleanup.
The restoration workspace and Unity project have separate ownership boundaries.
Follow project `AGENTS.md` and the main skill for authorization, recovery completeness, and MVP gates.

## Restoration workspace

Keep source evidence and generated analysis in one external `recovered/` vault.
This tree illustrates ownership.
Create optional subfolders only when outputs need them.

```text
RESTORATION_ROOT/
|-- recovered/
|   |-- original/            immutable supplied packages and splits
|   |-- extracted/           verified leaves and unchanged payloads
|   |-- exports/             raw captures and separately identified decoded outputs
|   |-- code/                managed/DEX decompilation and native indexes
|   |-- indexes/             identity, hashes, catalogs, claims, mappings
|   `-- compat/              generated compatibility copies and maps
|-- UNITY_PROJECT/            authored replica
|-- validation/               captures, fixtures, logs, comparison reports
`-- analysis_tools/           pinned tools, caches, isolated runtimes
```

Numbered folders and nine physical directories are not requirements.
Preserve useful subtrees from recovery tools.
Do not flatten conflicting names.
Do not duplicate complete exports to match this example.
Do not move bytes only to match this example.

Equivalent folder names may serve the same ownership roles.
Record those roles and provenance.
Keep raw and derived ownership unambiguous.

Keep these materials outside `UNITY_PROJECT/`:

- `recovered/` and evidence databases.
- Tool caches and decompiler output.
- Exporter projects and raw bundles.
- Validation captures.

Existing workspaces may migrate incrementally.
Before migration:

1. Inventory the current evidence.
2. Hash the current evidence.
3. Define explicit source and destination paths.
4. Preserve `.meta` ownership for assets that already entered Unity.
5. Migrate at a separate reversible checkpoint.

Do not move a live project only because the skill changed.
Inspect existing manifests before repeating recovery work.
Selective promotion limits Unity dependencies.
It does not replace the external recovery gate in the main skill.

## Unity project structure

Keep first-party runtime content under one project namespace.
Avoid exporter type-name folders at the `Assets/` root.
This tree illustrates ownership destinations.
Create only folders with evidenced or agreed consumers.

```text
Assets/
|-- _Project/
|   |-- Art/
|   |   |-- Animations/
|   |   |-- Fonts/
|   |   |-- Materials/
|   |   |-- Models/
|   |   |-- Shaders/
|   |   |-- Sprites/
|   |   `-- Textures/
|   |-- Audio/
|   |-- Data/                reference-bearing configuration and catalogs
|   |-- Prefabs/             subdivide by evidenced ownership when needed
|   |-- Resources/
|   |-- Scenes/
|   |-- Settings/            rendering, text and other project settings
|   `-- Scripts/
|-- Plugins/
|-- ThirdParty/
`-- StreamingAssets/
```

Put project-owned Editor tools under `_Project/Scripts/Editor/`.
Put project-owned tests under `_Project/Scripts/Tests/`.
Use nearby folders when assembly-definition boundaries require them.
Subdivide scripts, prefabs, and scenes by recovered ownership when needed.
Do not require feature folders without an actual owner.

Use `_Project/Resources/` when the production loader requires Resources loading.
Apply the user or target's resource policy when one exists.
Prefer serialized references or the production catalog where they support the recovered loader contract.
Create `Data/`, `Settings/`, and other subdivisions only when they have an actual owner.
This tree does not require migration of a live project.

Use `Plugins/` for native libraries and platform-specific plugins.
Use `ThirdParty/` for immutable vendor and Asset Store content.
Prefer project-owned adapters or compatibility copies when they avoid vendor edits.

Use `StreamingAssets/` only for byte-preserved runtime files that the production loader reads there.
Keep evidence collections outside that folder.

Exclude generated Unity directories, builds, caches, and IDE files from authored content.
Apply the project's version-control policy to those outputs.

For unavoidable top-level exceptions, record the owner and reason.
Record a removal or normalization plan in the ledger.

Before broad import or restoration checkpoints, run:

`scripts/audit_unity_project_layout.py --project-root UNITY_PROJECT`

The audit requires the `_Project` ownership namespace by default.
It does not require optional feature, media, or integration folders.
Add repeated `--require-dir Assets/OWNER/SUBDIRECTORY` arguments only for evidenced or agreed folders under documented owners.
Use `--create-missing` only for new projects or intentional migrations.
That option creates declared folders.
It does not move assets.

### Original names and reuse

Use recovered original asset names when known.
Keep source PathIDs and numeric keys in receipts or maps.
Do not substitute invented type-plus-number filenames for known original names.
Resolve duplicate names through evidenced owner or domain folders.
Record unknown names explicitly.
Do not describe fabricated names as original.

Before generating a resource, check the owner receipt and catalog.
Check existing promotions against source hashes and importer compatibility.
Reuse a valid promotion for the actual consumer.
An unrelated object with the same name does not qualify.

### Restricted Resources policies

Check platform and loading constraints before broad promotion.
Apply this section's restrictions only when the user or target requires them.

If Resources may contain only small configuration:

1. Record the agreed size and type thresholds.
2. Audit every Resources directory under `Assets/`, including vendor directories.
3. Audit each configuration asset's transitive dependencies.

No universal threshold defines small configuration.
A small ScriptableObject can include a large prefab through its references.
When those references violate the agreed policy, move the reference-bearing data or catalog outside Resources.
Moving media alone may leave the dependency in Resources.
Preserve immutable vendor bytes through scoped adapters when needed.
Preserve source evidence outside Unity.

Report these checks separately:

- File size and type.
- Dependency closure.
- Production resolution.

The layout audit checks folder ownership only.
It does not check resource sizes, transitive dependencies, linker retention, or build footprint.

For restricted Resources checks, use the Editor dependency graph.
For example, `AssetDatabase.GetDependencies` identifies serialized dependencies.
Include explicit dynamic-loading entries that serialized references do not represent.
Identify unresolved edges.
A filesystem-only check does not establish the dependency closure.

If the task permits moves only, obtain authorization before changing catalog, preload, or addressable bindings.
Check the existing API semantics that consumers use:

- Keys and casing.
- Folder enumeration and order.
- Asset returns versus prefab-component returns.
- Initialization.

Exercise normal startup with Editor lookup fallbacks disabled.
Report compile, linker, and target Player checks separately.
Moving media outside Resources does not prove smaller initial downloads, lazy loading, or platform subpackages.

### Moves that preserve identity

Before migration, capture these baselines:

- Affected file bytes.
- GUIDs and local fileIDs.
- Importer parameters.
- Saved references.
- Protected runtime values.

Use Editor moves that preserve GUIDs when available.
Inventory affected path consumers:

- Generic and non-generic asset loaders.
- Import and reimport APIs.
- GUID conversion.
- Combined paths.
- Authoring destinations.
- Test fixtures.
- Historical receipts.

Preserve historical evidence.
Use a reviewed relocation map when historical project paths require resolution.

Check destination identity through the actual consumer APIs.
Check serialized reference integrity.
Check the production route.

For structure-only verification, inspect saved production assets directly.
Do not rebuild production assets to prepare those checks.
Clone dynamic fonts and writable atlas dependencies before mutable probes.
Clone writable materials before mutable probes.
Use [verification recipes](restoration-verification-recipes.md) for captured baselines and state restoration.

## Selective promotion contract

Recovered artifacts remain evidence.
Unity assets serve runtime consumers through explicit promotion.
Preserve evidence files in `recovered/`.
Copy or generate required Unity assets into the project.
Do not move the only evidence copy into Unity.

Before promotion, create a manifest entry:

```yaml
id:
ledger_item:
source_path:
source_sha256:
source_locator_domain:
evidence_verdict:
runtime_selection_condition:
dependency_closure: []
destination_path:
destination_guid:
transform_or_import_settings:
license_or_reuse_boundary:
acceptance_case:
status: planned | promoted_unverified | runtime_verified | retired
```

Promotion steps:

1. Select one MVP behavior or ledger item.
2. Trace its concrete runtime selection condition.
3. Compute the smallest dependency closure for that consumer.
4. Reject sources without demonstrated consumers.
5. Choose destinations under the documented Unity owners.
6. Preserve original names and stable identifier mappings.
7. Preserve required import settings.
8. Copy or generate only the required closure.
9. Check import and serialized references.
10. Check production-loader resolution.
11. Test the actual runtime case.
12. Update manifest status.
13. Update the ledger.

The dependency closure includes applicable data, code, adapters, scenes, prefabs, referenced assets, runtime dependencies, and loader registration.
Similar names or plausible appearance do not demonstrate a consumer.
Do not carry package PathIDs into project YAML.
Do not import an entire exporter project or recovered directory for convenience.

Before retiring an unused promotion, prove that no runtime or serialized consumer remains.
Apply the main skill's MVP handoff rules when the promoted closure completes the milestone.
