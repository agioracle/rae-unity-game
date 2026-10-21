import { z } from "zod";
export const text = z
  .string()
  .trim()
  .min(1)
  .max(16000)
  .refine((s) => !s.includes("\0"), "NUL is not allowed");
export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceSchema = z
  .object({
    path: text,
    sha256: digest,
    locator: z
      .object({
        domain: z.enum([
          "path_field",
          "unity_guid_fileid",
          "unity_pathid",
          "managed_token",
          "native_rva",
          "native_va",
          "native_file_offset",
          "capture_case",
        ]),
        value: text,
      })
      .strict(),
  })
  .strict();
export const claimSchema = z
  .object({
    id,
    question: text,
    claim: text,
    evidence_grade: z.enum([
      "A_direct_static",
      "B_structural",
      "C_runtime_observation",
      "design_fill",
      "unknown",
    ]),
    evidence_verdict: z.enum([
      "exact",
      "derived",
      "inferred",
      "temporary_approximation",
      "evidence_blocked",
      "product_override",
    ]),
    sources: z.array(sourceSchema).max(100),
    proves: z.array(text).min(1).max(40),
    does_not_prove: z.array(text).min(1).max(40),
    unresolved: z.array(text).max(40),
    filtered_or_sampled: z.boolean(),
    truncated: z.boolean(),
  })
  .strict();
export const coverageSchema = z
  .object({
    id,
    category: z.enum([
      "identity",
      "managed",
      "il2cpp",
      "native",
      "assets",
      "configs",
      "android",
      "other",
    ]),
    scope: text,
    status: z.enum([
      "pending",
      "recovered",
      "unsupported",
      "failed",
      "not_applicable",
    ]),
    sources: z.array(sourceSchema).max(100),
    attempts: z.array(text).max(40),
    reason: text,
    affected_consumers: z.array(text).max(100),
    material_to_mvp: z.boolean(),
  })
  .strict();
export const markerSchema = z
  .object({
    id,
    case_id: id,
    layer: z.enum(["V0", "V1", "V2", "V3", "V4"]),
    result: z.enum(["pass", "fail", "blocked", "partial"]),
    build: text,
    steps: text,
    environment: text,
    artifacts: z.array(sourceSchema).min(1).max(100),
    proves: z.array(text).min(1).max(40),
    does_not_prove: z.array(text).min(1).max(40),
  })
  .strict();
export const roadmapSchema = z
  .object({
    outcome: text,
    entry: text,
    interaction: text,
    state_owner: text,
    lifecycle_owner: text,
    observable_outcome: text,
    repeat_path: text,
    startup_steps: z.array(text).min(1).max(30),
    claim_ids: z.array(id).min(1).max(100),
    marker_ids: z.array(id).max(100),
    blockers: z.array(text).max(100),
  })
  .strict();
export const acceptanceSchema = z
  .object({
    decision: z.enum(["accepted", "changes_requested", "waived"]),
    statement: text,
    version: text,
    scope: text,
  })
  .strict();
export const inventorySchema = z
  .object({
    schema_version: z.literal(1),
    backend_assessment: text,
    status: text,
    unity_versions_found: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .passthrough();
export const ledgerSchema = z
  .object({
    schema_version: z.literal(1),
    revision: z.number().int().nonnegative(),
    created_at: text,
    updated_at: text,
    authorization: text,
    input: text,
    backend: text,
    inventory_path: text,
    manifest_path: text,
    identity_status: z.literal("unverified"),
    recovery: z.array(coverageSchema),
    claims: z.array(claimSchema),
    markers: z.array(markerSchema),
    roadmap: z
      .object({
        phase: z.enum(["P0", "P1", "P2", "P3"]),
        checkpoint: z.enum([
          "not_ready",
          "ready_for_user_playtest",
          "changes_requested",
          "accepted",
        ]),
        card: roadmapSchema.nullable(),
        acceptance: acceptanceSchema.nullable(),
        ready_version: text.nullable(),
      })
      .strict(),
    history: z.array(
      z
        .object({
          at: text,
          operation: text,
          revision: z.number().int(),
          detail: text,
        })
        .strict(),
    ),
  })
  .strict();
export type Ledger = z.infer<typeof ledgerSchema>;
export type Source = z.infer<typeof sourceSchema>;
