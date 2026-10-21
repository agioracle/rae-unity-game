import { z } from "zod";
import { relative } from "node:path";
import { id, text, digest } from "../domain/model.js";
import { loadLedger, inside, hashFile } from "./store.js";
import { readEvidence, retainReport } from "./evidenceReports.js";
import { requireCondition } from "../domain/errors.js";
import { featureContext } from "./featureContext.js";
import { recoverIl2cpp } from "./il2cppRecovery.js";
import { mapIl2cpp } from "./il2cpp.js";
import { unpackBundle } from "./bundle.js";
import { traceReferences } from "./references.js";
const selector = z
  .object({
    suffix: text.refine(
      (s) =>
        !s.startsWith("/") && !s.includes("\\") && !s.split("/").includes(".."),
      "Use a relative artifact suffix",
    ),
    sha256: digest.optional(),
  })
  .strict();
const common = {
  binary: selector,
  metadata: selector,
  query: text,
  assembly: text.optional(),
};
const native = z.discriminatedUnion("mode", [
  z
    .object({
      ...common,
      mode: z.literal("recover"),
      unityVersion: z.string().regex(/^\d+\.\d+\.\d+[abcfpx]\d+(?:c\d+)?$/),
      toolVersion: z.string().trim().min(1).max(80),
      provider: z.enum(["auto", "il2cppdumper", "libcpp2il"]).default("auto"),
    })
    .strict(),
  z
    .object({
      ...common,
      mode: z.literal("catalog"),
      map: text,
      provenance: text,
      format: z.enum(["libcpp2il-jsonl", "il2cppdumper-script"]),
    })
    .strict(),
]);
export const investigationSchema = z
  .object({
    caseId: id,
    question: text,
    targetProject: text.optional(),
    native: native.optional(),
    bundles: z
      .array(
        z
          .object({
            artifact: selector,
            roots: z
              .array(
                z
                  .object({
                    path: text,
                    pathId: z.string().regex(/^-?\d+$/),
                    maxDepth: z.number().int().min(0).max(20).default(5),
                    maxNodes: z.number().int().min(1).max(500).default(100),
                    maxInputMiB: z.number().int().min(1).max(128).default(64),
                  })
                  .strict(),
              )
              .max(16)
              .default([]),
            members: z.array(text).min(1).max(32).optional(),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export async function investigateFeature(
  workspace: string,
  input: z.infer<typeof investigationSchema>,
) {
  const record = investigationSchema.parse(input),
    ledger = await loadLedger(workspace);
  const manifest = z
    .object({
      originals: z
        .array(z.object({ path: text, sha256: digest }).passthrough())
        .max(200000),
      extracted: z
        .array(z.object({ path: text, sha256: digest }).passthrough())
        .max(200000),
    })
    .passthrough()
    .parse(
      JSON.parse(
        (
          await readEvidence(workspace, ledger.manifest_path, 16 * 1024 * 1024)
        ).bytes.toString(),
      ),
    );
  async function select(selection: z.infer<typeof selector>) {
    const matches = [...manifest.originals, ...manifest.extracted]
      .map((s) => ({ ...s, path: relative(workspace, s.path) }))
      .filter(
        (s) =>
          s.path.endsWith(selection.suffix) &&
          (!selection.sha256 || s.sha256 === selection.sha256),
      );
    requireCondition(
      matches.length === 1,
      "ARTIFACT_SELECTION",
      `Expected exactly one artifact for suffix ${selection.suffix}; found ${matches.length}. Select an explicit ABI/path/hash.`,
    );
    const m = matches[0]!;
    requireCondition(
      (await hashFile(inside(workspace, m.path))) === m.sha256,
      "EVIDENCE_CHANGED",
      "Selected raw artifact changed since intake.",
    );
    return m.path;
  }
  const selectedNative = record.native
    ? {
        binary: await select(record.native.binary),
        metadata: await select(record.native.metadata),
      }
    : null;
  const selectedBundles = [];
  for (const b of record.bundles)
    selectedBundles.push({ record: b, path: await select(b.artifact) });
  let nativeResult: null | Record<string, unknown> = null;
  const resources: unknown[] = [];
  try {
    if (record.native && selectedNative) {
      const n = record.native;
      let map: string,
        provenance: string,
        format: "libcpp2il-jsonl" | "il2cppdumper-script",
        recovery: null | Awaited<ReturnType<typeof recoverIl2cpp>> = null;
      if (n.mode === "recover") {
        recovery = await recoverIl2cpp({
          workspace,
          ...selectedNative,
          provider: n.provider,
          unityVersion: n.unityVersion,
          toolVersion: n.toolVersion,
          query: n.query,
        });
        map = recovery.mapping.sources[2]!.path;
        provenance = recovery.mapping.sources[3]!.path;
        format =
          recovery.execution.provider === "libcpp2il"
            ? "libcpp2il-jsonl"
            : "il2cppdumper-script";
      } else {
        map = n.map;
        provenance = n.provenance;
        format = n.format;
      }
      const mapping = await mapIl2cpp({
        workspace,
        ...selectedNative,
        map,
        provenance,
        format,
        query: n.query,
        assembly: n.assembly,
        offset: 0,
        limit: 100,
      });
      nativeResult = { ...selectedNative, recovery, mapping };
    }
    for (const b of selectedBundles) {
      const bundle = z
          .object({
            output: text,
            members: z.array(
              z.object({ path: text, flags: z.number() }).passthrough(),
            ),
          })
          .passthrough()
          .parse(await unpackBundle(workspace, b.path)),
        traces = [];
      const members =
        b.record.members ??
        bundle.members
          .filter((m) => m.flags === 4 && !m.path.endsWith(".resS"))
          .map((m) => m.path);
      requireCondition(
        members.length <= 32,
        "INPUT_LIMIT",
        "Select at most32 serialized dependency members explicitly.",
      );
      for (const root of b.record.roots) {
        requireCondition(
          bundle.members.some((m) => m.path === root.path) &&
            members.includes(root.path),
          "ARTIFACT_SELECTION",
          "Reference root must be an explicitly admitted bundle member.",
        );
        for (const member of members)
          requireCondition(
            bundle.members.some((m) => m.path === member),
            "ARTIFACT_SELECTION",
            "Admitted member does not exist in this bundle.",
          );
        traces.push(
          await traceReferences({
            workspace,
            paths: members.map((m) => bundle.output + "/" + m),
            path: bundle.output + "/" + root.path,
            pathId: root.pathId,
            maxDepth: root.maxDepth,
            maxNodes: root.maxNodes,
            maxInputMiB: root.maxInputMiB,
          }),
        );
      }
      resources.push({ selection: b.record, bundle, traces });
    }
  } catch (error) {
    await retainReport(workspace, "feature-investigation-failed", {
      case_id: record.caseId,
      selection: record,
      native: nativeResult,
      resources,
      status: "failed",
      error: String(error),
    });
    throw error;
  }
  const result = {
    case_id: record.caseId,
    selection: record,
    context: await featureContext(
      workspace,
      record.question,
      record.native?.query,
      record.targetProject,
    ),
    native: nativeResult,
    resources,
    semantic_status: "requires_host_investigation",
    does_not_prove: [
      "Feature implementation or semantic recovery",
      "Complete native call selection",
      "Target runtime behavior or visual parity",
      "Human acceptance",
    ],
  };
  return {
    ...result,
    ...(await retainReport(workspace, "feature-investigation", result)),
  };
}
