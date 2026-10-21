import { mkdir, writeFile, realpath } from "node:fs/promises";
import { join, isAbsolute, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { loadLedger, inside, hashFile, atomicJson } from "./store.js";
import { readEvidence, retainReport } from "./evidenceReports.js";
import { runProcess } from "../providers/process.js";
import { prepareManagedAnalyzer } from "../providers/managedAnalyzer.js";
import { locate } from "../providers/doctor.js";
import { mapIl2cpp } from "./il2cpp.js";
import { requireCondition } from "../domain/errors.js";
export async function recoverIl2cpp(x: {
  workspace: string;
  binary: string;
  metadata: string;
  toolVersion: string;
  provider?: "auto" | "il2cppdumper" | "libcpp2il" | undefined;
  unityVersion?: string | undefined;
  query?: string | undefined;
}) {
  const dumper = process.env.REA_UNITY_IL2CPP_DUMPER,
    indexer = process.env.REA_UNITY_LIBCPP2IL_INDEXER;
  requireCondition(
    dumper || indexer,
    "TOOL_UNAVAILABLE",
    "Configure REA_UNITY_IL2CPP_DUMPER or REA_UNITY_LIBCPP2IL_INDEXER with a trusted version-compatible analyzer.",
  );
  await loadLedger(x.workspace);
  const meta = await readEvidence(x.workspace, x.metadata);
  requireCondition(
    meta.bytes.length >= 8 && meta.bytes.readUInt32LE(0) === 0xfab11baf,
    "INVALID_METADATA",
    "Expected plain IL2CPP metadata header.",
  );
  const metadataVersion = meta.bytes.readUInt32LE(4);
  const provider =
    x.provider && x.provider !== "auto"
      ? x.provider
      : metadataVersion >= 35 || !dumper
        ? "libcpp2il"
        : "il2cppdumper";
  const configured = provider === "libcpp2il" ? indexer : dumper;
  requireCondition(
    configured && isAbsolute(configured),
    "TOOL_UNAVAILABLE",
    provider === "libcpp2il"
      ? "Metadata requires a compatible REA_UNITY_LIBCPP2IL_INDEXER; configure its trusted executable or managed DLL."
      : "Configure the absolute trusted REA_UNITY_IL2CPP_DUMPER executable.",
  );
  requireCondition(
    provider !== "libcpp2il" || x.unityVersion,
    "INVALID_INPUT",
    "LibCpp2IL recovery requires the exact observed Unity version.",
  );
  const tool = await realpath(configured),
    toolSha256 = await hashFile(tool),
    binary = inside(x.workspace, x.binary),
    metadata = inside(x.workspace, x.metadata),
    binarySha = await hashFile(binary);
  const folder = join("recovered/05_indexes", `il2cpp-${randomUUID()}`),
    out = inside(x.workspace, folder);
  await mkdir(out);
  const incomplete = join(out, ".incomplete");
  await writeFile(incomplete, "Analyzer recovery in progress\n", {
    flag: "wx",
  });
  let executable = tool,
    managed: Awaited<ReturnType<typeof prepareManagedAnalyzer>> | null = null;
  let args =
    provider === "libcpp2il"
      ? [binary, metadata, x.unityVersion!, out]
      : [binary, metadata, out];
  if (extname(tool).toLowerCase() === ".dll") {
    requireCondition(
      provider === "libcpp2il",
      "INVALID_TOOL",
      "Dumper adapter expects a native executable.",
    );
    const host = process.env.REA_UNITY_DOTNET ?? (await locate("dotnet"));
    requireCondition(
      host && isAbsolute(host),
      "TOOL_UNAVAILABLE",
      "Configure REA_UNITY_DOTNET with a compatible full framework host.",
    );
    executable = await realpath(host);
    const tools = inside(x.workspace, "tools");
    await mkdir(tools, { recursive: true });
    managed = await prepareManagedAnalyzer(
      tool,
      join(tools, `il2cpp-${randomUUID()}`),
    );
    args = [managed.runner, ...args];
  }
  const executableSha = await hashFile(executable);
  let run: Awaited<ReturnType<typeof runProcess>>;
  try {
    run = await runProcess(executable, args, {
      timeoutMs: 300000,
      maxBytes: 4 * 1024 * 1024,
    });
  } catch (error) {
    await retainReport(x.workspace, "il2cpp-execution", {
      provider,
      tool,
      tool_sha256: toolSha256,
      executable,
      args,
      managed,
      status: "failed",
      error: String(error),
    });
    throw error;
  }
  const execution = {
    provider,
    tool,
    tool_sha256: toolSha256,
    executable,
    executable_sha256: executableSha,
    version: x.toolVersion,
    version_status: "caller_declared",
    metadata_version: metadataVersion,
    args,
    managed,
    ...run,
  };
  const executionReport = await retainReport(
    x.workspace,
    "il2cpp-execution",
    execution,
  );
  requireCondition(
    (await hashFile(binary)) === binarySha &&
      (await hashFile(metadata)) === meta.source.sha256 &&
      (await hashFile(tool)) === toolSha256 &&
      (await hashFile(executable)) === executableSha,
    "EVIDENCE_CHANGED",
    "Analyzer inputs or executable changed during recovery.",
  );
  requireCondition(
    run.code === 0,
    "ANALYZER_FAILED",
    `${provider} exited ${run.code}; inspect ${executionReport.report_path} and incomplete output. No map was accepted.`,
  );
  if (provider === "libcpp2il") {
    const summary = JSON.parse(
      (
        await readEvidence(
          x.workspace,
          join(folder, "summary.json"),
          1024 * 1024,
        )
      ).bytes.toString(),
    );
    requireCondition(
      summary.inputs?.binary_sha256 === binarySha &&
        summary.inputs?.metadata_sha256 === meta.source.sha256 &&
        summary.parsed?.metadata_version === metadataVersion &&
        summary.parsed?.unity_version === x.unityVersion &&
        summary.truncation?.truncated === false,
      "MAPPING_MISMATCH",
      "Fresh analyzer summary disagrees with selected inputs/version or reports truncation.",
    );
  }
  const provenance = join(folder, "rea-provenance.json");
  await atomicJson(inside(x.workspace, provenance), {
    provider: `${provider} tool SHA256=${toolSha256}; execution SHA256=${executionReport.report_sha256}`,
    version: x.toolVersion + " (caller declared)",
    binary_sha256: binarySha,
    metadata_sha256: meta.source.sha256,
  });
  const mapping = await mapIl2cpp({
    workspace: x.workspace,
    binary: x.binary,
    metadata: x.metadata,
    map: join(
      folder,
      provider === "libcpp2il" ? "methods.jsonl" : "script.json",
    ),
    provenance,
    format:
      provider === "libcpp2il" ? "libcpp2il-jsonl" : "il2cppdumper-script",
    query: x.query,
    offset: 0,
    limit: 100,
  });
  const { rm } = await import("node:fs/promises");
  await rm(incomplete);
  return {
    execution,
    execution_report: executionReport,
    mapping,
    output: folder,
    limits: [
      "Dependency hashes cover admitted local files, not every host OS/framework input.",
      "Analyzer compatibility is version-specific; unsupported metadata remains a failure.",
      "Mapped declarations are not original managed method bodies.",
    ],
  };
}
