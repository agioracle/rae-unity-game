import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  loadLedger,
  inside,
  noSymlinks,
  hashFile,
  atomicJson,
} from "./store.js";
import { python } from "../providers/process.js";
import { AppError, requireCondition } from "../domain/errors.js";
export async function inspectObjects(
  workspace: string,
  path: string,
  selection: {
    pathId?: string;
    serializedFile?: string;
    field?: string;
    offset?: number;
    limit?: number;
    maxInputMiB?: number;
  },
) {
  await loadLedger(workspace);
  const source = inside(workspace, path);
  await noSymlinks(source);
  const sha256 = await hashFile(source);
  const args = [
    "--input",
    source,
    "--offset",
    String(selection.offset ?? 0),
    "--max-input-mib",
    String(selection.maxInputMiB ?? 64),
    "--limit",
    String(selection.limit ?? 20),
  ];
  if (selection.pathId !== undefined) args.push("--path-id", selection.pathId);
  if (selection.serializedFile !== undefined)
    args.push("--serialized-file", selection.serializedFile);
  if (selection.field !== undefined) args.push("--field", selection.field);
  const result = z.record(z.unknown()).parse(
    await python("unity_objects.py", args, {
      timeoutMs: 35000,
      maxBytes: 2 * 1024 * 1024,
    }),
  );
  if (result.status === "unavailable")
    throw new AppError(String(result.code), String(result.message));
  requireCondition(
    (await hashFile(source)) === sha256 && result.source_sha256 === sha256,
    "EVIDENCE_CHANGED",
    "Unity serialized source changed during inspection.",
  );
  const record = {
    schema_version: 1,
    source: { path, sha256, locator_domain: "unity_pathid" },
    evidence: result,
  };
  const report_path = join(
    workspace,
    "reports",
    `unity-objects-${randomUUID()}.json`,
  );
  await atomicJson(report_path, record);
  return { ...record, report_path, report_sha256: await hashFile(report_path) };
}
