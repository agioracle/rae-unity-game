import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AppError, requireCondition } from "../domain/errors.js";
import { ledgerSchema, type Ledger, type Source } from "../domain/model.js";

// Canonicalize caller-selected parent aliases (for example macOS /var -> /private/var).
// The selected final component and every path inside the evidence boundary remain checked.
export async function selectedPath(path: string): Promise<string> {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  if (parent === absolute) return absolute;
  let base = parent;
  const tails: string[] = [];
  for (;;) {
    try {
      return join(
        await realpath(base),
        ...tails,
        absolute.slice(parent.length + 1),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const next = dirname(base);
      if (next === base) throw e;
      tails.unshift(base.slice(next.length + 1));
      base = next;
    }
  }
}
export async function noSymlinks(path: string): Promise<void> {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  if (parent !== absolute) await noSymlinks(parent);
  try {
    requireCondition(
      !(await lstat(absolute)).isSymbolicLink(),
      "UNSAFE_PATH",
      `Symlink is not allowed: ${absolute}`,
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
export function inside(root: string, path: string): string {
  requireCondition(
    !isAbsolute(path),
    "UNSAFE_PATH",
    "Evidence paths must be workspace-relative.",
  );
  const target = resolve(root, path),
    r = relative(resolve(root), target);
  requireCondition(
    r !== "" && r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r),
    "UNSAFE_PATH",
    "Path must stay inside the workspace.",
  );
  return target;
}
export async function hashFile(path: string): Promise<string> {
  await noSymlinks(path);
  const file = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await file.stat();
    requireCondition(
      before.isFile(),
      "INVALID_EVIDENCE",
      "Evidence must be a regular file.",
    );
    const h = createHash("sha256");
    for await (const chunk of file.createReadStream({ autoClose: false }))
      h.update(chunk);
    const after = await file.stat();
    requireCondition(
      before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        before.ctimeMs === after.ctimeMs,
      "EVIDENCE_CHANGED",
      "Evidence changed while hashing.",
    );
    return h.digest("hex");
  } finally {
    await file.close();
  }
}
export async function verifySources(
  root: string,
  sources: Pick<Source, "path" | "sha256">[],
): Promise<void> {
  for (const source of sources) {
    const p = inside(root, source.path);
    await noSymlinks(p);
    requireCondition(
      (await hashFile(p)) === source.sha256,
      "EVIDENCE_CHANGED",
      `SHA-256 mismatch: ${source.path}`,
    );
  }
}
export async function loadLedger(workspace: string): Promise<Ledger> {
  const root = resolve(workspace);
  await noSymlinks(root);
  const p = join(root, "restoration.json");
  await noSymlinks(p);
  const st = await lstat(p);
  requireCondition(
    st.isFile() && st.size <= 16 * 1024 * 1024,
    "INVALID_LEDGER",
    "Ledger must be a regular file <=16 MiB.",
  );
  const ledger = ledgerSchema.parse(JSON.parse(await readFile(p, "utf8")));
  try {
    await lstat(join(root, ".incomplete"));
    throw new AppError("INCOMPLETE_WORKSPACE", "Intake has not completed.");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return ledger;
}
export async function atomicJson(path: string, data: unknown): Promise<void> {
  await noSymlinks(path);
  const payload = JSON.stringify(data, null, 2) + "\n";
  requireCondition(
    Buffer.byteLength(payload) <= 16 * 1024 * 1024,
    "LEDGER_LIMIT",
    "JSON document exceeds 16 MiB.",
  );
  const temp = join(dirname(path), `.write-${randomUUID()}.tmp`);
  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(payload);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
export async function mutateLedger<T>(
  workspace: string,
  operation: string,
  fn: (ledger: Ledger) => Promise<T>,
): Promise<T> {
  const root = resolve(workspace);
  await noSymlinks(root);
  const lock = join(root, ".ledger-lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      throw new AppError(
        "WORKSPACE_BUSY",
        "Another writer owns this workspace. Inspect .ledger-lock before removing a stale lock.",
      );
    throw e;
  }
  try {
    const ledger = await loadLedger(root);
    const result = await fn(ledger);
    ledger.revision++;
    ledger.updated_at = new Date().toISOString();
    ledger.history.push({
      at: ledger.updated_at,
      operation,
      revision: ledger.revision,
      detail: "Operation completed; prior records retained where applicable.",
    });
    requireCondition(
      ledger.history.length <= 10000,
      "LEDGER_LIMIT",
      "History limit reached; archive this workspace before further changes.",
    );
    await atomicJson(
      join(root, "restoration.json"),
      ledgerSchema.parse(ledger),
    );
    return result;
  } finally {
    await rm(lock, { recursive: true });
  }
}
