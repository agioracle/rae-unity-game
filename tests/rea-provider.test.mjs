import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const cli = new URL("../dist/cli.js", import.meta.url).pathname;

test("REA adapter retains static analysis provenance using a protocol fixture (not a real-provider validation)", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-rea-"));
  try {
    const source = join(root, "Player");
    await mkdir(join(source, "Game_Data/Managed"), { recursive: true });
    await writeFile(
      join(source, "Game_Data/Managed/Assembly-CSharp.dll"),
      "synthetic assembly",
    );
    const workspace = join(root, "work");
    let p = spawnSync(
      process.execPath,
      [
        cli,
        "unity",
        "init",
        "--input",
        source,
        "--workspace",
        workspace,
        "--authorization",
        "fixture",
      ],
      { encoding: "utf8" },
    );
    assert.equal(p.status, 0, p.stdout);
    const executable = join(root, "rea-fixture");
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({fixture:true,args:process.argv.slice(2)}));\n`,
      { mode: 0o700 },
    );
    p = spawnSync(
      process.execPath,
      [
        cli,
        "unity",
        "analyze",
        "--workspace",
        workspace,
        "--kind",
        "managed-artifact",
        "--path",
        "recovered/00_original/source/Game_Data/Managed/Assembly-CSharp.dll",
      ],
      { encoding: "utf8", env: { ...process.env, REA_UNITY_REA: executable } },
    );
    assert.equal(p.status, 0, p.stdout || p.stderr);
    const data = JSON.parse(p.stdout).data;
    const retained = JSON.parse(await readFile(data.report_path, "utf8"));
    assert.equal(retained.provider, "rea");
    assert.equal(retained.result.fixture, true);
    assert.equal(retained.result.args[0], "inspect-managed-artifact");
    assert.equal(retained.result.args.at(-1), "--json");
    assert.equal(retained.source.sha256.length, 64);
    assert.equal(retained.tool.sha256.length, 64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
