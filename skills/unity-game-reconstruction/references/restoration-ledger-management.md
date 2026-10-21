# Ledger Management

Use this module to update delivery scope, checkpoints and acceptance.
Use the [template](ledger-template.md) for schemas.
Use [delivery](first-playable-and-production-ledger.md) for phase definitions.
The shared `AGENTS.md` defines authorization and user gates.

## Records

Keep two separate records:

- The roadmap states current playability, launch steps, blocker and next delivery.
- The technical ledger records evidence, asset mappings, test jobs and history.

Read the roadmap snapshot and active delivery card at startup.
Query technical checkpoints by ID when needed.
Do not replace player outcomes with a list of scripts or research tasks.

## Status

| Status | Meaning |
| --- | --- |
| `planned` | The item has a defined scope. |
| `evidence_ready` | Evidence supports the planned implementation. |
| `implementing` | Implementation is active. |
| `implemented_unverified` | Implementation exists without sufficient validation. |
| `runtime_verified` | The declared runtime checks passed. |
| `user_verified` | The user accepted the declared result. |
| `deferred` | Authorized scope postpones the item. |
| `evidence_blocked` | Missing evidence prevents dependent exact work. |
| `product_override` | Authorized behavior differs from the original. |
| `reverted` | The implementation no longer exists. History remains. |

Record evidence grade, evidence verdict, implementation, validation and user acceptance separately.
Do not use one completion flag for these dimensions.

## Plan

1. Derive modules and variants from evidence.
2. Define one player-visible result.
3. Record included scope, excluded scope and acceptance.
4. Identify dependencies and material evidence gaps.
5. Select the smallest integrated implementation.
6. Select checks for that implementation.

Cover required systems before exhaustive detail in one content family.
Add representative variants only where the source distinguishes them.
Keep module coverage separate from content coverage.
Create a shared item when correctness depends on multiple owners.
Reopen an assumption when runtime evidence disproves it.

## Update

Record the result after each delivery:

- Actual implementation paths and scope.
- Source and claim records.
- Validation result and artifacts.
- Remaining scope and blockers.
- Pending job identity and resume action.
- User feedback and next action.

Keep detailed hashes and job logs in the technical ledger.
Link them from the delivery card.

## Acceptance

Track the MVP separately as `not_ready`, `ready_for_user_playtest`, `changes_requested` or `accepted`.
Record the accepted version, scope and user statement.
Reuse prior acceptance when the roadmap is stale.
A gate waiver changes workflow, not the acceptance record.

Mark a module complete only after its declared variants and dependencies pass acceptance.
Keep deferred items, evidence gaps and product overrides explicit.
Mark a phase complete only after its player-facing exit gate passes.
A large checkpoint count does not establish phase completion.

## History

Align authorized commits with reversible checkpoints.
Preserve unrelated changes during rollback.
Check affected loaders, references, persistence and tests after rollback.
Keep superseded and reverted records.

For repeated failures, record the assumption, decisive evidence, repair and regression.
Keep concrete case history in the project retrospective.
Keep project instructions in `AGENTS.md`.
Keep reusable procedures in the relevant Skill module.
