# Feature-oriented REA Unity Edition

The complete REA core supplies general investigation. Start with `rea-unity-game <original REA command>` or its original MCP tools. Unity additions use `rea-unity-game unity <operation>` / `unity_*`. Read [the feature workflow](../skills/unity-game-reconstruction/references/feature-investigation.md) for feature explanations and cross-project reproduction.

```bash
rea-unity-game unity feature-context --workspace /path/restoration \
  --question "How is this feature implemented?" --seed ExactIdentifier \
  --target-project /path/my-other-game
rea-unity-game inspect-managed-artifact /path/Assembly-CSharp.dll --json
rea-unity-game decompile /path/libil2cpp.so 0x1234 --provider ghidra --json
rea-unity-game unity inspect-objects --workspace /path/restoration \
  --path recovered/03_android_raw/game.apk/assets/bin/Data/sharedassets0.assets
```

`feature-context` reads the target version and source artifact index. The host agent uses the complete REA session, follows the evidence and writes the adapted implementation using its code and Unity tools. A context/claim/marker record is not itself analysis, code generation or a runtime test.

# Workflow and records

Use `--workspace /absolute/restoration` for workspace operations. All evidence `path` fields are relative to that workspace, and all hashes are actual lowercase SHA-256 values. Examples below are templates, not completed evidence. Replace placeholder values and include only results you actually obtained.

## Inspect, recover and query

```bash
rea-unity-game unity inspect --input /path/game.apk
rea-unity-game unity init --input /path/game.apk --workspace /path/restoration --authorization "Explicit user scope"
rea-unity-game unity plan --workspace /path/restoration
rea-unity-game unity query --workspace /path/restoration --pattern ExactTypeName --limit 10
rea-unity-game unity records --workspace /path/restoration --kind recovery --id assets
rea-unity-game unity verify --workspace /path/restoration
```

Raw extraction is complete within declared input/budgets. It is not decoded asset export. Complete supported recovery across all supplied leaves, investigate failures, retain raw sources and record gaps before implementation. Unity project authoring and tool preparation follow the packaged skill.

The bundled helpers support hash manifests, verified nested-leaf extraction, Android signing/identity checks, provenance-preserving joins, evidence search, guidance installation and layout audits. Run the selected helper's `--help` from `skills/unity-game-reconstruction/scripts/`. SDK tools and their licenses are external dependencies. A signer or metadata/binary pairing hint from archive inventory is not an independently verified identity.

## REA static analysis

The complete REA 6.7.0 runtime is a required dependency. Original REA CLI/MCP tools are directly available. `REA_UNITY_REA` can explicitly override the report-retaining convenience adapter with a trusted executable. This convenience adapter retains static managed reports; it does not restrict the full original core tool catalog:

```bash
rea-unity-game unity analyze --workspace /path/restoration --kind managed-artifact \
  --path recovered/03_android_raw/game.apk/assets/bin/Data/Managed/Assembly-CSharp.dll
rea-unity-game unity analyze --workspace /path/restoration --kind managed-members \
  --path recovered/03_android_raw/game.apk/assets/bin/Data/Managed/Assembly-CSharp.dll \
  --type Game.ExactController
rea-unity-game unity handoff --workspace /path/restoration
```

REA's JSON, exit status, tool/source hashes and exact argument vector are retained in `reports/`. The normal response is compact; query the retained report. Nonzero exit output is retained when the process completed within budget. No claim is created automatically. Timeouts or output overflow return errors and do not imply cleanup of arbitrary provider descendants.

## Recovery outcome

Write JSON and call `record-recovery --file recovery.json` (MCP: `unity_record_recovery` with `record`). Each category has one current outcome; previous values are retained in history. ID must equal category: `identity`, `managed`, `il2cpp`, `native`, `assets`, `configs`, `android`.

```json
{
  "id": "managed",
  "category": "managed",
  "scope": "All managed assemblies across the supplied current-version leaves",
  "status": "recovered",
  "sources": [{
    "path": "recovered/05_indexes/managed.json",
    "sha256": "REPLACE_WITH_64_HEX_DIGEST",
    "locator": {"domain": "managed_token", "value": "Assembly-CSharp.dll:0x06000001"}
  }],
  "attempts": ["Pinned ILSpy command and representative body/token check"],
  "reason": "Supported methods recovered; representative bodies checked",
  "affected_consumers": ["Current loop controller"],
  "material_to_mvp": true
}
```

Statuses: `pending`, `recovered`, `unsupported`, `failed`, `not_applicable`. `recovered` requires hashed artifacts. `unsupported`/`failed` require concrete attempts. Inapplicability requires a reason. Failed or unsupported outcomes can be accounted without being successful. Material gaps block implementation. Do not set `material_to_mvp: false` merely to force a gate to pass.

## Claim

`record-claim --file claim.json` appends an immutable ID. Use a new ID for a correction and reference it from the roadmap.

```json
{
  "id": "core-loop-v1",
  "question": "Which source-backed input changes the authoritative state?",
  "claim": "Replace with the exact supported conclusion",
  "evidence_grade": "A_direct_static",
  "evidence_verdict": "exact",
  "sources": [{
    "path": "recovered/05_indexes/core.json",
    "sha256": "REPLACE_WITH_64_HEX_DIGEST",
    "locator": {"domain": "path_field", "value": "core.json:stateTransition"}
  }],
  "proves": ["This particular source field/relationship"],
  "does_not_prove": ["Unobserved lifecycle or device behavior"],
  "unresolved": [],
  "filtered_or_sampled": false,
  "truncated": false
}
```

Grades: `A_direct_static`, `B_structural`, `C_runtime_observation`, `design_fill`, `unknown`. Verdicts: `exact`, `derived`, `inferred`, `temporary_approximation`, `evidence_blocked`, `product_override`. Keep them independent. Automatic gates accept sourced, untruncated `exact`/`derived`/`inferred` claims without unresolved questions. Approximation/override approval requires a separately scoped workflow; this version deliberately leaves such claims blocked at the exact-evidence gate.

Locator domains: `path_field`, `unity_guid_fileid`, `unity_pathid`, `managed_token`, `native_rva`, `capture_case`. Never equate integers from different domains.

## One playable outcome

`set-roadmap --file roadmap.json`:

```json
{
  "outcome": "One player-visible result derived from the original",
  "entry": "Designated entry scene",
  "interaction": "Normal player input",
  "state_owner": "Authoritative controller",
  "lifecycle_owner": "Scene/session owner",
  "observable_outcome": "Visible result",
  "repeat_path": "Retry or continue through normal input",
  "startup_steps": ["Open the compatible Editor and designated scene", "Enter Play mode and execute the declared input"],
  "claim_ids": ["core-loop-v1"],
  "marker_ids": ["loop-check-v1"],
  "blockers": []
}
```

Marker IDs can be listed before checks run. Claim IDs must already exist. Setting the roadmap does not mutate Unity or create gameplay code. An agent uses the evidence and connected Editor tools to implement it after `status` says implementation is allowed.

## Actual validation and explicit acceptance

Run checks, then use `record-marker --file marker.json`:

```json
{
  "id": "loop-check-v1",
  "case_id": "entry-input-outcome-repeat",
  "layer": "V2",
  "result": "pass",
  "build": "playable-v1",
  "steps": "Exact steps actually executed, including retry",
  "environment": "Exact Editor/player and platform",
  "artifacts": [{
    "path": "validation/loop-check-v1.log",
    "sha256": "REPLACE_WITH_64_HEX_DIGEST",
    "locator": {"domain": "capture_case", "value": "entry-input-outcome-repeat"}
  }],
  "proves": ["This normal-input case in the recorded environment"],
  "does_not_prove": ["Original algorithm, GPU fidelity or another device"]
}
```

Layers: V0 static, V1 EditMode, V2 PlayMode, V3 paired visual/audio comparison, V4 Player/device. Markers report `pass`, `fail`, `blocked` or `partial`; the tool checks bytes, not whether those steps happened.

```bash
rea-unity-game unity ready --workspace /path/restoration --version playable-v1
```

Readiness requires accounted recovery, no material gaps/blockers, sourced claims, all referenced markers passing for the named build, and at least one V2 or V4 marker. Hashes are rechecked. Report startup steps/limits and await actual human feedback. Only then record their statement:

```json
{
  "decision": "accepted",
  "statement": "The user's explicit acceptance, preserved faithfully",
  "version": "playable-v1",
  "scope": "The one loop they actually accepted"
}
```

`record-acceptance --file acceptance.json`, then `advance`. `changes_requested` permits MVP revisions; it is not acceptance. `waived` records an explicit user waiver separately and does not mark the checkpoint accepted. Silence, tests and “continue” are insufficient.
