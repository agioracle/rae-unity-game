import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
test("occupied transfer receipt refuses before any workspace operation", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-driver-"));
  try {
    const spec = join(root, "spec.json"),
      out = join(root, "existing.json");
    await writeFile(
      spec,
      JSON.stringify({
        workspace: join(root, "absent"),
        claims: [{}],
        transfer: {},
      }),
    );
    await writeFile(out, "existing receipt");
    const r = spawnSync(
      process.execPath,
      ["scripts/apply-feature-transfer.mjs", spec, out],
      { encoding: "utf8" },
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /EEXIST/);
    assert.equal(await readFile(out, "utf8"), "existing receipt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
