# Playable Delivery

Use this module to plan milestones and select acceptance checks.
The shared `AGENTS.md` defines recovery and user-acceptance gates.

## Recovery and Implementation

Complete the accounted recovery pass once before first implementation.
Use [recovery](package-recovery.md) for coverage and gap handling.
Select one MVP evidence packet from that corpus.
Import only dependencies for the current milestone.
Defer deeper interpretation and unused compatibility work, not package extraction.
Reuse valid recovery results after interruption.

## MVP Packet

Record these items before implementation:

- Authorization and package identity.
- Target engine and runtime compatibility.
- Core input and authoritative state.
- Source-backed observable outcome and repeat path.
- Required assets and their consumers.
- Uncertainty and excluded scope.

Use approximations only within explicit user approval.
Do not describe them as original parity.

## Phases

| Phase | Goal | Exit gate |
| --- | --- | --- |
| P0 Intake | Establish evidence, constraints and risks. | Account for recovery. Define the roadmap and MVP packet. |
| P1 Prototype | Implement the defining interaction. | Input changes the intended state without a blocking exception. |
| P2 First playable | Connect entry, interaction, outcome and repetition. | The loop runs through normal input with startup instructions. |
| U1 Playtest | Obtain user judgment on the first playable. | Explicit acceptance permits post-MVP work. |
| P3 Vertical slice | Integrate representative behavior and presentation. | Declared UI, feedback, data and persistence checks pass. |
| P4 Alpha | Integrate every major system in scope. | Required feature flows work together. |
| P5 Beta | Complete declared content and stability work. | Scoped regression, lifecycle and platform checks meet the declared risk limits. |
| P6 Release candidate | Prepare the requested target artifact. | Required build, signing, installation and device checks pass. |
| P7 Operations | Maintain requested released behavior. | Operational checks, updates and rollback work. |

Include release or operations phases only when the user requests them.
Phase labels do not authorize external actions.

## First-Playable Acceptance

1. Start the designated scene or build without manual repair.
2. Execute the defining interaction through normal input.
3. Observe the intended state change and feedback.
4. Reach the original-relevant observable outcome.
5. Execute the repeat or continuation path.
6. Check blocking errors and relevant trapped-state paths.
7. Restore temporary test state.
8. Provide startup steps and limits.

Call an Editor-only result an Editor first playable.
Do not infer device readiness from that result.
Use the U1 checkpoint after these checks.
Apply the acceptance rules in shared `AGENTS.md`.

## Roadmap

Organize the roadmap by milestones, not files or test invocations.
Each delivery card states one result and its acceptance.
The roadmap must answer:

1. What is playable now?
2. How can the user start it?
3. What prevents the next delivery?
4. What is the next playable result?

Keep the roadmap short enough for routine startup.
Use [ledger management](restoration-ledger-management.md) for technical records and status.

## Validation Selection

| Layer | Use when the claim requires |
| --- | --- |
| V0 Static | Serialized identities, paths or references. |
| V1 EditMode | Deterministic data or state rules. |
| V2 PlayMode | Runtime input, lifecycle or integrated flow. |
| V3 Comparison | Observable visual or audio fidelity. |
| V4 Player/device | Target builds, device behavior or release readiness. |

Select the lowest sufficient layer first.
Expand for changed dependencies, failures or milestone acceptance.
Stop when the declared checks pass.
Document-only edits require document or helper checks, not unchanged Unity suites.

## Cost Control

Define one result per active implementation.
Query bounded evidence that can change the next decision.
Use exact indexes instead of complete dumps.
Report changes, validation, blocker and next action.
Do not repeat package history in routine updates.
Stop semantic research when available evidence supports the next implementation.
Keep material unresolved claims separate from the delivered result.
