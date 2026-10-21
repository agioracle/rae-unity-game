import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { execute } from "../dist/operations.js";
async function ok(name, input) {
  const r = await execute(name, input);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}
async function setup() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-transfer-"));
  const player = join(root, "Player");
  await mkdir(player);
  await writeFile(join(player, "globalgamemanagers"), "fixture");
  const workspace = join(root, "work");
  await ok("init", {
    input: player,
    workspace,
    authorization: "isolated transfer test",
  });
  const target = join(root, "Target");
  for (const p of ["Assets", "Packages", "ProjectSettings"])
    await mkdir(join(target, p), { recursive: true });
  await writeFile(
    join(target, "ProjectSettings/ProjectVersion.txt"),
    "m_EditorVersion: 2022.3.62f3\n",
  );
  await writeFile(
    join(target, "Packages/manifest.json"),
    '{"dependencies":{}}',
  );
  await writeFile(
    join(workspace, "reports/feature.cs"),
    "public class Feature {}\n",
  );
  await writeFile(
    join(workspace, "reports/link.asset"),
    "ref: {fileID: 11500000, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}\n",
  );
  const { hashFile } = await import("../dist/application/store.js");
  const source = {
    path: "reports/feature.cs",
    sha256: await hashFile(join(workspace, "reports/feature.cs")),
    locator: { domain: "path_field", value: "controlled implementation" },
  };
  await ok("record-claim", {
    workspace,
    record: {
      id: "feature",
      question: "How does the feature work?",
      claim: "Controlled feature evidence",
      evidence_grade: "B_structural",
      evidence_verdict: "derived",
      sources: [source],
      proves: ["test transfer"],
      does_not_prove: ["game parity"],
      unresolved: [],
      filtered_or_sampled: false,
      truncated: false,
    },
  });
  return { root, workspace, target };
}
function request(target) {
  return {
    targetProject: target,
    featureId: "RecreatedFeature",
    claimIds: ["feature"],
    files: [
      {
        source: "reports/feature.cs",
        target: "Feature.cs",
        sourceGuid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      { source: "reports/link.asset", target: "Link.asset" },
    ],
    adaptation: {
      namespace: "Target.Gameplay",
      input: "Use existing input events",
      rendering: "No rendering dependency",
      lifecycle: "Target owner creates and resets feature",
    },
    validationCases: ["normal input", "repeat", "disable and re-enable"],
  };
}
test("target transfer profiles real settings, rewrites GUID references and applies into one new feature folder", async () => {
  const x = await setup();
  try {
    const p = await ok("inspect-target", { targetProject: x.target });
    assert.equal(p.editor_version, "2022.3.62f3");
    assert.equal(p.modified, false);
    const plan = await ok("plan-transfer", {
      workspace: x.workspace,
      record: request(x.target),
    });
    const planPath = relative(x.workspace, plan.report_path);
    const applied = await ok("apply-transfer", {
      workspace: x.workspace,
      plan: planPath,
      planSha256: plan.report_sha256,
    });
    assert.equal(applied.validation_status, "not_run");
    const text = await readFile(
      join(x.target, "Assets/RecreatedFeature/Link.asset"),
      "utf8",
    );
    assert.ok(!text.includes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const meta = await readFile(
      join(x.target, "Assets/RecreatedFeature/Feature.cs.meta"),
      "utf8",
    );
    assert.ok(text.includes(/guid: (\w+)/.exec(meta)[1]));
    assert.equal(
      (
        await execute("apply-transfer", {
          workspace: x.workspace,
          plan: planPath,
          planSha256: plan.report_sha256,
        })
      ).ok,
      false,
    );
  } finally {
    await rm(x.root, { recursive: true, force: true });
  }
});
test("target transfer rejects stale inputs, unresolved GUIDs and traversal before any writes", async () => {
  const x = await setup();
  try {
    const r = request(x.target);
    r.files[0].target = "../Escape.cs";
    assert.equal(
      (await execute("plan-transfer", { workspace: x.workspace, record: r }))
        .ok,
      false,
    );
    await writeFile(
      join(x.workspace, "reports/link.asset"),
      "ref: {fileID: 1, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 3}",
    );
    assert.equal(
      (
        await execute("plan-transfer", {
          workspace: x.workspace,
          record: request(x.target),
        })
      ).ok,
      false,
    );
    await writeFile(join(x.workspace, "reports/link.asset"), "text: hello");
    const p = await ok("plan-transfer", {
      workspace: x.workspace,
      record: request(x.target),
    });
    await writeFile(join(x.target, "Assets/New.cs"), "class New {}");
    const result = await execute("apply-transfer", {
      workspace: x.workspace,
      plan: relative(x.workspace, p.report_path),
      planSha256: p.report_sha256,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "TARGET_CHANGED");
  } finally {
    await rm(x.root, { recursive: true, force: true });
  }
});

test("orphan .meta files cannot satisfy target serialized GUID dependencies", async () => {
  const x = await setup();
  try {
    await writeFile(
      join(x.target, "Assets/Missing.cs.meta"),
      "fileFormatVersion: 2\nguid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
    );
    await writeFile(
      join(x.workspace, "reports/link.asset"),
      "ref: {fileID: 11500000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 3}",
    );
    const r = await execute("plan-transfer", {
      workspace: x.workspace,
      record: request(x.target),
    });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "UNRESOLVED_GUID");
    const profile = await ok("inspect-target", { targetProject: x.target });
    assert.equal(profile.orphan_metadata.length, 1);
    assert.equal(profile.guids.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, undefined);
  } finally {
    await rm(x.root, { recursive: true, force: true });
  }
});
