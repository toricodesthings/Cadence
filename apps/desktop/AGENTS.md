# Cadence Desktop — Agent Rules

Tauri v2 shell for Windows and Linux (Ubuntu). It embeds the built frontend SPA and adds OS features: keyring, global shortcuts, native menu, tray, deep links, notifications, auto-update.

- No product UI or logic here. It lives in the frontend under `app/platform/`; see `apps/frontend/AGENTS.md`.
- Rust lives in `src-tauri/src/lib.rs`. `main.rs` is the entry only; never remove its Windows console-hiding attribute.
- Never hand-edit `src-tauri/gen/` (generated).
- oxlint doesn't cover Rust. `typecheck` runs `cargo fmt --check` and `cargo clippy -D warnings`; treat any warning as a failure.

## Version

- The version lives only in the root `package.json`.
- `scripts/sync-version.mjs` copies it into `tauri.conf.json` and `Cargo.toml`/`.lock` before `build`, `build:debug` and `typecheck`.
- Never edit the version in those files.

## Rust shell

- `tauri_plugin_single_instance` registers first. A second launch focuses the running window.
- Use `#[cfg(desktop)]` only for truly desktop-only code: single instance, global shortcuts, menu, keyring, OAuth loopback, window state. Keep the other plugins cross-platform; Tauri mobile is a future target.
- `#[cfg(windows)]` code: Efficiency mode, the tray, the Jump List, autostart.
- Rust never changes app state. It calls `emit_desktop_command(app, "<command>", value)`, and the frontend handles the command.
- A new menu item or shortcut needs both the Rust emit and the frontend handler. One without the other is a dead button.
- Keep app commands (`store_*`, `take_launch_command`, `save_text_as`) narrow: validated names, never a path from the webview.

**Windows background delivery (tray)**
- Opt-in. Read once at startup from `backgroundDelivery` in `cadence_desktop_preferences.dat`.
- A change takes effect on the next launch, never mid-session.
- Close hides to tray only if the tray has existed since startup. A tray must never appear late, or the person loses their way back in.

## Capabilities and CSP

- `src-tauri/capabilities/*.json` is the only grant of what the webview may call. Anything unlisted is refused at runtime.
- A new plugin API needs its exact permission added; nothing broader.
- Windows-only plugins (autostart) go in the `windows-background` capability (`"platforms": ["windows"]`).
- The desktop CSP (`tauri.conf.json` › `app.security.csp`) is separate from the web's `apps/frontend/public/_headers`. A new external host goes in both, by hand.

## Release

- Release only via `pnpm release` at the repo root. Never hand-roll an artifact.
- The `vX.Y.Z` tag runs `.github/workflows/cadence-desktop-release.yml`. It builds Windows (NSIS) and Linux (AppImage, deb, rpm) and signs the update.
- Linux builds on ubuntu-22.04 to keep the glibc floor low.
- The updater installs quietly on Windows (per-user installer, no elevation).

## Dev and tests

- `pnpm dev:desktop` (repo root) runs `tauri dev` against the frontend dev server on port 8790.
- `pnpm dev:desktop:full` adds the backend.
- Clippy checks the host OS only. `#[cfg(windows)]` code is checked on Windows CI, or locally with `--target x86_64-pc-windows-gnu` plus MinGW and `windres`.
- `e2e:smoke` needs `tauri-driver` (`cargo install tauri-driver --locked`) and `VITE_DESKTOP_E2E=true`; without it the test bridge is missing.
- `cargo test` covers the launch-flag allowlist.

## New native behaviour

1. Can it stay web code behind `app/platform/`? Prefer that.
2. Add the plugin to `Cargo.toml` and register it in `lib.rs`, with the right `cfg`.
3. Add the exact permission to `capabilities/`.
4. Menu item or shortcut: Rust emit plus frontend handler.
5. New external host: both CSPs.
6. Run `typecheck`. If behaviour changed, run `e2e:smoke` too.
