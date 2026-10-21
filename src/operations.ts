import { z } from "zod";
import { selectedPath } from "./application/store.js";
import {
  acceptanceSchema,
  claimSchema,
  coverageSchema,
  markerSchema,
  roadmapSchema,
  text,
  id,
  digest,
} from "./domain/model.js";
import { failure, AppError } from "./domain/errors.js";
import { inspect, initialize, verifyIntake } from "./application/workspace.js";
import {
  status,
  plan,
  recordRecovery,
  recordClaim,
  recordMarker,
  setRoadmap,
  ready,
  recordAcceptance,
  advance,
} from "./application/ledger.js";
import { query, readRecord, handoff } from "./application/queries.js";
import { analyze } from "./providers/rea.js";
import { featureContext } from "./application/featureContext.js";
import { inspectObjects } from "./application/unityObjects.js";
import { doctor, capabilities } from "./providers/doctor.js";
import { mapIl2cpp } from "./application/il2cpp.js";
import { traceReferences } from "./application/references.js";
import { inspectTarget } from "./application/targetProject.js";
import {
  transferRequest,
  planTransfer,
  applyTransfer,
} from "./application/transfer.js";
import { unpackBundle } from "./application/bundle.js";
import { recoverIl2cpp } from "./application/il2cppRecovery.js";
import {
  androidScenario,
  androidScenarioSchema,
} from "./application/androidScenario.js";
import { compareUiValues, uiValuesSchema } from "./application/uiValues.js";
import {
  investigateFeature,
  investigationSchema,
} from "./application/investigation.js";
import {
  inspectNativeWindows,
  nativeWindowsSchema,
} from "./application/nativeWindows.js";
import {
  decodeComponent,
  componentSchemaRequest,
} from "./application/componentSchema.js";
import { compareUiSignals, uiSignalsSchema } from "./application/uiSignals.js";
const workspace = { workspace: text };
export interface Operation {
  description: string;
  schema: z.AnyZodObject;
  mutates: boolean;
  execute: (input: unknown) => Promise<unknown>;
}
function operation<S extends z.AnyZodObject>(
  description: string,
  schema: S,
  mutates: boolean,
  run: (input: z.infer<S>) => Promise<unknown>,
): Operation {
  return {
    description,
    schema,
    mutates,
    execute: async (input) => {
      const parsed = schema.parse(input);
      for (const key of ["workspace", "input"])
        if (typeof parsed[key] === "string")
          parsed[key] = await selectedPath(parsed[key]);
      return run(parsed);
    },
  };
}
export const operations = {
  inspect: operation(
    "Inspect untrusted packages or an extracted Unity player without modifying the source.",
    z.object({ input: text }).strict(),
    false,
    async (x) => inspect(x.input),
  ),
  init: operation(
    "Snapshot authorized input into a NEW restoration workspace and extract bounded raw evidence. Does not recover gameplay.",
    z.object({ input: text, ...workspace, authorization: text }).strict(),
    true,
    async (x) => initialize(x.input, x.workspace, x.authorization),
  ),
  status: operation(
    "Read compact restoration state and independent evidence/delivery gates.",
    z.object(workspace).strict(),
    false,
    async (x) => status(x.workspace),
  ),
  plan: operation(
    "Select Mono/IL2CPP recovery routes from recorded evidence; return explicit tool handoffs and gaps.",
    z.object(workspace).strict(),
    false,
    async (x) => plan(x.workspace),
  ),
  query: operation(
    "Search fixed text with time/file/byte/result budgets. Retain a scoped query report; absence in unscanned data remains unknown.",
    z
      .object({
        ...workspace,
        root: text.default("recovered"),
        pattern: text,
        limit: z.number().int().min(1).max(100).default(20),
      })
      .strict(),
    true,
    async (x) => query(x.workspace, x.root, x.pattern, x.limit),
  ),
  "record-recovery": operation(
    "Record one recovery category outcome with hashes, attempts, gaps and affected consumers. Tool reports are caller-supplied evidence.",
    z.object({ ...workspace, record: coverageSchema }).strict(),
    true,
    async (x) => recordRecovery(x.workspace, x.record),
  ),
  "record-claim": operation(
    "Append an immutable versioned claim with qualified locator domains and verified local source hashes.",
    z.object({ ...workspace, record: claimSchema }).strict(),
    true,
    async (x) => recordClaim(x.workspace, x.record),
  ),
  "record-marker": operation(
    "Append a reported validation marker and check artifact hashes. Does not independently run the test or record human acceptance.",
    z.object({ ...workspace, record: markerSchema }).strict(),
    true,
    async (x) => recordMarker(x.workspace, x.record),
  ),
  "set-roadmap": operation(
    "Define one source-backed player-visible loop: entry, interaction, ownership, outcome, repeat and startup steps.",
    z.object({ ...workspace, record: roadmapSchema }).strict(),
    true,
    async (x) => setRoadmap(x.workspace, x.record),
  ),
  ready: operation(
    "Check recovery/evidence gates and passing runtime markers for the named build, then request user playtest. Does not imply user acceptance.",
    z.object({ ...workspace, version: text }).strict(),
    true,
    async (x) => ready(x.workspace, x.version),
  ),
  "record-acceptance": operation(
    "ONLY when the human explicitly authorized it: record their statement, scope and current ready version. Never infer from tests, silence or continuation.",
    z.object({ ...workspace, record: acceptanceSchema }).strict(),
    true,
    async (x) => recordAcceptance(x.workspace, x.record),
  ),
  advance: operation(
    "Permit P3 work only after explicit current-version human acceptance or a separate recorded gate waiver.",
    z.object(workspace).strict(),
    true,
    async (x) => advance(x.workspace),
  ),
  verify: operation(
    "Rehash all recorded intake files; detect source/raw evidence changes. Does not establish export correctness or parity.",
    z.object(workspace).strict(),
    false,
    async (x) => {
      await status(x.workspace);
      return verifyIntake(x.workspace);
    },
  ),
  records: operation(
    "Page exact ledger record kinds or retrieve one ID; avoid dumping the full evidence ledger.",
    z
      .object({
        ...workspace,
        kind: z.enum(["claims", "recovery", "markers", "history"]),
        id: id.optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(10),
      })
      .strict(),
    false,
    async (x) => readRecord(x.workspace, x.kind, x.id, x.offset, x.limit),
  ),
  handoff: operation(
    "Return a bounded REA/Unity task packet. Does not execute external tools or mutate the Editor.",
    z.object({ ...workspace, claim: id.optional() }).strict(),
    false,
    async (x) => handoff(x.workspace, x.claim),
  ),
  analyze: operation(
    "Run bounded static managed analysis through an installed REA executable. Retain source/tool hashes, arguments and full JSON; never run supplied target code.",
    z
      .object({
        ...workspace,
        kind: z.enum(["managed-artifact", "managed-members"]),
        path: text,
        type: text.optional(),
      })
      .strict(),
    true,
    async (x) => analyze(x.workspace, x.kind, x.path, x.type),
  ),
  "inspect-objects": operation(
    "Inspect a page of actual Unity SerializedFile objects using pinned optional UnityPy; preserve qualified PathIDs and source hashes.",
    z
      .object({
        ...workspace,
        path: text,
        maxInputMiB: z.number().int().min(1).max(128).default(64),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .strict(),
    true,
    async (x) =>
      inspectObjects(x.workspace, x.path, {
        offset: x.offset,
        limit: x.limit,
        maxInputMiB: x.maxInputMiB,
      }),
  ),
  "inspect-object": operation(
    "Read one exact serialized-file/PathID object, raw-byte hash and available typed fields. Missing TypeTrees remain partial evidence.",
    z
      .object({
        ...workspace,
        path: text,
        maxInputMiB: z.number().int().min(1).max(128).default(64),
        pathId: z.string().regex(/^-?\d+$/),
        serializedFile: text.optional(),
        field: text.optional(),
      })
      .strict(),
    true,
    async (x) =>
      inspectObjects(x.workspace, x.path, {
        pathId: x.pathId,
        maxInputMiB: x.maxInputMiB,
        ...(x.serializedFile === undefined
          ? {}
          : { serializedFile: x.serializedFile }),
        ...(x.field === undefined ? {} : { field: x.field }),
      }),
  ),
  "decode-component": operation(
    "Decode one exact MonoBehaviour using an attributed bounded external TypeTree, explicit MonoScript identity, version-matched native header and full-byte consumption. Preserve source/schema hashes and provider-association limits.",
    z.object({ ...workspace, record: componentSchemaRequest }).strict(),
    true,
    async (x) => decodeComponent(x.workspace, x.record),
  ),
  "inspect-native": operation(
    "Decode explicitly selected assembly/token ARM64 or ARM32 (ARM/Thumb pointer mode) navigation windows from hashed ELF/catalog evidence. Preserve aliases and byte budgets; no game-specific method names or fixed counts.",
    z.object({ ...workspace, record: nativeWindowsSchema }).strict(),
    true,
    async (x) => inspectNativeWindows(x.workspace, x.record),
  ),
  "investigate-feature": operation(
    "Prepare a question-scoped investigation using explicit artifact selectors, ABI/version-matched fresh recovery or attributed catalog, and optional resource roots. No game-specific symbols or PathIDs. Host agent establishes semantics and authors target code.",
    z.object({ ...workspace, record: investigationSchema }).strict(),
    true,
    async (x) => investigateFeature(x.workspace, x.record),
  ),
  "feature-context": operation(
    "Bind one requested game feature and optional existing target Unity project to recorded artifacts and the complete REA investigation tools. Reads context; the host agent performs analysis and authoring.",
    z
      .object({
        ...workspace,
        question: text,
        seed: text.optional(),
        targetProject: text.optional(),
      })
      .strict(),
    false,
    async (x) =>
      featureContext(x.workspace, x.question, x.seed, x.targetProject),
  ),
  "unpack-bundle": operation(
    "Extract exact UnityFS 6..8 members into a new evidence directory with preflight byte/count/path budgets; no asset deserialization or implicit external file loads.",
    z.object({ ...workspace, path: text }).strict(),
    true,
    async (x) => unpackBundle(x.workspace, x.path),
  ),
  "recover-il2cpp": operation(
    "Route fresh IL2CPP recovery by metadata version through a configured trusted Il2CppDumper or LibCpp2IL indexer. Isolate managed analyzers from trimmed framework DLLs, retain execution/dependency hashes, and map fresh output.",
    z
      .object({
        ...workspace,
        binary: text,
        metadata: text,
        toolVersion: text.refine(
          (value) => value.length <= 80,
          "Tool version must not exceed 80 characters",
        ),
        provider: z.enum(["auto", "il2cppdumper", "libcpp2il"]).default("auto"),
        unityVersion: z
          .string()
          .regex(/^\d+\.\d+\.\d+[abcfpx]\d+(?:c\d+)?$/)
          .optional(),
        query: text.optional(),
      })
      .strict(),
    true,
    async (x) => recoverIl2cpp(x),
  ),
  "map-il2cpp": operation(
    "Map attributed IL2CPP methods to exact on-disk ELF addresses and file offsets. Preserve aliases, absent pointers and provider provenance; imported maps do not prove method bodies.",
    z
      .object({
        ...workspace,
        binary: text,
        metadata: text,
        map: text,
        provenance: text,
        format: z.enum(["il2cppdumper-script", "libcpp2il-jsonl"]),
        query: text.optional(),
        assembly: text.optional(),
        runtimeBase: z
          .string()
          .regex(/^(?:0x[\da-f]+|\d+)$/i)
          .optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .strict(),
    true,
    async (x) => mapIl2cpp(x),
  ),
  "trace-references": operation(
    "Trace outgoing serialized PPtr fields through an explicitly admitted file set. Keep path/hash/PathID identity, field paths, unresolved externals and TypeTree gaps; never load external paths automatically.",
    z
      .object({
        ...workspace,
        paths: z.array(text).min(1).max(32),
        path: text,
        maxInputMiB: z.number().int().min(1).max(128).default(64),
        pathId: z.string().regex(/^-?\d+$/),
        maxDepth: z.number().int().min(0).max(20).default(5),
        maxNodes: z.number().int().min(1).max(500).default(100),
      })
      .strict(),
    true,
    async (x) => traceReferences(x),
  ),
  "inspect-target": operation(
    "Inspect actual Unity version, packages, input, pipeline, assemblies, script conventions and GUID inventory without mutation.",
    z.object({ targetProject: text }).strict(),
    false,
    async (x) => inspectTarget(x.targetProject),
  ),
  "plan-transfer": operation(
    "Plan a source-backed feature adaptation into a new target Assets folder. Check context and serialized GUID dependencies; host agent authors code and adaptation decisions.",
    z.object({ ...workspace, record: transferRequest }).strict(),
    true,
    async (x) => planTransfer(x.workspace, x.record),
  ),
  "apply-transfer": operation(
    "Apply one exact hashed transfer plan into an exclusively new feature folder. Recheck claims, sources, target context and GUIDs. Does not compile or establish runtime parity.",
    z.object({ ...workspace, plan: text, planSha256: digest }).strict(),
    true,
    async (x) => applyTransfer(x.workspace, x.plan, x.planSha256),
  ),
  "android-scenario": operation(
    "Execute a reviewed bounded input case on one authorized Android app/device. Verify installed APK hashes and foreground identity; capture exact PNGs before/after normal tap/hold/multitouch. Execution alone is not a parity assertion.",
    z.object({ ...workspace, record: androidScenarioSchema }).strict(),
    true,
    async (x) => androidScenario(x.workspace, x.record),
  ),
  "compare-ui-signals": operation(
    "Evaluate independently reviewed visible RGB-region predicates on hashed source/target captures. State labels are caller-supplied; retain crops/counts and never infer internal state or whole visual parity.",
    z.object({ ...workspace, record: uiSignalsSchema }).strict(),
    true,
    async (x) => compareUiSignals(x.workspace, x.record),
  ),
  "compare-ui-values": operation(
    "Compare one reviewed numeric UI value in two hashed PNG/JPEG regions using bounded crops and strict OCR confidence. Retain crops and TSV; ambiguous recognition is inconclusive, never parity.",
    z.object({ ...workspace, record: uiValuesSchema }).strict(),
    true,
    async (x) => compareUiValues(x.workspace, x.record),
  ),
  doctor: operation(
    "Check Python compatibility and optional provider executables on PATH without installing software.",
    z.object({}).strict(),
    false,
    async () => doctor(),
  ),
  capabilities: operation(
    "List implemented operations, external recovery handoffs and proof limits.",
    z.object({}).strict(),
    false,
    async () => capabilities(),
  ),
} satisfies Record<string, Operation>;
export async function execute(name: string, input: unknown) {
  try {
    const op = (operations as Record<string, Operation>)[name];
    if (!op)
      throw new AppError("UNKNOWN_OPERATION", `Unknown operation: ${name}`);
    return { ok: true as const, data: await op.execute(input) };
  } catch (e) {
    return failure(e);
  }
}
