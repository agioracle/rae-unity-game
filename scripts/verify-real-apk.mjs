// Game-independent intake and investigation. All feature choices are reviewed JSON.
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { execute } from "../dist/operations.js";
import { hashFile } from "../dist/application/store.js";
const [specPath, output] = process.argv.slice(2);
if (!specPath || !output || !isAbsolute(output))
  throw Error(
    "Usage: node scripts/verify-real-apk.mjs reviewed-spec.json /absolute/NEW-output",
  );
if ((await lstat(specPath)).size > 1024 * 1024)
  throw Error("Specification exceeds1MiB");
const bytes = await readFile(specPath),
  spec = JSON.parse(bytes);
if (
  Object.keys(spec).some(
    (k) => !["input", "authorization", "investigation"].includes(k),
  ) ||
  !isAbsolute(spec.input ?? "") ||
  typeof spec.authorization !== "string" ||
  !spec.investigation
)
  throw Error(
    "Expected input, authorization and investigation operation record",
  );
const specHash = createHash("sha256").update(bytes).digest("hex");
const root = resolve(output);
await mkdir(root);
const workspace = join(root, "source-workspace");
async function call(name, args) {
  const r = await execute(name, args);
  if (!r.ok) throw Error(JSON.stringify(r));
  return r.data;
}
await call("init", {
  input: spec.input,
  workspace,
  authorization: spec.authorization,
});
const investigation = await call("investigate-feature", {
  workspace,
  record: spec.investigation,
});
if ((await hashFile(specPath)) !== specHash)
  throw Error("Specification changed during investigation");
await writeFile(
  join(root, "investigation.json"),
  JSON.stringify(
    {
      workspace,
      specification: { path: resolve(specPath), sha256: specHash },
      ...investigation,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    workspace,
    case_id: investigation.case_id,
    semantic_status: investigation.semantic_status,
    report: investigation.report_path,
  }),
);
