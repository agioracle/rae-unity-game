# Ledger Template

Use the first three sections for the roadmap.
Keep technical checkpoints in a separate ledger.
Query them by ID instead of loading their full history.

## Snapshot

```yaml
current_phase: P0 | P1 | P2 | U1 | P3 | P4 | P5 | P6 | P7
current_playable:
launch_instructions:
next_playable:
largest_blocker:
recovery_pass_status:
recovery_coverage_ref:
last_verified_artifact_or_scene:
```

## Milestone Row

| Phase | Player-visible result | Scope | Acceptance | Status | Blocker or next action | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Selected phase | Observable result | Included and excluded work | Required checks | Current status | Next decision | Record links |

Use the [delivery module](first-playable-and-production-ledger.md) for phase meanings.
Do not include release or operations work without user scope.

## Delivery Card

```yaml
id:
phase:
player_visible_goal:
scope_included: []
scope_excluded: []
acceptance: []
status: planned | evidence_ready | implementing | implemented_unverified | runtime_verified | user_verified | deferred | evidence_blocked | product_override | reverted
dependencies: []
evidence_debt: []
blocker:
next_action:
implementation_paths: []
evidence_refs: []
validation_result:
remaining_work: []
user_confirmation:
pending_job: # Record identity, inputs, output scope and resume action while a job runs.
```

## MVP Checkpoint

```yaml
state: not_ready | ready_for_user_playtest | changes_requested | accepted
scope_included: []
scope_excluded: []
promoted_asset_manifest:
playtest_build_or_scene:
launch_instructions:
validation_markers: []
user_feedback:
accepted_at:
accepted_version_and_scope:
workflow_override: # Record explicit user direction. Do not fabricate acceptance.
```

Use the shared `AGENTS.md` for the user-acceptance gate.
Keep acceptance and workflow overrides separate.

## Technical Checkpoint

```yaml
id:
supports_milestone:
claim:
package_or_build_identity:
evidence_grade:
evidence_verdict:
scope_and_truncation:
source_chain: []
exact_locators_and_hashes: []
implementation_paths: []
acceptance_marker_ids: []
validation:
proves: []
does_not_prove: []
deferred_or_blocked: []
commit_or_revert_history: []
```

Create a checkpoint for a material claim, milestone decision or rollback boundary.
Do not create one for every command or document edit.
