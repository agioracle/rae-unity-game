import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
export function coreRuntime() {
  const manifest = require.resolve("rea-agents/package.json");
  return {
    entry: join(dirname(manifest), "scripts/rea.mjs"),
    manifest,
    version: "6.7.0",
  };
}
export async function forwardCoreCli(args: string[]): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [coreRuntime().entry, ...args], {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    const terminate = () => child.kill("SIGTERM");
    process.once("SIGINT", terminate);
    process.once("SIGTERM", terminate);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      process.removeListener("SIGINT", terminate);
      process.removeListener("SIGTERM", terminate);
      resolve(
        code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1),
      );
    });
  });
}
