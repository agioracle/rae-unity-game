import { createHash } from "node:crypto";
// Execute reviewed numeric or color-signal screenshot checkpoints through the shared CLI/MCP owner.
// The host agent captures/identifies source and target views and writes this spec.
import { readFile, writeFile } from "node:fs/promises";
import { execute } from "../dist/operations.js";
import { hashFile } from "../dist/application/store.js";
const [specPath, output] = process.argv.slice(2);
if (!specPath || !output)
  throw Error(
    "Usage: node scripts/compare-feature-checkpoints.mjs spec.json NEW-result.json",
  );
const bytes = await readFile(specPath);
if (bytes.length > 1024 * 1024) throw Error("Specification exceeds 1 MiB");
const specSha256 = createHash("sha256").update(bytes).digest("hex");
const spec = JSON.parse(bytes);
if (
  typeof spec.workspace !== "string" ||
  !Array.isArray(spec.checkpoints) ||
  !spec.checkpoints.length ||
  spec.checkpoints.length > 20
)
  throw Error("Expected workspace and 1..20 reviewed checkpoints");
const results = [];
for (const checkpoint of spec.checkpoints) {
  const operation = checkpoint.operation ?? "compare-ui-values";
  if (!["compare-ui-values", "compare-ui-signals"].includes(operation))
    throw Error("Unsupported checkpoint operation");
  if (
    checkpoint.operation &&
    Object.keys(checkpoint).some((k) => !["operation", "record"].includes(k))
  )
    throw Error("Expected checkpoint operation and record");
  const record = checkpoint.operation ? checkpoint.record : checkpoint;
  const response = await execute(operation, {
    workspace: spec.workspace,
    record,
  });
  results.push(response);
}
const status = results.every((r) => r.ok && r.data.status === "passed")
  ? "passed"
  : results.some((r) => r.ok && r.data.status === "mismatch")
    ? "mismatch"
    : "inconclusive";
if ((await hashFile(specPath)) !== specSha256)
  throw Error("Checkpoint specification changed during execution");
const result = {
  specification: { path: specPath, sha256: specSha256 },
  status,
  scope:
    "Caller-reviewed numeric/color UI predicates only; source/target action execution and artifact linkage are separate evidence.",
  results,
};
await writeFile(output, JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify({ status, checkpoints: results.length, output }));
if (status !== "passed") process.exitCode = 2;
