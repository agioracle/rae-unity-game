Historical0.3 record. The previously open fresh-recovery, original-runtime, real-click and numeric-checkpoint gaps are addressed for the scoped case in [0.4 automatic feature-loop verification](automatic-loop-verification.md). Original full-artwork parity remains outside that case.

# Feature transfer verification — 2026-10-19

Version 0.3 adds Unity address/resource/target tools to the complete pinned REA 6.7.0 runtime. This is a bounded integration result, not proof that any APK can be reconstructed automatically.

## Executed scope

| Stage | Evidence | Result |
| --- | --- | --- |
| Real APK intake | Existing authorized Siege Squad base + arm64 split, copied into a fresh isolated workspace | Both leaves snapshotted/extracted with hashes; original workspace/project unchanged |
| IL2CPP navigation | Existing LibCpp2IL practice catalog, generator commit `b5ad444b82267cb1e4b88b8b373c008105bdea52`; binary SHA `7f5aeba49747124d51a9544be3aadb838ca3305d61179ef5ccce4f65ed06be95`; metadata SHA `8f34dfe7085e9fd863577c95ab762a06d3ea1ae53dc3ebc5b2035797cf017ead` | 103,475 methods admitted; provider file offsets checked against the APK's ELF load segments. Catalog generation itself was not rerun successfully. |
| APK bundle extraction | `data.unity3d`, SHA `a450e02d133385ac7cbf6e12ec78b8f146443619444548fa6895fecc00c80c96`, UnityFS 8, engine 6000.3.12f1 | 47,300,673 expanded bytes; exact member hashes retained |
| Resource investigation | `level2` PathID `19` (`CoinPill`), 20 admitted SerializedFiles | 14 visited objects, 49 reference edges, depth-limited partial graph. UI dependency evidence is separate from proof of runtime pending-coin selection. |
| Native feature interpretation | Get/Set/Add/ConsumePendingCoins, tokens `0x06000235`–`0x06000238`; exact APK bytes decoded by Capstone 5.0.6 | 4 procedures, 58 instructions. Get/set clamp negative values; Add ignores nonpositive values, wraps int32 then uses setter; Consume reads and saves zero; setter calls PlayerPrefs.Save. |
| Target integration | New isolated Unity 2022.3.62f3 project; component, IMGUI input view and Editor validation harness | Source-backed hashed plan, new GUIDs, create-only transfer. Editor creates prefab/scene and checks runtime commands, state, persistence and lifecycle. |

Address example: GetPendingCoins has ELF VA `0x22adad4`, provider-reported RVA `0x22a9ad4`, and on-disk offset `0x22a9ad4`. The mapper's lowest-PT_LOAD image base is zero, so its image-relative address equals ELF VA. These values are deliberately not collapsed.

The target uses a namespaced preference key and instance-owned component. Its UI is an isolated test interface. Original art/layout, original PlayerPrefs runtime and original Android input were not copied or executed. Ten PlayMode cases passed again in the final fresh target `/.verification/feature-transfer/TargetGameValidated` relative to this repository. The transferred script hashes still match the exact plan/receipt after Editor execution. [Unity result](verification-results/feature-transfer-unity-playmode.json), [transfer hashes and scope](verification-results/feature-transfer-verification-summary.json), and [actual unified MCP calls](verification-results/feature-transfer-mcp-verification.json) are retained. No user acceptance was recorded.

## Remaining full-flow gaps

A compatible fresh IL2CPP extraction engine is still required for APK-only operation on this metadata version 39 example. The existing practice indexer failed to start under the available .NET runtime (`TypeLoadException`); its prior output was imported with exact source hashes and marked as attributed navigation. `recover-il2cpp` now provides a configured Il2CppDumper execution adapter; its successful subprocess contract is tested with a clearly labelled protocol fixture, not claimed as a real analyzer run on metadata 39.

Complete REA tools/catalog and actual managed inspection remain verified. A fresh native provider/session probe encountered local Swift helper compilation/cache/toolchain errors. No successful REA native decompilation is claimed for this run; independent byte disassembly and host interpretation supplied the bounded feature explanation.

No Android PlaybackEngine is installed and no original-game device run occurred. Automated checks invoked the same public commands as the test UI; hardware clicks, original-versus-target runtime comparison, source-game menu animation and visual/device parity remain unverified. No human acceptance was inferred.

## Reproduce from the repository

Use Node 22.19+ or another supported engine, and the pinned optional UnityPy environment. Paths are explicit; every output/target must be new.

```sh
npm ci --omit=optional
python3 -m venv .tools/python
.tools/python/bin/pip install -r requirements-unity.txt
export REA_UNITY_PYTHON="$PWD/.tools/python/bin/python"
npm run build
node scripts/verify-real-apk.mjs /authorized/apk-leaves /authorized/LibCpp2IL/catalog /absolute/NEW-verification-root
# Optional independent byte check; provide an environment containing Capstone 5.0.6:
python scripts/verify-pending-coins-native.py --workspace /absolute/NEW-verification-root/source-workspace --map-report /absolute/path/to/retained-il2cpp-map.json --output /absolute/NEW-verification-root/source-workspace/reports/pending-coins-native.json
node scripts/feature-transfer-example.mjs /absolute/NEW-verification-root /absolute/NEW-target
/absolute/Unity -batchmode -nographics -projectPath /absolute/NEW-target -executeMethod NativeTransferValidation.Run -logFile /absolute/NEW-verification-root/unity.log
```

This real-package driver intentionally selects the verified Siege Squad currency example and prior catalog format; it is a reproducible integration case, not an arbitrary-game solver. For another feature, the host agent investigates using the unified tools, authors its adaptation and validation cases, then uses the same plan/apply boundaries.

## Final checks

Node 22.23.1 / Python 3.13.2: 32 JavaScript tests + 29 Python tests passed, typecheck/format passed, 33 imported-practice hashes verified. Synthetic workflow passed. Packed 0.3 install outside the checkout passed (148 files), including the real complete-core MCP catalogue and actual managed parser. Unified real-data domain calls exposed 235 tools (207 original REA + 28 Unity), mapped four pending-coin methods and traced the 14-node/49-edge partial graph.

Independent review found four material issues, all reproduced RED→GREEN and fixed: TypeTree expansion before budget enforcement, exactly-2,000-edge truncation, ELF32 class-width overflow, and orphan metadata GUID dependencies. Disclosed remaining limitations are unique-basename external association, size/mtime fingerprints for non-text assets, and importer/subasset fidelity requiring Editor verification.

## Current command locations

This document records the historical0.3/0.4 run. In0.5, the currency-only drivers moved to `examples/pending-coins/verify-apk.mjs`, `verify-native.py` and `stage-example.mjs`. The public `scripts/verify-real-apk.mjs` now accepts a generic reviewed JSON specification. Historical artifacts are unchanged. See `docs/general-feature-loop-verification.md` for the next case.
