import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const projectPython = new URL("../.tools/python/bin/python", import.meta.url)
  .pathname;
function call(args) {
  const p = spawnSync(process.execPath, [cli, "unity", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      REA_UNITY_PYTHON: process.env.REA_UNITY_PYTHON ?? projectPython,
    },
  });
  assert.equal(p.status, 0, p.stdout || p.stderr);
  return JSON.parse(p.stdout).data;
}
test("UnityPy inspects a real serialized TextAsset, keeping 64-bit PathID and source hashes", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-objects-"));
  try {
    const data = join(root, "data.assets");
    let p = spawnSync(
      "python3",
      [
        new URL("./support/create-unity-asset.py", import.meta.url).pathname,
        data,
      ],
      { encoding: "utf8" },
    );
    assert.equal(p.status, 0, p.stderr);
    const apk = join(root, "game.apk");
    p = spawnSync(
      "python3",
      [
        "-c",
        "import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:z.write(sys.argv[2],'assets/bin/Data/sharedassets0.assets')",
        apk,
        data,
      ],
      { encoding: "utf8" },
    );
    assert.equal(p.status, 0, p.stderr);
    const workspace = join(root, "work");
    call([
      "init",
      "--input",
      apk,
      "--workspace",
      workspace,
      "--authorization",
      "synthetic serialized-format test",
    ]);
    const path =
      "recovered/03_android_raw/game.apk/assets/bin/Data/sharedassets0.assets";
    const catalog = call([
      "inspect-objects",
      "--workspace",
      workspace,
      "--path",
      path,
    ]);
    assert.equal(catalog.evidence.objects[0].path_id, "9007199254740993");
    assert.equal(catalog.evidence.objects[0].type, "TextAsset");
    const result = call([
      "inspect-object",
      "--workspace",
      workspace,
      "--path",
      path,
      "--path-id",
      "9007199254740993",
      "--serialized-file",
      catalog.evidence.objects[0].serialized_file,
    ]);
    assert.equal(result.evidence.object.fields.m_Name, "FixtureConfig");
    assert.match(result.evidence.object.fields.m_Script, /cooldown/);
    assert.equal(result.source.sha256.length, 64);
    assert.equal(result.evidence.object.raw_sha256.length, 64);
    assert.ok(await readFile(result.report_path));
    const repeat = call([
      "inspect-objects",
      "--workspace",
      workspace,
      "--path",
      path,
    ]);
    assert.equal(
      repeat.evidence.objects[0].serialized_file,
      catalog.evidence.objects[0].serialized_file,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("duplicate serialized PathIDs are rejected before UnityPy dictionary overwrite", async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "rug-duplicate-id-"),
  );
  try {
    const data = join(root, "duplicates.assets");
    let p = spawnSync(
      "python3",
      [
        new URL("./support/create-unity-asset.py", import.meta.url).pathname,
        data,
        "--duplicate",
      ],
      { encoding: "utf8" },
    );
    assert.equal(p.status, 0, p.stderr);
    const python = process.env.REA_UNITY_PYTHON ?? projectPython;
    p = spawnSync(
      python,
      [
        new URL("../python/unity_objects.py", import.meta.url).pathname,
        "--input",
        data,
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(
      p.status,
      0,
      "Duplicate PathIDs must not become complete evidence.",
    );
    assert.match(p.stderr, /duplicate.*PathID/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
