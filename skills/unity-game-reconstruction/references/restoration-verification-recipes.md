# Restoration Verification Recipes

Use the recipe that applies to the recurring defect, numerical audit, or unsafe validation.
These recipes supplement [the restoration module](unity-original-restoration.md).
They do not require new debug routes, exhaustive suites, engine changes, or platform work.
For asset moves, use [workspace and promotion guidance](workspace-layout-and-asset-promotion.md).
Follow `AGENTS.md` and the main skill for authorization and recovery gates.

## 1. Capture the reported instance

Before changing the reproduction scene, record the project and process.
Record loaded scenes and the selected object.
Identify the actual affected instance.
Match that instance to the supplied capture using evidenced identity and configuration.
The selected object may differ from the affected instance.
Preserve the user's reproduction state until you capture the useful snapshot.

Record the relevant observations:

- Inputs and source data.
- Applicable random state.
- Ordered operations.
- Instance references.
- Lifecycle phase and clock.
- Observed output.

Include Unity component state only when it helps distinguish the cause.
Limit capture to the affected dependency graph.

Locate the earliest divergence across applicable boundaries:

| Boundary | Observation |
| --- | --- |
| Data selection and creation | Compare selected or generated data before initialization. Preserve ordering, identities, and applicable random consumption. |
| Initialization and binding | Check original defaults, overrides, references, and owners on the intended instance. |
| First update or resumed operation | Check the first callback's input state. Compare producer and consumer clocks and execution gates. |
| Steady updates and state changes | Check the live consumer's current owner. Identify the first input or transition that introduces the mismatch. |
| Release and reuse | Check callback release against the original lifecycle. Check reference release. Check mutable state reset. |

Reproduce the decisive boundary with matching configuration and relevant variants.
A downstream workaround can conceal an upstream defect.
It does not prove the original rule.
Exact comparison requires matching data, inputs, and lifecycle conditions.
Visual similarity alone does not establish those conditions.
Select probes from the affected subsystem's evidence.

If original evidence cannot resolve the rule, record the missing evidence.
Continue unaffected work.

If the user authorizes a safeguard, limit it to the approved object or operation.
Test permitted paths.
Test rejected paths.
Test rollback.
Retain an unmodified comparison against the source rule.
Record changed outputs and applicable random consumption.
Record the safeguard's scope limits as a product override.
Do not describe the override as a recovered algorithm.

## 2. Audit values through consumers

Use a bounded inventory for the requested parameter family.
Connect each value to execution.

```yaml
parameter_id:
source_locator_and_hash:
source_value_and_type:
selection_condition:
producer_and_saved_field:
initialization_or_overwrite:
effective_runtime_consumer:
units_clock_and_arithmetic:
boundary_case:
comparison_layer: serialized_input | initialized_value | consumer_math | engine_output
verdict:
unverified_scope:
```

Trace these sources of effective values:

- Defaults and inherited overrides.
- Constructor, `Awake`, `OnEnable`, and `Bind` assignments.
- Scene owner selection.
- Runtime changes.

Check saved assets after reloading them.
Check ordinary production instances.
A temporary authoring object does not prove a saved binding.
A pure resolver does not prove independent scene initialization.

Classify raw differences before changing implementation:

- Active fields that a consumer reads.
- Inactive modules or unused fields.
- Version or schema translations.
- Intentional overrides.
- Unresolved semantics.

Decode enum meanings for each engine version.
Check setter side effects.
Check assignment order.
Preserve serialized zeros and sentinels.
Keep these distinctions explicit:

- Layer index versus layer mask.
- Declared metadata versus effective component state.
- Local coordinates versus world coordinates.

When native single-precision arithmetic defines the contract, retain operation order.
Retain explicit rounding boundaries.
Test a discriminating nonzero or intermediate value.

If random drift conceals arithmetic, control the fixture's sampled input after real initialization.
Preserve production sampling.
Use an independent source oracle.
Do not use another invocation of the implementation as the oracle.

Matching source inputs does not prove these outputs:

- Engine-generated center of mass or inertia.
- Contact solver results.
- Curve domains that the comparison did not inspect.
- Random replay.
- Shader pixels.
- Importer or audio-processing output.
- Authenticated server values.

Declare tolerances for the measured output and environment only.
Do not weaken exact input assertions to accommodate engine differences.
Distinguish normal startup correctness from optional independent-scene debug routes.
Require those debug routes only when the user requests them.

## 3. Check saved output without reauthoring

Classify each test's effects before execution:

- Read-only inspection.
- Isolated mutable fixture.
- Production authoring or migration.
- Save mutation.
- Integration through real input.

Legacy suites may rebuild delivered prefabs or scenes.
They may disable delivered entry flags despite a regression label.

For saved-binding changes or structure-only tasks, inspect actual saved assets.
Check normal entry directly.
Do not invoke a legacy rebuild to prepare those checks.

If generator changes are in scope, exercise the generator deliberately.
Apply scoped migrations.
Audit final saved output.
Check byte idempotency where appropriate.
Preserve subsequent unrelated bindings.
A matching root GUID does not prove preservation of local fileIDs or component references.

Before generating glyphs, clone dynamic fonts and their writable atlas and material dependencies.
Clone mutable meshes or materials before probes change them.
Distinguish source recipe checks from hashes of settled dynamic caches.

Restore only changes that this test caused and its captured baseline proves.
Treat unexplained earlier changes as user-owned until investigation resolves their origin.

Observe the actual presentation pipeline:

- Active camera.
- Canvas mode.
- Render layer.
- Clock.
- Visible phase.
- Instance identity.

Preserve that pipeline during screenshot capture.
Temporary camera or Canvas conversions can introduce sorting or coordinate artifacts.
Use bounded rendering and readiness conditions.
Retain actual pixels or audio samples.
A delayed capture may miss a short effect.
That absence does not prove the effect never occurred.

## 4. Check test results and state restoration

Before a test mutates persistence, save a scoped baseline outside Unity.
Capture key presence separately from values.
Capture relevant Editor and runtime state.
Record successful capture explicitly.
Partial setup must not treat default fields as an absent-key snapshot.

Run each cleanup step independently.
A failure in one cleanup step must not prevent later cleanup steps.
After completion or cancellation, compare persisted readback against the applicable baseline.
Record uncaptured state.
Record unexplained earlier changes.
Do not invent replacement values.

Before accepting results after an edit, check compile errors.
Check that loaded test code includes the latest edits.
Check test discovery.
Check runner idle status.

Check that the expected new cases executed.
Inspect the provider's effective filters and counts.

These outcomes do not establish RED or GREEN results:

- Zero executed tests.
- Old loaded assemblies.
- Queued or running jobs.
- Cancellation acknowledgement.

Resume an existing job before starting it again.
Check runner cessation before another mutation.
Check state restoration before another mutation.
Respect instructions that prohibit restart.

Freeze production asset writers during runtime or GPU acceptance.
Independent read-only work may continue on a named stable snapshot.
Keep one writer for shared Editor state.

For 429 responses, respect `Retry-After` or bounded backoff.
Reduce concurrent requests and jobs.
Restore normal bounded concurrency when authorization and service health permit it.

At handoff, report these proof layers separately:

- Behavior supported by source evidence.
- Equality of saved inputs.
- Ordinary replica integration.
- Controlled injection.
- Paired original and device results.

Normal input routes and injected state transitions prove different behavior.
Report final selected suite counts.
Do not sum repeated runs into a parity percentage.
Current Console silence does not prove correction of historical engine diagnostics.
