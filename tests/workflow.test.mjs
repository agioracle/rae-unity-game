import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cli = new URL("../dist/cli.js", import.meta.url).pathname;
function call(args, ok = true) {
  const p = spawnSync(process.execPath, [cli, "unity", ...args], {
    encoding: "utf8",
  });
  assert.equal(p.status, ok ? 0 : 1, p.stderr || p.stdout);
  return JSON.parse(p.stdout);
}
function fixture(path, kind = "mono") {
  const p = spawnSync(
    "python3",
    [
      "-c",
      `import zipfile,sys,io
p,kind=sys.argv[1:]
with zipfile.ZipFile(p,'w') as z:
 z.writestr('AndroidManifest.xml','<manifest package="test.synthetic"/>')
 z.writestr('assets/bin/Data/globalgamemanagers',b'2021.3.45f1\\x00')
 if kind=='mono': z.writestr('assets/bin/Data/Managed/Assembly-CSharp.dll',b'MZ synthetic only')
 if kind=='il2cpp':
  z.writestr('assets/bin/Data/Managed/Metadata/global-metadata.dat',b'synthetic metadata')
  z.writestr('lib/arm64-v8a/libil2cpp.so',b'synthetic elf')
 if kind=='traversal': z.writestr('../escape.txt',b'bad')
 if kind=='duplicate': z.writestr('AndroidManifest.xml',b'duplicate')
`,
      path,
      kind,
    ],
    { encoding: "utf8" },
  );
  assert.equal(p.status, 0, p.stderr);
}

test("public inspection preserves backend evidence and inventories without source mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "rug-"));
  try {
    const apk = join(root, "game.apk");
    fixture(apk);
    const before = await readFile(apk);
    const result = call(["inspect", "--input", apk]);
    assert.equal(result.ok, true);
    assert.equal(result.data.inventory.backend_assessment, "Mono_candidate");
    assert.deepEqual(await readFile(apk), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace intake preserves bytes and refuses overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "rug-"));
  try {
    const apk = join(root, "game.apk");
    fixture(apk, "il2cpp");
    const workspace = join(root, "restoration");
    const result = call([
      "init",
      "--input",
      apk,
      "--workspace",
      workspace,
      "--authorization",
      "Owner-authorized synthetic test",
    ]);
    assert.equal(result.data.backend, "IL2CPP");
    assert.deepEqual(
      await readFile(join(workspace, "recovered/00_original/game.apk")),
      await readFile(apk),
    );
    assert.equal(
      (
        await readFile(
          join(
            workspace,
            "recovered/03_android_raw/game.apk/assets/bin/Data/globalgamemanagers",
          ),
        )
      ).includes("2021.3.45f1"),
      true,
    );
    assert.equal(
      call(
        [
          "init",
          "--input",
          apk,
          "--workspace",
          workspace,
          "--authorization",
          "test",
        ],
        false,
      ).error.code,
      "WORKSPACE_EXISTS",
    );
    const status = call(["status", "--workspace", workspace]);
    assert.equal(status.data.roadmap.checkpoint, "not_ready");
    assert.equal(status.data.gates.recovery_accounted, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const kind of ["traversal", "duplicate"])
  test(`rejects ${kind} archive before publishing a workspace`, async () => {
    const root = await mkdtemp(join(tmpdir(), "rug-"));
    try {
      const apk = join(root, "bad.apk");
      fixture(apk, kind);
      const result = call(
        [
          "init",
          "--input",
          apk,
          "--workspace",
          join(root, "workspace"),
          "--authorization",
          "test",
        ],
        false,
      );
      assert.equal(result.ok, false);
      assert.match(
        result.error.message,
        /unsafe|duplicate|\.\.|rejected|failed/i,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

export { call, fixture };
