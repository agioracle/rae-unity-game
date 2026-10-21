import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { coreRuntime } from "./runtime.js";

type Message = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: unknown;
  [key: string]: unknown;
};
type Owner = "core" | "unity";
type Backend = { process: ChildProcessWithoutNullStreams; lines: Interface };
type Broadcast = { method: string; results: Partial<Record<Owner, Message>> };
const key = (id: unknown) => JSON.stringify(id);
const isResponse = (message: Message) =>
  message.id !== undefined && message.method === undefined;
const mergeMethods = new Set([
  "initialize",
  "tools/list",
  "resources/list",
  "resources/templates/list",
  "prompts/list",
]);
const collectionFor: Record<string, string> = {
  "tools/list": "tools",
  "resources/list": "resources",
  "resources/templates/list": "resourceTemplates",
  "prompts/list": "prompts",
};

/** Multiplex envelopes rather than rebuild REA schemas, results or session semantics. */
export async function serveEdition(
  entry: string,
  options: { coreEntry?: string; domainEntry?: string } = {},
): Promise<void> {
  const children = {} as Record<Owner, Backend>;
  const broadcasts = new Map<string, Broadcast>();
  const callbacks = new Map<string, { owner: Owner; id: unknown }>();
  const callbackOrigins = new Map<string, string>();
  const clientRequests = new Map<string, Owner | "both">();
  const domainPrompts = new Set([
    "reconstruct-unity-game",
    "investigate-unity-feature",
  ]);
  const capabilities: Partial<Record<Owner, Record<string, unknown>>> = {};
  let callbackId = 0,
    stopping = false;
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const exited = new Set<Owner>();
  const blockedInputs = new Set<Owner>();
  let killTimer: NodeJS.Timeout | undefined;
  const output = (message: Message) => {
    if (
      !process.stdout.destroyed &&
      !process.stdout.write(JSON.stringify(message) + "\n")
    ) {
      for (const backend of Object.values(children)) backend.lines.pause();
      process.stdout.once("drain", () => {
        for (const backend of Object.values(children)) backend.lines.resume();
      });
    }
  };
  const send = (owner: Owner, message: Message) => {
    const child = children[owner].process;
    if (
      !child.stdin.destroyed &&
      !child.stdin.write(JSON.stringify(message) + "\n") &&
      !blockedInputs.has(owner)
    ) {
      blockedInputs.add(owner);
      input.pause();
      child.stdin.once("drain", () => {
        blockedInputs.delete(owner);
        if (blockedInputs.size === 0 && !stopping) input.resume();
      });
    }
  };
  const terminateBackend = (owner: Owner, signal: NodeJS.Signals) => {
    const child = children[owner]?.process;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (owner === "unity" && process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    } else child.kill(signal);
  };
  const stop = (code: number) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    input.close();
    process.stdin.pause();
    for (const owner of ["core", "unity"] as const)
      terminateBackend(owner, "SIGTERM");
    killTimer = setTimeout(() => {
      for (const owner of ["core", "unity"] as const)
        terminateBackend(owner, "SIGKILL");
    }, 5000);
    killTimer.unref();
  };
  const response = (owner: Owner, message: Message) => {
    if (message.method !== undefined) {
      if (message.id !== undefined) {
        const id = `rea-unity:callback:${++callbackId}`;
        callbacks.set(key(id), { owner, id: message.id });
        callbackOrigins.set(`${owner}:${key(message.id)}`, id);
        output({ ...message, id });
      } else if (message.method === "notifications/cancelled") {
        const mapped = callbackOrigins.get(
          `${owner}:${key(message.params?.requestId)}`,
        );
        if (mapped)
          output({
            ...message,
            params: { ...message.params, requestId: mapped },
          });
      } else output(message);
      return;
    }
    const id = key(message.id),
      broadcast = broadcasts.get(id);
    if (!broadcast) {
      clientRequests.delete(id);
      output(message);
      return;
    }
    broadcast.results[owner] = message;
    const { core, unity } = broadcast.results;
    if (!core || !unity) return;
    broadcasts.delete(id);
    clientRequests.delete(id);
    if (core.error !== undefined || unity.error !== undefined) {
      output(core.error !== undefined ? core : unity);
      return;
    }
    if (broadcast.method === "initialize") {
      const base = core.result ?? {},
        extra = unity.result ?? {};
      capabilities.core = (base.capabilities as Record<string, unknown>) ?? {};
      capabilities.unity =
        (extra.capabilities as Record<string, unknown>) ?? {};
      output({
        ...core,
        result: {
          ...base,
          serverInfo: { name: "rea-unity-game", version: "0.2.0" },
          capabilities: {
            ...((base.capabilities as object) ?? {}),
            ...((extra.capabilities as object) ?? {}),
          },
          instructions: [
            base.instructions,
            extra.instructions,
            "REA Unity Edition retains the complete REA core. Use original tools for general reverse engineering and unity_* for Unity domain evidence.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      });
    } else {
      const field = collectionFor[broadcast.method]!,
        base = core.result ?? {},
        extra = unity.result ?? {};
      const original = Array.isArray(base[field]) ? base[field] : [],
        additional = Array.isArray(extra[field]) ? extra[field] : [];
      if (field === "prompts")
        for (const prompt of additional)
          if (
            typeof prompt === "object" &&
            prompt &&
            typeof prompt.name === "string"
          )
            domainPrompts.add(prompt.name);
      output({
        ...core,
        result: { ...base, [field]: [...original, ...additional] },
      });
    }
  };
  const receive = (owner: Owner, line: string) => {
    try {
      response(owner, JSON.parse(line) as Message);
    } catch (error) {
      process.stderr.write(
        `${owner} emitted invalid JSON-RPC: ${String(error)}\n`,
      );
      stop(1);
    }
  };
  for (const owner of ["core", "unity"] as const) {
    const args =
      owner === "core"
        ? [options.coreEntry ?? coreRuntime().entry, "mcp"]
        : [options.domainEntry ?? entry, "--unity-domain-mcp"];
    const child = spawn(process.execPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      env: process.env,
      detached: owner === "unity" && process.platform !== "win32",
    });
    child.stdin.on("error", () => stop(1));
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    children[owner] = { process: child, lines };
    lines.on("line", (line) => receive(owner, line));
    child.stderr.pipe(process.stderr, { end: false });
    child.on("error", (error) => {
      process.stderr.write(`${owner} backend failed: ${error.message}\n`);
      stop(1);
    });
    child.on("close", (code) => {
      exited.add(owner);
      lines.close();
      if (!stopping) stop(code === 0 ? 1 : (code ?? 1));
      if (exited.size === 2) {
        if (killTimer) clearTimeout(killTimer);
        finish();
      }
    });
  }
  input.on("line", (line) => {
    if (stopping) return;
    let message: Message;
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Expected an object.");
      message = value as Message;
    } catch {
      output({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON-RPC message." },
      });
      return;
    }
    const id = key(message.id);
    if (isResponse(message)) {
      const callback = callbacks.get(id);
      if (callback) {
        callbacks.delete(id);
        callbackOrigins.delete(`${callback.owner}:${key(callback.id)}`);
        send(callback.owner, { ...message, id: callback.id });
      } else send("core", message);
      return;
    }
    if (typeof message.method !== "string") {
      send("core", message);
      return;
    }
    if (message.id === undefined) {
      if (message.method === "notifications/cancelled") {
        const route = clientRequests.get(key(message.params?.requestId));
        if (route === "both") {
          send("core", message);
          send("unity", message);
        } else send(route ?? "core", message);
      } else {
        send("core", message);
        send("unity", message);
      }
      return;
    }
    if (mergeMethods.has(message.method) && !message.params?.cursor) {
      const broadcast: Broadcast = { method: message.method, results: {} };
      broadcasts.set(id, broadcast);
      clientRequests.set(id, "both");
      const capability = message.method.startsWith("resources/")
        ? "resources"
        : message.method.startsWith("prompts/")
          ? "prompts"
          : message.method === "tools/list"
            ? "tools"
            : undefined;
      for (const owner of ["core", "unity"] as const) {
        if (
          capability &&
          capabilities[owner] &&
          !capabilities[owner]![capability]
        )
          response(owner, {
            jsonrpc: "2.0",
            id: message.id,
            result: { [collectionFor[message.method]!]: [] },
          });
        else send(owner, message);
      }
      return;
    }
    let owner: Owner = "core";
    if (
      message.method === "tools/call" &&
      typeof message.params?.name === "string" &&
      message.params.name.startsWith("unity_")
    )
      owner = "unity";
    if (
      [
        "resources/read",
        "resources/subscribe",
        "resources/unsubscribe",
      ].includes(message.method) &&
      typeof message.params?.uri === "string" &&
      message.params.uri.startsWith("unity-reconstruction://")
    )
      owner = "unity";
    if (
      message.method === "prompts/get" &&
      typeof message.params?.name === "string" &&
      domainPrompts.has(message.params.name)
    )
      owner = "unity";
    clientRequests.set(id, owner);
    send(owner, message);
  });
  input.on("close", () => stop(0));
  const interrupt = () => stop(130),
    terminate = () => stop(143);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  process.stdout.on("error", () => stop(1));
  try {
    await done;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
