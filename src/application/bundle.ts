import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadLedger, inside, hashFile, noSymlinks } from "./store.js";
import { retainReport } from "./evidenceReports.js";
import { python } from "../providers/process.js";
import { requireCondition } from "../domain/errors.js";
export async function unpackBundle(workspace: string, path: string) {
  await loadLedger(workspace);
  const source = inside(workspace, path),
    sha256 = await hashFile(source),
    output = join("recovered/04_unity_raw", `bundle-${randomUUID()}`),
    destination = inside(workspace, output);
  await noSymlinks(destination);
  const evidence = (await python(
    "unity_bundle.py",
    ["--input", source, "--output", destination],
    { timeoutMs: 120000, maxBytes: 4 * 1024 * 1024 },
  )) as Record<string, unknown>;
  requireCondition(
    (await hashFile(source)) === sha256 && evidence.source_sha256 === sha256,
    "EVIDENCE_CHANGED",
    "UnityFS source changed during extraction.",
  );
  const result = { ...evidence, source: { path, sha256 }, output };
  return {
    ...result,
    ...(await retainReport(workspace, "unity-bundle", result)),
  };
}
