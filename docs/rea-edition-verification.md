# REA Unity Edition 0.2: implementation and evidence

Date: 2026-10-19. The user corrected the foundation: REA already owns the generic reverse-engineering and agent workflows; this project must specialize that complete foundation with Unity tools and domain practice. Version 0.2 replaces the initial optional two-command REA relationship with a required complete runtime.

## Integration

- `rea-agents@6.7.0` is required and pinned with dependency integrity in npm-shrinkwrap.json. The supplied source checkout remains unchanged; its reference commit/version are recorded in upstream-rea.json. No claim is made that the published bytes were rebuilt independently from that checkout.
- Original REA CLI commands execute the packaged implementation; Unity commands use `unity <operation>` and cannot hide original analyze/inspect/doctor behavior.
- One stdio endpoint merges 207 actual core tools and 21 domain additions. Original core JSON Schemas, output/structuredContent, errors and Evidence metadata are retained. Calls use the same persistent actual REA session.
- Server callback IDs are qualified by ownership. Both callback responses and backend cancellation references route to their owner. Tests also exercise normal request cancellation, progress and capability-aware discovery.
- UnityPy 1.25.4 reads actual SerializedFile object indexes/fields. This version admits one extracted SerializedFile, format 9–22, up to 64 MiB. Qualified source identity, 64-bit PathIDs, raw hashes, decode limits and parser version remain explicit.
- Feature context binds the question/seeds, recorded source artifacts and an existing target project's actual Editor version. The feature workflow and prompt direct the host agent to core analysis, Unity-specific identities and actual target authoring/validation. They do not claim that a task description or ledger record implemented a feature.

## Executed validation

- `npm run check` using Node 22.23.1 / Python 3.13.2: format and strict typecheck pass; 22 JavaScript tests pass; 25 Python tests pass; 33 imported practice/fixture digests verify. [Full output](verification-results/edition-check.log).
- Actual REA process: compare all 207 tool definitions unmodified, parse a valid generated managed PE with the real core, retain original structured Evidence and errors, and route original CLI commands. This is stronger than the earlier convenience-adapter mock but does not validate an installed native engine or a real game.
- Protocol fixture: colliding callback IDs from two backends, source-specific resources, progress, client cancellation and server-originated callback cancellation.
- Actual UnityPy: parse a valid generated TextAsset, preserve PathID 9007199254740993, round-trip the listed stable file locator into a later exact read, retain field/raw hashes, and reject duplicate serialized PathIDs before the parser's dictionary can overwrite evidence. [Installed parser versions](verification-results/unity-parser-versions.txt).
- `npm run demo`: real domain CLI package/intake/plan/query/verify/status workflow; unsupported recovery gates remain correctly blocked. [Output](verification-results/edition-demo.log).
- Packed runtime: unpack a fresh npm tarball outside the source checkout, install its pinned production graph offline, use packaged domain helpers, discover the complete actual core/domain MCP catalog and execute real managed PE analysis through the installed session. [Output](verification-results/edition-package.log).

## Independent review

A fresh review found three material issues. Each was reproduced by a failing regression before the fix, followed by the passing full suite:

1. Anonymous UnityPy byte inputs produced randomized per-process file names. The adapter now supplies the admitted source's stable file name. The outer source path/hash remains the full qualifier.
2. Callback IDs were rewritten but backend cancellation references were not. A reverse ownership map now translates the notification's requestId; the client receives cancellation for its actual active callback.
3. UnityPy overwrote duplicate PathIDs before enumeration. The pinned adapter now observes each producer index entry before insertion and rejects duplicates instead of claiming a complete reduced dictionary.

One minor extension remains deferred: current Unity discovery is unpaged. The broker preserves upstream core cursors; it does not yet compose a future paginated domain cursor. Documentation limits the pagination claim accordingly. Current core and domain catalogs are returned without loss.

## Operational boundaries

The complete REA runtime inherits REA's provider/authority contracts and optional-engine readiness. Original upstream setup/update retain upstream installation identity; use the documented edition MCP configuration for the combined server. Edition-specific automatic registration is not implemented.

The host agent owns feature investigation reasoning and code changes, using the connected Unity Editor and file tools. IL2CPP address mapping, broad asset/media export, actual Editor/device checks and real-game feature equivalence require appropriate tools and evidence. No real APK feature has yet been transferred into a second real game in this repository's tests. This record establishes the corrected foundation and domain increments, not universal recovery success.

No commits, pushes or publication were performed. The original REA source checkout and installed practice skill were preserved.
