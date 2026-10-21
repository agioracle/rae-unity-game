import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  copyFile,
  lstat,
  realpath,
} from "node:fs/promises";
import { dirname, join, basename, extname } from "node:path";
import { hashFile, noSymlinks } from "../application/store.js";
import { requireCondition } from "../domain/errors.js";
// A trimmed self-contained app is not a framework reference pack. Isolate the
// configured plugin from app-local System.* files before framework-dependent use.
export async function prepareManagedAnalyzer(
  source: string,
  destination: string,
) {
  const dll = await realpath(source);
  requireCondition(
    extname(dll).toLowerCase() === ".dll",
    "INVALID_TOOL",
    "Expected a managed analyzer DLL.",
  );
  const configPath = dll.slice(0, -4) + ".runtimeconfig.json";
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const runtime =
    config.runtimeOptions?.framework ??
    config.runtimeOptions?.includedFrameworks?.find(
      (f: { name: string }) => f.name === "Microsoft.NETCore.App",
    );
  requireCondition(
    runtime?.name === "Microsoft.NETCore.App" &&
      /^\d+\.\d+\.\d+$/.test(runtime.version),
    "INVALID_TOOL",
    "Managed analyzer requires an explicit Microsoft.NETCore.App runtime version.",
  );
  await noSymlinks(destination);
  await mkdir(destination);
  const dependencies = [];
  let bytes = 0;
  for (const name of (await readdir(dirname(dll))).sort()) {
    if (
      !/\.(dll|dylib|so)$/i.test(name) ||
      /^(System\.|Microsoft\.)/i.test(name)
    )
      continue;
    const path = join(dirname(dll), name);
    await noSymlinks(path);
    const st = await lstat(path);
    requireCondition(
      st.isFile() &&
        st.size <= 128 * 1024 * 1024 &&
        (bytes += st.size) <= 512 * 1024 * 1024 &&
        dependencies.length < 128,
      "TOOL_LIMIT",
      "Managed analyzer dependency set exceeds budget.",
    );
    const sha256 = await hashFile(path);
    await copyFile(path, join(destination, name));
    requireCondition(
      (await hashFile(path)) === sha256 &&
        (await hashFile(join(destination, name))) === sha256,
      "EVIDENCE_CHANGED",
      "Analyzer dependency changed while preparing runtime.",
    );
    dependencies.push({ name, sha256 });
  }
  requireCondition(
    dependencies.some((d) => d.name === basename(dll)),
    "INVALID_TOOL",
    "Analyzer DLL was not admitted.",
  );
  const runner = join(destination, basename(dll));
  await writeFile(
    runner.slice(0, -4) + ".runtimeconfig.json",
    JSON.stringify(
      {
        runtimeOptions: {
          tfm: config.runtimeOptions.tfm,
          framework: runtime,
          configProperties: {
            "System.Text.Json.JsonSerializer.IsReflectionEnabledByDefault": true,
          },
        },
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  return {
    runner,
    dependencies,
    runtime,
    runtime_config_sha256: await hashFile(
      runner.slice(0, -4) + ".runtimeconfig.json",
    ),
    resolution:
      "Full framework runtime; app-local System.* and Microsoft.* assemblies excluded",
  };
}
