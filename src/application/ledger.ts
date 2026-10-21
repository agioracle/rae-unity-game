import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AppError, requireCondition } from "../domain/errors.js";
import {
  acceptanceSchema,
  claimSchema,
  coverageSchema,
  inventorySchema,
  markerSchema,
  roadmapSchema,
  type Ledger,
} from "../domain/model.js";
import {
  loadLedger,
  mutateLedger,
  verifySources,
  noSymlinks,
} from "./store.js";

export function gates(l: Ledger) {
  const recovery_accounted =
    l.recovery.length >= 7 &&
    l.recovery.every(
      (r) =>
        r.status !== "pending" &&
        (r.status === "recovered" ||
          r.status === "not_applicable" ||
          r.attempts.length > 0),
    );
  const material_gaps = l.recovery
    .filter(
      (r) =>
        r.material_to_mvp &&
        r.status !== "recovered" &&
        r.status !== "not_applicable",
    )
    .map((r) => r.id);
  const c = l.roadmap.card;
  const claims_ready =
    !!c &&
    c.claim_ids.every((id) => {
      const claim = l.claims.find((x) => x.id === id);
      return (
        claim &&
        claim.sources.length > 0 &&
        !claim.truncated &&
        claim.unresolved.length === 0 &&
        ["exact", "derived", "inferred"].includes(claim.evidence_verdict)
      );
    });
  const implementation_allowed =
    recovery_accounted &&
    material_gaps.length === 0 &&
    claims_ready &&
    !!c &&
    c.blockers.length === 0;
  const a = l.roadmap.acceptance;
  const currentAcceptance =
    !!a && !!l.roadmap.ready_version && a.version === l.roadmap.ready_version;
  return {
    recovery_accounted,
    material_gaps,
    claims_ready,
    implementation_allowed,
    post_mvp_allowed:
      implementation_allowed &&
      currentAcceptance &&
      ((l.roadmap.checkpoint === "accepted" && a.decision === "accepted") ||
        (l.roadmap.checkpoint === "ready_for_user_playtest" &&
          a.decision === "waived")),
  };
}
function invalidate(l: Ledger) {
  if (l.roadmap.acceptance)
    l.history.push({
      at: new Date().toISOString(),
      revision: l.revision,
      operation: "invalidated-acceptance",
      detail: JSON.stringify({
        acceptance: l.roadmap.acceptance,
        ready_version: l.roadmap.ready_version,
      }),
    });
  l.roadmap.acceptance = null;
  l.roadmap.checkpoint = "not_ready";
  l.roadmap.ready_version = null;
  if (["P2", "P3"].includes(l.roadmap.phase)) l.roadmap.phase = "P1";
}
async function verifyReadyEvidence(
  l: Ledger,
  workspace: string,
  version: string,
) {
  requireCondition(
    gates(l).implementation_allowed,
    "GATE_BLOCKED",
    "Recovery, material evidence, claims or roadmap blockers prevent first-playable readiness.",
  );
  const card = l.roadmap.card!;
  const markers = card.marker_ids.map((id) =>
    l.markers.find((m) => m.id === id),
  );
  requireCondition(
    markers.length > 0 &&
      markers.every((m) => m && m.result === "pass" && m.build === version) &&
      markers.some((m) => m && ["V2", "V4"].includes(m.layer)),
    "GATE_BLOCKED",
    "Ready requires passing markers for this version, including V2 runtime or V4 Player/device evidence.",
  );
  for (const record of l.recovery)
    await verifySources(workspace, record.sources);
  for (const id of card.claim_ids)
    await verifySources(workspace, l.claims.find((c) => c.id === id)!.sources);
  for (const marker of markers)
    await verifySources(workspace, marker!.artifacts);
}
export async function status(workspace: string) {
  const l = await loadLedger(workspace);
  return {
    schema_version: l.schema_version,
    revision: l.revision,
    authorization: l.authorization,
    backend: l.backend,
    identity_status: l.identity_status,
    recovery: l.recovery.map(({ id, category, status, material_to_mvp }) => ({
      id,
      category,
      status,
      material_to_mvp,
    })),
    claim_count: l.claims.length,
    marker_count: l.markers.length,
    roadmap: l.roadmap,
    gates: gates(l),
    ledger_path: join(workspace, "restoration.json"),
    does_not_prove: [
      "Reported tool results have been independently reproduced.",
      "Original game parity.",
    ],
  };
}
export async function recordRecovery(workspace: string, input: unknown) {
  const record = coverageSchema.parse(input);
  return await mutateLedger(workspace, "record-recovery", async (l) => {
    requireCondition(
      record.id === record.category,
      "INVALID_COVERAGE",
      "Use the category name as recovery ID.",
    );
    requireCondition(
      record.status !== "recovered" || record.sources.length > 0,
      "INVALID_COVERAGE",
      "Recovered outcomes require hashed source artifacts.",
    );
    requireCondition(
      record.status === "pending" || record.reason.trim().length > 0,
      "INVALID_COVERAGE",
      "Accounted outcomes require a reason.",
    );
    requireCondition(
      !["unsupported", "failed"].includes(record.status) ||
        record.attempts.length > 0,
      "INVALID_COVERAGE",
      "Failed and unsupported outcomes require concrete attempts.",
    );
    await verifySources(workspace, record.sources);
    const index = l.recovery.findIndex((r) => r.id === record.id);
    if (index >= 0) {
      l.history.push({
        at: new Date().toISOString(),
        revision: l.revision,
        operation: "previous-recovery",
        detail: JSON.stringify(l.recovery[index]),
      });
      l.recovery[index] = record;
    } else l.recovery.push(record);
    invalidate(l);
    return { record, gates: gates(l) };
  });
}
export async function recordClaim(workspace: string, input: unknown) {
  const record = claimSchema.parse(input);
  return await mutateLedger(workspace, "record-claim", async (l) => {
    requireCondition(
      !l.claims.some((x) => x.id === record.id),
      "DUPLICATE_ID",
      "Claim ID already exists; create a new versioned ID.",
    );
    requireCondition(
      !["exact", "derived"].includes(record.evidence_verdict) ||
        record.sources.length > 0,
      "INVALID_CLAIM",
      "Exact and derived claims need hashed sources.",
    );
    requireCondition(
      record.evidence_grade !== "design_fill" ||
        !["exact", "derived"].includes(record.evidence_verdict),
      "INVALID_CLAIM",
      "Design fill cannot establish exact or derived original evidence.",
    );
    await verifySources(workspace, record.sources);
    l.claims.push(record);
    invalidate(l);
    return { record };
  });
}
export async function recordMarker(workspace: string, input: unknown) {
  const record = markerSchema.parse(input);
  return await mutateLedger(workspace, "record-marker", async (l) => {
    requireCondition(
      !l.markers.some((x) => x.id === record.id),
      "DUPLICATE_ID",
      "Marker ID already exists; create a new versioned ID.",
    );
    await verifySources(workspace, record.artifacts);
    l.markers.push(record);
    invalidate(l);
    return { record, reported_result: true, independently_reproduced: false };
  });
}
export async function setRoadmap(workspace: string, input: unknown) {
  const card = roadmapSchema.parse(input);
  return await mutateLedger(workspace, "set-roadmap", async (l) => {
    for (const id of card.claim_ids)
      requireCondition(
        l.claims.some((c) => c.id === id),
        "UNKNOWN_CLAIM",
        `Unknown claim: ${id}`,
      );
    if (l.roadmap.card)
      l.history.push({
        at: new Date().toISOString(),
        revision: l.revision,
        operation: "previous-roadmap",
        detail: JSON.stringify(l.roadmap),
      });
    l.roadmap.card = card;
    invalidate(l);
    if (gates(l).implementation_allowed && l.roadmap.phase === "P0")
      l.roadmap.phase = "P1";
    return { roadmap: l.roadmap, gates: gates(l) };
  });
}
export async function ready(workspace: string, version: string) {
  return await mutateLedger(workspace, "ready", async (l) => {
    await verifyReadyEvidence(l, workspace, version);
    invalidate(l);
    l.roadmap.phase = "P2";
    l.roadmap.checkpoint = "ready_for_user_playtest";
    l.roadmap.ready_version = version;
    return {
      roadmap: l.roadmap,
      next: "Provide startup steps and limits; request explicit human playtest acceptance.",
    };
  });
}
export async function recordAcceptance(workspace: string, input: unknown) {
  const record = acceptanceSchema.parse(input);
  return await mutateLedger(workspace, "record-acceptance", async (l) => {
    requireCondition(
      l.roadmap.checkpoint === "ready_for_user_playtest" ||
        l.roadmap.checkpoint === "changes_requested",
      "NOT_READY",
      "First playable must be ready before recording its acceptance.",
    );
    requireCondition(
      record.version === l.roadmap.ready_version,
      "VERSION_MISMATCH",
      "Acceptance must identify the current ready version.",
    );
    if (record.decision !== "changes_requested")
      await verifyReadyEvidence(l, workspace, record.version);
    if (l.roadmap.acceptance)
      l.history.push({
        at: new Date().toISOString(),
        revision: l.revision,
        operation: "previous-acceptance",
        detail: JSON.stringify(l.roadmap.acceptance),
      });
    l.roadmap.acceptance = record;
    l.roadmap.checkpoint =
      record.decision === "accepted"
        ? "accepted"
        : record.decision === "changes_requested"
          ? "changes_requested"
          : "ready_for_user_playtest";
    return {
      roadmap: l.roadmap,
      notice:
        "The caller records the explicit human statement; tool success is not human acceptance.",
    };
  });
}
export async function advance(workspace: string) {
  return await mutateLedger(workspace, "advance", async (l) => {
    requireCondition(
      gates(l).post_mvp_allowed,
      "USER_ACCEPTANCE_REQUIRED",
      "Post-MVP work requires explicit versioned human acceptance or a separate gate waiver.",
    );
    await verifyReadyEvidence(l, workspace, l.roadmap.ready_version!);
    l.roadmap.phase = "P3";
    return { roadmap: l.roadmap };
  });
}
export async function plan(workspace: string) {
  const l = await loadLedger(workspace);
  const p = join(workspace, l.inventory_path);
  await noSymlinks(p);
  const inventory = inventorySchema.parse(
    JSON.parse(await readFile(p, "utf8")),
  );
  const il2cpp = l.backend === "IL2CPP",
    mono = l.backend === "Mono_candidate";
  return {
    backend: l.backend,
    unity_versions: inventory.unity_versions_found,
    identity_status: l.identity_status,
    gates: gates(l),
    stages: [
      {
        id: "identity",
        tools: ["apksigner", "apkanalyzer"],
        task: "Verify package ID, version and signer across supplied Android leaves. Desktop scope needs its own recorded identity.",
        boundary: "Archive names do not establish package identity.",
      },
      {
        id: "code",
        tools: il2cpp
          ? ["Cpp2IL", "Il2CppInspectorRedux", "REA/Ghidra"]
          : mono
            ? ["ilspycmd", "REA managed analysis"]
            : [],
        task: il2cpp
          ? "Pair metadata with the matching ABI binary; export metadata/address indexes; inspect required native bodies."
          : mono
            ? "Recover available managed IL/method bodies and verify representative tokens."
            : "Find missing backend evidence before selecting a decompiler.",
        boundary:
          "Do not label dummy DLLs or pseudocode as recovered original source.",
      },
      {
        id: "assets",
        tools: ["AssetRipper", "UnityDataTools", "UnityPy"],
        task: "Preserve raw objects, attempt supported exports, retain IDs and dependencies; account for all failures.",
        boundary:
          "Exporter output is derived evidence, not the original editable project.",
      },
      {
        id: "implementation",
        tools: ["Unity Editor MCP", "Unity CLI"],
        task: "Choose one source-backed loop; promote only its dependency closure; validate normal input and repeat path.",
        boundary:
          "One owner for Editor mutations. User playtest acceptance gates post-MVP work.",
      },
    ],
    pending: l.recovery.filter((r) => r.status === "pending").map((r) => r.id),
    warnings: inventory.warnings,
    next: "Use record-recovery for every category, record-claim for exact source chains, then set-roadmap.",
  };
}
