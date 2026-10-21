import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("actual pinned UnityPy decoding bounds empty vectors before ordinary and automatic AssetBundle expansion", () => {
  const python =
    process.env.REA_UNITY_PYTHON ??
    new URL("../.tools/python/bin/python", import.meta.url).pathname;
  const result = spawnSync(
    python,
    [new URL("./support/check-decode-budget.py", import.meta.url).pathname],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
