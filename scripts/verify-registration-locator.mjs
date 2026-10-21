import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../dist/providers/process.js";
import { noSymlinks } from "../dist/application/store.js";
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i],
    v = process.argv[i + 1];
  if (
    !["--dotnet", "--compiler", "--framework", "--out"].includes(k) ||
    !v ||
    options[k]
  )
    throw Error("Expected --dotnet --compiler --framework --out paths");
  options[k] = resolve(v);
}
for (const k of ["--dotnet", "--compiler", "--framework", "--out"])
  if (!options[k]) throw Error("Missing " + k);
await noSymlinks(options["--out"]);
await mkdir(options["--out"]);
const version = basename(options["--framework"]);
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw Error("Framework path must end in a version");
const references = (await readdir(options["--framework"]))
  .filter((n) => n.endsWith(".dll"))
  .sort();
if (references.length > 300) throw Error("Reference budget exceeded");
const output = join(options["--out"], "RegistrationLocatorFixture.dll");
const build = await runProcess(
  options["--dotnet"],
  [
    options["--compiler"],
    "-noconfig",
    "-nostdlib",
    "-target:exe",
    "-langversion:latest",
    "-out:" + output,
    ...references.map((n) => "-r:" + join(options["--framework"], n)),
    fileURLToPath(
      new URL("../analyzers/ReaRegistrationLocator.cs", import.meta.url),
    ),
    fileURLToPath(
      new URL("../tests/support/registration-locator.cs", import.meta.url),
    ),
  ],
  { timeoutMs: 60000, maxBytes: 1024 * 1024 },
);
if (build.code !== 0) throw Error(build.stdout + build.stderr);
await writeFile(
  output.slice(0, -4) + ".runtimeconfig.json",
  JSON.stringify({
    runtimeOptions: {
      tfm: "net" + version.split(".").slice(0, 2).join("."),
      framework: { name: "Microsoft.NETCore.App", version },
    },
  }),
  { flag: "wx" },
);
const execution = await runProcess(options["--dotnet"], [output], {
  timeoutMs: 30000,
  maxBytes: 1024 * 1024,
});
await writeFile(
  join(options["--out"], "result.json"),
  JSON.stringify({ build, execution }, null, 2),
  { flag: "wx" },
);
if (execution.code !== 0) throw Error(execution.stdout + execution.stderr);
console.log(execution.stdout.trim());
