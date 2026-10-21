import { inflateSync } from "node:zlib";
import { requireCondition } from "../domain/errors.js";
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(bytes: Buffer) {
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Validate complete PNG framing, CRCs and bounded inflated scanline length.
// Pixel/color interpretation remains the image decoder's responsibility.
export function validatePng(bytes: Buffer) {
  const valid = (value: unknown) =>
    requireCondition(
      value,
      "INVALID_CAPTURE",
      "Screenshot is not a complete supported PNG.",
    );
  valid(
    bytes.length >= 57 &&
      bytes.length <= 16 * 1024 * 1024 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  let offset = 8,
    width = 0,
    height = 0,
    bpp = 0,
    seenData = false,
    endedData = false,
    ended = false,
    chunkCount = 0;
  const data: Buffer[] = [];
  while (offset < bytes.length) {
    valid(++chunkCount <= 65536 && offset + 12 <= bytes.length);
    const length = bytes.readUInt32BE(offset),
      end = offset + 12 + length;
    valid(end <= bytes.length);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    valid(
      /^[A-Za-z]{4}$/.test(type) &&
        crc(bytes.subarray(offset + 4, end - 4)) ===
          bytes.readUInt32BE(end - 4),
    );
    if (offset === 8) {
      valid(type === "IHDR" && length === 13);
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      const depth = bytes[offset + 16]!,
        color = bytes[offset + 17]!;
      const channels = (
        { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>
      )[color];
      valid(
        width > 0 &&
          height > 0 &&
          width * height <= 16 * 1024 * 1024 &&
          channels &&
          [1, 2, 4, 8, 16].includes(depth) &&
          bytes[offset + 18] === 0 &&
          bytes[offset + 19] === 0 &&
          bytes[offset + 20] === 0,
      );
      valid(
        (color === 0 || color === 3 || depth === 8 || depth === 16) &&
          !(color === 3 && depth === 16),
      );
      bpp = depth * channels!;
    } else if (type === "IHDR") valid(false);
    if (type === "IDAT") {
      valid(!endedData);
      data.push(bytes.subarray(offset + 8, end - 4));
      seenData = true;
    } else if (seenData) endedData = true;
    if (type === "IEND") {
      valid(length === 0 && seenData && end === bytes.length);
      ended = true;
    }
    offset = end;
  }
  valid(ended);
  const row = Math.ceil((width * bpp) / 8) + 1,
    expected = row * height;
  valid(expected <= 128 * 1024 * 1024 + 16384);
  let decoded: Buffer;
  try {
    decoded = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
  } catch {
    requireCondition(
      false,
      "INVALID_CAPTURE",
      "PNG image stream is invalid or exceeds its decode budget.",
    );
  }
  valid(decoded!.length === expected);
  for (let y = 0; y < height; y++) valid(decoded![y * row]! <= 4);
  return { width, height };
}
