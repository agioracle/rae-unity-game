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
import { hashFile } from "../dist/application/store.js";
process.env.REA_UNITY_PYTHON ??= new URL(
  "../.tools/python/bin/python",
  import.meta.url,
).pathname;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);
async function setup() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-ui-"));
  await mkdir(join(root, "Player"));
  await writeFile(join(root, "Player/globalgamemanagers"), "protocol test");
  const workspace = join(root, "work");
  assert.equal(
    (
      await execute("init", {
        input: join(root, "Player"),
        workspace,
        authorization: "controlled screenshot comparison fixture",
      })
    ).ok,
    true,
  );
  for (const name of ["source", "target"])
    await writeFile(join(workspace, "reports", name + ".png"), png);
  const tool = join(root, "ocr-fixture");
  await writeFile(
    tool,
    `#!/usr/bin/env node\nif(process.argv.includes('--version'))console.log('controlled OCR protocol fixture');else {const v=process.argv[2].includes('source')?'75':(process.env.REA_TEST_OCR??'75');console.log('level\\tpage_num\\tblock_num\\tpar_num\\tline_num\\tword_num\\tleft\\ttop\\twidth\\theight\\tconf\\ttext');console.log('5\\t1\\t1\\t1\\t1\\t1\\t0\\t0\\t1\\t1\\t96\\t'+v);}\n`,
  );
  await chmod(tool, 0o700);
  const selection = (name) => ({
    path: "reports/" + name + ".png",
    sha256: null,
    roi: { x: 0, y: 0, width: 1, height: 1 },
    scale: 1,
  });
  const source = selection("source"),
    target = selection("target");
  source.sha256 = target.sha256 = await hashFile(join(workspace, source.path));
  return {
    root,
    workspace,
    tool,
    record: {
      caseId: "coin-value",
      source,
      target,
      expected: "75",
      minimumConfidence: 80,
    },
  };
}
test("numeric UI checks retain source hashes and separate observable value equality from full parity", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_TESSERACT;
  process.env.REA_UNITY_TESSERACT = x.tool;
  try {
    const r = await execute("compare-ui-values", {
      workspace: x.workspace,
      record: x.record,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.status, "passed");
    assert.equal(r.data.source.observation.value, "75");
    assert.ok(r.data.does_not_prove.includes("Full visual parity"));
    assert.ok(await readFile(r.data.report_path));
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_TESSERACT;
    else process.env.REA_UNITY_TESSERACT = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("numeric UI check fails closed on mismatches, ambiguous OCR and stale source hashes", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_TESSERACT;
  process.env.REA_UNITY_TESSERACT = x.tool;
  try {
    process.env.REA_TEST_OCR = "74";
    let r = await execute("compare-ui-values", {
      workspace: x.workspace,
      record: x.record,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.status, "mismatch");
    process.env.REA_TEST_OCR = "75 75";
    r = await execute("compare-ui-values", {
      workspace: x.workspace,
      record: x.record,
    });
    assert.equal(r.ok, true);
    assert.equal(r.data.status, "inconclusive");
    await writeFile(join(x.workspace, x.record.source.path), "changed");
    r = await execute("compare-ui-values", {
      workspace: x.workspace,
      record: x.record,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "EVIDENCE_CHANGED");
  } finally {
    delete process.env.REA_TEST_OCR;
    if (saved === undefined) delete process.env.REA_UNITY_TESSERACT;
    else process.env.REA_UNITY_TESSERACT = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("transparent pixels cannot reveal hidden numeric RGB content to the OCR comparison", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_TESSERACT;
  process.env.REA_UNITY_TESSERACT = x.tool;
  try {
    await writeFile(
      join(x.workspace, x.record.source.path),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DAAAAEAQEARwbK3gAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    x.record.source.sha256 = await hashFile(
      join(x.workspace, x.record.source.path),
    );
    const r = await execute("compare-ui-values", {
      workspace: x.workspace,
      record: x.record,
    });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /transparent/i);
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_TESSERACT;
    else process.env.REA_UNITY_TESSERACT = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("a complete explicit positive sign is numeric syntax and is retained in the observation", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_TESSERACT;
  process.env.REA_UNITY_TESSERACT = x.tool;
  process.env.REA_TEST_OCR = "+75";
  try {
    const r = await execute("compare-ui-values", {
      workspace: x.workspace,
      record: x.record,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.status, "passed");
    assert.equal(r.data.target.observation.text, "+75");
    assert.equal(r.data.target.observation.value, "75");
  } finally {
    delete process.env.REA_TEST_OCR;
    if (saved === undefined) delete process.env.REA_UNITY_TESSERACT;
    else process.env.REA_UNITY_TESSERACT = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
test("reviewed light-text preprocessing is explicit and retained with the source hash", async () => {
  const x = await setup(),
    saved = process.env.REA_UNITY_TESSERACT;
  process.env.REA_UNITY_TESSERACT = x.tool;
  x.record.source.lightTextThreshold = 230;
  try {
    const r = await execute("compare-ui-values", {
      workspace: x.workspace,
      record: x.record,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.source.preparation.light_text_threshold, 230);
    assert.equal(
      r.data.source.preparation.source_sha256,
      x.record.source.sha256,
    );
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_TESSERACT;
    else process.env.REA_UNITY_TESSERACT = saved;
    await rm(x.root, { recursive: true, force: true });
  }
});
