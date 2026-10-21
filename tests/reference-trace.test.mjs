process.env.REA_UNITY_PYTHON ??= new URL(
  "../.tools/python/bin/python",
  import.meta.url,
).pathname;
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, realpath, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../dist/operations.js";
test("serialized PPtr graph resolves explicit externals and cycles, preserves field paths and marks missing targets", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-graph-"));
  try {
    const p = spawnSync(
      "python3",
      [
        new URL("./support/create-reference-assets.py", import.meta.url)
          .pathname,
        root,
      ],
      { encoding: "utf8" },
    );
    assert.equal(p.status, 0, p.stderr);
    const w = join(root, "work");
    assert.equal(
      (
        await execute("init", {
          input: join(root, "Player"),
          workspace: w,
          authorization: "controlled graph test",
        })
      ).ok,
      true,
    );
    const { readFile } = await import("node:fs/promises");
    const ledger = JSON.parse(
      await readFile(join(w, "restoration.json"), "utf8"),
    );
    const manifest = JSON.parse(
      await readFile(join(w, ledger.manifest_path), "utf8"),
    );
    const paths = [...manifest.originals, ...manifest.extracted].map((f) =>
      f.path.slice(w.length + 1),
    );
    const prefix = paths
      .find((p) => p.endsWith("/a.assets"))
      .slice(0, -"/a.assets".length);
    const r = await execute("trace-references", {
      workspace: w,
      paths: [prefix + "/a.assets", prefix + "/b.assets"],
      path: prefix + "/a.assets",
      pathId: "1",
      maxDepth: 5,
      maxNodes: 20,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.nodes.length, 2, JSON.stringify(r.data));
    assert.ok(
      r.data.edges.some(
        (e) =>
          e.field === "/m_Component/0/component" && e.status === "resolved",
      ),
    );
    assert.ok(r.data.edges.some((e) => e.status === "missing_object"));
    assert.equal(r.data.status, "partial");
    assert.ok(r.data.edges.some((e) => e.target?.pathId === "1"));
    assert.equal(r.data.sources.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
