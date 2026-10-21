import test from "node:test";
import assert from "node:assert/strict";
import { runProcessBytes } from "../dist/providers/process.js";
test("capture preserves exact non-UTF8 screenshot bytes and enforces the shared output budget", async () => {
  const r = await runProcessBytes(process.execPath, [
    "-e",
    "process.stdout.write(Buffer.from([137,80,78,71,255,0,128]))",
  ]);
  assert.deepEqual([...r.stdout], [137, 80, 78, 71, 255, 0, 128]);
  await assert.rejects(
    runProcessBytes(
      process.execPath,
      ["-e", "process.stdout.write(Buffer.alloc(8192))"],
      { maxBytes: 32 },
    ),
    (e) => e.code === "OUTPUT_LIMIT",
  );
});
test("timeout settles even when a descendant retains inherited capture pipes", async () => {
  const began = Date.now();
  await assert.rejects(
    runProcessBytes(
      process.execPath,
      [
        "-e",
        "require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},1200)'],{stdio:['ignore',1,2]});setTimeout(()=>{},5000)",
      ],
      { timeoutMs: 80 },
    ),
    (e) => e.code === "PROCESS_TIMEOUT",
  );
  assert.ok(
    Date.now() - began < 800,
    "descendant pipe must not hold the timeout promise",
  );
});
