import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { loadLedger, inside, hashFile, atomicJson } from "./store.js";
import { retainReport } from "./evidenceReports.js";
import { python } from "../providers/process.js";
import { requireCondition } from "../domain/errors.js";
export async function traceReferences(x: {
  workspace: string;
  paths: string[];
  path: string;
  pathId: string;
  maxDepth: number;
  maxNodes: number;
  maxInputMiB?: number;
}) {
  await loadLedger(x.workspace);
  requireCondition(
    new Set(x.paths).size === x.paths.length && x.paths.includes(x.path),
    "INVALID_SELECTION",
    "Admitted paths must be unique and include the root SerializedFile.",
  );
  const files = await Promise.all(
    x.paths.map(async (path) => ({
      path,
      input: inside(x.workspace, path),
      sha256: await hashFile(inside(x.workspace, path)),
    })),
  );
  const manifest = join(
    x.workspace,
    "reports",
    `.references-${randomUUID()}.json`,
  );
  try {
    await atomicJson(manifest, { ...x, files });
    const evidence = (await python(
      "unity_references.py",
      ["--manifest", manifest],
      { timeoutMs: 60000, maxBytes: 4 * 1024 * 1024 },
    )) as Record<string, unknown>;
    for (const f of files)
      requireCondition(
        (await hashFile(f.input)) === f.sha256,
        "EVIDENCE_CHANGED",
        "Serialized evidence changed during traversal.",
      );
    const result = {
      ...evidence,
      sources: files.map(({ path, sha256 }) => ({ path, sha256 })),
    };
    return {
      ...result,
      ...(await retainReport(x.workspace, "unity-references", result)),
    };
  } finally {
    await rm(manifest, { force: true });
  }
}
