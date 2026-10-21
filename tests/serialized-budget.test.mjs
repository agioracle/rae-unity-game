import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { execute } from "../dist/operations.js";
test("larger SerializedFiles require an explicit bounded budget; default and hard ceiling remain enforced", async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "rug-large-serialized-"),
  );
  try {
    const input = join(root, "Player");
    await mkdir(input);
    await writeFile(join(input, "globalgamemanagers"), "Unity marker");
    const source = new URL("./support/create-unity-asset.py", import.meta.url)
      .pathname;
    const r = spawnSync(
      "python3",
      [
        "-c",
        "import sys,struct,runpy;d=runpy.run_path(sys.argv[1])['create_asset']();b=bytearray(65*1024*1024);b[:len(d)]=d;struct.pack_into('>I',b,4,len(b));open(sys.argv[2],'wb').write(b)",
        source,
        join(input, "large.assets"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    const workspace = join(root, "work");
    assert.equal(
      (
        await execute("init", {
          input,
          workspace,
          authorization: "Synthetic explicit bounded file-budget regression",
        })
      ).ok,
      true,
    );
    const args = {
      workspace,
      path: "recovered/00_original/source/large.assets",
      limit: 1,
    };
    assert.equal((await execute("inspect-objects", args)).ok, false);
    const result = await execute("inspect-objects", {
      ...args,
      maxInputMiB: 128,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.evidence.objects[0].type, "TextAsset");
    assert.equal(
      (await execute("inspect-objects", { ...args, maxInputMiB: 129 })).ok,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
