import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../dist/operations.js";
async function fixture(ambiguous = false) {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-generic-"));
  const input = join(root, "Player");
  await mkdir(input);
  await writeFile(
    join(input, "globalgamemanagers"),
    "controlled generic project",
  );
  if (ambiguous)
    for (const abi of ["arm64-v8a", "x86_64"]) {
      await mkdir(join(input, abi));
      await writeFile(join(input, abi, "libcustom.so"), abi);
    }
  const workspace = join(root, "work");
  assert.equal(
    (
      await execute("init", {
        input,
        workspace,
        authorization: "controlled generic test",
      })
    ).ok,
    true,
  );
  return { root, workspace };
}
test("feature investigation has no game-specific required symbol, resource root or target version", async () => {
  const f = await fixture();
  try {
    for (const [caseId, question] of [
      ["dash", "Explain dash cooldown and cancellation"],
      ["inventory", "Explain equipment slots and item replacement"],
    ]) {
      const r = await execute("investigate-feature", {
        workspace: f.workspace,
        record: { caseId, question },
      });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.data.context.question, question);
      assert.equal(r.data.native, null);
      assert.equal(r.data.resources.length, 0);
      assert.equal(r.data.semantic_status, "requires_host_investigation");
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("missing or ambiguous native selection fails without silently choosing an ABI or artifact", async () => {
  const f = await fixture();
  try {
    const record = {
      caseId: "x",
      question: "Explain jump",
      native: {
        binary: { suffix: "libcustom.so" },
        metadata: { suffix: "global-metadata.dat" },
        mode: "recover",
        unityVersion: "2022.3.62f3",
        toolVersion: "test",
        query: "Movement::",
        assembly: "Gameplay",
      },
    };
    let r = await execute("investigate-feature", {
      workspace: f.workspace,
      record,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "ARTIFACT_SELECTION");
    r = await execute("investigate-feature", {
      workspace: f.workspace,
      record: { ...record, currencyClass: "CurrencyManager" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "INVALID_INPUT");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("two ABI artifact matches require an explicit selector before any recovery", async () => {
  const f = await fixture(true);
  try {
    const r = await execute("investigate-feature", {
      workspace: f.workspace,
      record: {
        caseId: "ambiguous",
        question: "Explain movement",
        native: {
          mode: "recover",
          provider: "auto",
          unityVersion: "2022.3.62f3",
          toolVersion: "fixture",
          binary: { suffix: "libcustom.so" },
          metadata: { suffix: "metadata.dat" },
          query: "Movement",
        },
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "ARTIFACT_SELECTION");
    assert.match(r.error.message, /found 2/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
