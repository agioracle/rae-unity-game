import { z } from "zod";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { id, text, digest } from "../domain/model.js";
import { loadLedger, inside, hashFile, verifySources } from "./store.js";
import { retainReport } from "./evidenceReports.js";
import { python } from "../providers/process.js";
const channel = z.number().int().min(0).max(255),
  rgb = z
    .object({
      min: z.tuple([channel, channel, channel]),
      max: z.tuple([channel, channel, channel]),
    })
    .strict()
    .refine(
      (r) => r.min.every((n, i) => n <= r.max[i]!),
      "RGB minimum must not exceed maximum",
    );
export const visualSignal = z
  .object({
    roi: z
      .object({
        x: z.number().int().min(0).max(16383),
        y: z.number().int().min(0).max(16383),
        width: z.number().int().min(1).max(16384),
        height: z.number().int().min(1).max(16384),
      })
      .strict(),
    rgb,
    fraction: z
      .object({ min: z.number().min(0).max(1), max: z.number().min(0).max(1) })
      .strict()
      .refine(
        (r) => r.min <= r.max,
        "Fraction minimum must not exceed maximum",
      ),
  })
  .strict();
const selection = z.object({ path: text, sha256: digest }).merge(visualSignal);
export const uiSignalsSchema = z
  .object({ caseId: id, state: text, source: selection, target: selection })
  .strict();
export async function compareUiSignals(
  workspace: string,
  input: z.infer<typeof uiSignalsSchema>,
) {
  const r = uiSignalsSchema.parse(input);
  await loadLedger(workspace);
  await verifySources(workspace, [r.source, r.target]);
  const folder = join("reports", "ui-signals-" + randomUUID());
  await mkdir(inside(workspace, folder));
  async function observe(name: string, s: z.infer<typeof selection>) {
    const path = join(folder, name + ".png");
    const observation = z
      .object({
        fraction: z.number().min(0).max(1),
        matching_pixels: z.number().int().nonnegative(),
        total_pixels: z.number().int().positive(),
        preparation: z.object({ source_sha256: digest }).passthrough(),
      })
      .passthrough()
      .parse(
        await python(
          "ui_signal.py",
          [
            "--input",
            inside(workspace, s.path),
            "--output",
            inside(workspace, path),
            "--roi",
            JSON.stringify(s.roi),
            "--rgb",
            JSON.stringify(s.rgb),
          ],
          { timeoutMs: 20000, maxBytes: 32768 },
        ),
      );
    if (observation.preparation.source_sha256 !== s.sha256)
      throw Error("Signal source changed during decode");
    return {
      selection: s,
      observation,
      crop: { path, sha256: await hashFile(inside(workspace, path)) },
      matches:
        observation.fraction >= s.fraction.min &&
        observation.fraction <= s.fraction.max,
    };
  }
  const source = await observe("source", r.source),
    target = await observe("target", r.target);
  await verifySources(workspace, [r.source, r.target]);
  const result = {
    case_id: r.caseId,
    reviewed_state: r.state,
    status: source.matches && target.matches ? "passed" : "mismatch",
    source,
    target,
    scope:
      "Both independently reviewed visible RGB proportions match their predicates; semantic label is caller supplied.",
    does_not_prove: [
      "Internal state identity",
      "Action execution",
      "Full visual parity",
      "Human acceptance",
    ],
  };
  return {
    ...result,
    ...(await retainReport(workspace, "ui-signals", result)),
  };
}
