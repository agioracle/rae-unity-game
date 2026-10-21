# REA Unity Game

**The complete REA foundation, specialized with Unity tools and reconstruction practice.**

Provide an authorized APK, ask how a feature works, and let your host agent investigate it with REA, explain the evidence, then adapt it to another Unity game and verify the behavior.

[简体中文](README.zh-CN.md) · [Feature workflow](skills/unity-game-reconstruction/references/feature-investigation.md) · [Architecture](docs/architecture.md) · [Verification](docs/verification.md)

Version 0.2 makes `rea-agents@6.7.0` a required runtime. Original REA tools, sessions, providers, schemas, Evidence and errors stay intact. The Unity edition adds domain tools and practice; the host agent retains reasoning, code authoring and orchestration. The checkout directory remains `rae-unity-game`.

## Start

Use Node ^22.19.0, ^24.11.0 or >=26 and Python >=3.10. `.nvmrc` pins the locally verified Node 22.23.1. Optional engines and instrumenters remain capability-dependent.

```bash
npm ci --ignore-scripts --omit=optional
npm run build
# Original REA commands, using the included core:
node dist/cli.js inspect-managed-artifact /path/Assembly-CSharp.dll --json
node dist/cli.js decompile /path/libil2cpp.so 0x1234 --provider ghidra --json
# Unity additions:
node dist/cli.js unity inspect --input /path/game.apk
node dist/cli.js unity init --input /path/game.apk \
  --workspace /path/restoration --authorization "Owner-approved scope"
node dist/cli.js unity feature-context --workspace /path/restoration \
  --question "How is this feature implemented?" --target-project /path/my-other-game
```

A workspace must be a new private path. Intake preserves failed/interrupted output with an `.incomplete` marker and never overwrites existing workspaces. Evidence, reports and tools stay outside the authored Unity project. Nothing is uploaded by this edition. Original REA runtime operations follow the core's authority/lifecycle contracts; mere package intake does not authorize executing a game.

## One MCP endpoint

```json
{
  "mcpServers": {
    "rea-unity-game": {
      "command": "node",
      "args": ["/absolute/path/rae-unity-game/dist/cli.js", "mcp"]
    }
  }
}
```

Upstream setup/update commands retain the upstream installation identity; use the edition MCP configuration above to connect the Unity additions.

Original core tools retain their names. Unity tools use `unity_*`. Read `unity-reconstruction://rea-core-skill` and `unity-reconstruction://skill`, or invoke the `investigate-unity-feature` prompt with input, question, workspace and optional target_project. The same persistent core session owns native analysis and retained Evidence across calls. The broker preserves schemas, content, structuredContent, metadata, errors, discovery paging, callbacks, progress and cancellation. [Architecture and limits](docs/architecture.md).

Example request:

> Explain the implementation of this feature in `/path/game.apk` with exact code/IL/native and asset evidence. Reproduce it in `/path/my-game` using that project's architecture, then run normal-input and lifecycle checks. Keep unresolved evidence explicit.

The host's existing code/file tools and connected Unity Editor MCP/CLI perform actual target-project work. This package does not replace them with a generic model runtime. Skill instructions describe how to connect Unity objects, scripts, configs, code and lifecycle evidence. A handoff or ledger record is not an implementation.

## Unity additions

| Capability | Domain increment |
| --- | --- |
| Package intake | APK/XAPK/APKS/APKM/AAB/ZIP, split directories and extracted desktop players; immutable snapshots, safe raw extraction and hashes |
| Backend routing | Mono/IL2CPP evidence, version/ABI hints and explicit missing leaves |
| Serialized objects | `inspect-objects` and `inspect-object`: qualified 64-bit PathIDs, types, raw hashes and available fields using pinned optional UnityPy |
| Feature scope | `feature-context`: question/seeds, actual recorded artifacts and an existing target project's Editor version |
| Reconstruction practice | Source-backed input/state/output/lifecycle tracing, dependency promotion and adaptation to the target game |
| Verification records | Recovery accounting, claims, actual test markers and versioned explicit user acceptance |

Unity CLI operations: `unity inspect`, `init`, `verify`, `plan`, `status`, `query`, `records`, `handoff`, `analyze`, `feature-context`, `inspect-objects`, `inspect-object`, `record-recovery`, `record-claim`, `record-marker`, `set-roadmap`, `ready`, `record-acceptance`, `advance`, `doctor`, `capabilities`. All domain operations return JSON. Record commands accept `--file record.json`. Original REA commands retain their own arguments/output controls.

For serialized inspection, install the pinned optional parser in a local environment:

```bash
python3 -m venv .tools/python
.tools/python/bin/python -m pip install -r requirements-unity.txt
export REA_UNITY_PYTHON="$PWD/.tools/python/bin/python"
```

The current parser handles single extracted SerializedFiles, formats 9–22, up to 64 MiB. TypeTree failures remain partial evidence. UnityFS extraction, cross-file PPtr tracing, attributed IL2CPP ELF mapping and create-only target transfer are now available. Compatible analyzer installations and actual target Editor checks remain required. [Unity domain tool contracts](docs/unity-domain-tools.md). [UnityPy official API](https://github.com/K0lb3/UnityPy).

## Check and try

```bash
npm run check
npm run demo
node scripts/package-smoke.mjs
```

Tests compare the complete actual REA catalog, invoke its real managed parser, check protocol routing and parse a valid generated Unity TextAsset with UnityPy. Generated fixtures are not a real-game restoration. Real native-engine compatibility, Unity Editor integration and feature parity require the corresponding target, tools and runtime checks. [Verification scope](docs/verification.md).

The complete original REA skill and notices ship with the required dependency. Unity practice material provenance is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No package has been published by this work.

Version 0.3 verification: real Siege Squad APK static evidence → bounded native currency explanation → a fresh Unity target, with ten actual PlayMode cases. At that release, fresh metadata39 extraction, original Android runtime and real-click/visual checks had not yet run; see0.4 below for the later scoped evidence. [Exact scope and reproduction](docs/feature-transfer-verification.md).

Version 0.4 adds fresh metadata39 recovery, authorized Android normal-input capture, and strict numeric screenshot comparisons. An isolated pending-coin transfer passed 10 actual Unity PlayMode cases and 5 screenshot checkpoints after real Player button clicks. Scope, setup, artifacts and limits: [executed automatic feature loop](docs/automatic-loop-verification.md).

Version0.5 removes currency decisions from the public investigation/transfer drivers. It adds declarative investigation, bounded ARM64 instruction windows, attributed custom-component decoding, visual phase guards and color predicates. A second case traces a skill's short-release cancellation, dual-input activation, independent button hold,10-second recharge and reuse from a real APK into an existing Unity project. Actual Editor/PlayMode, clean builds, original Android inputs and target Player inputs are recorded separately. [Executed case and limits](docs/general-feature-loop-verification.md) · [Generic contracts and commands](docs/unity-domain-tools.md#general-feature-investigation-05).

Fresh-package coverage adds ARM32 ARM/Thumb windows, strict registration recovery, an isolated Cpp2IL schema frontend, explicit larger SerializedFile budgets, string-list schema normalization and pre-install ABI checks. The new three-choice case transfers an admitted normal-draft subset into a blank Unity target. Original ARMv7 runtime comparison and Showdown/progression coverage remain open. [Executed evidence and limits](docs/draft-three-choice-verification.md).
