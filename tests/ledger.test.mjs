import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
function call(args, ok = true) {
  const p = spawnSync(process.execPath, [cli, "unity", ...args], {
    encoding: "utf8",
  });
  assert.equal(p.status, ok ? 0 : 1, p.stderr || p.stdout);
  return JSON.parse(p.stdout);
}
async function setup(fn) {
  const root = await mkdtemp(join(tmpdir(), "rug-ledger-"));
  try {
    const apk = join(root, "input.apk");
    const p = spawnSync("python3", [
      "-c",
      "import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr('assets/bin/Data/Managed/Assembly-CSharp.dll',b'MZ synthetic')",
      apk,
    ]);
    assert.equal(p.status, 0);
    const workspace = join(root, "work");
    call([
      "init",
      "--input",
      apk,
      "--workspace",
      workspace,
      "--authorization",
      "synthetic owner",
    ]);
    const evidence = join(workspace, "validation/evidence.txt");
    await writeFile(evidence, "synthetic acceptance artifact");
    const source = {
      path: "validation/evidence.txt",
      sha256: createHash("sha256")
        .update(await readFile(evidence))
        .digest("hex"),
      locator: { domain: "capture_case", value: "synthetic" },
    };
    const json = async (command, value, ok = true) => {
      const f = join(root, "record.json");
      await writeFile(f, JSON.stringify(value));
      return call([command, "--workspace", workspace, "--file", f], ok);
    };
    await fn({ root, workspace, source, json });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("recovery accounting, material gaps, markers and explicit versioned acceptance remain independent", async () =>
  setup(async ({ workspace, source, json }) => {
    assert.equal(
      call(["ready", "--workspace", workspace, "--version", "v1"], false).error
        .code,
      "GATE_BLOCKED",
    );
    const categories = [
      "identity",
      "managed",
      "il2cpp",
      "native",
      "assets",
      "configs",
      "android",
    ];
    for (const category of categories)
      await json("record-recovery", {
        id: category,
        category,
        scope: "all supplied synthetic files",
        status: "unsupported",
        sources: [source],
        attempts: ["synthetic tool attempt"],
        reason: "Synthetic artifact cannot decode real gameplay",
        affected_consumers: [],
        material_to_mvp: false,
      });
    assert.equal(
      call(["status", "--workspace", workspace]).data.gates.recovery_accounted,
      true,
    );
    await json("record-claim", {
      id: "core",
      question: "What does fixture demonstrate?",
      claim: "Synthetic-only workflow",
      evidence_grade: "C_runtime_observation",
      evidence_verdict: "exact",
      sources: [source],
      proves: ["fixture case only"],
      does_not_prove: ["real game parity"],
      unresolved: [],
      filtered_or_sampled: false,
      truncated: false,
    });
    await json("set-roadmap", {
      outcome: "fixture loop",
      entry: "entry",
      interaction: "input",
      state_owner: "controller",
      lifecycle_owner: "scene",
      observable_outcome: "fixture output",
      repeat_path: "retry",
      startup_steps: ["run fixture"],
      claim_ids: ["core"],
      marker_ids: ["play"],
      blockers: [],
    });
    assert.equal(
      call(["ready", "--workspace", workspace, "--version", "v1"], false).error
        .code,
      "GATE_BLOCKED",
    );
    await json("record-marker", {
      id: "play",
      case_id: "loop",
      layer: "V2",
      result: "pass",
      build: "v1",
      steps: "entry/input/outcome/repeat",
      environment: "synthetic fixture",
      artifacts: [source],
      proves: ["synthetic fixture loop"],
      does_not_prove: ["original algorithm"],
    });
    call(["ready", "--workspace", workspace, "--version", "v1"]);
    assert.equal(
      call(["status", "--workspace", workspace]).data.roadmap.checkpoint,
      "ready_for_user_playtest",
    );
    assert.equal(
      call(["advance", "--workspace", workspace], false).error.code,
      "USER_ACCEPTANCE_REQUIRED",
    );
    assert.equal(
      (
        await json(
          "record-acceptance",
          {
            decision: "accepted",
            statement: "accepted for v0",
            version: "v0",
            scope: "fixture",
          },
          false,
        )
      ).error.code,
      "VERSION_MISMATCH",
    );
    await json("record-acceptance", {
      decision: "accepted",
      statement: "Owner explicitly accepts this fixture workflow",
      version: "v1",
      scope: "fixture loop",
    });
    call(["advance", "--workspace", workspace]);
    assert.equal(
      call(["status", "--workspace", workspace]).data.roadmap.phase,
      "P3",
    );
  }));

test("changed evidence and duplicate records fail; writer lock prevents lost updates", async () =>
  setup(async ({ workspace, source, json }) => {
    const record = {
      id: "claim1",
      question: "q",
      claim: "c",
      evidence_grade: "A_direct_static",
      evidence_verdict: "exact",
      sources: [source],
      proves: ["p"],
      does_not_prove: ["n"],
      unresolved: [],
      filtered_or_sampled: false,
      truncated: false,
    };
    await json("record-claim", record);
    assert.equal(
      (await json("record-claim", record, false)).error.code,
      "DUPLICATE_ID",
    );
    await writeFile(join(workspace, source.path), "changed");
    assert.equal(
      (await json("record-claim", { ...record, id: "claim2" }, false)).error
        .code,
      "EVIDENCE_CHANGED",
    );
    await mkdir(join(workspace, ".ledger-lock"));
    assert.equal(
      (await json("record-claim", { ...record, id: "claim3" }, false)).error
        .code,
      "WORKSPACE_BUSY",
    );
  }));

async function readyFixture({ workspace, source, json }) {
  for (const category of [
    "identity",
    "managed",
    "il2cpp",
    "native",
    "assets",
    "configs",
    "android",
  ])
    await json("record-recovery", {
      id: category,
      category,
      scope: "synthetic scope",
      status: "not_applicable",
      sources: [],
      attempts: [],
      reason: "Fixture tests gate semantics only",
      affected_consumers: [],
      material_to_mvp: false,
    });
  await json("record-claim", {
    id: "core",
    question: "q",
    claim: "c",
    evidence_grade: "A_direct_static",
    evidence_verdict: "exact",
    sources: [source],
    proves: ["fixture"],
    does_not_prove: ["game"],
    unresolved: [],
    filtered_or_sampled: false,
    truncated: false,
  });
  const card = {
    outcome: "loop",
    entry: "entry",
    interaction: "input",
    state_owner: "owner",
    lifecycle_owner: "scene",
    observable_outcome: "result",
    repeat_path: "retry",
    startup_steps: ["fixture"],
    claim_ids: ["core"],
    marker_ids: ["play"],
    blockers: [],
  };
  await json("set-roadmap", card);
  await json("record-marker", {
    id: "play",
    case_id: "loop",
    layer: "V2",
    result: "pass",
    build: "v1",
    steps: "fixture",
    environment: "fixture",
    artifacts: [source],
    proves: ["fixture"],
    does_not_prove: ["game"],
  });
  call(["ready", "--workspace", workspace, "--version", "v1"]);
  return card;
}

test("acceptance and advancement reject evidence changed after readiness or acceptance", async () =>
  setup(async (ctx) => {
    const { workspace, source, json } = ctx;
    await readyFixture(ctx);
    const acceptance = {
      decision: "accepted",
      statement: "Explicit fixture acceptance",
      version: "v1",
      scope: "loop",
    };
    await writeFile(join(workspace, source.path), "changed after readiness");
    assert.equal(
      (await json("record-acceptance", acceptance, false)).error.code,
      "EVIDENCE_CHANGED",
    );
    await writeFile(
      join(workspace, source.path),
      "synthetic acceptance artifact",
    );
    await json("record-acceptance", acceptance);
    await writeFile(join(workspace, source.path), "changed after acceptance");
    assert.equal(
      call(["advance", "--workspace", workspace], false).error.code,
      "EVIDENCE_CHANGED",
    );
  }));

test("changing a P3 roadmap archives and invalidates earlier acceptance", async () =>
  setup(async (ctx) => {
    const { workspace, json } = ctx;
    const card = await readyFixture(ctx);
    await json("record-acceptance", {
      decision: "accepted",
      statement: "Explicit fixture acceptance",
      version: "v1",
      scope: "loop",
    });
    call(["advance", "--workspace", workspace]);
    await json("set-roadmap", {
      ...card,
      outcome: "different loop",
      marker_ids: [],
      blockers: ["not implemented"],
    });
    const state = call(["status", "--workspace", workspace]).data;
    assert.equal(state.roadmap.checkpoint, "not_ready");
    assert.equal(state.roadmap.acceptance, null);
    assert.equal(state.gates.post_mvp_allowed, false);
    assert.equal(
      call(["advance", "--workspace", workspace], false).error.code,
      "USER_ACCEPTANCE_REQUIRED",
    );
    const history = call([
      "records",
      "--workspace",
      workspace,
      "--kind",
      "history",
      "--limit",
      "50",
    ]).data;
    assert.ok(
      history.items.some((h) => h.operation === "invalidated-acceptance"),
    );
  }));

test("same-version readiness cannot reactivate a prior waiver for a changed scope", async () =>
  setup(async (ctx) => {
    const { workspace, json } = ctx;
    const card = await readyFixture(ctx);
    await json("record-acceptance", {
      decision: "waived",
      statement: "Explicitly waive fixture gate for this loop",
      version: "v1",
      scope: "loop",
    });
    await json("set-roadmap", { ...card, outcome: "changed scope" });
    call(["ready", "--workspace", workspace, "--version", "v1"]);
    assert.equal(
      call(["advance", "--workspace", workspace], false).error.code,
      "USER_ACCEPTANCE_REQUIRED",
    );
  }));
