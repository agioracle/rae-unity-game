import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";
const cli = new URL("../dist/cli.js", import.meta.url).pathname;

test("SDK stdio client discovers and calls the same strict named CLI contracts", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "mcp"],
    stderr: "pipe",
  });
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === "unity_inspect"));
    assert.ok(list.tools.some((t) => t.name === "unity_record_claim"));
    for (const tool of list.tools.filter((t) => t.name.startsWith("unity_"))) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
    const result = await client.callTool({
      name: "unity_capabilities",
      arguments: {},
    });
    const cliResult = spawnSync(
      process.execPath,
      [cli, "unity", "capabilities"],
      {
        encoding: "utf8",
      },
    );
    assert.equal(cliResult.status, 0, cliResult.stderr);
    assert.deepEqual(
      JSON.parse(result.content[0].text),
      JSON.parse(cliResult.stdout),
    );
    const invalid = await client.callTool({
      name: "unity_status",
      arguments: { workspace: "/tmp/no-workspace", ignored: "no" },
    });
    assert.equal(invalid.isError, true);
    const refs = await client.readResource({
      uri: "unity-reconstruction://references/evidence-claims-and-acceptance.md",
    });
    assert.match(refs.contents[0].text, /Evidence Claims and Acceptance/);
    const prompts = await client.listPrompts();
    assert.ok(prompts.prompts.some((p) => p.name === "reconstruct-unity-game"));
  } finally {
    await client.close();
  }
});

test("unknown CLI flags and missing flag values return structured input errors", () => {
  for (const args of [
    ["inspect", "--input"],
    ["status", "--workspace", "/tmp", "--surprise", "yes"],
    ["inspect", "--input", "one", "--input", "two"],
  ]) {
    const p = spawnSync(process.execPath, [cli, "unity", ...args], {
      encoding: "utf8",
    });
    assert.equal(p.status, 1);
    assert.equal(JSON.parse(p.stdout).error.code, "INVALID_INPUT");
  }
});
