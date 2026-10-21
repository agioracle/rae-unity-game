# Package Safety and Tooling

Treat APK, XAPK, APKS, APKM, AAB-derived archives, bundles, and recovered directories as untrusted input, including user-owned inputs.
Preserve evidence before convenience.

## Immutable workspace

Keep the `recovered/` vault outside the Unity project.
Use sibling roots for the project, validation output, and tools:

```text
RESTORATION_ROOT/
|-- recovered/
|   |-- 00_original/          immutable supplied packages and splits
|   |-- 01_inventory/         hashes, package inventory, identity reports, tool records
|   |-- 02_container_leaves/  verified extracted APK leaves
|   |-- 03_android_raw/       decoded Manifest/resources/DEX/smali evidence
|   |-- 04_unity_raw/         untouched Unity serialized/exported evidence
|   |-- 05_indexes/           GUID/PathID/token/RVA/config/audio/UI catalogs
|   `-- 06_compat/            generated compatibility copies and GUID maps
|-- UNITY_PROJECT/            authored Unity restoration project
|-- validation/               fixtures, captures, logs, markers, comparison reports
`-- analysis_tools/           pinned tools and caches
```

Never edit `00_original` or first-pass Raw evidence.
Raw evidence means preserved bytes before conversion.
Store repairs, re-signing, merges, shader replacements, script cleanup, identity rewrites, and conversions in new derived-output roots.
Keep recovered layers, exporter projects, decompiler output, caches, and validation corpora outside `UNITY_PROJECT/`.
Read `workspace-layout-and-asset-promotion.md` before promoting artifacts.

## Archive safety gates

Before listing or extraction:

- Open a stable regular-file snapshot without following symlinks.
- Hash the complete input.
- Check that the input does not change during processing.
- Limit container size, central-directory size, entry count, per-member bytes, total uncompressed bytes, expansion ratio, and nested-container count.
- Limit optional integrity-test duration.
- Reject absolute paths, `..`, NUL, drive prefixes, duplicate normalized paths, ZIP symlinks, and file/directory prefix collisions.
- Reject encrypted members unless the tool explicitly supports them.
- Create a new private output path.
- Never extract over an existing tree.
- Retain an incomplete marker until verification and manifest publication succeed.
- On failure, delete only newly generated incomplete output.
- Make evidence read-only where practical.

Filesystem permissions are advisory. Hashes establish integrity.

## Bundled helpers

The scripts use Python's standard library unless they name an external Android SDK tool.
Run them from the skill directory or use absolute paths.

| Script | Contract |
|---|---|
| `inspect_unity_package.py` | Creates a bounded, read-only inventory of APK/XAPK/APKS/AAB/ZIP inputs or split directories. |
| `hash_manifest.py` | Creates or checks strict SHA-256 manifests for explicit scopes. |
| `extract_container_leaves.py` | Extracts only APK leaves that an inspector report verified. |
| `verify_apk_set_identity.py` | Uses SDK `apksigner` and `apkanalyzer` to check package ID, version code, and signer across leaves. |
| `build_joined_view.py` | Creates an IL2CPP analysis view from verified base and ABI/data splits. Conflicts fail unless bytes match. |
| `evidence_query.py` | Retrieves bounded text with explicit truncation and output budgets. |

Example preflight with new output paths:

```bash
python3 scripts/inspect_unity_package.py INPUT --output recovered/01_inventory/package.json --pretty
python3 scripts/hash_manifest.py create recovered/01_inventory/original.sha256.json INPUT --root RESTORATION_ROOT
python3 scripts/extract_container_leaves.py --container INPUT --inventory recovered/01_inventory/package.json --output recovered/02_container_leaves
python3 scripts/verify_apk_set_identity.py recovered/02_container_leaves/base.apk recovered/02_container_leaves/split.apk --output recovered/01_inventory/identity.json
python3 scripts/build_joined_view.py --base recovered/02_container_leaves/base.apk --split recovered/02_container_leaves/split.apk --inventory recovered/01_inventory/package.json --identity-report recovered/01_inventory/identity.json --output recovered/03_android_joined
```

`build_joined_view.py` preserves provenance for the evidenced split layout.
Do not use its output as a generic merged APK or installation artifact.

## Package and backend routing

1. Inventory every leaf before combining evidence.
2. Record package, version, and signer identity.
3. Locate Unity markers, `ScriptingAssemblies.json`, managed assemblies, `global-metadata.dat`, `libil2cpp.so`, `libunity.so`, ABI splits, bundles, OBBs, and asset packs.
4. Use Mono when gameplay assemblies contain real method bodies.
5. Use IL2CPP when metadata and a matching ABI binary exist.
6. Stop native mapping if matching metadata or binaries are missing.
7. Report the missing leaf.
8. Decode the Android wrapper separately.

ABI means application binary interface.
Java, Kotlin, and smali evidence does not establish native Unity gameplay behavior.

## Tool selection

Select the smallest independently checkable toolchain for the question.
Use `agent-tool-provisioning.md` for installation, compatibility, smoke checks, fallback, and user-action boundaries.

| Question | Primary tool | Independent check or fallback | Evidence boundary |
|---|---|---|---|
| AAB/APKS/split identity | bundletool and SDK signing/analyzer tools | Inventory hashes | Merges and re-signing create derived evidence. |
| Manifest/resources/DEX | Apktool and bounded JADX | Exact smali method | Check JADX failure markers against smali. |
| Unity objects/references | UnityDataTools or selective UnityPy | AssetsTools.NET/UABEA | Stripped TypeTrees can limit fields. |
| Broad asset export | AssetRipper | Representative raw objects | An export is not the original project. |
| Mono assemblies | ILSpy/ILSpyCmd | dnlib token/IL query | Obfuscation and native plugins need separate analysis. |
| IL2CPP types/addresses | Cpp2IL | Il2CppInspectorRedux | Declarations and stubs are not original bodies. |
| Native behavior | Ghidra at a known RVA/function | Another disassembler or runtime case | Pseudocode names and types are inference. |
| Device behavior | adb/scrcpy | Isolated logs/traces | Observation does not prove internal state. |
| Rendering/performance | RenderDoc/Perfetto on authorized targets | Deterministic frame/timing comparison | Headless success does not prove GPU parity. |
| Media comparison | FFmpeg, ImageMagick, vgmstream as needed | Another decoder/diff | Conversions produce derived evidence. Record options. |

RVA means relative virtual address.
Do not install tools without a current evidence need.

## Tool record

Record each selected external tool:

```yaml
name:
official_source:
release_or_commit:
binary_or_source_sha256:
license_checked:
host_os_arch:
target_package_hashes: []
target_unity_version:
target_backend_and_metadata:
purpose:
command:
output_root:
known_warnings: []
fallback:
query_budget:
transport: none | stdio | localhost
allowed_operations: []
telemetry_disabled:
```

For MCP or runtime instrumentation:

- Bind locally.
- Default to read-only operations and bounded pages.
- Separate pristine and annotated databases.
- Check existing authorization before patching, export, hooking or mutation.
- Request approval only when that operation exceeds the authorized scope.
