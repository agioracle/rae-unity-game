import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("docs/vendor-provenance.json", root), "utf8"),
);
for (const file of manifest.files) {
  const bytes = await readFile(new URL(file.path, root));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== file.sha256)
    throw new Error(`Vendored source drift: ${file.path}`);
}
process.stdout.write(
  `Verified ${manifest.files.length} vendored files against recorded SHA-256 digests.\n`,
);
