import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { AppError, requireCondition } from "../domain/errors.js";
import {
  atomicJson,
  hashFile,
  inside,
  loadLedger,
  noSymlinks,
} from "../application/store.js";
import { locate } from "./doctor.js";
import { coreRuntime } from "../core/runtime.js";
import { runProcess } from "./process.js";

export async function analyze(
  workspace: string,
  kind: "managed-artifact" | "managed-members",
  path: string,
  type: string | undefined,
) {
  await loadLedger(workspace);
  const source = inside(workspace, path);
  await noSymlinks(source);
  const sourceHash = await hashFile(source);
  requireCondition(
    kind === "managed-members" || type === undefined,
    "INVALID_INPUT",
    "--type applies only to managed-members.",
  );
  const override = process.env.REA_UNITY_REA;
  const requested = override ?? `rea-agents@${coreRuntime().version}`;
  const found = override ? await locate(override) : coreRuntime().entry;
  requireCondition(
    found,
    "TOOL_UNAVAILABLE",
    "The configured REA override was not found.",
  );
  const executable = await realpath(found),
    toolHash = await hashFile(executable);
  const args = [
    kind === "managed-artifact"
      ? "inspect-managed-artifact"
      : "inspect-managed-members",
    source,
    ...(type ? ["--type", type] : []),
    "--json",
  ];
  const started = new Date().toISOString();
  const result = await runProcess(
    override ? executable : process.execPath,
    override ? args : [executable, ...args],
    {
      timeoutMs: 120000,
      maxBytes: 8 * 1024 * 1024,
    },
  );
  requireCondition(
    (await hashFile(source)) === sourceHash,
    "EVIDENCE_CHANGED",
    "Analysis source changed while REA was running.",
  );
  requireCondition(
    (await hashFile(executable)) === toolHash,
    "TOOL_CHANGED",
    "REA executable changed while running.",
  );
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    if (result.code === 0)
      throw new AppError(
        "INVALID_PROVIDER_OUTPUT",
        "REA returned success without JSON.",
      );
  }
  const report = {
    schema_version: 1,
    provider: "rea",
    kind,
    source: { path, sha256: sourceHash },
    tool: {
      requested,
      path: executable,
      sha256: toolHash,
      version: "not_probed",
    },
    command: {
      executable: override ? executable : process.execPath,
      args: override ? args : [executable, ...args],
    },
    started_at: started,
    finished_at: new Date().toISOString(),
    exit_code: result.code,
    result: parsed,
    stderr: result.stderr,
    proves: [
      "The recorded REA command returned this output for these source bytes.",
    ],
    does_not_prove: [
      "Provider conclusions were independently validated.",
      "The original game has been reconstructed.",
    ],
  };
  const reportPath = join(workspace, "reports", `rea-${randomUUID()}.json`);
  await atomicJson(reportPath, report);
  requireCondition(
    result.code === 0,
    "PROVIDER_FAILED",
    `REA exited ${result.code}; retained report: ${reportPath}`,
  );
  return {
    provider: "rea",
    kind,
    source: report.source,
    report_path: reportPath,
    report_sha256: await hashFile(reportPath),
    next: "Query the report, preserve REA Evidence IDs, and record a qualified claim. No claim is created automatically.",
  };
}
