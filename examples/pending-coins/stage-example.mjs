// Stage a source-backed currency example into a fresh isolated Unity project.
// Run after real APK static evidence exists; does not pretend to recover arbitrary features.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execute } from "../../dist/operations.js";
import { hashFile } from "../../dist/application/store.js";
const root = resolve(process.argv[2] ?? ".verification/feature-transfer");
const c = JSON.parse(await readFile(join(root, "static-context.json"), "utf8")),
  workspace = c.workspace,
  target = resolve(process.argv[3] ?? join(root, "TargetGame"));
await mkdir(target);
const claimId = "pending-coins-native-" + Date.now();
async function call(name, input) {
  const result = await execute(name, input);
  if (!result.ok) throw Error(JSON.stringify(result));
  return result.data;
}
for (const folder of ["Assets", "Packages", "ProjectSettings"])
  await mkdir(join(target, folder), { recursive: true });
await writeFile(
  join(target, "Packages/manifest.json"),
  JSON.stringify({ dependencies: { "com.unity.modules.imgui": "1.0.0" } }),
);
await writeFile(
  join(target, "ProjectSettings/ProjectVersion.txt"),
  "m_EditorVersion: 2022.3.62f3\n",
);
const native = "reports/pending-coins-native.json";
await call("record-claim", {
  workspace,
  record: {
    id: claimId,
    question: "How are pending coins accumulated and consumed?",
    claim:
      "The four selected ARM64 methods read/write PlayerPrefs, clamp negatives, ignore nonpositive additions, and consume by reading then writing zero; setter tail-calls Save. Int32 addition wraps before setter clamp.",
    evidence_grade: "A_direct_static",
    evidence_verdict: "derived",
    sources: [
      ...c.map.sources.slice(0, 2).map((source, index) => ({
        ...source,
        locator: {
          domain: index === 0 ? "native_va" : "path_field",
          value:
            index === 0
              ? "ELF-VA=0x22adad4; file offset=0x22a9ad4; provider RVA=0x22a9ad4"
              : "IL2CPP metadata header version39",
        },
      })),
      {
        path: native,
        sha256: await hashFile(join(workspace, native)),
        locator: {
          domain: "native_va",
          value:
            "ELF-VA=0x22adad4/0x22adb24/0x22adb48/0x22adb9c; qualified mapping in report; provider RVA differs",
        },
      },
    ],
    proves: [
      "Bounded native instruction sequence and direct callee identities",
    ],
    does_not_prove: [
      "Original Android PlayerPrefs execution",
      "original menu animation or UI appearance",
      "original runtime call selection",
    ],
    unresolved: [],
    filtered_or_sampled: true,
    truncated: false,
  },
});
const sourceRoot = fileURLToPath(
  new URL("./", import.meta.url),
);
const names = [
  "PendingCoinsFeature.cs",
  "PendingCoinsView.cs",
  "Editor/NativeTransferValidation.cs",
  "Editor/BuildTransferredPlayer.cs",
];
for (const name of names) {
  await mkdir(
    join(workspace, "reports/staged", name.split("/").slice(0, -1).join("/")),
    { recursive: true },
  );
  await writeFile(
    join(workspace, "reports/staged", name),
    await readFile(join(sourceRoot, name)),
  );
}
const plan = await call("plan-transfer", {
  workspace,
  record: {
    targetProject: target,
    featureId: "PendingCoinRecreation",
    claimIds: [claimId],
    files: names.map((name) => ({
      source: "reports/staged/" + name,
      target: name,
    })),
    adaptation: {
      namespace:
        "Reconstructed.Gameplay; standalone component instead of original global CurrencyManager",
      input:
        "Isolated IMGUI Add/Consume buttons call component API; automated PlayMode invokes the same public commands; hardware click parity remains unverified.",
      rendering:
        "Built-in IMGUI verification view; original game menu layout/assets remain investigation evidence only.",
      lifecycle:
        "Instance-owned component; isolated namespaced PlayerPrefs key; disable/re-enable preserves pending balance. No source-game preferences are changed.",
    },
    validationCases: [
      "clamp negative stored values",
      "ignore zero and negative additions",
      "sum positive additions",
      "consume returns balance then clears it",
      "repeat consume returns zero",
      "int32 overflow follows source arithmetic",
      "disable/re-enable preserves state",
      "new component instance reads persisted state",
    ],
  },
});
const receipt = await call("apply-transfer", {
  workspace,
  plan: relative(workspace, plan.report_path),
  planSha256: plan.report_sha256,
});
await writeFile(
  join(root, "transfer-context.json"),
  JSON.stringify({ target, workspace, plan, receipt }, null, 2),
);
console.log(
  JSON.stringify({
    target,
    files: receipt.written.length,
    validation_status: receipt.validation_status,
  }),
);
