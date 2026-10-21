Latest executed case: [0.4 automatic feature loop](automatic-loop-verification.md). The following sections retain earlier foundation/test boundaries; they do not supersede the newer case-specific evidence.

Latest Unity-domain validation: [0.3 feature transfer case](feature-transfer-verification.md), including real APK static evidence and isolated Unity PlayMode execution. Earlier verification below describes the original foundation.

# Verification scope

Checkout paths in retained verification summaries and log excerpts have been normalized to the current `rea-unity-game` directory name. This editorial update does not represent a rerun of the recorded checks; original local run artifacts remain unchanged.

Run `npm run check`, `npm run demo`, and the installed-tarball smoke test before release. The package smoke test unpacks a fresh tarball and uses its own shrinkwrap for an isolated `npm ci --omit=dev` installation, then runs its runtime outside the checkout. Test counts and executed evidence for this implementation are recorded in [the 0.2 verification record](rea-edition-verification.md). The initial domain-only results remain in implementation-log.md as history.

The automated boundaries include real CLI processes, an official MCP SDK client/server session, generated Mono and IL2CPP marker packages, nested split extraction and provenance, desktop player inventories, changed evidence, duplicate IDs, writer locks, traversal/duplicate/symlink/prefix rejection, query scope/budgets, recovery gates, version-matched marker checks and explicit acceptance gates.

The convenience-adapter override fixture is synthetic. In addition, tests now launch the actual required REA 6.7.0 process, compare all 207 original tool contracts, execute its real managed PE metadata parser on a valid generated assembly, and retain its structured Evidence/errors through the edition. This establishes actual core wiring and managed parsing, not native-engine compatibility. Broker tests independently exercise colliding callback IDs, progress, cancellation and mixed discovery capabilities. UnityPy 1.25.4 reads a generated valid SerializedFile TextAsset with a 64-bit PathID; it is not a real game asset. Vendored helper tests cover query scan limits, hash stability, guidance adoption and project layout semantics.

The repository demo creates synthetic package bytes, not a playable Unity project. Dedicated core tests generate valid managed PE structures with IL; serialized tests generate a valid Unity asset format. It stops at recovery planning with unresolved gates. Tests and demo do not establish:

- Compatibility of ILSpy, Cpp2IL, AssetRipper or any native engine with a real target.
- Android signing/package identity or native/metadata compatibility.
- Recovered original method bodies or the original editable project.
- Unity import, compilation, PlayMode, GPU/audio fidelity, Player/device readiness or gameplay parity.
- Independent semantic verification of caller-submitted records or a human speaker's identity.

Validate those claims only with an authorized real package, the appropriate installed toolchain, representative typed fields, actual Editor/device cases and explicit proof boundaries. Package inputs are optional local evidence and are not uploaded by this project.
