# Agent-Owned Tool Provisioning

The agent owns routine tool preparation.

## Responsibility boundaries

Unity Editor remains user-managed.
Detect its version and project compatibility.
Do not install, upgrade, downgrade, activate, or accept its license unless the user explicitly requests that work.

Autonomously provision other required tools and dependencies when the environment permits.
Request user action only for unavoidable boundaries:

- Privileged or system mutation.
- Interactive commercial licenses.
- Credentials or paid entitlement.
- Hardware or device trust.
- Platform prompts the agent cannot complete.

Never delegate routine installation commands to the user.
Request narrow approval when necessary.
Continue the installation yourself after approval.

## Provisioning procedure

For each required capability:

1. Define compatibility from package identity, Unity version, backend version, host OS and architecture, and output format.
2. Detect an existing executable or library.
3. Check its real path, version, architecture, license, and harmless smoke command.
4. Reuse a compatible verified installation.
5. Reject stale, incompatible, shadowed, corrupt, or wrong-architecture copies.
6. Select the smallest maintained tool that answers the evidence question.
7. Check current official documentation or release metadata for versions, URLs, support, and licenses.
8. Prefer installation locations in the order below.
9. Download from an official vendor, repository, registry, or recorded trusted mirror.
10. Pin a release or commit.
11. Check a published checksum or signature when available.
12. Otherwise, record the downloaded SHA-256.
13. Install non-interactively where supported.
14. Avoid unrelated upgrades, shell-profile changes, background services, telemetry, browser extensions, and global hooks.
15. Run a version check.
16. Run a minimal representative smoke case.
17. Record the installation details below.
18. Continue the restoration when provisioning succeeds.

`PATH` presence alone does not establish compatibility.
Installation success without usable output does not establish acceptance.

Prefer these locations, in order:

1. Bundled skill script or pinned project tool.
2. Project-local tools or virtual environment.
3. User-local portable binary, package-manager prefix, or cache.
4. Isolated container or disposable environment.
5. System installation only when safer options fail.

Record path, version, source, license, integrity, host, target compatibility, installation command, cache location, smoke result, and fallback.
Use the tool manifest in `package-safety-and-tooling.md`.

## Failure and fallback

1. Identify network, permission, architecture, runtime, license, release corruption, format, or target-version failures.
2. Retry only within safe limits.
3. Request narrow execution approval when required.
4. Try portable, project-local, container, source-build, or maintained equivalent tools that preserve evidence boundaries.
5. Preserve package identity, matching versions and ABIs, and integrity checks.
6. Never use unofficial binaries to force success.
7. If safe routes fail, report the capability, attempted versions and sources, exact failure, exhausted fallbacks, and affected evidence.
8. Identify the minimal user-owned action.
9. Mark dependent claims blocked or degraded.

Never bypass authentication, entitlement, or approval boundaries.
A fallback's evidence strength can differ.
Do not claim equivalent output without support.

## Installation hygiene

- Keep caches outside original files and Raw evidence and Unity `Assets/`.
- Place dependencies in the project only when they intentionally belong there.
- Never execute target-package binaries or scripts as installation helpers.
- Keep secrets outside commands, logs, manifests, and environment dumps.
- Preserve a tool lock or manifest.
- Provision tools only when the selected module needs them.
- Remove abandoned installers and partial environments when safe.
- Retain reproducibility hashes, versions, commands, manifests, and license records.

## Capabilities

Select capabilities as needed:

- Archive and hash tools.
- Android SDK components, bundletool, Apktool and JADX.
- Managed decompilers, serialized-data tools, exporters, IL2CPP analyzers and native analyzers.
- Media comparison, image utilities, audio utilities and device bridges.
- Profiling, capture and test runners.
- Python, Node and .NET dependencies.
- MCP and automation bridges.
Proprietary, platform, and version restrictions can limit tool availability.
