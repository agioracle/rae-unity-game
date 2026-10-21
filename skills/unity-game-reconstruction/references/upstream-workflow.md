---
name: wefund-unity-game-reconstruction
description: Restore authorized Unity games from APK or XAPK or recovered evidence. Use for playable delivery, restoration diagnosis, parity checks and workflow maintenance.
---

# Unity Game Reconstruction

Restore an editable Unity project with behavior traceable to the authorized original.
Read the [shared instructions](assets/project-guidance/AGENTS.md) before work.
They define authorization, evidence, delivery gates and validation limits.

## Start

1. Identify the current request and its permitted changes.
2. Reuse known paths, package identity, decisions, recovery results and acceptance.
3. For project work, read applicable project `AGENTS.md` instructions.
4. For legacy projects, read applicable `RULES.md` until its instructions move into `AGENTS.md`.
5. Check the worktree before file changes.
6. Check Editor state when the task uses the Editor or its mutable assets.
7. Read the roadmap snapshot and active card for game-delivery work.
8. Select one reference for the next decision.

Query technical records by exact ID when needed.
Do not load the complete ledger at routine startup.
For Skill maintenance, inspect the affected modules instead of changing the game project.

## References

| Task | Read |
| --- | --- |
| Plan playable delivery or production phases | [Delivery](references/first-playable-and-production-ledger.md) |
| Inspect or extract a package | [Package safety](references/package-safety-and-tooling.md) |
| Recover code, data or assets | [Recovery](references/package-recovery.md) |
| Promote assets or organize project files | [Workspace](references/workspace-layout-and-asset-promotion.md) |
| Update scope, acceptance or checkpoint status | [Ledger](references/restoration-ledger-management.md) |
| Create a ledger schema | [Template](references/ledger-template.md) |
| Implement or diagnose Unity behavior | [Unity restoration](references/unity-original-restoration.md) |
| Check numerical fidelity or unsafe tests | [Verification procedures](references/restoration-verification-recipes.md) |
| Select checks by technical risk | [Routing](references/routing-matrix.md) |
| State a parity or completion claim | [Claims](references/evidence-claims-and-acceptance.md) |
| Query a large evidence corpus | [Retrieval](references/token-efficient-evidence-retrieval.md) |
| Prepare a required tool | [Tools](references/agent-tool-provisioning.md) |

Read another module only when the next action requires it.

## Execute

Define one observable result and its acceptance case.
Identify its source, selection condition, runtime consumer and lifecycle owner.
For a mismatch, find the earliest divergence before editing values.
Implement the smallest authorized change.
Run the selected checks.
Restore temporary test state.
Update the delivery card with results, limits and next action.

## Project Guidance

Use `scripts/bootstrap_project_guidance.py --check --project-root UNITY_ROOT` to inspect template drift during authorized guidance setup or updates.
Inspect unmarked guidance before adoption.
Preserve local instructions outside managed markers.

The tool writes `AGENTS.md` only.
It reports a legacy `RULES.md` without deleting it.
Merge applicable legacy instructions into project `AGENTS.md` before using `--legacy-rules-reviewed`.
That option records the caller's review, not an automatic semantic merge.
Do not update project guidance during Skill-only work.

## Language

Use short sentences with one instruction each.
Keep technical identifiers and uncertainty unchanged.
Keep concrete game cases in the project retrospective.
Derive each project's terminology and constraints from evidence and user scope.
The wording uses STE structural principles, not certified dictionary compliance.
