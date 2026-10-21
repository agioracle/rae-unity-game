import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execute } from "../dist/operations.js";
import { hashFile } from "../dist/application/store.js";
process.env.REA_UNITY_PYTHON ??= new URL(
  "../.tools/python/bin/python",
  import.meta.url,
).pathname;
test("color signal comparison applies independent reviewed regions, never a built-in skill color", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-signal-"));
  try {
    await mkdir(join(root, "Player"));
    await writeFile(join(root, "Player/globalgamemanagers"), "signal fixture");
    const workspace = join(root, "w");
    assert.equal(
      (
        await execute("init", {
          input: join(root, "Player"),
          workspace,
          authorization: "controlled image predicate fixture",
        })
      ).ok,
      true,
    );
    const path = "reports/red.png";
    await writeFile(
      join(workspace, path),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const selected = {
      path,
      sha256: await hashFile(join(workspace, path)),
      roi: { x: 0, y: 0, width: 1, height: 1 },
      rgb: { min: [200, 0, 0], max: [255, 50, 50] },
      fraction: { min: 1, max: 1 },
    };
    let r = await execute("compare-ui-signals", {
      workspace,
      record: {
        caseId: "red-signal",
        state: "enabled",
        source: selected,
        target: selected,
      },
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.status, "passed");
    r = await execute("compare-ui-signals", {
      workspace,
      record: {
        caseId: "green-signal",
        state: "enabled",
        source: selected,
        target: { ...selected, rgb: { min: [0, 200, 0], max: [50, 255, 50] } },
      },
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.status, "mismatch");
    assert.ok(r.data.does_not_prove.includes("Internal state identity"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
