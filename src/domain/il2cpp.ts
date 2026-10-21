import { requireCondition } from "./errors.js";
export interface NativeMethod {
  name: string;
  address: string | number;
  assembly?: string;
  token?: string;
  signature?: string;
  reported_rva?: string;
  reported_offset?: number;
}
function integer(v: string | number): bigint {
  requireCondition(
    typeof v === "string"
      ? /^(?:0x[\da-f]+|\d+)$/i.test(v)
      : Number.isSafeInteger(v) && v >= 0,
    "INVALID_ADDRESS",
    "Address must be an unsigned exact integer; use strings above the safe integer range.",
  );
  const n = BigInt(v);
  requireCondition(
    n <= 0xffffffffffffffffn,
    "INVALID_ADDRESS",
    "Address exceeds uint64.",
  );
  return n;
}
const hex = (n: bigint) => `0x${n.toString(16)}`;
export function mapElfMethods(
  binary: Buffer,
  methods: NativeMethod[],
  options: { runtimeBase?: string | undefined },
) {
  const check = (yes: unknown, message: string) =>
    requireCondition(yes, "INVALID_ELF", message);
  check(
    binary.length >= 64 &&
      binary.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])),
    "Expected an on-disk ELF, not a memory dump, PE or Mach-O.",
  );
  const bits = binary[4] === 2 ? 64 : binary[4] === 1 ? 32 : 0;
  check(
    bits && binary[5] === 1 && binary[6] === 1,
    "Only little-endian ELF32/ELF64 version 1 is supported.",
  );
  const addressLimit = bits === 32 ? 0x100000000n : 0x10000000000000000n;
  const machine = binary.readUInt16LE(18);
  check([3, 40, 62, 183].includes(machine), "Unsupported ELF machine.");
  check(
    machine === 3 || machine === 40 ? bits === 32 : bits === 64,
    "ELF machine and address width disagree.",
  );
  const u = (p: number) =>
    bits === 64 ? binary.readBigUInt64LE(p) : BigInt(binary.readUInt32LE(p));
  const phoff = u(bits === 64 ? 32 : 28),
    entsize = binary.readUInt16LE(bits === 64 ? 54 : 42),
    count = binary.readUInt16LE(bits === 64 ? 56 : 44);
  check(
    count > 0 &&
      count <= 4096 &&
      entsize >= (bits === 64 ? 56 : 32) &&
      phoff + BigInt(entsize * count) <= BigInt(binary.length),
    "Invalid program segment table.",
  );
  const segments: {
    offset: bigint;
    va: bigint;
    size: bigint;
    mem: bigint;
    flags: number;
  }[] = [];
  for (let i = 0; i < count; i++) {
    const p = Number(phoff) + i * entsize;
    if (binary.readUInt32LE(p) !== 1) continue;
    const offset = u(p + (bits === 64 ? 8 : 4)),
      va = u(p + (bits === 64 ? 16 : 8)),
      size = u(p + (bits === 64 ? 32 : 16)),
      mem = u(p + (bits === 64 ? 40 : 20)),
      flags = binary.readUInt32LE(p + (bits === 64 ? 4 : 24));
    check(
      size <= mem &&
        offset + size <= BigInt(binary.length) &&
        va + mem <= addressLimit,
      "Invalid load segment bounds.",
    );
    segments.push({ offset, va, size, mem, flags });
  }
  check(segments.length > 0, "ELF has no load segment.");
  const base = segments.reduce(
    (a, s) => (s.va < a ? s.va : a),
    segments[0]!.va,
  );
  const runtime =
    options.runtimeBase === undefined
      ? undefined
      : integer(options.runtimeBase);
  requireCondition(
    runtime === undefined || runtime < addressLimit,
    "INVALID_ADDRESS",
    "Runtime address exceeds ELF class width.",
  );
  const addresses = methods.map((m) => {
    let a = integer(m.address);
    requireCondition(
      a < addressLimit,
      "INVALID_ADDRESS",
      "Method address exceeds ELF class width.",
    );
    if (machine === 40) a &= ~1n;
    return a;
  });
  const aliases = new Map<string, number>();
  for (const a of addresses)
    if (a) aliases.set(hex(a), (aliases.get(hex(a)) ?? 0) + 1);
  const mapped = methods.map((m, i) => {
    const original = integer(m.address),
      a = addresses[i]!;
    const common = {
      name: m.name,
      assembly: m.assembly ?? null,
      token: m.token ?? null,
      signature: m.signature ?? null,
      provider_address: hex(original),
      provider_reported_rva: m.reported_rva ?? null,
      elf_va: hex(a),
      instruction_set:
        machine === 40
          ? original & 1n
            ? "thumb"
            : "arm"
          : machine === 183
            ? "arm64"
            : machine === 62
              ? "x86_64"
              : "x86",
      alias_count: aliases.get(hex(a)) ?? 0,
    };
    if (a === 0n)
      return {
        ...common,
        status: "no_native_pointer",
        file_offset: null,
        image_relative_address: null,
        runtime_va: null,
      };
    const matches = segments.filter(
      (s) => (s.flags & 1) !== 0 && s.va <= a && a < s.va + s.size,
    );
    if (matches.length !== 1)
      return {
        ...common,
        status: matches.length ? "ambiguous_segment" : "not_file_backed",
        file_offset: null,
        image_relative_address: null,
        runtime_va: null,
      };
    const offset = matches[0]!.offset + a - matches[0]!.va;
    if (m.reported_offset !== undefined)
      requireCondition(
        Number.isSafeInteger(m.reported_offset) &&
          BigInt(m.reported_offset) === offset,
        "MAPPING_MISMATCH",
        "Provider file offset disagrees with ELF load segment.",
      );
    const rva = a - base;
    requireCondition(
      runtime === undefined || runtime + rva < addressLimit,
      "INVALID_ADDRESS",
      "Runtime address exceeds ELF class width.",
    );
    return {
      ...common,
      status: "mapped",
      file_offset: hex(offset),
      image_relative_address: hex(rva),
      runtime_va: runtime === undefined ? null : hex(runtime + rva),
    };
  });
  return {
    format: `ELF${bits}`,
    machine,
    image_base: hex(base),
    runtime_base: runtime === undefined ? null : hex(runtime),
    runtime_base_definition:
      "Runtime address corresponding to the lowest PT_LOAD virtual address; supply only from observed mappings.",
    methods: mapped,
  };
}
