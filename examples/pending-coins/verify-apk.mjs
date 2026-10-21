// Siege Squad case driver. Fresh recovery is preferred; imported catalogs remain explicitly attributed.
import {
  mkdir,
  readdir,
  copyFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { execute } from "../../dist/operations.js";
const [apkDirectory, catalogDirectory, root] = process.argv.slice(2);
const fresh = catalogDirectory === "fresh";
if (
  !apkDirectory ||
  !isAbsolute(apkDirectory) ||
  !root ||
  !isAbsolute(root) ||
  (!fresh && (!catalogDirectory || !isAbsolute(catalogDirectory)))
)
  throw Error(
    "Usage: node scripts/verify-real-apk.mjs /absolute/apk-directory fresh|/absolute/LibCpp2IL-catalog /absolute/NEW-output",
  );
await mkdir(root);
const splits = join(root, "apk-splits");
await mkdir(splits);
const names = (await readdir(apkDirectory)).filter((n) => n.endsWith(".apk"));
if (!names.length) throw Error("No APK leaves selected.");
for (const name of names)
  await copyFile(join(apkDirectory, name), join(splits, name));
const workspace = join(root, "source-workspace");
async function call(name, args) {
  const r = await execute(name, args);
  if (!r.ok) throw Error(JSON.stringify(r));
  return r.data;
}
await call("init", {
  input: splits,
  workspace,
  authorization:
    "User-authorized Unity feature investigation; supplied APK leaves copied to isolated verification workspace",
});
const ledger = JSON.parse(await readFile(join(workspace, "restoration.json")));
const manifest = JSON.parse(
  await readFile(join(workspace, ledger.manifest_path)),
);
const paths = manifest.extracted.map((r) => relative(workspace, r.path));
function unique(suffix) {
  const selected = paths.filter((p) => p.endsWith(suffix));
  if (selected.length !== 1)
    throw Error("Artifact selection must be unique: " + suffix);
  return selected[0];
}
const binary = unique("lib/arm64-v8a/libil2cpp.so"),
  metadata = unique("global-metadata.dat"),
  bundle = unique("data.unity3d");
const unpack = await call("unpack-bundle", { workspace, path: bundle });
let map,
  fresh_recovery = null;
if (fresh) {
  fresh_recovery = await call("recover-il2cpp", {
    workspace,
    binary,
    metadata,
    provider: "auto",
    unityVersion: unpack.engine,
    toolVersion:
      "ReaIl2CppIndexer/LibCpp2IL b5ad444; observed summary retained",
    query: "CurrencyManager::",
  });
  map = fresh_recovery.mapping;
} else {
  await copyFile(
    join(catalogDirectory, "methods.jsonl"),
    join(workspace, "reports/methods.jsonl"),
  );
  await copyFile(
    join(catalogDirectory, "summary.json"),
    join(workspace, "reports/index-summary.json"),
  );
  const summary = JSON.parse(
    await readFile(join(catalogDirectory, "summary.json")),
  );
  await writeFile(
    join(workspace, "reports/map-provenance.json"),
    JSON.stringify({
      provider: "Il2CppEvidenceIndexer/LibCpp2IL (imported external output)",
      version: summary.generator.cpp2il_commit,
      binary_sha256: summary.inputs.binary_sha256,
      metadata_sha256: summary.inputs.metadata_sha256,
    }),
  );
  map = await call("map-il2cpp", {
    workspace,
    binary,
    metadata,
    map: "reports/methods.jsonl",
    provenance: "reports/map-provenance.json",
    format: "libcpp2il-jsonl",
    query: "CurrencyManager::",
    assembly: "Assembly-CSharp",
  });
}
const context = {
  workspace,
  binary,
  metadata,
  bundle,
  map,
  unpack,
  fresh_recovery,
};
await writeFile(
  join(root, "static-context.json"),
  JSON.stringify(context, null, 2),
);
const admitted = unpack.members
  .filter((m) => m.flags === 4 && !m.path.endsWith(".resS"))
  .map((m) => unpack.output + "/" + m.path);
const references = await call("trace-references", {
  workspace,
  paths: admitted,
  path: unpack.output + "/level2",
  pathId: "19",
  maxDepth: 3,
  maxNodes: 100,
});
await writeFile(
  join(root, "references.json"),
  JSON.stringify({ ok: true, data: references }, null, 2),
);
console.log(
  JSON.stringify(
    {
      scope: fresh
        ? "Siege Squad APK static evidence; catalog freshly recovered by configured analyzer"
        : "Siege Squad APK static evidence; catalog explicitly imported",
      workspace,
      total_methods: map.total_methods,
      bundle_bytes: unpack.uncompressed_bytes,
      reference_status: references.status,
      nodes: references.nodes.length,
      edges: references.edges.length,
    },
    null,
    2,
  ),
);
