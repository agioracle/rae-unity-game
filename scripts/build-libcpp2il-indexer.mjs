import { fileURLToPath } from "node:url";
// Build the repository-owned exporter against an explicitly selected full framework.
import {
  readdir,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  lstat,
} from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { runProcess } from "../dist/providers/process.js";
import { hashFile, noSymlinks } from "../dist/application/store.js";
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1];
  if (
    !["--lib", "--dotnet", "--compiler", "--framework", "--out"].includes(
      key,
    ) ||
    !value ||
    options[key]
  )
    throw Error(
      "Expected --lib --dotnet --compiler --framework --out absolute paths",
    );
  options[key] = resolve(value);
}
for (const key of ["--lib", "--dotnet", "--compiler", "--framework", "--out"])
  if (!options[key]) throw Error("Missing " + key);
const directory = options["--out"];
await noSymlinks(directory);
await mkdir(directory);
const dependencies = [];
for (const name of (await readdir(options["--lib"])).sort()) {
  if (
    !/\.(dll|so|dylib)$/i.test(name) ||
    /^(System\.|Microsoft\.|Il2CppEvidenceIndexer)/.test(name)
  )
    continue;
  const path = join(options["--lib"], name);
  await noSymlinks(path);
  const st = await lstat(path);
  if (!st.isFile() || st.size > 128 * 1024 * 1024 || dependencies.length >= 128)
    throw Error("Library budget exceeded");
  await copyFile(path, join(directory, name));
  dependencies.push({ name, sha256: await hashFile(path) });
}
const runtime = (await readdir(options["--framework"]))
  .filter((n) => n.endsWith(".dll"))
  .sort();
if (runtime.length > 300) throw Error("Framework reference budget exceeded");
const source = new URL("../analyzers/ReaIl2CppIndexer.cs", import.meta.url)
    .pathname,
  output = join(directory, "ReaIl2CppIndexer.dll");
const args = [
  options["--compiler"],
  "-noconfig",
  "-nostdlib",
  "-target:exe",
  "-langversion:latest",
  "-nullable:enable",
  "-out:" + output,
  ...runtime.map((n) => "-r:" + join(options["--framework"], n)),
  ...dependencies
    .filter((d) => d.name.endsWith(".dll"))
    .map((d) => "-r:" + join(directory, d.name)),
  source,
  new URL("../analyzers/ReaRegistrationLocator.cs", import.meta.url).pathname,
];
const run = await runProcess(options["--dotnet"], args, {
  timeoutMs: 60000,
  maxBytes: 1024 * 1024,
});
if (run.code !== 0) throw Error(run.stdout + run.stderr);
const version = basename(options["--framework"]);
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw Error("Framework directory must identify its version");
await writeFile(
  output.slice(0, -4) + ".runtimeconfig.json",
  JSON.stringify(
    {
      runtimeOptions: {
        tfm: "net" + version.split(".").slice(0, 2).join("."),
        framework: { name: "Microsoft.NETCore.App", version },
      },
    },
    null,
    2,
  ),
  { flag: "wx" },
);
const manifest = {
  source_sha256: await hashFile(source),
  output_sha256: await hashFile(output),
  registration_locator_sha256: await hashFile(
    new URL("../analyzers/ReaRegistrationLocator.cs", import.meta.url).pathname,
  ),
  compiler_sha256: await hashFile(options["--compiler"]),
  framework: options["--framework"],
  framework_references: await Promise.all(
    runtime.map(async (name) => ({
      name,
      sha256: await hashFile(join(options["--framework"], name)),
    })),
  ),
  dependencies,
  build: run,
};
if (
  dependencies.some((d) => d.name === "Cpp2IL.dll") &&
  dependencies.some((d) => d.name === "Cpp2IL.Core.dll")
) {
  const frontendRuntime = join(directory, "Cpp2IL.runtimeconfig.json");
  await copyFile(output.slice(0, -4) + ".runtimeconfig.json", frontendRuntime);
  const plugins = join(directory, "Plugins");
  await mkdir(plugins);
  const pluginSource = fileURLToPath(
    new URL("../analyzers/ReaRegistrationPlugin.cs", import.meta.url),
  );
  const plugin = join(plugins, "ReaRegistrationPlugin.dll");
  const pluginRun = await runProcess(
    options["--dotnet"],
    [
      options["--compiler"],
      "-noconfig",
      "-nostdlib",
      "-target:library",
      "-langversion:latest",
      "-nullable:enable",
      "-out:" + plugin,
      ...runtime.map((n) => "-r:" + join(options["--framework"], n)),
      ...dependencies
        .filter((d) => d.name.endsWith(".dll"))
        .map((d) => "-r:" + join(directory, d.name)),
      "-r:" + output,
      pluginSource,
    ],
    { timeoutMs: 60000, maxBytes: 1024 * 1024 },
  );
  if (pluginRun.code !== 0) throw Error(pluginRun.stdout + pluginRun.stderr);
  // The frontend discovers plugins from its working directory. Put the exact
  // indexer beside the plugin so the recovery callback resolves independently.
  await copyFile(output, join(plugins, "ReaIl2CppIndexer.dll"));
  manifest.frontend = {
    runtimeconfig_sha256: await hashFile(frontendRuntime),
    plugin_source_sha256: await hashFile(pluginSource),
    plugin_sha256: await hashFile(plugin),
    indexer_dependency_sha256: await hashFile(
      join(plugins, "ReaIl2CppIndexer.dll"),
    ),
    working_directory: directory,
    build: pluginRun,
  };
}
await writeFile(
  join(directory, "build-manifest.json"),
  JSON.stringify(manifest, null, 2),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    output,
    manifest: join(directory, "build-manifest.json"),
    framework: version,
  }),
);
