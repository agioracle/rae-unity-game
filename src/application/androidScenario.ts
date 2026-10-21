import { z } from "zod";
import { mkdir, writeFile, realpath } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { text, id } from "../domain/model.js";
import { loadLedger, hashFile, inside } from "./store.js";
import { retainReport, readEvidence } from "./evidenceReports.js";
import { runProcess, runProcessBytes } from "../providers/process.js";
import { requireCondition, AppError } from "../domain/errors.js";
import { python } from "../providers/process.js";
import { visualSignal } from "./uiSignals.js";
import { validatePng } from "../providers/png.js";
const point = z
  .object({
    x: z.number().int().min(0).max(16383),
    y: z.number().int().min(0).max(16383),
  })
  .strict();
export const androidScenarioSchema = z
  .object({
    caseId: id,
    serial: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/),
    package: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/),
    width: z.number().int().min(1).max(16384),
    height: z.number().int().min(1).max(16384),
    apkPaths: z.array(text).min(1).max(16).optional(),
    install: z.boolean().default(false),
    actions: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("tap"), ...point.shape }).strict(),
          z
            .object({
              kind: z.literal("hold"),
              points: z.array(point).min(1).max(5),
              durationMs: z.number().int().min(1).max(10000),
            })
            .strict(),
          z
            .object({
              kind: z.literal("wait"),
              durationMs: z.number().int().min(1).max(5000),
            })
            .strict(),
          z
            .object({
              kind: z.literal("wait-until"),
              signal: visualSignal,
              timeoutMs: z.number().int().min(100).max(60000),
              pollMs: z.number().int().min(100).max(2000).default(500),
            })
            .strict(),
          z.object({ kind: z.literal("capture") }).strict(),
        ]),
      )
      .min(1)
      .max(20),
  })
  .strict();
export async function androidScenario(
  workspace: string,
  input: z.infer<typeof androidScenarioSchema>,
) {
  const record = androidScenarioSchema.parse(input);
  const ledger = await loadLedger(workspace);
  requireCondition(
    record.width * record.height <= 16 * 1024 * 1024,
    "IMAGE_LIMIT",
    "Scenario display exceeds 16 megapixels.",
  );
  requireCondition(
    record.actions.reduce(
      (n, a) =>
        n +
        ("durationMs" in a ? a.durationMs : "timeoutMs" in a ? a.timeoutMs : 0),
      0,
    ) <= 60000,
    "INPUT_LIMIT",
    "Scenario duration exceeds 60 seconds.",
  );
  for (const action of record.actions) {
    const points =
      action.kind === "tap"
        ? [action]
        : action.kind === "hold"
          ? action.points
          : [];
    requireCondition(
      points.every((p) => p.x < record.width && p.y < record.height),
      "INVALID_INPUT",
      "Input coordinates exceed the reviewed display.",
    );
  }
  const configured = process.env.REA_UNITY_ADB;
  requireCondition(
    configured && isAbsolute(configured),
    "TOOL_UNAVAILABLE",
    "Configure absolute REA_UNITY_ADB for the selected authorized device.",
  );
  const adb = await realpath(configured),
    adbHash = await hashFile(adb);
  const base = ["-s", record.serial];
  const steps: unknown[] = [];
  async function call(
    args: string[],
    maxBytes = 512 * 1024,
    timeoutMs = 15000,
  ) {
    const r = await runProcess(adb, [...base, ...args], {
      timeoutMs,
      maxBytes,
    });
    requireCondition(
      r.code === 0,
      "ANDROID_FAILED",
      r.stderr.trim() || r.stdout.trim() || "ADB operation failed.",
    );
    return r.stdout;
  }
  const apks = [];
  for (const path of record.apkPaths ?? []) {
    requireCondition(
      path.toLowerCase().endsWith(".apk"),
      "INVALID_INPUT",
      "Scenario installation admits APK files only.",
    );
    apks.push({ path, sha256: await hashFile(inside(workspace, path)) });
  }
  if (record.install) {
    requireCondition(
      apks.length > 0,
      "INVALID_INPUT",
      "Installing requires selected APK paths.",
    );
    const manifest = z
      .object({
        extracted: z
          .array(
            z
              .object({
                container_sha256: z.string().optional(),
                member: z.string().optional(),
              })
              .passthrough(),
          )
          .max(200000),
      })
      .passthrough()
      .parse(
        JSON.parse(
          (
            await readEvidence(
              workspace,
              ledger.manifest_path,
              16 * 1024 * 1024,
            )
          ).bytes.toString(),
        ),
      );
    const perApk = apks.map((apk) => [
      ...new Set(
        manifest.extracted
          .filter((e) => e.container_sha256 === apk.sha256)
          .map(
            (e) =>
              /^lib\/([A-Za-z0-9_-]+)\/[^/]+\.so$/.exec(e.member ?? "")?.[1],
          )
          .filter((abi): abi is string => abi !== undefined),
      ),
    ]);
    const nativeApks = perApk.filter((abis) => abis.length > 0);
    if (nativeApks.length) {
      const raw = (
        await call(["shell", "getprop", "ro.product.cpu.abilist"], 4096)
      ).trim();
      requireCondition(
        /^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$/.test(raw),
        "DEVICE_CAPABILITY",
        "Device did not report a valid ABI list.",
      );
      const deviceAbis = raw.split(",");
      const common = nativeApks[0]!.filter((abi) =>
        nativeApks.every((abis) => abis.includes(abi)),
      );
      const compatible = common.some((abi) => deviceAbis.includes(abi));
      const capability = {
        case_id: record.caseId,
        serial: record.serial,
        selected_apks: apks,
        selected_native_abis: [...new Set(nativeApks.flat())].sort(),
        common_native_abis: common.sort(),
        device_abis: deviceAbis,
        execution_status: compatible ? "abi_admitted" : "blocked",
        assertions_status: "not_evaluated",
        limits: [
          "Declared APK library directories and device properties only; no native execution or gameplay proof.",
        ],
      };
      const report = await retainReport(
        workspace,
        "android-abi-preflight",
        capability,
      );
      if (!compatible)
        throw new AppError(
          "ABI_MISMATCH",
          "Selected APK native ABIs do not match this device. No install or input was sent.",
          report,
        );
    }
    const installed = await call([
      "install-multiple",
      ...apks.map((p) => inside(workspace, p.path)),
    ]);
    requireCondition(
      /^Success\s*$/m.test(installed),
      "ANDROID_FAILED",
      "APK installation did not report Success.",
    );
    await call([
      "shell",
      "monkey",
      "-p",
      record.package,
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ]);
  }
  const packagePaths = (await call(["shell", "pm", "path", record.package]))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^package:/, ""));
  requireCondition(
    packagePaths.length > 0 &&
      packagePaths.length <= 16 &&
      packagePaths.every((p) =>
        /^\/data\/app\/[A-Za-z0-9/._=+~\-]+\.apk$/.test(p),
      ),
    "PACKAGE_IDENTITY",
    "Installed package paths are absent or unsupported.",
  );
  const installed: { path: string; sha256: string }[] = [];
  for (const path of packagePaths) {
    const value = await call(["shell", "sha256sum", path]);
    const sha256 = /^([a-f\d]{64})\s/.exec(value)?.[1];
    requireCondition(
      sha256,
      "PACKAGE_IDENTITY",
      "Could not hash installed APK.",
    );
    installed.push({ path, sha256 });
  }
  if (apks.length)
    requireCondition(
      apks
        .map((p) => p.sha256)
        .sort()
        .join(",") ===
        installed
          .map((p) => p.sha256)
          .sort()
          .join(","),
      "PACKAGE_IDENTITY",
      "Installed APK bytes do not match every selected source leaf.",
    );
  const folder = join("reports", `android-${record.caseId}-${randomUUID()}`);
  await mkdir(inside(workspace, folder));
  let dex: string | undefined,
    remoteDex: string | undefined,
    dexHash: string | undefined;
  if (record.actions.some((a) => a.kind === "hold" && a.points.length > 1)) {
    const configuredDex = process.env.REA_UNITY_TOUCH_DEX;
    requireCondition(
      configuredDex && isAbsolute(configuredDex),
      "TOOL_UNAVAILABLE",
      "Multi-touch requires the repository ReaTouch DEX built with the Android SDK and configured as REA_UNITY_TOUCH_DEX.",
    );
    dex = await realpath(configuredDex);
    dexHash = await hashFile(dex);
    remoteDex = "/data/local/tmp/rea-touch-" + randomUUID() + ".dex";
    await call(["push", dex, remoteDex]);
    await call(["shell", "chmod", "444", remoteDex]);
  }
  const frames: {
    path: string;
    sha256: string;
    width: number;
    height: number;
    activity: string;
    elapsed_ms: number;
  }[] = [];
  const began = Date.now();
  let failure: string | undefined;
  let captureBytes = 0;
  const guardAttempts: unknown[] = [];
  async function foreground(timeoutMs = 15000) {
    const value = await call(
      ["shell", "dumpsys", "activity", "activities"],
      512 * 1024,
      timeoutMs,
    );
    const line = value
      .split("\n")
      .find((l) =>
        /topResumedActivity=|mResumedActivity:|mResumedActivity=/.test(l),
      );
    requireCondition(
      line?.match(
        /\s([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\/[^\s}]+/,
      )?.[1] === record.package,
      "WRONG_FOREGROUND",
      "Selected package is not the resumed activity; no input was sent.",
    );
    return line!.trim();
  }
  function remaining(deadline?: number) {
    const ms =
      deadline === undefined ? 15000 : Math.min(15000, deadline - Date.now());
    requireCondition(
      ms > 0,
      "PHASE_NOT_REACHED",
      "Phase deadline expired; later inputs were not sent.",
    );
    return ms;
  }
  async function frame(label: string, deadline?: number) {
    const activity = await foreground(remaining(deadline));
    const r = await runProcessBytes(
      adb,
      [...base, "exec-out", "screencap", "-p"],
      { timeoutMs: remaining(deadline), maxBytes: 16 * 1024 * 1024 },
    );
    const b = r.stdout;
    captureBytes += b.length;
    requireCondition(
      frames.length < 64 && captureBytes <= 128 * 1024 * 1024,
      "CAPTURE_LIMIT",
      "Scenario capture budget exceeded64 frames/128MiB",
    );
    requireCondition(r.code === 0, "INVALID_CAPTURE", "ADB capture failed.");
    const { width, height } = validatePng(b);
    requireCondition(
      width === record.width && height === record.height,
      "DISPLAY_CHANGED",
      "Display dimensions differ from the reviewed input case.",
    );
    const path = join(folder, label + ".png");
    await writeFile(inside(workspace, path), b, { flag: "wx" });
    const item = {
      path,
      sha256: await hashFile(inside(workspace, path)),
      width,
      height,
      activity,
      elapsed_ms: Date.now() - began,
    };
    frames.push(item);
    return item;
  }
  try {
    await frame("before");
    for (let index = 0; index < record.actions.length; index++) {
      requireCondition(
        Date.now() - began < 120000,
        "PROCESS_TIMEOUT",
        "Android scenario exceeded 120 seconds.",
      );
      const action = record.actions[index]!;
      await foreground();
      const points =
        action.kind === "tap"
          ? [action]
          : action.kind === "hold"
            ? action.points
            : [];
      requireCondition(
        points.every((p) => p.x < record.width && p.y < record.height),
        "INVALID_INPUT",
        "Input coordinates exceed the reviewed display.",
      );
      if (action.kind === "tap")
        await call([
          "shell",
          "input",
          "tap",
          String(action.x),
          String(action.y),
        ]);
      else if (action.kind === "hold") {
        if (action.points.length === 1) {
          const p = action.points[0]!;
          await call([
            "shell",
            "input",
            "swipe",
            String(p.x),
            String(p.y),
            String(p.x),
            String(p.y),
            String(action.durationMs),
          ]);
        } else {
          const result = await call([
            "shell",
            "env",
            "CLASSPATH=" + remoteDex,
            "app_process",
            "/system/bin",
            "ReaTouch",
            String(action.durationMs),
            ...action.points.flatMap((p) => [String(p.x), String(p.y)]),
          ]);
          requireCondition(
            result.includes('"injected":true'),
            "ANDROID_FAILED",
            "Multi-touch helper did not confirm injection.",
          );
        }
      } else if (action.kind === "wait")
        await new Promise((done) => setTimeout(done, action.durationMs));
      else if (action.kind === "wait-until") {
        const deadline = Date.now() + action.timeoutMs;
        let matched = false,
          attempt = 0;
        do {
          requireCondition(
            Date.now() - began < 120000,
            "PROCESS_TIMEOUT",
            "Scenario exceeded120 seconds",
          );
          const captured = await frame(
            "guard-" + index + "-" + attempt++,
            deadline,
          );
          const crop = inside(
            workspace,
            join(folder, "guard-crop-" + index + "-" + attempt + ".png"),
          );
          const measurement = z
            .object({
              fraction: z.number().min(0).max(1),
              preparation: z
                .object({ source_sha256: z.string() })
                .passthrough(),
            })
            .passthrough()
            .parse(
              await python(
                "ui_signal.py",
                [
                  "--input",
                  inside(workspace, captured.path),
                  "--output",
                  crop,
                  "--roi",
                  JSON.stringify(action.signal.roi),
                  "--rgb",
                  JSON.stringify(action.signal.rgb),
                ],
                { timeoutMs: remaining(deadline), maxBytes: 32768 },
              ),
            );
          requireCondition(
            measurement.preparation.source_sha256 === captured.sha256,
            "EVIDENCE_CHANGED",
            "Guard capture changed",
          );
          matched =
            Date.now() <= deadline &&
            measurement.fraction >= action.signal.fraction.min &&
            measurement.fraction <= action.signal.fraction.max;
          guardAttempts.push({
            step: index,
            captured,
            measurement,
            matches: matched,
          });
          if (!matched && Date.now() < deadline)
            await new Promise((done) =>
              setTimeout(done, Math.min(action.pollMs, deadline - Date.now())),
            );
        } while (!matched && Date.now() < deadline);
        requireCondition(
          matched,
          "PHASE_NOT_REACHED",
          "Reviewed visible phase was not reached; later inputs were not sent.",
        );
      }
      steps.push({ index, action, after: await frame("after-" + index) });
    }
  } catch (error) {
    failure = String(error);
  } finally {
    if (remoteDex) await call(["shell", "rm", remoteDex]);
  }
  requireCondition(
    (await hashFile(adb)) === adbHash &&
      (!dex || (await hashFile(dex)) === dexHash),
    "EVIDENCE_CHANGED",
    "Android input tools changed during execution.",
  );
  const result = {
    case_id: record.caseId,
    execution_status: failure ? "failed" : "completed",
    failure: failure ?? null,
    serial: record.serial,
    package: record.package,
    selected_apks: apks,
    installed_apks: installed,
    adb: { path: adb, sha256: adbHash },
    touch_dex: dex ? { path: dex, sha256: dexHash } : null,
    frames,
    guard_attempts: guardAttempts,
    steps,
    assertions_status: "not_evaluated",
    does_not_prove: [
      "Expected gameplay state",
      "Visual or semantic parity",
      "Human acceptance",
    ],
  };
  return {
    ...result,
    ...(await retainReport(workspace, "android-scenario", result)),
  };
}
