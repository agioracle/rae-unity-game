import { fileURLToPath } from "node:url";
// Build normal Android InputManager touch injection for the selected SDK/JDK.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runProcess } from "../dist/providers/process.js";
import { hashFile, noSymlinks } from "../dist/application/store.js";
const [sdk, jdk, output] = process.argv.slice(2).map((p) => resolve(p));
if (!sdk || !jdk || !output)
  throw Error("Usage: node scripts/build-android-touch.mjs SDK JDK NEW-output");
await noSymlinks(output);
await mkdir(output);
const classes = join(output, "classes");
await mkdir(classes);
const javac = join(jdk, "bin", "javac"),
  java = join(jdk, "bin", "java"),
  android = join(sdk, "platforms", "android-35", "android.jar"),
  d8jar = join(sdk, "build-tools", "35.0.1", "lib", "d8.jar");
const source = new URL("../android-tools/ReaTouch.java", import.meta.url)
  .pathname;
for (const path of [javac, java, android, d8jar, source]) await hashFile(path);
const compile = await runProcess(
  javac,
  ["--release", "8", "-cp", android, "-d", classes, source],
  { timeoutMs: 30000, maxBytes: 512 * 1024 },
);
if (compile.code) throw Error(compile.stdout + compile.stderr);
const classFiles = (await readdir(classes))
  .filter((n) => n.endsWith(".class"))
  .map((n) => join(classes, n));
if (!classFiles.length) throw Error("No class files generated");
const dex = await runProcess(
  java,
  [
    "-cp",
    d8jar,
    "com.android.tools.r8.D8",
    "--lib",
    android,
    "--output",
    output,
    ...classFiles,
  ],
  { timeoutMs: 30000, maxBytes: 512 * 1024 },
);
if (dex.code) throw Error(dex.stdout + dex.stderr);
const tools = await Promise.all(
  [javac, java, android, d8jar, source].map(async (path) => ({
    path,
    sha256: await hashFile(path),
  })),
);
const artifact = join(output, "classes.dex");
await writeFile(
  join(output, "build-manifest.json"),
  JSON.stringify(
    {
      tools,
      artifact: { path: artifact, sha256: await hashFile(artifact) },
      compile,
      dex,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  JSON.stringify({ artifact, manifest: join(output, "build-manifest.json") }),
);
