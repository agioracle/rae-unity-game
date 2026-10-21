import { z } from "zod";
import { text, id, digest } from "../domain/model.js";
import { loadLedger, inside, verifySources } from "./store.js";
import { readEvidence, retainReport } from "./evidenceReports.js";
import { python } from "../providers/process.js";
import { requireCondition } from "../domain/errors.js";
export const componentSchemaRequest = z
  .object({
    caseId: id,
    maxInputMiB: z.number().int().min(1).max(128).default(64),
    path: text,
    pathId: z.string().regex(/^-?\d+$/),
    scriptPath: text,
    scriptPathId: z.string().regex(/^-?\d+$/),
    schema: text,
    schemaSha256: digest,
    map: text,
    mapSha256: digest,
  })
  .strict();
export async function decodeComponent(
  workspace: string,
  input: z.infer<typeof componentSchemaRequest>,
) {
  const r = componentSchemaRequest.parse(input);
  await loadLedger(workspace);
  const schema = await readEvidence(workspace, r.schema, 1024 * 1024),
    map = await readEvidence(workspace, r.map, 4 * 1024 * 1024);
  requireCondition(
    schema.source.sha256 === r.schemaSha256 &&
      map.source.sha256 === r.mapSha256,
    "EVIDENCE_CHANGED",
    "Schema or map hash differs from reviewed selection.",
  );
  const s = z
    .object({
      inputs: z.object({ binary_sha256: digest, metadata_sha256: digest }),
    })
    .passthrough()
    .parse(JSON.parse(schema.bytes.toString()));
  const m = z
    .object({
      sources: z.array(z.object({ path: text, sha256: digest })).length(4),
    })
    .passthrough()
    .parse(JSON.parse(map.bytes.toString()));
  requireCondition(
    s.inputs.binary_sha256 === m.sources[0]!.sha256 &&
      s.inputs.metadata_sha256 === m.sources[1]!.sha256,
    "MAPPING_MISMATCH",
    "Schema attribution is for different native/metadata bytes.",
  );
  await verifySources(workspace, m.sources);
  const source = await readEvidence(
      workspace,
      r.path,
      r.maxInputMiB * 1024 * 1024,
    ),
    script = await readEvidence(
      workspace,
      r.scriptPath,
      r.maxInputMiB * 1024 * 1024,
    );
  const decoded = z
    .object({
      sources: z.array(z.object({ sha256: digest }).passthrough()).length(3),
      fields: z.record(z.unknown()),
    })
    .passthrough()
    .parse(
      await python(
        "component_schema.py",
        [
          "--max-input-mib",
          String(r.maxInputMiB),
          "--path",
          inside(workspace, r.path),
          "--path-id",
          r.pathId,
          "--script-path",
          inside(workspace, r.scriptPath),
          "--script-id",
          r.scriptPathId,
          "--schema",
          inside(workspace, r.schema),
        ],
        { timeoutMs: 35000, maxBytes: 2 * 1024 * 1024 },
      ),
    );
  const expected = [source.source, script.source, schema.source];
  requireCondition(
    decoded.sources.every((x, i) => x.sha256 === expected[i]!.sha256),
    "EVIDENCE_CHANGED",
    "Component evidence changed during decode.",
  );
  await verifySources(workspace, [...expected, map.source]);
  return {
    case_id: r.caseId,
    selection: r,
    ...decoded,
    ...(await retainReport(workspace, "component-fields", {
      case_id: r.caseId,
      selection: r,
      ...decoded,
    })),
  };
}
