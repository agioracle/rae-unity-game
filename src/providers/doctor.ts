import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join, isAbsolute } from "node:path";
import { coreRuntime } from "../core/runtime.js";
import { runProcess } from "./process.js";
const names = [
  "rea",
  "ilspycmd",
  "Cpp2IL",
  "Il2CppDumper",
  "AssetRipper",
  "UnityDataTools",
  "jadx",
  "apktool",
  "apksigner",
  "apkanalyzer",
  "adb",
  "unity",
];
export async function locate(name: string) {
  const paths = isAbsolute(name)
    ? [name]
    : (process.env.PATH ?? "")
        .split(delimiter)
        .filter(Boolean)
        .flatMap((p) =>
          process.platform === "win32"
            ? [join(p, name), join(p, name + ".exe"), join(p, name + ".cmd")]
            : [join(p, name)],
        );
  for (const path of paths)
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      /* try next PATH candidate */
    }
  return null;
}
export async function doctor() {
  const name =
    process.env.REA_UNITY_PYTHON ??
    (process.platform === "win32" ? "python" : "python3");
  let python: {
    available: boolean;
    version: string | null;
    compatible: boolean;
  } = { available: false, version: null, compatible: false };
  try {
    const p = await runProcess(name, ["--version"], {
      timeoutMs: 5000,
      maxBytes: 4096,
    });
    const version = (p.stdout || p.stderr).trim();
    const match = /Python (\d+)\.(\d+)/.exec(version);
    python = {
      available: p.code === 0,
      version,
      compatible:
        !!match &&
        (Number(match[1]) > 3 ||
          (Number(match[1]) === 3 && Number(match[2]) >= 10)),
    };
  } catch {
    /* report unavailable without installing */
  }
  const tools = await Promise.all(
    names.map(async (name) => ({
      name,
      path: await locate(name),
      compatibility: "not_verified",
    })),
  );
  return {
    core: {
      package: "rea-agents",
      version: coreRuntime().version,
      entry: coreRuntime().entry,
      required: true,
    },
    node: {
      version: process.versions.node,
      compatible: (() => {
        const [major, minor] = process.versions.node.split(".").map(Number);
        return (
          (major === 22 && minor! >= 19) ||
          (major === 24 && minor! >= 11) ||
          major! >= 26
        );
      })(),
    },
    python,
    configured_il2cpp_analyzer: {
      path: process.env.REA_UNITY_IL2CPP_DUMPER ?? null,
      compatibility: "not_verified",
    },
    configured_domain_tools: await Promise.all(
      Object.entries({
        libcpp2il_indexer: process.env.REA_UNITY_LIBCPP2IL_INDEXER,
        dotnet: process.env.REA_UNITY_DOTNET,
        adb: process.env.REA_UNITY_ADB,
        touch_dex: process.env.REA_UNITY_TOUCH_DEX,
        tesseract: process.env.REA_UNITY_TESSERACT,
      }).map(async ([name, path]) => {
        let readable = false;
        if (path && isAbsolute(path))
          try {
            await access(path, constants.R_OK);
            readable = true;
          } catch {}
        return {
          name,
          path: path ?? null,
          readable,
          compatibility: "not_verified",
        };
      }),
    ),
    tools,
    notes: [
      "Tool discovery checks PATH presence only.",
      "No software was installed. Unity, SDK licenses and provider compatibility require separate evidence.",
      "Core intake/query helpers require Python >=3.10.",
    ],
  };
}
export function capabilities() {
  return {
    product: "rea-unity-game",
    version: "0.5.0",
    local_only: true,
    foundation: {
      package: "rea-agents",
      version: coreRuntime().version,
      cli: "complete inherited command surface",
      mcp: "complete persistent core catalog plus Unity additions",
    },
    implemented: [
      "APK/XAPK/APKS/APKM/AAB/ZIP inventory",
      "split directories and desktop player inventory",
      "immutable source snapshots and bounded raw extraction",
      "hashed evidence and bounded queries",
      "persistent recovery accounting and roadmap gates",
      "versioned first-playable acceptance",
      "shared CLI/MCP contracts",
      "provider diagnostics and REA/Unity handoff",
      "bounded REA managed-analysis adapter",
      "UnityPy serialized object catalogs and exact PathID fields",
      "feature question and existing target-project context",
      "bounded UnityFS extraction and outgoing cross-file PPtr tracing",
      "qualified ELF/IL2CPP maps with provider provenance and code aliases",
      "metadata-aware Il2CppDumper/LibCpp2IL fresh recovery with isolated managed runtime and map retention",
      "authorized Android APK identity, bounded normal input and binary screenshots",
      "declarative feature investigation without game-specific symbols, ABI selection or object IDs",
      "bounded ARM64 instruction windows with alias preservation and aggregate output budget",
      "attributed schema-based MonoBehaviour field decode with exact native header and full-byte consumption",
      "visual phase guards with strict deadlines and independently reviewed RGB signals",
      "hashed numeric UI region comparison with explicit OCR confidence and inconclusive results",
      "target version/packages/input/pipeline/assembly/GUID profiling",
      "hashed create-only feature transfer plans with GUID remapping",
    ],
    delegated: [
      "Mono decompilation: ILSpy/REA",
      "IL2CPP metadata compatibility: configured version-compatible Il2CppDumper or repository LibCpp2IL exporter; native analysis: complete REA providers",
      "decoded Unity asset export: AssetRipper/UnityDataTools/UnityPy",
      "editable project authoring and runtime validation: Unity Editor agents",
    ],
    limitations: [
      "No automatic recovery of arbitrary original source.",
      "Game execution requires an authorized selected device/app; no protection bypass.",
      "No automatic Unity installation.",
      "No gameplay, GPU or device parity assertion from inventory or synthetic tests.",
    ],
  };
}
