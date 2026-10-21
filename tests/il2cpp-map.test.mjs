import test from "node:test";
import assert from "node:assert/strict";
import { mapElfMethods } from "../dist/domain/il2cpp.js";
function elf(machine = 183) {
  if (machine === 40) {
    const b = Buffer.alloc(0x300);
    b.write("\x7fELF", 0, "binary");
    b[4] = 1;
    b[5] = 1;
    b[6] = 1;
    b.writeUInt16LE(3, 16);
    b.writeUInt16LE(40, 18);
    b.writeUInt32LE(52, 28);
    b.writeUInt16LE(32, 42);
    b.writeUInt16LE(1, 44);
    b.writeUInt32LE(1, 52);
    b.writeUInt32LE(0x100, 56);
    b.writeUInt32LE(0x4100, 60);
    b.writeUInt32LE(0x200, 68);
    b.writeUInt32LE(0x220, 72);
    b.writeUInt32LE(5, 76);
    return b;
  }
  const b = Buffer.alloc(0x300);
  b.write("\x7fELF", 0, "binary");
  b[4] = 2;
  b[5] = 1;
  b[6] = 1;
  b.writeUInt16LE(3, 16);
  b.writeUInt16LE(machine, 18);
  b.writeBigUInt64LE(64n, 32);
  b.writeUInt16LE(64, 52);
  b.writeUInt16LE(56, 54);
  b.writeUInt16LE(1, 56);
  b.writeUInt32LE(1, 64);
  b.writeUInt32LE(5, 68);
  b.writeBigUInt64LE(0x100n, 72);
  b.writeBigUInt64LE(0x4100n, 80);
  b.writeBigUInt64LE(0x200n, 96);
  b.writeBigUInt64LE(0x220n, 104);
  return b;
}
test("ELF map distinguishes provider RVA, ELF VA, file offset, absent pointers and shared aliases", () => {
  const r = mapElfMethods(
    elf(),
    [
      { name: "A", address: "0x4120" },
      { name: "B", address: "0x4120" },
      { name: "Abstract", address: "0x0" },
      { name: "BSS", address: "0x4301" },
    ],
    { runtimeBase: "0x70000000" },
  );
  assert.equal(r.methods[0].elf_va, "0x4120");
  assert.equal(r.methods[0].file_offset, "0x120");
  assert.equal(r.methods[0].image_relative_address, "0x20");
  assert.equal(r.methods[0].runtime_va, "0x70000020");
  assert.equal(r.methods[0].alias_count, 2);
  assert.equal(r.methods[2].status, "no_native_pointer");
  assert.equal(r.methods[3].status, "not_file_backed");
});
test("ARM Thumb normalization is explicit; unsafe numeric and malformed ELF addresses fail", () => {
  const r = mapElfMethods(elf(40), [{ name: "Thumb", address: "0x4121" }], {});
  assert.equal(r.methods[0].instruction_set, "thumb");
  assert.equal(r.methods[0].elf_va, "0x4120");
  assert.equal(r.methods[0].provider_address, "0x4121");
  assert.throws(
    () =>
      mapElfMethods(elf(), [{ name: "Unsafe", address: 9007199254740992 }], {}),
    /safe|integer/i,
  );
  const b = elf();
  b.writeBigUInt64LE(0xffffn, 72);
  assert.throws(() => mapElfMethods(b, [], {}), /segment/i);
});

test("ELF32 rejects load segments, method pointers and runtime addresses beyond its class width", () => {
  const b = elf(40);
  b.writeUInt32LE(0xfffffff0, 60);
  assert.throws(
    () => mapElfMethods(b, [{ name: "Overflow", address: "0x100000010" }], {}),
    /segment|width/i,
  );
  assert.throws(
    () =>
      mapElfMethods(
        elf(40),
        [{ name: "Overflow", address: "0x100000010" }],
        {},
      ),
    /width|address/i,
  );
  assert.throws(
    () =>
      mapElfMethods(elf(40), [{ name: "Thumb", address: "0x4121" }], {
        runtimeBase: "0x100000000",
      }),
    /width|address/i,
  );
});
