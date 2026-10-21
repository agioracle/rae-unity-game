import { spawnSync } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const root = resolve(".demo", new Date().toISOString().replaceAll(":", "-"));
await mkdir(root, { recursive: true, mode: 0o700 });
const base = await realpath(root),
  input = join(base, "synthetic.apk"),
  workspace = join(base, "restoration");
const made = spawnSync(
  process.env.REA_UNITY_PYTHON ?? "python3",
  [
    "-c",
    `import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('assets/bin/Data/globalgamemanagers',b'2021.3.45f1\\x00')
 z.writestr('assets/bin/Data/Managed/Assembly-CSharp.dll',b'MZ synthetic fixture; no real method bodies')
 z.writestr('assets/bin/Data/config.json','{"fixture":true,"message":"synthetic evidence"}')`,
    input,
  ],
  { encoding: "utf8" },
);
if (made.status !== 0) throw new Error(made.stderr);
for (const args of [
  ["inspect", "--input", input],
  [
    "init",
    "--input",
    input,
    "--workspace",
    workspace,
    "--authorization",
    "Repository-generated synthetic fixture",
  ],
  ["plan", "--workspace", workspace],
  ["query", "--workspace", workspace, "--pattern", "synthetic"],
  ["verify", "--workspace", workspace],
  ["status", "--workspace", workspace],
]) {
  const p = spawnSync(process.execPath, [cli, "unity", ...args], {
    encoding: "utf8",
  });
  if (p.status !== 0) throw new Error(p.stdout || p.stderr);
  const result = JSON.parse(p.stdout);
  process.stdout.write(
    JSON.stringify({
      command: args[0],
      ok: result.ok,
      ...(args[0] === "status" ? { gates: result.data.gates } : {}),
    }) + "\n",
  );
}
process.stdout.write(
  `Synthetic workflow completed. Inspect the retained workspace: ${workspace}\nThis does not validate a real Unity game, decompiler, Editor, or device.\n`,
);
