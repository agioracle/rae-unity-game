#!/usr/bin/env node
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { operations, execute, type Operation } from "./operations.js";
import { failure, AppError } from "./domain/errors.js";
import { serve } from "./mcp.js";
import { serveEdition } from "./core/broker.js";
import { coreRuntime, forwardCoreCli } from "./core/runtime.js";
import { fileURLToPath } from "node:url";
function usage() {
  return `REA Unity Game — Reverse engineer Unity games with agents\n\nUsage: rea-unity-game <REA command> ... | unity <operation> [--option value]\nUnity operations return JSON. Original REA commands keep their own output controls. Records use --file record.json.\n\n${Object.entries(
    operations,
  )
    .map(([name, op]) => `  ${name.padEnd(19)}${op.description}`)
    .join(
      "\n",
    )}\n  mcp                Start the local stdio MCP server\n\nExamples:\n  rea-unity-game unity inspect --input /path/game.apk\n  rea-unity-game unity init --input /path/game.xapk --workspace /path/restoration --authorization "Owner approved"\n  rea-unity-game unity plan --workspace /path/restoration\n  rea-unity-game unity query --workspace /path/restoration --pattern Assembly-CSharp\n  rea-unity-game unity record-claim --workspace /path/restoration --file claim.json\n`;
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--unity-domain-mcp") {
    await serve();
    return;
  }
  if (argv.length === 1 && (argv[0] === "mcp" || argv[0] === "--mcp")) {
    await serveEdition(fileURLToPath(import.meta.url));
    return;
  }
  if (
    argv[0] &&
    argv[0] !== "unity" &&
    !["--help", "help", "--version"].includes(argv[0])
  ) {
    process.exitCode = await forwardCoreCli(argv);
    return;
  }
  const [name, ...args] = argv[0] === "unity" ? argv.slice(1) : argv;
  if (!name || name === "--help" || name === "help") {
    if (argv[0] !== "unity") await forwardCoreCli(["--help"]);
    process.stdout.write(usage());
    return;
  }
  if (name === "--version") {
    process.stdout.write(
      `rea-unity-game 0.5.0 (REA ${coreRuntime().version})\n`,
    );
    return;
  }
  const op = (operations as Record<string, Operation>)[name];
  if (!op) throw new AppError("UNKNOWN_OPERATION", `Unknown command: ${name}`);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      `${name}: ${op.description}\nInput fields: ${Object.keys(op.schema.shape).join(", ")}\nRecord commands accept --file record.json.\n`,
    );
    return;
  }
  const input: Record<string, unknown> = {};
  const keys = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!,
      value = args[i + 1];
    if (
      !/^--[a-z][a-z-]*$/.test(flag) ||
      value === undefined ||
      value.startsWith("--")
    )
      throw new AppError(
        "INVALID_INPUT",
        `Expected --option value at ${flag}.`,
      );
    const key = flag
      .slice(2)
      .replace(/-([a-z])/g, (_, x: string) => x.toUpperCase());
    if (keys.has(key))
      throw new AppError("INVALID_INPUT", `Duplicate option: ${flag}`);
    keys.add(key);
    if (key === "file") {
      if (!("record" in op.schema.shape))
        throw new AppError(
          "INVALID_INPUT",
          "--file only applies to record operations.",
        );
      const content = await readFile(value, "utf8");
      if (Buffer.byteLength(content) > 1024 * 1024)
        throw new AppError("INVALID_INPUT", "Record file exceeds 1 MiB.");
      try {
        input.record = JSON.parse(content);
      } catch {
        throw new AppError(
          "INVALID_INPUT",
          "Record file must contain valid JSON.",
        );
      }
    } else {
      if (!(key in op.schema.shape) || key === "record")
        throw new AppError("INVALID_INPUT", `Unknown option: ${flag}`);
      let schema = op.schema.shape[key];
      while (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional)
        schema = schema._def.innerType;
      input[key] =
        schema instanceof z.ZodNumber
          ? Number(value)
          : schema instanceof z.ZodArray
            ? JSON.parse(value)
            : value;
    }
  }
  const result = await execute(name, input);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) process.exitCode = 1;
}
main().catch((e) => {
  process.stdout.write(JSON.stringify(failure(e), null, 2) + "\n");
  process.exitCode = 1;
});
