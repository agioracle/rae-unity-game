import { z } from "zod";
import { mkdir, writeFile, realpath } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { id, text, digest } from "../domain/model.js";
import { loadLedger, inside, hashFile } from "./store.js";
import { retainReport } from "./evidenceReports.js";
import { python, runProcess } from "../providers/process.js";
import { requireCondition } from "../domain/errors.js";
const selection = z
  .object({
    path: text,
    sha256: digest,
    roi: z
      .object({
        x: z.number().int().min(0).max(16383),
        y: z.number().int().min(0).max(16383),
        width: z.number().int().min(1).max(16384),
        height: z.number().int().min(1).max(16384),
      })
      .strict(),
    scale: z.number().int().min(1).max(4).default(4),
    lightTextThreshold: z.number().int().min(200).max(250).optional(),
  })
  .strict();
export const uiValuesSchema = z
  .object({
    caseId: id,
    source: selection,
    target: selection,
    expected: z.string().regex(/^-?(?:0|[1-9]\d{0,18})$/),
    minimumConfidence: z.number().min(80).max(100).default(85),
  })
  .strict();
// A single numeric word is required. Do not join fragments, strip unknown glyphs,
// whitelist digits (which can hide recognition errors), or infer missing digits.
export function numericObservation(tsv: string, minimumConfidence: number) {
  const lines = tsv.trim().split(/\r?\n/);
  const header = lines.shift()?.split("\t");
  if (
    header?.join("\t") !==
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext"
  )
    return {
      status: "inconclusive",
      reason: "Invalid TSV schema",
      value: null,
    };
  const words = lines
    .map((l) => l.split("\t"))
    .filter((c) => c[0] === "5" && c.slice(11).join("\t").trim());
  if (words.length !== 1)
    return {
      status: "inconclusive",
      reason: "Expected exactly one OCR word",
      value: null,
    };
  const cells = words[0]!,
    value = cells.slice(11).join("\t").trim(),
    confidence = Number(cells[10]);
  if (
    !/^[+-]?(?:0|[1-9]\d{0,18})$/.test(value) ||
    !Number.isFinite(confidence) ||
    confidence < minimumConfidence
  )
    return {
      status: "inconclusive",
      reason: "Ambiguous numeric OCR or low confidence",
      value: null,
      confidence,
    };
  return {
    status: "observed",
    text: value,
    value: BigInt(value).toString(),
    confidence,
  };
}
export async function compareUiValues(
  workspace: string,
  input: z.infer<typeof uiValuesSchema>,
) {
  const record = uiValuesSchema.parse(input);
  await loadLedger(workspace);
  for (const selected of [record.source, record.target])
    requireCondition(
      (await hashFile(inside(workspace, selected.path))) === selected.sha256,
      "EVIDENCE_CHANGED",
      "Screenshot hash differs from the reviewed case.",
    );
  const configured = process.env.REA_UNITY_TESSERACT;
  requireCondition(
    configured && isAbsolute(configured),
    "TOOL_UNAVAILABLE",
    "Configure absolute REA_UNITY_TESSERACT for numeric screenshot comparison; Python Pillow is also required.",
  );
  const tool = await realpath(configured),
    toolSha = await hashFile(tool);
  const version = await runProcess(tool, ["--version"], {
    timeoutMs: 5000,
    maxBytes: 8192,
  });
  requireCondition(
    version.code === 0,
    "OCR_FAILED",
    "OCR version probe failed.",
  );
  const folder = join("reports", "ui-values-" + randomUUID());
  await mkdir(inside(workspace, folder));
  async function observe(name: string, selected: z.infer<typeof selection>) {
    const crop = join(folder, name + ".png"),
      r = selected.roi;
    const preparation = z
      .object({
        source_sha256: digest,
        dimensions: z.array(z.number()).length(2),
      })
      .passthrough()
      .parse(
        await python(
          "ui_crop.py",
          [
            "--input",
            inside(workspace, selected.path),
            "--output",
            inside(workspace, crop),
            "--x",
            String(r.x),
            "--y",
            String(r.y),
            "--width",
            String(r.width),
            "--height",
            String(r.height),
            "--scale",
            String(selected.scale),
            ...(selected.lightTextThreshold === undefined
              ? []
              : [
                  "--light-text-threshold",
                  String(selected.lightTextThreshold),
                ]),
          ],
          { timeoutMs: 15000, maxBytes: 16384 },
        ),
      );
    requireCondition(
      preparation.source_sha256 === selected.sha256,
      "EVIDENCE_CHANGED",
      "Screenshot changed during crop.",
    );
    const result = await runProcess(
      tool,
      [inside(workspace, crop), "stdout", "-l", "eng", "--psm", "7", "tsv"],
      { timeoutMs: 15000, maxBytes: 128 * 1024 },
    );
    const raw = join(folder, name + ".tsv");
    await writeFile(inside(workspace, raw), result.stdout, { flag: "wx" });
    await writeFile(
      inside(workspace, join(folder, name + "-stderr.txt")),
      result.stderr,
      { flag: "wx" },
    );
    return {
      selection: selected,
      preparation,
      crop: { path: crop, sha256: await hashFile(inside(workspace, crop)) },
      ocr: {
        code: result.code,
        path: raw,
        sha256: await hashFile(inside(workspace, raw)),
      },
      observation:
        result.code === 0
          ? numericObservation(result.stdout, record.minimumConfidence)
          : {
              status: "inconclusive",
              reason: "OCR process failed",
              value: null,
            },
    };
  }
  const source = await observe("source", record.source),
    target = await observe("target", record.target);
  for (const selected of [record.source, record.target])
    requireCondition(
      (await hashFile(inside(workspace, selected.path))) === selected.sha256,
      "EVIDENCE_CHANGED",
      "Screenshot changed during comparison.",
    );
  requireCondition(
    (await hashFile(tool)) === toolSha,
    "EVIDENCE_CHANGED",
    "OCR tool changed during comparison.",
  );
  const status =
    source.observation.value === null || target.observation.value === null
      ? "inconclusive"
      : source.observation.value === record.expected &&
          target.observation.value === record.expected
        ? "passed"
        : "mismatch";
  const result = {
    case_id: record.caseId,
    status,
    expected: record.expected,
    minimum_confidence: record.minimumConfidence,
    source,
    target,
    tool: {
      path: tool,
      sha256: toolSha,
      version: version.stdout.trim() || version.stderr.trim(),
    },
    scope:
      "Equality of one explicitly selected numeric UI value in two immutable PNG/JPEG captures; ROI and expected value are caller-reviewed inputs.",
    does_not_prove: [
      "Full visual parity",
      "Correspondence of unobserved internal state",
      "That a button was clicked",
      "Human acceptance",
    ],
  };
  return { ...result, ...(await retainReport(workspace, "ui-values", result)) };
}
