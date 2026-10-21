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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../dist/operations.js";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
async function setup() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-android-"));
  await mkdir(join(root, "Player"));
  await writeFile(
    join(root, "Player/globalgamemanagers"),
    "controlled protocol fixture",
  );
  const workspace = join(root, "work");
  assert.equal(
    (
      await execute("init", {
        input: join(root, "Player"),
        workspace,
        authorization: "controlled adb protocol test",
      })
    ).ok,
    true,
  );
  const adb = join(root, "adb-fixture"),
    log = join(root, "calls.jsonl");
  const script = `#!/usr/bin/env node\nconst fs=require('node:fs');const a=process.argv.slice(4);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');if(a[0]==='exec-out')process.stdout.write(Buffer.from('${png}','base64'));else if(a.includes('dumpsys'))console.log('topResumedActivity=ActivityRecord{ fixture '+(process.env.REA_TEST_FOREGROUND??'com.example.game')+'/UnityPlayerActivity t1}');else if(a.includes('sha256sum'))console.log('0'.repeat(64)+'  /data/app/~~controlled/app-id==/base.apk');else if(a.includes('pm'))console.log('package:/data/app/~~controlled/app-id==/base.apk');\n`;
  await writeFile(adb, script);
  await chmod(adb, 0o700);
  return { root, workspace, adb, log };
}
test("Android case preserves binary captures and reports execution separately from gameplay assertions", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_ADB;
  process.env.REA_UNITY_ADB = x.adb;
  try {
    const r = await execute("android-scenario", {
      workspace: x.workspace,
      record: {
        caseId: "fixture",
        serial: "emulator-test",
        package: "com.example.game",
        width: 1,
        height: 1,
        actions: [{ kind: "tap", x: 0, y: 0 }],
      },
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.execution_status, "completed");
    assert.equal(r.data.assertions_status, "not_evaluated");
    assert.equal(r.data.frames.length, 2);
    assert.deepEqual(
      await readFile(join(x.workspace, r.data.frames[0].path)),
      Buffer.from(png, "base64"),
    );
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_ADB;
    else process.env.REA_UNITY_ADB = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("wrong foreground prevents all input and retains a failed case rather than a parity pass", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_ADB;
  process.env.REA_UNITY_ADB = x.adb;
  process.env.REA_TEST_FOREGROUND = "com.example.other";
  try {
    const r = await execute("android-scenario", {
      workspace: x.workspace,
      record: {
        caseId: "wrong-app",
        serial: "emulator-test",
        package: "com.example.game",
        width: 1,
        height: 1,
        actions: [{ kind: "tap", x: 0, y: 0 }],
      },
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.execution_status, "failed");
    const calls = (await readFile(x.log, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    assert.ok(!calls.some((c) => c.includes("input")));
  } finally {
    delete process.env.REA_TEST_FOREGROUND;
    if (saved === undefined) delete process.env.REA_UNITY_ADB;
    else process.env.REA_UNITY_ADB = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("package suffixes and truncated PNG cannot authorize input or report capture success", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_ADB;
  process.env.REA_UNITY_ADB = x.adb;
  try {
    process.env.REA_TEST_FOREGROUND = "com.other.com.example.game";
    let r = await execute("android-scenario", {
      workspace: x.workspace,
      record: {
        caseId: "suffix",
        serial: "emulator-test",
        package: "com.example.game",
        width: 1,
        height: 1,
        actions: [{ kind: "tap", x: 0, y: 0 }],
      },
    });
    assert.equal(r.data.execution_status, "failed");
    assert.ok(!(await readFile(x.log, "utf8")).includes('"input"'));
    delete process.env.REA_TEST_FOREGROUND;
    await writeFile(
      x.adb,
      (await readFile(x.adb, "utf8"))
        .replace("Buffer.from('", "Buffer.from('")
        .replace("'base64'))", "'base64').subarray(0,33))"),
    );
    r = await execute("android-scenario", {
      workspace: x.workspace,
      record: {
        caseId: "truncated",
        serial: "emulator-test",
        package: "com.example.game",
        width: 1,
        height: 1,
        actions: [{ kind: "capture" }],
      },
    });
    assert.equal(r.data.execution_status, "failed");
  } finally {
    delete process.env.REA_TEST_FOREGROUND;
    if (saved === undefined) delete process.env.REA_UNITY_ADB;
    else process.env.REA_UNITY_ADB = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("reviewed visual wait gates later input and retains a failed phase instead of clicking another screen", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_ADB;
  process.env.REA_UNITY_ADB = x.adb;
  process.env.REA_UNITY_PYTHON ??= new URL(
    "../.tools/python/bin/python",
    import.meta.url,
  ).pathname;
  try {
    const guard = {
      roi: { x: 0, y: 0, width: 1, height: 1 },
      rgb: { min: [0, 200, 0], max: [50, 255, 50] },
      fraction: { min: 1, max: 1 },
    };
    const r = await execute("android-scenario", {
      workspace: x.workspace,
      record: {
        caseId: "phase-gate",
        serial: "emulator-test",
        package: "com.example.game",
        width: 1,
        height: 1,
        actions: [
          { kind: "wait-until", signal: guard, timeoutMs: 100, pollMs: 100 },
          { kind: "tap", x: 0, y: 0 },
        ],
      },
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.execution_status, "failed");
    assert.ok(!(await readFile(x.log, "utf8")).includes('"input"'));
    assert.ok(Array.isArray(r.data.guard_attempts));
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_ADB;
    else process.env.REA_UNITY_ADB = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("matching capture returned after the phase deadline cannot authorize later input", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_ADB;
  process.env.REA_UNITY_ADB = x.adb;
  process.env.REA_UNITY_PYTHON ??= new URL(
    "../.tools/python/bin/python",
    import.meta.url,
  ).pathname;
  await writeFile(
    x.adb,
    (await readFile(x.adb, "utf8"))
      .replace(
        "process.stdout.write(Buffer.from",
        "(Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500),process.stdout.write(Buffer.from",
      )
      .replace("'base64'));", "'base64')));"),
  );
  try {
    const r = await execute("android-scenario", {
      workspace: x.workspace,
      record: {
        caseId: "late-match",
        serial: "emulator-test",
        package: "com.example.game",
        width: 1,
        height: 1,
        actions: [
          {
            kind: "wait-until",
            signal: {
              roi: { x: 0, y: 0, width: 1, height: 1 },
              rgb: { min: [200, 0, 0], max: [255, 50, 50] },
              fraction: { min: 1, max: 1 },
            },
            timeoutMs: 100,
            pollMs: 100,
          },
          { kind: "tap", x: 0, y: 0 },
        ],
      },
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.execution_status, "failed");
    assert.ok(!(await readFile(x.log, "utf8")).includes('"input"'));
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_ADB;
    else process.env.REA_UNITY_ADB = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
