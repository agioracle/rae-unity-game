import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { execute } from "../dist/operations.js";
test("ARM32 APK on ARM64-only device is blocked before install and input with retained ABI evidence", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rea-abi-"));
  const saved = process.env.REA_UNITY_ADB;
  try {
    const apk = join(root, "source.apk");
    execFileSync("python3", [
      "-c",
      "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.writestr('assets/bin/Data/globalgamemanagers',b'fixture');z.writestr('lib/armeabi-v7a/libil2cpp.so',b'not executed');z.close()",
      apk,
    ]);
    const workspace = join(root, "work");
    const intake = await execute("init", {
      input: apk,
      workspace,
      authorization: "Controlled ABI guard fixture",
    });
    assert.equal(intake.ok, true, JSON.stringify(intake));
    const adb = join(root, "adb"),
      calls = join(root, "calls.jsonl");
    await writeFile(
      adb,
      `#!/usr/bin/env node\nconst fs=require('node:fs');const a=process.argv.slice(4);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');if(a.includes('getprop'))console.log('arm64-v8a');else process.exit(97);`,
    );
    await chmod(adb, 0o700);
    process.env.REA_UNITY_ADB = adb;
    const manifest = JSON.parse(
      await readFile(
        join(workspace, "recovered/01_inventory/intake-manifest.json"),
        "utf8",
      ),
    );
    const leaf = manifest.originals[0].path;
    const result = await execute("android-scenario", {
      workspace,
      record: {
        caseId: "abi-mismatch",
        serial: "fixture",
        package: "com.example.game",
        width: 1,
        height: 1,
        install: true,
        apkPaths: [leaf.slice(workspace.length + 1)],
        actions: [{ kind: "tap", x: 0, y: 0 }],
      },
    });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.error.code, "ABI_MISMATCH");
    const report = JSON.parse(
      await readFile(result.error.details.report_path, "utf8"),
    );
    assert.deepEqual(report.selected_native_abis, ["armeabi-v7a"]);
    assert.deepEqual(report.device_abis, ["arm64-v8a"]);
    assert.equal(report.execution_status, "blocked");
    const seen = (await readFile(calls, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.deepEqual(seen, [["shell", "getprop", "ro.product.cpu.abilist"]]);
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_ADB;
    else process.env.REA_UNITY_ADB = saved;
    await rm(root, { recursive: true, force: true });
  }
});
