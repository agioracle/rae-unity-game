import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  symlink,
  realpath,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
function call(args, ok = true) {
  const p = spawnSync(process.execPath, [cli, "unity", ...args], {
    encoding: "utf8",
  });
  assert.equal(p.status, ok ? 0 : 1, p.stderr || p.stdout);
  return JSON.parse(p.stdout);
}
async function temporary(fn) {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-evidence-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function make(path, code) {
  const p = spawnSync("python3", ["-c", code, path], { encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
}

test("nested split packages preserve leaf provenance and query budgets", async () =>
  temporary(async (root) => {
    const input = join(root, "input.xapk");
    make(
      input,
      `import io,sys,zipfile,json
with zipfile.ZipFile(sys.argv[1],'w') as z:
 for name,entries in [('base.apk',{'assets/bin/Data/Managed/Metadata/global-metadata.dat':b'synthetic metadata'}),('split.arm64.apk',{'lib/arm64-v8a/libil2cpp.so':b'synthetic native'})]:
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as leaf:
   for n,v in entries.items():leaf.writestr(n,v)
  z.writestr(name,b.getvalue())
 z.writestr('manifest.json',json.dumps({'package_name':'synthetic.split'}))`,
    );
    const workspace = join(root, "work");
    call([
      "init",
      "--input",
      input,
      "--workspace",
      workspace,
      "--authorization",
      "synthetic test",
    ]);
    const manifest = JSON.parse(
      await readFile(
        join(workspace, "recovered/01_inventory/intake-manifest.json"),
        "utf8",
      ),
    );
    assert.ok(
      manifest.extracted.some(
        (r) => r.member === "lib/arm64-v8a/libil2cpp.so" && r.container_sha256,
      ),
    );
    const result = call([
      "query",
      "--workspace",
      workspace,
      "--pattern",
      "synthetic",
      "--limit",
      "1",
    ]);
    assert.ok(result.data.result);
    assert.equal(result.data.mode, "fixed");
    assert.ok(await readFile(result.data.report_path));
    assert.equal(
      call(["verify", "--workspace", workspace]).data.verified_files > 5,
      true,
    );
    await chmod(
      join(
        workspace,
        "recovered/03_android_raw/0002-split.arm64.apk/lib/arm64-v8a/libil2cpp.so",
      ),
      0o600,
    );
    await writeFile(
      join(
        workspace,
        "recovered/03_android_raw/0002-split.arm64.apk/lib/arm64-v8a/libil2cpp.so",
      ),
      "tampered",
    );
    assert.equal(
      call(["verify", "--workspace", workspace], false).error.code,
      "EVIDENCE_CHANGED",
    );
  }));

test("desktop Unity player directory has its own backend and complete file hash inventory", async () =>
  temporary(async (root) => {
    const input = join(root, "Player");
    await mkdir(join(input, "Game_Data/Managed/Metadata"), { recursive: true });
    await writeFile(join(input, "GameAssembly.dll"), "synthetic native");
    await writeFile(
      join(input, "Game_Data/Managed/Metadata/global-metadata.dat"),
      "synthetic metadata",
    );
    await writeFile(
      join(input, "Game_Data/globalgamemanagers"),
      "2022.3.1f1\0",
    );
    assert.equal(
      call(["inspect", "--input", input]).data.inventory.backend_assessment,
      "IL2CPP",
    );
    const workspace = join(root, "work");
    call([
      "init",
      "--input",
      input,
      "--workspace",
      workspace,
      "--authorization",
      "owner",
    ]);
    const result = call(["verify", "--workspace", workspace]);
    assert.equal(result.data.verified_files, 3);
    assert.deepEqual(
      await readFile(join(input, "GameAssembly.dll")),
      await readFile(
        join(workspace, "recovered/00_original/source/GameAssembly.dll"),
      ),
    );
  }));

test("input symlinks, symlink members, file-prefix collisions and query escapes are rejected", async () =>
  temporary(async (root) => {
    const input = join(root, "input.apk");
    make(
      input,
      "import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr('assets/bin/Data/test.txt','safe')",
    );
    const link = join(root, "link.apk");
    await symlink(input, link);
    assert.equal(
      call(["inspect", "--input", link], false).error.code,
      "UNSAFE_PATH",
    );
    for (const kind of ["symlink", "collision"]) {
      const bad = join(root, kind + ".apk");
      make(
        bad,
        `import sys,zipfile,stat
with zipfile.ZipFile(sys.argv[1],'w') as z:
 if '${kind}'=='symlink':
  info=zipfile.ZipInfo('link');info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(info,'outside')
 else:
  z.writestr('a','file');z.writestr('a/b','child')`,
      );
      assert.equal(call(["inspect", "--input", bad], false).ok, false);
    }
    const workspace = join(root, "work");
    call([
      "init",
      "--input",
      input,
      "--workspace",
      workspace,
      "--authorization",
      "owner",
    ]);
    assert.equal(
      call(
        [
          "query",
          "--workspace",
          workspace,
          "--root",
          "../",
          "--pattern",
          "safe",
        ],
        false,
      ).error.code,
      "UNSAFE_PATH",
    );
    await symlink(root, join(workspace, "recovered/link"));
    assert.equal(
      call(
        [
          "query",
          "--workspace",
          workspace,
          "--root",
          "recovered/link",
          "--pattern",
          "safe",
        ],
        false,
      ).error.code,
      "UNSAFE_PATH",
    );
  }));
