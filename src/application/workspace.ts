import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { python } from "../providers/process.js";
import { AppError, requireCondition } from "../domain/errors.js";
import { inventorySchema, ledgerSchema, type Ledger } from "../domain/model.js";
import { atomicJson, noSymlinks, hashFile } from "./store.js";

export async function inspect(input: string) {
  const temp = await mkdtemp(
    join(await realpath(tmpdir()), "rea-unity-inspect-"),
  );
  try {
    await noSymlinks(input);
    const result = z
      .object({ inventory: inventorySchema })
      .parse(
        await python("intake.py", [
          "inspect",
          "--input",
          resolve(input),
          "--output",
          join(temp, "inventory.json"),
        ]),
      );
    const report = result.inventory;
    // Keep large inventories retrievable via init; inspection explicitly reports summarization.
    const { containers: _containers, files: _files, ...summary } = report;
    return {
      inventory: {
        ...summary,
        containers: Array.isArray(report.containers)
          ? report.containers.slice(0, 20)
          : [],
        files: Array.isArray(report.files) ? report.files.slice(0, 20) : [],
      },
      filtered_or_sampled: true,
      does_not_prove: [
        "signer/package identity",
        "original source recovery",
        "runtime behavior",
      ],
      next: "init preserves the full inventory and source snapshots on disk",
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function initialize(
  input: string,
  workspace: string,
  authorization: string,
) {
  const root = resolve(workspace);
  await noSymlinks(root);
  await noSymlinks(input);
  try {
    await lstat(root);
    throw new AppError("WORKSPACE_EXISTS", "Workspace must be a new path.");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const intake = z
    .object({ inventory: inventorySchema })
    .passthrough()
    .parse(
      await python("intake.py", [
        "init",
        "--input",
        resolve(input),
        "--output",
        root,
      ]),
    );
  const now = new Date().toISOString();
  const categories = [
    "identity",
    "managed",
    "il2cpp",
    "native",
    "assets",
    "configs",
    "android",
  ] as const;
  const ledger: Ledger = {
    schema_version: 1,
    revision: 0,
    created_at: now,
    updated_at: now,
    authorization,
    input: resolve(input),
    backend: intake.inventory.backend_assessment,
    inventory_path: "recovered/01_inventory/package.json",
    manifest_path: "recovered/01_inventory/intake-manifest.json",
    identity_status: "unverified",
    recovery: categories.map((category) => ({
      id: category,
      category,
      scope: `Account for ${category} across every supplied leaf`,
      status: "pending",
      sources: [],
      attempts: [],
      reason:
        "Recovery has not been accounted. Intake is extraction, not decoded recovery.",
      affected_consumers: [],
      material_to_mvp: true,
    })),
    claims: [],
    markers: [],
    roadmap: {
      phase: "P0",
      checkpoint: "not_ready",
      card: null,
      acceptance: null,
      ready_version: null,
    },
    history: [],
  };
  await atomicJson(join(root, "restoration.json"), ledgerSchema.parse(ledger));
  await unlink(join(root, ".incomplete"));
  return {
    workspace: root,
    backend: ledger.backend,
    inventory_path: join(root, ledger.inventory_path),
    manifest_path: join(root, ledger.manifest_path),
    source_identity: "unverified",
    next: "plan: inspect the recovery routes and account for every recovery category",
  };
}
export async function verifyIntake(workspace: string) {
  const root = resolve(workspace);
  await noSymlinks(root);
  const manifest = z
    .object({
      originals: z.array(z.object({ path: z.string(), sha256: z.string() })),
      extracted: z.array(z.object({ path: z.string(), sha256: z.string() })),
    })
    .parse(
      JSON.parse(
        await readFile(
          join(root, "recovered/01_inventory/intake-manifest.json"),
          "utf8",
        ),
      ),
    );
  const rows = [...manifest.originals, ...manifest.extracted];
  let verified = 0;
  for (const row of rows) {
    const path = resolve(row.path);
    requireCondition(
      path.startsWith(root + "/") || path.startsWith(root + "\\"),
      "INVALID_MANIFEST",
      "Manifest path escaped the workspace.",
    );
    requireCondition(
      (await hashFile(path)) === row.sha256,
      "EVIDENCE_CHANGED",
      `Intake artifact changed: ${path}`,
    );
    verified++;
  }
  return {
    verified_files: verified,
    proves: ["Recorded intake file hashes match."],
    does_not_prove: [
      "No additional files exist.",
      "Decoded exports or gameplay are correct.",
    ],
  };
}
