# Unity Restoration Checklist

Choose sections for the changed boundary and stated acceptance.
Follow project `AGENTS.md` and the main skill for authorization and acceptance gates.
Stop after required checks pass unless new findings justify more checks.

## Evidence contract

- State the observable target or reproduced mismatch.
- Record package and build identity.
- Record evidence grade and verdict.
- Record identifier domains, source hashes, query scope, and the complete source chain.
- Name data, lifecycle, hierarchy, coordinate, loader, and persistence owners.
- Distinguish product overrides from parity claims.
- State what each acceptance marker proves.
- State what each acceptance marker does not prove.

## Evidence layers and compatibility

- Preserve raw evidence bytes and package hash links.
- Keep compatibility copies separate from raw evidence.
- Record transformation and schema versions.
- Record maps from original references to new references.
- Use valid project GUIDs and local fileIDs in runtime assets.
- Reject temporary package PathIDs in project references.
- Make generators fail on unknown identities.
- Preserve legitimate optional null references and source sentinels.
- Publish generator output counts and warnings.
- Prevent stale partial outputs after generation fails.

## Workspace and project layout

- Keep `recovered/`, validation output, and tool caches outside Unity.
- Exclude exporter projects, decompiler trees, raw media collections, and recovered source trees from Unity.
- Use the ownership roots from [workspace and promotion guidance](workspace-layout-and-asset-promotion.md).
- Create optional folders only when an actual consumer needs them.
- Record each promoted asset's source hash, locator, consumer, destination, dependency closure, and acceptance case in its manifest.
- Record layout issues and justified exceptions before broad import or checkpoint handoff.
- Apply Resources restrictions only when the user or target requires them.
- Under those restrictions, check every Resources directory under `Assets/`, including vendor directories.
- Check the agreed size and type policy.
- Check transitive dependencies separately from folder ownership.
- Preserve original names, GUIDs, and local fileIDs during moves.
- Check affected importer, loader, authoring, and receipt paths.

## Data and loading

- Check the original row, ID, and default.
- Check the actual runtime consumer.
- Remove or isolate obsolete test and fallback paths after original loading works.
- Check asset existence in the project.
- Check resolution through the production loader.
- Check that destination contexts read the authoritative source that previous contexts wrote.
- For numerical parity, compare original inputs separately from saved producer outputs.
- Compare initialized effective values separately from actual consumer arithmetic.
- Classify inactive fields, unused fields, and engine-generated outputs separately.

## Presentation ownership

- Classify each object by runtime ownership.
- Preserve stable authored presentation during runtime refresh.
- Make missing required authored paths or components fail explicitly.
- Use source-backed creation methods and stable identities for dynamic collections.
- Preserve manual state unless original runtime logic owns it.
- Preserve source-owned procedural generation, inputs, selection conditions, and lifecycle.

## Runtime refresh performance

- Keep Editor authoring, runtime binding, and runtime refresh in separate call paths.
- Keep Editor authoring and migration outside frequent runtime callbacks.
- Assess source-owned runtime generation against its evidenced lifecycle and target budget.
- Cache authored component and asset references for the view lifetime.
- Preserve source-owned collection creation and release.
- Use incremental updates when the original retains its views.
- Use pooling where the recovered lifecycle requires it.
- Check evidenced instance lifetime and expected child counts after repeated actions.
- Check registration counts against the source contract.
- Prevent unintended duplicate listeners after repeated entry.
- Check first-visible content against the original refresh timing.
- Inspect frequent callbacks for repeated scans, loads, global layout rebuilds, and unnecessary synchronous saves.
- Check cold and warm actions against target frame and allocation budgets.

## Interaction

- Test real input and raycast paths.
- Check interaction filters, overlays, masks, sibling order, and blocking state.
- Check exits from empty, locked, and exhausted states.
- Check cancellation, close, and repeated-open paths.
- Emit success feedback only after the actual mutation succeeds.

## Variants and reuse

- Resolve the correct prefab or template from original selection fields.
- Select representative variants and boundary cases from recovered evidence.
- Check that saved assets own copied components and references.
- Reset owned transforms, state, materials, effects, timers, subscriptions, and generated children before reuse.

## Coordinates and presentation

- Check anchors, pivots, source dimensions, and pixels per unit.
- Check scaler, camera projection, parent transforms, hit anchors, and collision geometry.
- Document the authored reference mapping.
- Check active transforms and projection against evidenced source and destination spaces.
- Use a shared non-animated scale root only for a proven uniform conversion.
- Preserve required nonuniform mappings.
- Preserve independently owned simulation and interaction geometry.
- Capture representative aspect ratios, configurations, variants, and lifecycle states from the acceptance scope.

## Animation, effects, and audio

- Check curve paths, component types, properties, and persistent references.
- Reject stale or invalid required serialized references.
- Preserve legitimate optional null bindings and source sentinels.
- Check compatible live receivers for events that require them.
- Preserve evidenced optional events and events with no receiver action.
- Preserve original runtime dependencies, effects, materials, shaders, and audio timing.
- Record unavailable dependencies as blocked.
- Test feedback during the actual runtime flow and after reuse.
- Check that the production caller binds the live feedback consumer.
- Observe actual audio output and listener state.
- Observe actual animation or effect changes.
- Check source-specific mechanisms only when the recovered path uses them.
- Check the controller, override, clip, event, receiver, and state-mutation chain.
- Index the audio event, setup, group, clip, mixer, and playback-rule chain.
- Sample that audio chain.

## State and lifecycle

- Check initialization, steady state, pause, and resume where relevant.
- Check interruption, completion, cancellation, teardown, and repeated entry where relevant.
- Guard asynchronous work against destroyed or reused objects.
- Restore the correct prior state after overlay or pause reasons clear.
- Consume one-shot context once.
- Clear consumed context.

## Platform and startup

- Check Editor and target compilation paths.
- Isolate platform access behind adapters.
- Preserve the required development fallback.
- Check startup and loading dependencies for unrelated heavy content.

## Handoff checks

- Complete required import, compile, targeted test, runtime acceptance, and production-loading checks.
- State partial-suite limits and unrelated failures.
- Capture baselines before tests mutate persistence, selection, active context, runtime mode, or temporary flags.
- Record successful baseline capture explicitly.
- Restore captured presence and values after completion or cancellation.
- Check persisted readback against the applicable baseline.
- Do not substitute defaults for uncaptured state after partial setup fails.
- Record uncaptured or unexplained earlier changes.
- Remove temporary validation assets that the test created.
- Inspect files that tools changed automatically in the worktree.
- Update ledger status, deferred variants, blockers, acceptance records, and commit state.
- Report static, headless, interactive, GPU, device, and paired-original results separately.
- Identify freshly loaded test code and the expected cases.
- Check actual discovery, filters, and executed counts.
- Reject zero-case results, stale loaded code, and cancellation acknowledgement as passing evidence.
- Check runner cessation before another test mutates shared state.
- Inspect saved production assets directly for structure-only verification.
- Do not regenerate production assets to prepare structure-only verification.
- When authoring is in scope, run the writer before final saved-output checks.
- Check that the writer preserves subsequent unrelated bindings.
- Clone mutable fonts, atlas dependencies, materials, and meshes before probes change them.
- Distinguish normal input routes from controlled injection and paired parity comparisons.

Use [verification recipes](restoration-verification-recipes.md) for test identity, baseline capture, cancellation, and mutable probes.

## MVP checkpoint

- Record MVP inclusions and exclusions under the main skill's scope rules.
- Provide exact launch instructions and a short user playtest path.
- Check required validation before marking `ready_for_user_playtest`.
- Apply the acceptance and revision states from `AGENTS.md` and the main skill.
