import { z } from "zod";
import { id, text, digest } from "../domain/model.js";
import { loadLedger, inside } from "./store.js";
import { readEvidence, retainReport } from "./evidenceReports.js";
import { python } from "../providers/process.js";
import { requireCondition } from "../domain/errors.js";
export const nativeWindowsSchema = z
  .object({
    caseId: id,
    map: text,
    mapSha256: digest,
    methods: z
      .array(
        z
          .object({
            assembly: text,
            token: z.string().regex(/^0x06[\da-f]{6}$/i),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    maxBytes: z.number().int().min(4).max(16384).default(4096),
  })
  .strict();
export async function inspectNativeWindows(
  workspace: string,
  input: z.infer<typeof nativeWindowsSchema>,
) {
  const record = nativeWindowsSchema.parse(input);
  await loadLedger(workspace);
  const before = await readEvidence(workspace, record.map, 4 * 1024 * 1024);
  requireCondition(
    before.source.sha256 === record.mapSha256,
    "EVIDENCE_CHANGED",
    "Map report hash changed.",
  );
  const result = z
    .object({
      map_sha256: digest,
      methods: z
        .array(
          z.object({ assembly: text, token: text, name: text }).passthrough(),
        )
        .max(32),
    })
    .passthrough()
    .parse(
      await python(
        "native_windows.py",
        [
          "--workspace",
          workspace,
          "--map-report",
          inside(workspace, record.map),
          "--map-sha256",
          record.mapSha256,
          "--methods",
          JSON.stringify(record.methods),
          "--max-bytes",
          String(record.maxBytes),
        ],
        { timeoutMs: 60000, maxBytes: 8 * 1024 * 1024 },
      ),
    );
  requireCondition(
    result.map_sha256 === record.mapSha256 &&
      (await readEvidence(workspace, record.map)).source.sha256 ===
        record.mapSha256,
    "EVIDENCE_CHANGED",
    "Map report changed during native inspection.",
  );
  const evidence = { case_id: record.caseId, selection: record, ...result };
  return {
    ...evidence,
    ...(await retainReport(workspace, "native-windows", evidence)),
  };
}
