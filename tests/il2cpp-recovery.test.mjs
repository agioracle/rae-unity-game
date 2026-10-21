import test from "node:test";
import assert from "node:assert/strict";
import { execute } from "../dist/operations.js";
import {
  mkdtemp,
  realpath,
  rm,
  mkdir,
  writeFile,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("IL2CPP analyzer is explicitly capability-driven and missing installation is actionable", async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "rug-il2cpp-provider-"),
  );
  const saved = process.env.REA_UNITY_IL2CPP_DUMPER;
  delete process.env.REA_UNITY_IL2CPP_DUMPER;
  try {
    const r = await execute("recover-il2cpp", {
      workspace: root,
      binary: "bin",
      metadata: "meta",
      toolVersion: "6.7.46",
    });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "TOOL_UNAVAILABLE");
  } finally {
    if (saved !== undefined) process.env.REA_UNITY_IL2CPP_DUMPER = saved;
    await rm(root, { recursive: true, force: true });
  }
});

test("configured analyzer subprocess feeds the shared mapper with exact execution/source attribution", async () => {
  const { chmod } = await import("node:fs/promises");
  const { relative } = await import("node:path");
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-il2cpp-run-"));
  const saved = process.env.REA_UNITY_IL2CPP_DUMPER;
  try {
    const player = join(root, "Player");
    await mkdir(player);
    await writeFile(
      join(player, "globalgamemanagers"),
      "controlled provider protocol fixture",
    );
    const workspace = join(root, "work");
    let r = await execute("init", {
      input: player,
      workspace,
      authorization: "controlled subprocess adapter test",
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    const binary = Buffer.alloc(0x200);
    binary.write("\x7fELF", 0, "binary");
    binary[4] = 2;
    binary[5] = 1;
    binary[6] = 1;
    binary.writeUInt16LE(3, 16);
    binary.writeUInt16LE(183, 18);
    binary.writeBigUInt64LE(64n, 32);
    binary.writeUInt16LE(56, 54);
    binary.writeUInt16LE(1, 56);
    binary.writeUInt32LE(1, 64);
    binary.writeUInt32LE(5, 68);
    binary.writeBigUInt64LE(0x200n, 96);
    binary.writeBigUInt64LE(0x200n, 104);
    await writeFile(join(workspace, "reports/native.so"), binary);
    const metadata = Buffer.alloc(8);
    metadata.writeUInt32LE(0xfab11baf);
    metadata.writeUInt32LE(29, 4);
    await writeFile(join(workspace, "reports/global-metadata.dat"), metadata);
    const executable = join(root, "controlled-analyzer");
    await writeFile(
      executable,
      '#!/usr/bin/env node\nconst fs=require("node:fs"),p=require("node:path");fs.writeFileSync(p.join(process.argv[4],"script.json"),JSON.stringify({ScriptMethod:[{Address:256,Name:"Fixture$$Add",Signature:"void Add();"}]}));console.log("controlled protocol fixture; not a real IL2CPP analyzer");\n',
    );
    await chmod(executable, 0o700);
    process.env.REA_UNITY_IL2CPP_DUMPER = executable;
    r = await execute("recover-il2cpp", {
      workspace,
      binary: "reports/native.so",
      metadata: "reports/global-metadata.dat",
      toolVersion: "protocol-fixture",
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.mapping.methods[0].elf_va, "0x100");
    assert.equal(r.data.mapping.methods[0].file_offset, "0x100");
    assert.equal(r.data.execution.executable_sha256.length, 64);
    assert.equal(r.data.execution.version_status, "caller_declared");
    const provenance = JSON.parse(
      await readFile(
        join(workspace, r.data.output, "rea-provenance.json"),
        "utf8",
      ),
    );
    provenance.metadata_sha256 = "0".repeat(64);
    await writeFile(
      join(workspace, r.data.output, "rea-provenance.json"),
      JSON.stringify(provenance),
    );
    const bad = await execute("map-il2cpp", {
      workspace,
      binary: "reports/native.so",
      metadata: "reports/global-metadata.dat",
      map: r.data.output + "/script.json",
      provenance: r.data.output + "/rea-provenance.json",
      format: "il2cppdumper-script",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.error.code, "MAPPING_MISMATCH");
  } finally {
    if (saved === undefined) delete process.env.REA_UNITY_IL2CPP_DUMPER;
    else process.env.REA_UNITY_IL2CPP_DUMPER = saved;
    await rm(root, { recursive: true, force: true });
  }
});

test("metadata39 routes to LibCpp2IL instead of an incompatible dumper", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-route39-"));
  const saved = {
    indexer: process.env.REA_UNITY_LIBCPP2IL_INDEXER,
    dumper: process.env.REA_UNITY_IL2CPP_DUMPER,
  };
  try {
    const player = join(root, "Player");
    await mkdir(player);
    await writeFile(join(player, "globalgamemanagers"), "routing test");
    const workspace = join(root, "work");
    assert.equal(
      (
        await execute("init", {
          input: player,
          workspace,
          authorization: "provider routing test",
        })
      ).ok,
      true,
    );
    const metadata = Buffer.alloc(8);
    metadata.writeUInt32LE(0xfab11baf);
    metadata.writeUInt32LE(39, 4);
    await writeFile(join(workspace, "reports/meta.dat"), metadata);
    await writeFile(join(workspace, "reports/native.so"), "routing evidence");
    delete process.env.REA_UNITY_LIBCPP2IL_INDEXER;
    process.env.REA_UNITY_IL2CPP_DUMPER = process.execPath;
    const r = await execute("recover-il2cpp", {
      workspace,
      binary: "reports/native.so",
      metadata: "reports/meta.dat",
      toolVersion: "test",
      unityVersion: "6000.3.12f1",
    });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /LIBCPP2IL/);
  } finally {
    for (const [key, value] of [
      ["REA_UNITY_LIBCPP2IL_INDEXER", saved.indexer],
      ["REA_UNITY_IL2CPP_DUMPER", saved.dumper],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("managed analyzer preparation excludes trimmed framework assemblies and preserves attributed plugin bytes", async () => {
  const { prepareManagedAnalyzer } = await import(
    "../dist/providers/managedAnalyzer.js"
  );
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "rug-managed-runtime-"),
  );
  try {
    await writeFile(join(root, "Indexer.dll"), "controlled plugin fixture");
    await writeFile(join(root, "LibCpp2IL.dll"), "third party fixture");
    await writeFile(
      join(root, "System.Collections.dll"),
      "trimmed forwarder fixture",
    );
    await writeFile(
      join(root, "Indexer.runtimeconfig.json"),
      JSON.stringify({
        runtimeOptions: {
          tfm: "net10.0",
          includedFrameworks: [
            { name: "Microsoft.NETCore.App", version: "10.0.12" },
          ],
        },
      }),
    );
    const p = await prepareManagedAnalyzer(
      join(root, "Indexer.dll"),
      join(root, "isolated"),
    );
    assert.equal(p.dependencies.length, 2);
    assert.ok(!p.dependencies.some((d) => d.name.startsWith("System.")));
    const c = JSON.parse(
      await readFile(p.runner.slice(0, -4) + ".runtimeconfig.json", "utf8"),
    );
    assert.equal(c.runtimeOptions.framework.version, "10.0.12");
    assert.equal(c.runtimeOptions.includedFrameworks, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
