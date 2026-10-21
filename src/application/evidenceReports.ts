import { readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { inside, hashFile, atomicJson } from "./store.js";
import { requireCondition } from "../domain/errors.js";
export async function readEvidence(
  workspace: string,
  path: string,
  maxBytes = 128 * 1024 * 1024,
) {
  const full = inside(workspace, path),
    sha256 = await hashFile(full),
    st = await lstat(full);
  requireCondition(
    st.size <= maxBytes,
    "INPUT_LIMIT",
    "Evidence exceeds its read budget.",
  );
  const bytes = await readFile(full);
  requireCondition(
    bytes.length <= maxBytes && (await hashFile(full)) === sha256,
    "EVIDENCE_CHANGED",
    "Evidence changed during inspection.",
  );
  return { bytes, source: { path, sha256 } };
}
export async function retainReport(
  workspace: string,
  kind: string,
  data: unknown,
) {
  const report_path = join(
    workspace,
    "reports",
    `${kind}-${randomUUID()}.json`,
  );
  await atomicJson(report_path, data);
  return { report_path, report_sha256: await hashFile(report_path) };
}
