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
import { buildManagedPeFixture } from "./support/managed-pe-fixture.mjs";
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
function call(args) {
  const p = spawnSync(process.execPath, [cli, "unity", ...args], {
    encoding: "utf8",
  });
  assert.equal(p.status, 0, p.stdout || p.stderr);
  return JSON.parse(p.stdout).data;
}
test("feature context binds a question and real target Unity project to package artifacts and core investigation tools", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-feature-"));
  try {
    const source = join(root, "Player");
    await mkdir(join(source, "Game_Data/Managed"), { recursive: true });
    await writeFile(
      join(source, "Game_Data/Managed/Assembly-CSharp.dll"),
      buildManagedPeFixture(),
    );
    const target = join(root, "Target");
    await mkdir(join(target, "Assets"), { recursive: true });
    await mkdir(join(target, "ProjectSettings"));
    await mkdir(join(target, "Packages"));
    await writeFile(
      join(target, "Packages/manifest.json"),
      '{"dependencies":{}}',
    );
    await writeFile(
      join(target, "ProjectSettings/ProjectVersion.txt"),
      "m_EditorVersion: 2022.3.1f1\n",
    );
    const workspace = join(root, "work");
    call([
      "init",
      "--input",
      source,
      "--workspace",
      workspace,
      "--authorization",
      "feature analysis and target implementation",
    ]);
    const result = call([
      "feature-context",
      "--workspace",
      workspace,
      "--question",
      "How does the fixture transition work?",
      "--seed",
      "FixtureConfig",
      "--target-project",
      target,
    ]);
    assert.equal(result.artifacts.managed.count, 1);
    assert.equal(result.target_project.root, target);
    assert.equal(result.target_project.editor_version, "2022.3.1f1");
    assert.ok(
      result.investigation.some((s) =>
        s.tools.includes("inspect_managed_members"),
      ),
    );
    assert.ok(
      result.investigation.some((s) =>
        s.tools.includes("procedure_pseudo_code"),
      ),
    );
    assert.equal(
      await readFile(
        join(target, "ProjectSettings/ProjectVersion.txt"),
        "utf8",
      ),
      "m_EditorVersion: 2022.3.1f1\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
