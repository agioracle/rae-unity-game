# Unity Original Restoration Module

Restore observable behavior from evidence.
Keep authored scenes and prefabs editable.
Apply this workflow to the recovered domain model, presentation, input model, camera, and runtime loop.

Use [the checklist](unity-restoration-checklist.md) before broad changes, repeated mismatches, or changes with substantial serialization or state risks.
Use [workspace and promotion guidance](workspace-layout-and-asset-promotion.md) before creating folders or importing recovered assets.
Follow project `AGENTS.md` and the main skill for authorization, recovery gates, and MVP acceptance.

## Preflight

For review, status, or diagnosis, use relevant read-only checks.
Report the cause.
Change implementation only when the user authorizes implementation.
Package recovery gates apply to restoration implementation.
They do not prevent inspection of an existing defect.

1. Read project `AGENTS.md`.
2. Read applicable legacy instructions until migration preserves them in `AGENTS.md`.
3. Read the active roadmap delivery card for game-delivery work.
4. Retrieve linked technical records by exact ID when needed.
5. Reproduce the mismatch or define the target state.
6. Trace the runtime condition through original code, components, and assets to the output.
7. Classify the evidence verdict.
8. Identify ownership boundaries.
9. Inspect the worktree and relevant Editor, persistence or test state.
10. Select validation layers.
11. Check the delivery gate in the shared `AGENTS.md` when implementation changes playable scope.

## Evidence layers and identifiers

Keep these asset layers distinct:

| Layer | Meaning |
| --- | --- |
| Raw evidence | Immutable serialized or exported material retains its byte identity and package hash links. |
| Compatibility evidence | Generated copies record versioned transformations and maps from original references to new references. |
| Runtime assets | The replica consumes authored scenes, prefabs, data, and adapters. |

Do not change Raw YAML.
A compatibility generator must record input hashes, transformation and schema versions, output counts, warnings, and unknown references.
The generator must fail on unknown identities instead of discarding them.
Preserve legitimate optional null references and source sentinels.

Keep raw and compatibility evidence outside Unity.
Promote only the smallest dependency closure with a demonstrated consumer.
Record promotion in a manifest.
Do not use an exporter project as the authored project baseline.

Keep these identifier domains distinct:

- Package serialized files use PathIDs.
- Project `.meta` files use GUIDs.
- Project YAML uses local fileIDs.
- Managed code uses assembly identities and tokens.
- Native code uses ABI identities and RVAs.

Record each mapping between domains.
Add a representative regression assertion for each mapping that the change affects.

## Diagnose the failing boundary

Classify the cause before changing values.
Use the applicable category:

- Data or fallback.
- Runtime loading.
- State or lifecycle.
- Authored binding or input.
- Variant selection or reuse reset.
- Coordinate conversion.
- Serialized binding.
- Persistence across contexts.

If a defect repeats, investigate the shared boundary.
When the user authorizes changes, change that boundary.
Test the changed boundary.
For an authorized repair of a recurring defect, retain a regression test for that boundary.

Use [verification recipes](restoration-verification-recipes.md) for recurring physics defects, numerical audits, or unsafe test state.
Match the reported instance before diagnosing it.
A passing test of another variant does not resolve the report.

## Presentation ownership

| Presentation type | Required behavior |
| --- | --- |
| Static authored presentation | Bind the authored layout, decoration, stable panels, props, and manual states. Preserve these authored objects during Play Mode. |
| Runtime states | Toggle authored states only when recovered transitions own those states. |
| Data-driven authored presentation | Refresh stable counters, meters, slots, icons, labels, and markers in place. |
| Dynamic collections | Use source-backed creation methods. Preserve evidenced identities and lifetimes. |
| Pooled runtime objects | Instantiate or reuse authored prefabs. Reset reused objects to their baseline. |
| Transient effects | Create or pool temporary feedback. Give each effect a lifetime that permits safe teardown. |
| Source-owned procedural content | Preserve the original generator, inputs, selection conditions, and lifecycle when evidence requires runtime construction. |

These categories do not limit other presentation behavior that source evidence requires.
For required authored bindings, normal runtime must fail with the exact missing path or component.
Change authored structure through explicit Editor authoring or migration.
This restriction does not prohibit source-owned runtime generation.

## Runtime binding and refresh

Use three lifecycle boundaries for authored views:

1. Author or migrate through an explicit Editor operation.
2. Bind the runtime view once at initialization.
3. Refresh affected properties during navigation or state changes.

During Editor authoring, create the hierarchy.
Add required components.
Serialize references.
Save the assets.

During binding, resolve authored paths.
Cache components and assets.
Register listeners according to the source contract.
Prevent unintended duplicate registration after repeated entry.

During refresh, mutate the authoritative model.
Update affected properties.
Expose the refreshed state.

Keep Editor authoring and migration outside frequent runtime callbacks.
Inspect frequent callbacks for these costs:

- Full hierarchy deactivation or reconstruction.
- Object creation or destruction.
- Repeated component scans.
- Asset discovery or loading.
- Forced layout or text mesh rebuilds.
- Duplicate listeners.
- Synchronous saves.

A method named `Build` can still cause frame spikes when it reuses children.
Reparenting, restyling, label updates, and layout rebuilds can each cause those spikes.
Assess runtime generation against source ownership and the target budget.

When the original retains collection views, cache each view by its stable data key.
Apply only the required additions, removals, moves or updates.
Preserve instance identity when the original flow moves a view between containers.
When the original recreates views, preserve its creation and release boundaries.
Refresh detail or popup data at the source-defined visibility boundary.

Check cold and warm paths on the constrained target:

- Repeated actions preserve the evidenced lifetime and expected child counts.
- Registration counts match the source contract after repeated entry.
- Frequent runtime callbacks cannot invoke Editor authoring or migration.
- Allocations, layout rebuilds, asset loads, synchronous saves, and frame time meet the target budget.
- The first visible frame matches the source data for that lifecycle phase.

## Data and production loading

Trace runtime values to original configuration or source code.
Check the actual consumer.
Remove obsolete test and fallback paths after original loading works.
Check project asset existence.
Check resolution through the production loader.
Use one authoritative source across selection, launch, results, rewards, persistence, and destination refresh.

## Unity project organization

Follow [workspace and promotion guidance](workspace-layout-and-asset-promotion.md) for ownership roots, optional folders, names, reuse, and Resources policies.
Keep recovered evidence, tools, indexes, and validation output outside Unity.
Preserve each promoted asset's source hash and locator in the manifest.
Record unavoidable layout exceptions.

## Prefabs, variants, and reuse

Resolve variants from original selection fields and conditions.
Do not invent a variant taxonomy.
Preserve component and hierarchy differences.
Do not reduce structural variants to asset swaps.

Use Editor authoring that produces the same output when repeated.
Ensure saved project assets own copied references.

Before reuse, reset these owned values:

- Transforms and state.
- Materials and effects.
- Timers and subscriptions.
- Generated children.

Sanitize generated compatibility copies only.
Preserve recovered hierarchies, renderers, animators, clips, particles, and transforms.
Replace missing scripts, shaders, or materials only when records define the exact scope and visual or runtime consequences.

Match the material and shader family that evidence identifies.
Do not replace unrelated shader families because an exporter produced placeholders.
Check alpha, blending, render queue, keywords, and output on a real GPU.

## Coordinates and projection

Trace the source and destination spaces through these properties:

- Anchors and pivots.
- Source dimensions and pixels per unit.
- Canvas scaler and camera projection.
- Parent transforms.
- Hit anchors and collision geometry.
- Effects and animated nodes.

For conversion between spaces:

1. Preserve source dimensions and local transforms.
2. Record the authored reference mapping.
3. Identify the owner of each coordinate space.
4. Compute the active mapping from the actual transforms, camera, Canvas, and units.
5. Use uniform scaling only when evidence supports it.
6. Place any uniform conversion outside animation-driven nodes.
7. Preserve required nonuniform transforms or projection mappings.
8. Align dependent representations according to their source ownership.

Do not scale independent simulation or interaction geometry only to match a renderer.

## Animation and serialization

Bind copied curves by relative path, project component type, property, and valid persistent reference.
Reject stale package PathIDs and invalid required IDs or fileIDs.
Reject missing required scripts and broken required references.
Preserve legitimate optional null bindings and source sentinels.

Place required conversion scales outside animation-driven nodes.
Give each event that requires a receiver a compatible live receiver.
Preserve evidenced optional events and events with no receiver action.

Preserve original skeleton compatibility, materials, shaders, effect links, and audio timing.
Mark unavailable dependencies as blocked.

Restore the complete chain:

`state or override controller -> clip -> event -> receiver or relay -> state mutation`

Event names and timing do not prove receiver behavior or resulting state calculations.

For repeated UI names, bind by recovered root identity and relative path.
Add a structural signature when needed.
Capture the hierarchy before authoring a selector.
Reject matches from another root.

## Audio and feedback

Trace the audio chain:

`runtime event or state -> setup, pool, or group -> selection -> clip GUID or key -> mixer or bus -> playback rules -> lifecycle`

Playback rules include cooldown, priority, and spatial behavior.
Preserve original ordering, duplicates, empty entries, misspelled serialized fields, and random groups.
Preserve original selection and randomization rules.
Identical clip bytes do not prove mixer processing, trigger timing, or selection behavior.
Check those behaviors separately.

Exercise the actual caller and its bound consumer.
An optional delegate invocation does not prove production playback.
Check active listener ownership.
Check mute and pause state.
Observe actual output through the original playback path.

Cover relevant entry, replacement, and repeated-entry cases.
Inspect pooling only when the recovered path uses it.
Keep similar cues separate when original triggers differ.

For other feedback, trace the caller through its bound consumer to the effect.
An emitted event or existing particle asset does not prove visible animation or effects.

## State, interaction, and lifecycle

Execute the actual state mutation before success feedback.
Test the real input-system and EventSystem paths.
Direct method calls prove only the behavior they exercise.

Select relevant cases:

- Invalid transitions.
- Empty or exhausted states.
- Close and cancellation.
- Pause and resume.
- Repeated entry.
- Teardown and context unload.

Guard asynchronous work against destroyed targets and reused objects.

For native iterators, reconstruct state transitions.
Reconstruct yields.
Reconstruct caller callbacks.
Code addresses alone do not establish temporal order.
Distinguish the covered, callback-completed, input-ready, and destroyed signals.

When preloading replaces original selected-only creation, check which active or inactive roots can execute `Awake`.
Check which roots can claim persistent ownership.
Test each relevant non-default variant from a fresh session.

## Contexts and platforms

Persist durable results before changing scenes, screens, or contexts.
Restore destination state from the same authoritative source.
Consume one-shot launch or onboarding context once.
Isolate platform SDKs behind adapters and compile guards.
Audit transitive dependencies for startup and loading.
Exclude unrelated content from the first context.

## Validation

Select checks for the changed boundary and stated acceptance.
Expand validation only for new changes, failures, or unresolved concerns.
Document-only changes do not require Unity tests.

Choose the smallest sufficient set:

1. Check serialized integrity and production-loader resolution.
2. Check import and compilation, including target-specific compilation.
3. Test deterministic data and state.
4. Test runtime interaction and lifecycle through real input.
5. Compare runtime visuals and audio.
6. Test representative content, variants, persistence, and entry routes.

Report these environments separately:

- Static and Editor inspection.
- Batch or headless compilation and deterministic tests.
- Interactive runtime input and lifecycle.
- Real GPU, audio, and device checks.
- Paired original-package and replica comparisons.

A headless marker does not prove parity on a real GPU.
A replica-only invariant does not prove the original algorithm.
Each marker must state `proves` and `does_not_prove`.
Distinguish normal input routes from controlled injection.

For interactive authored views, select relevant repeated-action checks.
Check evidenced object lifetime, child counts, first-open content and listener registration.
Measure frame cost on the target device when acceptance or a performance claim requires that measurement.

Capture Editor state, persistence, selected content, active context, and temporary validation assets before tests mutate them.
Restore captured baselines according to [verification recipes](restoration-verification-recipes.md).
Report partial suites and unrelated failures precisely.
Update the ledger.

At the MVP handoff, provide exact scene or build launch steps.
Provide a short player test script.
Apply the checkpoint and acceptance rules from `AGENTS.md` and the main skill.
