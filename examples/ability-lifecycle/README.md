# Skill lifecycle case

This is an optional source-backed implementation example, not a built-in investigator template. The source-specific WarriorCore values10/.5/false/1 live in this example. Generic operations contain no character names, PathIDs, these timing constants or game-specific generated C#.

The selected source uses normalized unscaled recharge, dual-held priming with cancel/activate on release, an independent direct-button hold timer, optional single-use locking and lifecycle input cleanup. The target maps logical dual input to Space and direct hold to its own pointer UI. The activation effect hook remains an integration boundary; Warrior attacks, damage and original art are outside this case.

Stage these files inside a private evidence workspace after inspecting your target. Associate claims with actual native/component evidence. Supply target-specific file paths and adaptation decisions to `plan-transfer` / `apply-transfer`. Do not copy another case's sources, configuration or claims without investigating them.

`AbilityValidation.Run` is a create-only example fixture for the historical pending-coin target scene. It refuses existing `Ability.prefab` and `Integrated.unity` outputs and checks save results. It runs21 state/scene/actual PlayMode checks. This scene fixture is intentionally case-specific; adapt it to your own target. Run it once in a new owned target copy. `BuildAbilityPlayer.Build` takes a new `REA_UNITY_PLAYER_OUTPUT` path and builds only that integrated scene. Neither script belongs in generic investigation tooling.

The [verification report](../../docs/general-feature-loop-verification.md) records original APK normal inputs, target real inputs, baselines, failures and unresolved scope. Mouse system-event use requires the host's authorization and OS permissions; the package never grants them.
