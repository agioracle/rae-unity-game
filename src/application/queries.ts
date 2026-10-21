import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { python } from "../providers/process.js";
import { AppError, requireCondition } from "../domain/errors.js";
import {
  loadLedger,
  inside,
  noSymlinks,
  atomicJson,
  hashFile,
} from "./store.js";

export async function query(
  workspace: string,
  root: string,
  pattern: string,
  limit: number,
) {
  await loadLedger(workspace);
  const scope = inside(workspace, root);
  await noSymlinks(scope);
  const result = await python(
    "../skills/unity-game-reconstruction/scripts/evidence_query.py",
    [
      scope,
      pattern,
      "--fixed",
      "--max-results",
      String(limit),
      "--context",
      "2",
      "--max-output-chars",
      "24000",
      "--max-files",
      "5000",
      "--max-total-scan-bytes",
      "268435456",
      "--timeout-seconds",
      "30",
      "--json",
    ],
    { timeoutMs: 35000, maxBytes: 1024 * 1024 },
  );
  const report = z.record(z.unknown()).parse(result);
  const path = join(
    resolve(workspace),
    "reports",
    `query-${randomUUID()}.json`,
  );
  await noSymlinks(path);
  const pack = {
    schema_version: 1,
    query: pattern,
    mode: "fixed",
    scope,
    queried_at: new Date().toISOString(),
    result: report,
    next_narrow_query:
      "Use an exact locator from a returned match; check unscanned scope before absence claims.",
  };
  await atomicJson(path, pack);
  return { ...pack, report_path: path, report_sha256: await hashFile(path) };
}
export async function readRecord(
  workspace: string,
  kind: "claims" | "recovery" | "markers" | "history",
  id: string | undefined,
  offset: number,
  limit: number,
) {
  const ledger = await loadLedger(workspace);
  const records = ledger[kind];
  const matches =
    id === undefined
      ? records
      : records.filter((r) => "id" in r && r.id === id);
  return {
    kind,
    scope: id ?? "all records of this kind",
    total: matches.length,
    offset,
    items: matches.slice(offset, offset + limit),
    truncated: matches.length > offset + limit,
    ledger_revision: ledger.revision,
  };
}
export async function handoff(workspace: string, claimId: string | undefined) {
  const l = await loadLedger(workspace);
  const claim = claimId ? l.claims.find((c) => c.id === claimId) : undefined;
  requireCondition(
    !claimId || claim,
    "UNKNOWN_CLAIM",
    "No claim with this ID.",
  );
  return {
    workspace: resolve(workspace),
    backend: l.backend,
    source_claim: claim ?? null,
    rea: {
      transport: "stdio",
      command: "rea-unity-game",
      args: ["mcp"],
      tools: [
        "inspect_managed_artifact",
        "inspect_managed_members",
        "open_binary",
        "procedure_pseudo_code",
      ],
      note: "Use the installed REA tool catalog to select exact input schemas. Preserve its Evidence IDs and source hashes in a claim. The complete REA tools are available in this same MCP session; use them directly.",
    },
    unity: {
      transport: "existing Editor MCP or Unity CLI",
      task: "Read project guidance, inspect Editor state, choose one owner for mutable scenes/assets, import the approved dependency closure and verify normal input.",
      project_root: join(resolve(workspace), "project"),
      note: "project/ is a reserved empty root. Create the project through a compatible installed Unity Editor; no Editor version is installed or guessed.",
    },
    boundaries: [
      "Raw evidence is outside project/.",
      "Native RVA, managed token, Unity PathID and project GUID/fileID are separate locator domains.",
      "Return tool versions, commands, artifact hashes, observed result and proof limits.",
    ],
    next: claim
      ? "Implement only the source-backed consumer scope in this claim after status gates pass."
      : "Use plan and record a source-backed claim before implementation.",
  };
}
