import { readdir, lstat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { noSymlinks, selectedPath, hashFile } from "./store.js";
import { requireCondition } from "../domain/errors.js";
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export async function inspectTarget(targetProject: string) {
  const root = await selectedPath(targetProject);
  await noSymlinks(root);
  for (const dir of ["Assets", "Packages", "ProjectSettings"])
    requireCondition(
      (await lstat(join(root, dir))).isDirectory(),
      "INVALID_PROJECT",
      `Unity project requires ${dir}.`,
    );
  const rows: { path: string; sha256: string }[] = [],
    guids: Record<string, string[]> = {},
    assemblies: { path: string; definition: unknown }[] = [],
    scripts: { path: string; namespaces: string[] }[] = [];
  const orphan_metadata: string[] = [];
  let visited = 0,
    bytes = 0;
  const contents = new Map<string, string>();
  async function walk(dir: string) {
    for (const name of (await readdir(dir)).sort()) {
      const p = join(dir, name),
        st = await lstat(p);
      requireCondition(
        ++visited <= 30000,
        "PROJECT_LIMIT",
        "Target inventory exceeds 30000 entries.",
      );
      requireCondition(
        !st.isSymbolicLink(),
        "UNSAFE_PATH",
        "Target inventory cannot traverse symlinks.",
      );
      if (st.isDirectory()) {
        await walk(p);
        continue;
      }
      requireCondition(
        st.isFile(),
        "UNSAFE_PATH",
        "Target inventory requires regular files.",
      );
      const path = relative(root, p).replaceAll("\\", "/");
      if (
        !/\.(?:cs|asmdef|asmref|meta|json|txt|asset|prefab|unity|uxml|uss|inputactions)$/i.test(
          name,
        )
      ) {
        rows.push({
          path,
          sha256: digest({ size: st.size, mtime: st.mtimeMs }),
        });
        continue;
      }
      requireCondition(
        st.size <= 4 * 1024 * 1024 && (bytes += st.size) <= 64 * 1024 * 1024,
        "PROJECT_LIMIT",
        "Target text inventory exceeds its byte budget.",
      );
      const sha256 = await hashFile(p),
        text = await readFile(p, "utf8");
      requireCondition(
        (await hashFile(p)) === sha256,
        "TARGET_CHANGED",
        "Target changed during profiling.",
      );
      rows.push({ path, sha256 });
      if (
        path.startsWith("ProjectSettings/") ||
        path === "Packages/manifest.json"
      )
        contents.set(path, text);
      if (name.endsWith(".meta")) {
        const guid = /^guid:\s*([a-f\d]{32})\s*$/im
          .exec(text)?.[1]
          ?.toLowerCase();
        if (guid) {
          try {
            const asset = await lstat(p.slice(0, -5));
            requireCondition(
              !asset.isSymbolicLink() &&
                (asset.isFile() || asset.isDirectory()),
              "UNSAFE_PATH",
              "GUID metadata must identify a regular asset or directory.",
            );
            (guids[guid] ??= []).push(path.slice(0, -5));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            orphan_metadata.push(path);
          }
        }
      }
      if (name.endsWith(".asmdef")) {
        let definition: unknown;
        try {
          definition = JSON.parse(text);
        } catch {
          definition = { invalid_json: true };
        }
        assemblies.push({ path, definition });
      }
      if (name.endsWith(".cs"))
        scripts.push({
          path,
          namespaces: [...text.matchAll(/\bnamespace\s+([\w.]+)/g)].map(
            (m) => m[1]!,
          ),
        });
    }
  }
  for (const dir of ["Assets", "Packages", "ProjectSettings"])
    await walk(join(root, dir));
  const version = contents.get("ProjectSettings/ProjectVersion.txt"),
    manifest = contents.get("Packages/manifest.json");
  requireCondition(
    version && manifest,
    "INVALID_PROJECT",
    "Target requires ProjectVersion.txt and Packages/manifest.json.",
  );
  const packages = JSON.parse(manifest) as {
    dependencies?: Record<string, string>;
  };
  requireCondition(
    packages.dependencies &&
      typeof packages.dependencies === "object" &&
      !Array.isArray(packages.dependencies),
    "INVALID_PROJECT",
    "Package manifest requires dependencies.",
  );
  const player = contents.get("ProjectSettings/ProjectSettings.asset") ?? "",
    graphics = contents.get("ProjectSettings/GraphicsSettings.asset") ?? "",
    editor = contents.get("ProjectSettings/EditorSettings.asset") ?? "";
  const input = /^\s*activeInputHandler:\s*(\d+)/m.exec(player)?.[1];
  return {
    root,
    editor_version:
      /^m_EditorVersion:\s*(.+)$/m.exec(version)?.[1]?.trim() ?? null,
    packages: packages.dependencies,
    input:
      input === "0"
        ? "legacy"
        : input === "1"
          ? "input_system"
          : input === "2"
            ? "both"
            : "unknown",
    render_pipeline: /m_CustomRenderPipeline:\s*\{fileID:\s*0\}/.test(graphics)
      ? "built_in"
      : /m_CustomRenderPipeline:/.test(graphics)
        ? "custom_or_srp"
        : "unknown",
    domain_reload_settings: {
      enabled: /enterPlayModeOptionsEnabled:\s*(\d+)/.exec(editor)?.[1] ?? null,
      options: /enterPlayModeOptions:\s*(\d+)/.exec(editor)?.[1] ?? null,
    },
    assemblies,
    scripts: {
      count: scripts.length,
      examples: scripts.slice(0, 30),
      truncated: scripts.length > 30,
    },
    guids,
    orphan_metadata,
    duplicate_guids: Object.entries(guids)
      .filter(([, paths]) => paths.length > 1)
      .map(([guid, paths]) => ({ guid, paths })),
    fingerprint: digest(rows),
    fingerprint_scope:
      "Paths and SHA-256 of supported text/settings/metadata; other assets use size/mtime. Library and UserSettings excluded.",
    inventory_count: rows.length,
    modified: false,
  };
}
