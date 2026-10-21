import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { buildManagedPeFixture } from "./support/managed-pe-fixture.mjs";
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const req = createRequire(import.meta.url);
const core = join(
  dirname(req.resolve("rea-agents/package.json")),
  "scripts/rea.mjs",
);
async function connect(entry, args = ["mcp"]) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, ...args],
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr.on("data", (c) => (stderr += c));
  const client = new Client({ name: "unity-edition-test", version: "1" });
  try {
    await client.connect(transport);
    return client;
  } catch (e) {
    await client.close();
    throw new Error(`${e.message}\n${stderr}`);
  }
}

test("Unity edition exposes the entire real REA catalog unchanged plus domain tools", async () => {
  const base = await connect(core),
    edition = await connect(cli);
  try {
    const original = await base.listTools(),
      combined = await edition.listTools();
    assert.ok(original.tools.length >= 200);
    for (const tool of original.tools)
      assert.deepEqual(
        combined.tools.find((t) => t.name === tool.name),
        tool,
        tool.name,
      );
    for (const name of [
      "unity_inspect",
      "unity_map_il2cpp",
      "unity_recover_il2cpp",
      "unity_unpack_bundle",
      "unity_trace_references",
      "unity_inspect_target",
      "unity_plan_transfer",
      "unity_apply_transfer",
    ])
      assert.ok(
        combined.tools.some((t) => t.name === name),
        name,
      );
    assert.ok(combined.tools.some((t) => t.name === "procedure_pseudo_code"));
    assert.ok(combined.tools.some((t) => t.name === "trace_feature"));
    assert.ok(combined.tools.some((t) => t.name === "inspect_managed_members"));
  } finally {
    await Promise.all([base.close(), edition.close()]);
  }
});

test("one edition session executes real REA managed inspection and Unity intake, retaining original evidence", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-core-"));
  const client = await connect(cli);
  try {
    const assembly = join(root, "Game.dll");
    await writeFile(assembly, buildManagedPeFixture());
    const result = await client.callTool({
      name: "inspect_managed_artifact",
      arguments: { path: assembly },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.ok(
      result.structuredContent,
      "Original REA structuredContent must survive",
    );
    assert.match(JSON.stringify(result), /sha256/);
    assert.match(
      JSON.stringify(result),
      /Example|Fixture|fixture|TargetFramework|managed/,
    );
    const listed = await client.listResources();
    assert.ok(
      listed.resources.some((r) => r.uri === "unity-reconstruction://skill"),
    );
    const resources = await client.readResource({
      uri: "unity-reconstruction://skill",
    });
    assert.match(resources.contents[0].text, /Unity/);
    const capabilities = await client.callTool({
      name: "unity_capabilities",
      arguments: {},
    });
    assert.equal(JSON.parse(capabilities.content[0].text).ok, true);
    const originalError = await client.callTool({
      name: "inspect_managed_artifact",
      arguments: { path: join(root, "missing.dll") },
    });
    assert.equal(originalError.isError, true);
    assert.ok(originalError.content.length > 0);
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("ordinary CLI commands use the actual REA implementation without requiring another installation", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-cli-core-"));
  try {
    const dll = join(root, "Game.dll");
    await writeFile(dll, buildManagedPeFixture());
    const p = spawnSync(
      process.execPath,
      [cli, "inspect-managed-artifact", dll, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(p.status, 0, p.stderr || p.stdout);
    const r = JSON.parse(p.stdout);
    assert.match(JSON.stringify(r), /sha256/);
    assert.match(JSON.stringify(r), /managed/);
    const domain = spawnSync(process.execPath, [cli, "unity", "capabilities"], {
      encoding: "utf8",
    });
    assert.equal(domain.status, 0, domain.stdout || domain.stderr);
    assert.equal(JSON.parse(domain.stdout).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
