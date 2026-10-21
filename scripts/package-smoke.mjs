import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildManagedPeFixture } from "../tests/support/managed-pe-fixture.mjs";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
function run(command, args, options = {}) {
  const p = spawnSync(command, args, { encoding: "utf8", ...options });
  if (p.status !== 0) throw new Error(p.stdout + p.stderr);
  return p.stdout;
}
const root = await mkdtemp(join(await realpath(tmpdir()), "rug-package-"));
const packOutput = run("npm", [
  "pack",
  "--json",
  "--silent",
  "--pack-destination",
  root,
]);
// Use a fresh tarball path to avoid npm reusing cached local-file metadata.
const packed = JSON.parse(packOutput.slice(packOutput.indexOf("[\n")))[0];
const tarball = join(root, packed.filename);
try {
  // Install the packed artifact's own shrinkwrap. npm 10 local-file dependency
  // installation can ignore nested shrinkwrap metadata; ci reads the exact graph.
  run("tar", ["-xzf", tarball, "-C", root]);
  const installed = join(root, "package");
  run("npm", [
    "ci",
    "--omit=dev",
    "--omit=optional",
    "--ignore-scripts",
    "--offline",
    "--no-audit",
    "--no-fund",
    "--prefix",
    installed,
  ]);
  const cli = join(installed, "dist/cli.js");
  const result = JSON.parse(
    run(process.execPath, [cli, "unity", "capabilities"], { cwd: root }),
  );
  if (!result.ok) throw new Error("Installed CLI failed");
  const doctor = JSON.parse(
    run(process.execPath, [cli, "unity", "doctor"], { cwd: root }),
  );
  if (!doctor.data.python.compatible)
    throw new Error("Python helper runtime unavailable");
  const python = process.env.REA_UNITY_PYTHON ?? "python3";
  run(python, [
    "-c",
    "import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr('assets/bin/Data/Managed/Assembly-CSharp.dll',b'MZ synthetic package smoke')",
    join(root, "smoke.apk"),
  ]);
  const initialized = JSON.parse(
    run(
      process.execPath,
      [
        cli,
        "unity",
        "init",
        "--input",
        join(root, "smoke.apk"),
        "--workspace",
        join(root, "work"),
        "--authorization",
        "Synthetic packed-install test",
      ],
      { cwd: root },
    ),
  );
  if (!initialized.ok) throw new Error(JSON.stringify(initialized));
  const query = JSON.parse(
    run(
      process.execPath,
      [
        cli,
        "unity",
        "query",
        "--workspace",
        join(root, "work"),
        "--pattern",
        "synthetic",
      ],
      { cwd: root },
    ),
  );
  if (!query.ok) throw new Error(JSON.stringify(query));
  await readFile(
    join(
      root,
      "package/skills/unity-game-reconstruction/scripts/verify_apk_set_identity.py",
    ),
  );
  const client = new Client({ name: "packed-edition", version: "1" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [cli, "mcp"],
        cwd: root,
        stderr: "ignore",
      }),
    );
    const catalog = await client.listTools();
    if (
      catalog.tools.length < 220 ||
      ![
        "unity_inspect_object",
        "unity_android_scenario",
        "unity_compare_ui_values",
        "unity_investigate_feature",
        "unity_inspect_native",
        "unity_decode_component",
        "unity_compare_ui_signals",
      ].every((name) => catalog.tools.some((t) => t.name === name))
    )
      throw new Error("Installed complete core/domain catalog missing");
    console.log(
      `Installed MCP tools: ${catalog.tools.length}; Unity tools: ${catalog.tools.filter((t) => t.name.startsWith("unity_")).length}.`,
    );
    const assembly = join(root, "Game.dll");
    await writeFile(assembly, buildManagedPeFixture());
    const inspected = await client.callTool({
      name: "inspect_managed_artifact",
      arguments: { path: assembly },
    });
    if (inspected.isError || !inspected.structuredContent)
      throw new Error("Installed actual core analysis failed");
  } finally {
    await client.close();
  }
  console.log(
    `Packed install passed outside checkout: ${packed.filename} (${packed.entryCount} files).`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(tarball, { force: true });
}
