import { z } from "zod";
import { mkdir, writeFile, readFile, lstat } from "node:fs/promises";
import { dirname, join, extname, relative } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { text, id, digest } from "../domain/model.js";
import {
  loadLedger,
  inside,
  hashFile,
  noSymlinks,
  verifySources,
} from "./store.js";
import { readEvidence, retainReport } from "./evidenceReports.js";
import { inspectTarget } from "./targetProject.js";
import { requireCondition } from "../domain/errors.js";
const guid = z.string().regex(/^[a-f\d]{32}$/);
const destination = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (s) =>
      s
        .split("/")
        .every(
          (p) =>
            /^[\w.-]+$/.test(p) &&
            p !== "." &&
            p !== ".." &&
            !p.toLowerCase().endsWith(".meta"),
        ),
    "Use a feature-relative path with simple non-traversing components.",
  );
export const transferRequest = z
  .object({
    targetProject: text,
    featureId: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    claimIds: z.array(id).min(1).max(50),
    files: z
      .array(
        z
          .object({
            source: text,
            target: destination,
            sourceGuid: guid.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    adaptation: z
      .object({
        namespace: text,
        input: text,
        rendering: text,
        lifecycle: text,
      })
      .strict(),
    validationCases: z.array(text).min(1).max(30),
  })
  .strict();
const fileSchema = z
  .object({
    source: text,
    target: destination,
    sourceGuid: guid.optional(),
    sha256: digest,
    targetGuid: guid,
    outputSha256: digest,
  })
  .strict();
const planSchema = z
  .object({
    schema_version: z.literal(1),
    kind: z.literal("unity-feature-transfer"),
    targetProject: text,
    targetFingerprint: digest,
    featureId: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    claimIds: z.array(id).min(1).max(50),
    files: z.array(fileSchema).min(1).max(100),
    adaptation: transferRequest.shape.adaptation,
    validationCases: transferRequest.shape.validationCases,
    validation_status: z.literal("not_run"),
  })
  .strict();
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const textAssets = new Set([
  ".cs",
  ".json",
  ".asmdef",
  ".asmref",
  ".uxml",
  ".uss",
  ".prefab",
  ".unity",
  ".asset",
  ".mat",
  ".txt",
  ".shader",
  ".hlsl",
  ".cginc",
  ".inputactions",
]);
const binaryAssets = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".wav",
  ".ogg",
  ".mp3",
  ".ttf",
  ".otf",
]);
async function checkClaims(workspace: string, ids: string[]) {
  const l = await loadLedger(workspace);
  for (const id of ids) {
    const c = l.claims.find((c) => c.id === id);
    requireCondition(
      c && c.sources.length > 0,
      "INVALID_CLAIM",
      `Transfer needs an existing source-backed claim: ${id}`,
    );
    await verifySources(workspace, c.sources);
  }
}
function transform(
  bytes: Buffer,
  file: z.infer<typeof fileSchema>,
  files: z.infer<typeof fileSchema>[],
  targetGuids: Record<string, string[]>,
) {
  const ext = extname(file.target).toLowerCase();
  requireCondition(
    textAssets.has(ext) || binaryAssets.has(ext),
    "UNSUPPORTED_ASSET",
    `Unsupported transfer extension: ${ext}`,
  );
  if (!textAssets.has(ext)) return bytes;
  const value = bytes.toString("utf8");
  requireCondition(
    Buffer.from(value).equals(bytes) && !value.includes("\0"),
    "INVALID_ASSET",
    "Transfer text must be UTF-8 without NUL.",
  );
  const mapping = new Map(
    files
      .filter((f) => f.sourceGuid !== undefined)
      .map((f) => [f.sourceGuid!, f.targetGuid]),
  );
  const rewritten = value.replace(
    /\bguid:\s*([a-f\d]{32})\b/gi,
    (match, g: string) => {
      const key = g.toLowerCase(),
        replace = mapping.get(key);
      if (replace) return match.replace(g, replace);
      requireCondition(
        /^0{16}/.test(key) || targetGuids[key]?.length === 1,
        "UNRESOLVED_GUID",
        `Serialized GUID dependency is not mapped or uniquely present in target: ${key}`,
      );
      return match;
    },
  );
  return Buffer.from(rewritten, "utf8");
}
export async function planTransfer(
  workspace: string,
  input: z.infer<typeof transferRequest>,
) {
  const record = transferRequest.parse(input);
  await checkClaims(workspace, record.claimIds);
  const target = await inspectTarget(record.targetProject);
  requireCondition(
    target.duplicate_guids.length === 0,
    "AMBIGUOUS_GUID",
    "Target has duplicate asset GUIDs.",
  );
  const used = new Set(Object.keys(target.guids)),
    names = new Set<string>(),
    oldGuids = new Set<string>();
  const files = [];
  for (const f of record.files) {
    requireCondition(
      !names.has(f.target.toLowerCase()),
      "INVALID_TRANSFER",
      "Duplicate target asset path.",
    );
    names.add(f.target.toLowerCase());
    for (const other of names)
      requireCondition(
        other === f.target.toLowerCase() ||
          (!other.startsWith(f.target.toLowerCase() + "/") &&
            !f.target.toLowerCase().startsWith(other + "/")),
        "INVALID_TRANSFER",
        "File/directory path collision.",
      );
    if (f.sourceGuid) {
      requireCondition(
        !oldGuids.has(f.sourceGuid),
        "INVALID_TRANSFER",
        "Source GUID must identify one staged asset.",
      );
      oldGuids.add(f.sourceGuid);
    }
    const { source } = await readEvidence(
      workspace,
      f.source,
      16 * 1024 * 1024,
    );
    let targetGuid: string;
    do {
      targetGuid = randomBytes(16).toString("hex");
    } while (used.has(targetGuid));
    used.add(targetGuid);
    files.push({
      ...f,
      sha256: source.sha256,
      targetGuid,
      outputSha256: "0".repeat(64),
    });
  }
  for (const f of files) {
    const e = await readEvidence(workspace, f.source, 16 * 1024 * 1024);
    requireCondition(
      e.source.sha256 === f.sha256,
      "EVIDENCE_CHANGED",
      "Staged feature changed during planning.",
    );
    f.outputSha256 = sha(transform(e.bytes, f, files, target.guids));
  }
  const plan = planSchema.parse({
    schema_version: 1,
    kind: "unity-feature-transfer",
    targetProject: target.root,
    targetFingerprint: target.fingerprint,
    featureId: record.featureId,
    claimIds: record.claimIds,
    files,
    adaptation: record.adaptation,
    validationCases: record.validationCases,
    validation_status: "not_run",
  });
  const report = await retainReport(workspace, "transfer-plan", plan);
  return {
    ...plan,
    ...report,
    next: "Apply this reviewed plan, then compile and exercise its validation cases in Unity. Adaptation decisions are host-authored and require actual verification.",
  };
}
export async function applyTransfer(
  workspace: string,
  planPath: string,
  planSha256: string,
) {
  await loadLedger(workspace);
  const input = await readEvidence(workspace, planPath, 1024 * 1024);
  requireCondition(
    input.source.sha256 === planSha256,
    "EVIDENCE_CHANGED",
    "Transfer plan hash mismatch.",
  );
  const p = planSchema.parse(JSON.parse(input.bytes.toString("utf8")));
  await checkClaims(workspace, p.claimIds);
  const target = await inspectTarget(p.targetProject);
  requireCondition(
    target.fingerprint === p.targetFingerprint,
    "TARGET_CHANGED",
    "Target context changed; prepare a new adaptation plan.",
  );
  const ids = p.files.map((f) => f.targetGuid);
  requireCondition(
    new Set(ids).size === ids.length && ids.every((g) => !target.guids[g]),
    "AMBIGUOUS_GUID",
    "Planned target GUIDs must be new and unique.",
  );
  const staged = [];
  let total = 0;
  for (const f of p.files) {
    const e = await readEvidence(workspace, f.source, 16 * 1024 * 1024);
    requireCondition(
      e.source.sha256 === f.sha256,
      "EVIDENCE_CHANGED",
      "Staged feature source changed.",
    );
    const bytes = transform(e.bytes, f, p.files, target.guids);
    requireCondition(
      sha(bytes) === f.outputSha256,
      "EVIDENCE_CHANGED",
      "Transformed feature hash differs from the plan.",
    );
    requireCondition(
      (total += bytes.length) <= 64 * 1024 * 1024,
      "INPUT_LIMIT",
      "Transfer exceeds total 64 MiB.",
    );
    staged.push({ file: f, bytes });
  }
  const destination = join(target.root, "Assets", p.featureId);
  await noSymlinks(destination);
  await noSymlinks(destination + ".meta");
  try {
    await lstat(destination + ".meta");
    requireCondition(
      false,
      "TARGET_EXISTS",
      "Destination feature metadata already exists.",
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  // Exclusive folder ownership; failures leave an explicit incomplete marker, never remove user edits.
  await mkdir(destination);
  const marker = join(destination, ".rea-transfer-incomplete");
  await writeFile(marker, planSha256, { flag: "wx" });
  const written = [];
  for (const { file, bytes } of staged) {
    const out = inside(destination, file.target);
    await noSymlinks(out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, bytes, { flag: "wx" });
    await writeFile(
      out + ".meta",
      `fileFormatVersion: 2\nguid: ${file.targetGuid}\n`,
      { flag: "wx" },
    );
    written.push({
      path: relative(target.root, out),
      sha256: await hashFile(out),
      guid: file.targetGuid,
    });
  }
  const { rm } = await import("node:fs/promises");
  await rm(marker);
  const result = {
    kind: "unity-feature-transfer-receipt",
    targetProject: target.root,
    featureId: p.featureId,
    plan: input.source,
    written,
    adaptation: p.adaptation,
    validationCases: p.validationCases,
    validation_status: "not_run",
    does_not_prove: [
      "Unity compilation",
      "scene wiring correctness",
      "runtime behavior",
      "feature parity",
    ],
  };
  return {
    ...result,
    ...(await retainReport(workspace, "transfer-receipt", result)),
  };
}
