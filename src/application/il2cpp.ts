import { z } from "zod";
import { loadLedger } from "./store.js";
import { readEvidence, retainReport } from "./evidenceReports.js";
import { mapElfMethods, type NativeMethod } from "../domain/il2cpp.js";
import { requireCondition } from "../domain/errors.js";
const address = z.union([z.string().max(32), z.number().int().nonnegative()]);
const attribution = z
  .object({
    provider: z.string().min(1).max(200),
    version: z.string().min(1).max(100),
    binary_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    metadata_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function mapIl2cpp(x: {
  workspace: string;
  binary: string;
  metadata: string;
  map: string;
  provenance: string;
  format: "il2cppdumper-script" | "libcpp2il-jsonl";
  query?: string | undefined;
  assembly?: string | undefined;
  runtimeBase?: string | undefined;
  offset: number;
  limit: number;
}) {
  await loadLedger(x.workspace);
  const [binary, metadata, map, provenance] = await Promise.all([
    readEvidence(x.workspace, x.binary, 512 * 1024 * 1024),
    readEvidence(x.workspace, x.metadata),
    readEvidence(x.workspace, x.map),
    readEvidence(x.workspace, x.provenance, 16384),
  ]);
  const origin = attribution.parse(
    JSON.parse(provenance.bytes.toString("utf8")),
  );
  requireCondition(
    origin.binary_sha256 === binary.source.sha256 &&
      origin.metadata_sha256 === metadata.source.sha256,
    "MAPPING_MISMATCH",
    "Analyzer provenance does not match the selected binary and metadata hashes.",
  );
  requireCondition(
    metadata.bytes.length >= 8 && metadata.bytes.readUInt32LE(0) === 0xfab11baf,
    "INVALID_METADATA",
    "Expected plain IL2CPP metadata magic.",
  );
  let methods: NativeMethod[];
  if (x.format === "il2cppdumper-script") {
    const script = z
      .object({
        ScriptMethod: z
          .array(
            z
              .object({
                Address: address,
                Name: z.string().max(8192),
                Signature: z.string().max(32768).optional(),
              })
              .passthrough(),
          )
          .max(200000),
      })
      .passthrough()
      .parse(JSON.parse(map.bytes.toString("utf8")));
    methods = script.ScriptMethod.map((m) => ({
      name: m.Name,
      address: m.Address,
      ...(m.Signature === undefined ? {} : { signature: m.Signature }),
    }));
  } else {
    const lines = map.bytes
      .toString("utf8")
      .split("\n")
      .filter((l) => l.trim());
    requireCondition(
      lines.length <= 200000,
      "INPUT_LIMIT",
      "Method catalog exceeds 200000 rows.",
    );
    const row = z
      .object({
        assembly: z.string().max(1024),
        token: z.string().regex(/^0x06[\da-f]{6}$/i),
        full_name: z.string().max(8192),
        signature: z.string().max(32768),
        virtual_address: address,
        rva: z.string().max(32),
        file_offset: z.number().int().nonnegative().nullable(),
        has_native_pointer: z.boolean(),
      })
      .passthrough();
    methods = lines.map((l) => {
      const r = row.parse(JSON.parse(l));
      return {
        name: r.full_name,
        address: r.has_native_pointer ? r.virtual_address : "0x0",
        assembly: r.assembly,
        token: r.token,
        signature: r.signature,
        reported_rva: r.rva,
        ...(r.has_native_pointer && r.file_offset !== null
          ? { reported_offset: r.file_offset }
          : {}),
      };
    });
  }
  const all = mapElfMethods(binary.bytes, methods, {
    runtimeBase: x.runtimeBase,
  });
  const selected = all.methods.filter(
    (m) =>
      (x.query === undefined ||
        m.name.toLowerCase().includes(x.query.toLowerCase()) ||
        m.signature?.toLowerCase().includes(x.query.toLowerCase())) &&
      (x.assembly === undefined || m.assembly === x.assembly),
  );
  const result = {
    ...all,
    methods: selected.slice(x.offset, x.offset + x.limit),
    total_methods: methods.length,
    matched_methods: selected.length,
    offset: x.offset,
    truncated: selected.length > x.offset + x.limit,
    sources: [binary.source, metadata.source, map.source, provenance.source],
    attribution: origin,
    association:
      "provider_reported; hashes bind the imported output but do not independently prove its metadata-to-code association",
    metadata_version: metadata.bytes.readUInt32LE(4),
    does_not_prove: [
      "original C# bodies",
      "runtime feature selection",
      "generic instantiation identity for shared native code",
      "runtime load address without observed mapping",
    ],
    next: "Use the qualified ELF VA with core open_binary/procedure_pseudo_code/xrefs; inspect the core schemas first.",
  };
  return {
    ...result,
    ...(await retainReport(x.workspace, "il2cpp-map", result)),
  };
}
