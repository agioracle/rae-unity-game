// Apply host-authored claims and adaptation to an existing target; no built-in game code.
import { readFile, open, lstat } from "node:fs/promises";
import { relative } from "node:path";
import { execute } from "../dist/operations.js";
const [specPath, output] = process.argv.slice(2);
if (!specPath || !output)
  throw Error(
    "Usage: node scripts/apply-feature-transfer.mjs reviewed-transfer.json NEW-result.json",
  );
if ((await lstat(specPath)).size > 1024 * 1024)
  throw Error("Specification exceeds1MiB");
const spec = JSON.parse(await readFile(specPath, "utf8"));
if (
  Object.keys(spec).some(
    (k) => !["workspace", "claims", "transfer"].includes(k),
  ) ||
  typeof spec.workspace !== "string" ||
  !Array.isArray(spec.claims) ||
  spec.claims.length > 32 ||
  !spec.transfer
)
  throw Error("Expected workspace, claims and transfer operation record");
async function call(name, args) {
  const r = await execute(name, args);
  if (!r.ok) throw Error(JSON.stringify(r));
  return r.data;
}
const receiptFile = await open(output, "wx", 0o600);
try {
  for (const record of spec.claims)
    await call("record-claim", { workspace: spec.workspace, record });
  const plan = await call("plan-transfer", {
    workspace: spec.workspace,
    record: spec.transfer,
  });
  const receipt = await call("apply-transfer", {
    workspace: spec.workspace,
    plan: relative(spec.workspace, plan.report_path),
    planSha256: plan.report_sha256,
  });
  await receiptFile.writeFile(
    JSON.stringify({ workspace: spec.workspace, plan, receipt }, null, 2),
  );
  console.log(
    JSON.stringify({
      target: receipt.targetProject,
      written: receipt.written.length,
      validation_status: receipt.validation_status,
    }),
  );
} catch (error) {
  await receiptFile.truncate(0);
  await receiptFile.writeFile(
    JSON.stringify(
      {
        execution_status: "failed",
        workspace: spec.workspace,
        error: String(error),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await receiptFile.close();
}
