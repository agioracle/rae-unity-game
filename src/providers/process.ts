import { spawn } from "node:child_process";
import { AppError } from "../domain/errors.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
export async function runProcessBytes(
  command: string,
  args: string[],
  options: { timeoutMs?: number; maxBytes?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 300000,
    maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  return await new Promise<{ stdout: Buffer; stderr: Buffer; code: number }>(
    (done, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONIOENCODING: "utf-8",
        },
      });
      const out: Buffer[] = [],
        err: Buffer[] = [];
      let bytes = 0;
      let stop: AppError | undefined;
      const kill = (reason: AppError) => {
        if (!stop) {
          stop = reason;
          try {
            if (process.platform !== "win32" && child.pid)
              process.kill(-child.pid, "SIGKILL");
            else child.kill("SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
          child.stdout.destroy();
          child.stderr.destroy();
          clearTimeout(timer);
          reject(reason);
        }
      };
      const timer = setTimeout(
        () =>
          kill(
            new AppError(
              "PROCESS_TIMEOUT",
              `Helper exceeded ${timeoutMs} ms; process was terminated.`,
            ),
          ),
        timeoutMs,
      );
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes)
          kill(
            new AppError(
              "OUTPUT_LIMIT",
              "Helper output exceeded its byte budget.",
            ),
          );
        else out.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes)
          kill(
            new AppError(
              "OUTPUT_LIMIT",
              "Helper output exceeded its byte budget.",
            ),
          );
        else err.push(chunk);
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new AppError("TOOL_UNAVAILABLE", `${command}: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (stop) reject(stop);
        else
          done({
            stdout: Buffer.concat(out),
            stderr: Buffer.concat(err),
            code: code ?? 1,
          });
      });
    },
  );
}
export async function runProcess(
  command: string,
  args: string[],
  options: { timeoutMs?: number; maxBytes?: number } = {},
) {
  const result = await runProcessBytes(command, args, options);
  return {
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    code: result.code,
  };
}
export async function python(
  script: string,
  args: string[],
  options?: { timeoutMs?: number; maxBytes?: number },
): Promise<unknown> {
  const result = await runProcess(
    process.env.REA_UNITY_PYTHON ??
      (process.platform === "win32" ? "python" : "python3"),
    [resolve(packageRoot, "python", script), ...args],
    options,
  );
  if (result.code !== 0)
    throw new AppError(
      "HELPER_FAILED",
      result.stderr.trim() || result.stdout.trim() || "Python helper failed.",
    );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new AppError("INVALID_HELPER_OUTPUT", "Helper did not return JSON.");
  }
}
