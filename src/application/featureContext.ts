import { inspectTarget } from "./targetProject.js";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { loadLedger } from "./store.js";
export async function featureContext(
  workspace: string,
  question: string,
  seed: string | undefined,
  targetProject: string | undefined,
) {
  const ledger = await loadLedger(workspace);
  const manifest = z
    .object({
      originals: z.array(z.object({ path: z.string(), sha256: z.string() })),
      extracted: z.array(z.object({ path: z.string(), sha256: z.string() })),
    })
    .parse(
      JSON.parse(await readFile(join(workspace, ledger.manifest_path), "utf8")),
    );
  const rows = [...manifest.originals, ...manifest.extracted].map((r) => ({
    path: relative(workspace, r.path),
    recorded_sha256: r.sha256,
    freshness: "not_rehashed",
  }));
  const classify = (pattern: RegExp) => {
    const selected = rows.filter((r) => pattern.test(r.path));
    return {
      count: selected.length,
      items: selected.slice(0, 20),
      truncated: selected.length > 20,
    };
  };
  const target = targetProject ? await inspectTarget(targetProject) : null;
  return {
    question,
    seed: seed ?? null,
    backend: ledger.backend,
    target_project: target,
    artifacts: {
      managed: classify(/\/Managed\/.*\.dll$/i),
      native: classify(/(?:libil2cpp\.so|GameAssembly\.(?:dll|so|dylib))$/i),
      metadata: classify(/global-metadata\.dat$/i),
      serialized: classify(/(?:\.assets|globalgamemanagers|level\d+)$/i),
    },
    investigation: [
      {
        step: "Identify the observed feature entry and selection conditions",
        tools: [
          "unity_investigate_feature",
          "unity_decode_component",
          "unity_inspect_objects",
          "unity_inspect_object",
          "unity_trace_references",
          "unity_map_il2cpp",
          "unity_recover_il2cpp",
          "inspect_android_package",
        ],
        result:
          "Qualified GameObject/component/MonoScript/config identifiers and unresolved entrypoints.",
      },
      {
        step: "Trace actual implementation through the complete REA core",
        tools: [
          "inspect_managed_artifact",
          "inspect_managed_members",
          "unity_inspect_native",
          "open_binary",
          "procedure_pseudo_code",
          "xrefs",
          "trace_feature",
        ],
        result:
          "Source-backed input/state/output/lifecycle chain. For IL2CPP first obtain a version/ABI-matched metadata/address map using a domain analyzer.",
      },
      {
        step: "Explain and reproduce the feature in the specified target project",
        tools: [
          "unity_inspect_target",
          "unity_plan_transfer",
          "unity_apply_transfer",
          "unity_record_claim",
          "unity_record_marker",
        ],
        result:
          "The host agent writes code and bindings using target architecture, executes actual Editor checks and records artifacts. These records do not create the implementation.",
      },
      {
        step: "Execute reviewed source and target cases and compare visible checkpoints",
        tools: [
          "unity_android_scenario",
          "unity_compare_ui_values",
          "unity_compare_ui_signals",
          "unity_record_marker",
        ],
        result:
          "Installed source hashes, input traces, screenshots and narrowly scoped comparison. The host uses authorized Editor/player tools for target execution. Inconclusive OCR, missing permissions and failed inputs must remain unresolved.",
      },
    ],
    acceptance: [
      "Explain the implementation with exact source locators and explicit unknowns.",
      "Implement in the selected existing project without importing unrelated source-game systems.",
      "Verify the normal input, state transition, visible result and repeat/lifecycle cases.",
    ],
    limits: [
      "This context is an investigation entrypoint, not a claim that the feature was recovered.",
      "Inspect the discovered core tool input schemas before calling them.",
      "Investigating one feature does not require authoring a whole-game replica.",
    ],
  };
}
