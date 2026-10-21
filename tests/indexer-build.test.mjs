import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
test("managed analyzer builder isolates frontend framework and packages registration plugin with hashes", async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "rea-indexer-build-"),
  );
  try {
    const lib = join(root, "lib"),
      fw = join(root, "10.0.12"),
      out = join(root, "built"),
      host = join(root, "dotnet-fixture"),
      compiler = join(root, "compiler.dll");
    await mkdir(lib);
    await mkdir(fw);
    for (const name of [
      "Cpp2IL.dll",
      "Cpp2IL.Core.dll",
      "LibCpp2IL.dll",
      "System.Linq.dll",
      "Microsoft.CSharp.dll",
    ])
      await writeFile(join(lib, name), name);
    await writeFile(join(fw, "System.Runtime.dll"), "fixture framework");
    await writeFile(compiler, "fixture compiler");
    await writeFile(
      host,
      `#!/usr/bin/env node\nconst fs=require('node:fs');const output=process.argv.find(x=>x.startsWith('-out:')).slice(5);fs.writeFileSync(output,process.argv.join('\\n'));`,
    );
    await chmod(host, 0o700);
    execFileSync(
      process.execPath,
      [
        "scripts/build-libcpp2il-indexer.mjs",
        "--lib",
        lib,
        "--dotnet",
        host,
        "--compiler",
        compiler,
        "--framework",
        fw,
        "--out",
        out,
      ],
      { cwd: resolve(".") },
    );
    const runtime = JSON.parse(
      await readFile(join(out, "Cpp2IL.runtimeconfig.json"), "utf8"),
    );
    assert.equal(runtime.runtimeOptions.framework.version, "10.0.12");
    const manifest = JSON.parse(
      await readFile(join(out, "build-manifest.json"), "utf8"),
    );
    assert.ok(
      !manifest.dependencies.some(
        (d) => d.name.startsWith("System.") || d.name.startsWith("Microsoft."),
      ),
    );
    assert.match(manifest.frontend.plugin_sha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.frontend.plugin_source_sha256, /^[a-f0-9]{64}$/);
    assert.match(
      await readFile(join(out, "Plugins/ReaRegistrationPlugin.dll"), "utf8"),
      /ReaRegistrationPlugin.cs/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
