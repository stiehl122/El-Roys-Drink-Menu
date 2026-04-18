# 2026-04-17 Auth Gate Bug Findings

Manual iOS bug pass for the native SwiftUI manager app.

## Test Scope

- Date: `2026-04-17`
- Build: Preview environment
- Device: `iPhone 17` simulator
- Coverage: unauthenticated auth-gate flows only
- Tooling note: Computer Use access remained blocked, so testing used the simulator tooling from the iOS build plugin instead

## Confirmed Bugs

### 1. Validation banners are persistent instead of transient

#### Repro

1. Launch the app to the auth gate.
2. Leave all fields empty.
3. Tap `Sign In`.
4. Wait at least 6 seconds.

#### Expected

The validation notice should dismiss itself after a short interval, or at minimum stop occupying permanent space once the user continues interacting with the form.

#### Actual

The inline `Missing Fields` banner remains pinned in the layout after 6 seconds and keeps pushing the rest of the form down.

### 2. Validation errors leak across auth mode switches

#### Repro

1. Launch the app to the auth gate.
2. Leave all fields empty.
3. Tap `Sign In` to trigger `Missing Fields`.
4. Switch to `Reset Password`.
5. Switch again to `Create Account`.

#### Expected

Changing auth modes should clear any stale notice that was produced by the previous mode, since the form requirements and primary action have changed.

#### Actual

The original sign-in error remains visible on both the reset-password and sign-up forms until another submit replaces it.

### 3. Auth mode labels are truncated on the default simulator width

#### Repro

1. Launch the app on the `iPhone 17` simulator.
2. View the segmented auth mode control.

#### Expected

Each mode label should remain readable without truncation.

#### Actual

`Create Account` and `Reset Password` are truncated to `Create Acc...` and `Reset Pass...`, which makes the auth mode switcher feel cramped.

## Notes

- The validation copy itself appears correct for the mode that generated it.
- I did not cover authenticated editor flows, save/send behavior, or menu management because this pass did not use a test staff account.
