# Cadence Desktop — Agent Instructions

Native desktop shell built with **Tauri v2**. It does not reimplement Cadence — it embeds the built [`@cadence/frontend`](../frontend) SPA in a webview (`frontendDist: "../../frontend/build/client"`) and gives it OS-level capabilities a browser page can't have (global shortcuts, OS keyring, native menu, deep links, notifications, auto-update). All product logic, UI, and API calls stay in the frontend package — this app is the native container + a thin JS↔Rust bridge, nothing more. The Rust code already guards desktop-only code behind `#[cfg(desktop)]` vs `#[cfg(mobile)]` — Tauri mobile (Android/iOS) is a scaffolded future target sharing this same shell (see `icons/ios`, `icons/android`, `CHANGELOG.md`: the old Expo prototype was removed in favor of this path). Do not assume desktop-only when writing shell code unless it's genuinely desktop-exclusive (single-instance, global shortcuts, native menu are — file system/keyring/notifications generally aren't).

## 1. What Lives Where

```text
apps/desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs   # Entry point only — hides the console window on Windows release builds, DO NOT REMOVE that attribute
│   │   └── lib.rs     # All real logic: plugin registration, app menu, desktop-command event bridge
│   ├── capabilities/  # Permission manifests (what the webview may call) — see §4
│   ├── icons/          # Per-platform icons, incl. ios/ and android/ subfolders (future mobile target)
│   ├── gen/schemas/    # Generated capability JSON schemas — do not hand-edit
│   ├── tauri.conf.json # Window config, CSP, bundle targets, plugin config (deep-link scheme, updater)
│   └── Cargo.toml      # Plugin dependency versions
├── tests/e2e/          # tauri-driver + selenium-webdriver + mocha smoke suite
├── scripts/
│   ├── sync-version.mjs      # Copies root package.json version into tauri.conf.json + Cargo.toml/.lock
│   └── dev-with-bridge.mjs   # Runs the frontend dev server on the bridge port for `tauri dev`
└── package.json
```

The actual UI/business logic for anything desktop-specific (quick-capture window contents, settings, layout scale, command handling) lives in the **frontend** package under `apps/frontend/app/platform/` and related hooks/routes — see [`apps/frontend/AGENTS.md`](../frontend/AGENTS.md) §11. This app never renders UI itself.

## 2. Versioning — Never Hand-Edit

The version lives **only** in the root `package.json` (repo-wide rule, see root `AGENTS.md`). `sync-version.mjs` reads it and writes it into `src-tauri/tauri.conf.json` (`"version"`) and `src-tauri/Cargo.toml`/`Cargo.lock`. It runs automatically before `build`, `build:debug`, `typecheck`, and `e2e:smoke` (chained in `package.json` scripts). Never edit the version in `tauri.conf.json` or `Cargo.toml` directly — it will be overwritten and will drift from the source of truth until it is.

## 3. Rust Shell (`src-tauri/src/lib.rs`)

- **Plugin registration order matters.** `tauri_plugin_single_instance` must register first (comment in code enforces this) — a second launch focuses the existing window instead of opening a new one, and forwards `argv`/`cwd` as a `single-instance` event.
- **Desktop-only plugins** (`#[cfg(desktop)]`, no Android/iOS implementation): `keyring` (secure credential storage — replaces browser storage for auth tokens on desktop), `oauth` (native OAuth loopback for social sign-in), `global-shortcut`, and the app menu itself.
- **Cross-platform plugins:** `deep-link` (custom `cadence://` scheme, registered at runtime on Windows/Linux in debug builds), `http` (native fetch transport — pairs with `patch-desktop-fetch.ts` in the frontend), `notification`, `opener`, `store`, `process`, `log` (Info in debug, Warn in release), `updater` (desktop only, initialized last).
- **Native app menu** (`build_app_menu`): File (Quick Capture, Settings, Sync Now, Check for Updates, Quit), Edit (standard), View (Search, Command Palette, Sync Inspector, layout scale ±/reset), Navigate (Capture, Schedule, Habits, Weekly Review), Window, Help. Every menu item handler calls `focus_main_window` then `emit_desktop_command(app, "<command>", value)`.
- **The command bridge is one-directional and generic.** Rust never mutates app state directly — `emit_desktop_command` fires a `cadence://desktop-command` event with `{ command, value }` to the `"main"` window; the frontend's `app/platform/desktop-shell.ts` (or equivalent listener) is what interprets `open-quick-capture`, `show-settings`, `sync-now`, `navigate-*`, `layout-scale-*`, `show-command-palette`, etc. **Adding a new menu/shortcut action means adding both**: the Rust emit call *and* the frontend command handler — one without the other is a dead button or an unreachable code path.
- Global shortcuts are registered via the `global-shortcut` plugin at setup, desktop-only.

## 4. Capabilities & Security — Least Privilege

`src-tauri/capabilities/*.json` is the **only** source of what the webview may do — anything not listed is refused at runtime, not just hidden. The current `main-window` capability scopes to windows `["main", "quick-capture"]` and permissions: `core:default`, webview window creation, `deep-link:default`, `global-shortcut:default`, `keyring:allow-{set,get,delete}-secret`, `notification:default`, `oauth:allow-{cancel,start}`, `opener:default`, `process:default`, `store:default`, `updater:default`, and a scoped `http:default` allowlist (localhost dev ports, `api.cadenceapp.cloud`, the two Neon Auth branch hosts). **Adding a new native capability requires adding its permission here explicitly** — there is no implicit grant.

CSP is defined separately in `tauri.conf.json` (`app.security.csp`) from the web app's `apps/frontend/public/_headers` — the desktop CSP additionally allows `ipc:`/`http://ipc.localhost` (Tauri's IPC transport) and `asset:`/`http://asset.localhost` (local asset loading), and is **not** relaxed to match production web-only origins. Keep both CSPs in sync manually when adding a new external domain the frontend needs to reach.

## 5. Updater & Distribution

`tauri.conf.json#bundle`: targets `appimage`/`dmg`/`nsis`, `createUpdaterArtifacts: true`. The `updater` plugin checks `https://github.com/toricodesthings/Cadence/releases/latest/download/latest.json`, verified against the embedded `pubkey`. A release is produced by `pnpm release` at the repo root (tags `vX.Y.Z`, which is what the desktop build pipeline should key off) — never hand-roll a release artifact outside that flow.

## 6. Dev Workflow

- `pnpm dev:desktop` (repo root) → `tauri dev`, which runs `beforeDevCommand` (`pnpm run dev:frontend`, i.e. `dev-with-bridge.mjs`) and points the webview at `devUrl` (`http://localhost:8790`). The bridge script runs the frontend's own dev server on a separate port so hot reload works through the Tauri devUrl without port collision with a plain `pnpm dev:frontend` run.
- `pnpm dev:desktop:full` (repo root) runs backend + desktop together via Turborepo.
- A production build (`pnpm --filter @cadence/desktop build`) runs `beforeBuildCommand` (`pnpm --filter @cadence/frontend build:desktop`) first, then `tauri build`.
- `additionalWatchFolders` includes `../../frontend` and `../../../packages` — changes to shared packages are picked up without restarting `tauri dev`.

## 7. Testing

`tests/e2e/` uses the official Tauri WebDriver flow: `tauri-driver` (installed via `cargo install tauri-driver --locked`, not a workspace dependency) + `selenium-webdriver` + `mocha`/`chai`. `smoke.test.mjs` runs `build:debug` itself (with `VITE_DESKTOP_E2E=true`), then launches `src-tauri/target/debug/cadence-desktop[.exe]`. `cargo fmt --check` + `cargo clippy --all-targets -D warnings` run as `typecheck` — treat clippy warnings as build failures, matching the `-D warnings` flag.

## 8. Commands

```bash
pnpm dev:desktop              # from repo root
pnpm dev:desktop:full         # backend + desktop together
pnpm --filter @cadence/desktop build            # sync-version + tauri build (installers)
pnpm --filter @cadence/desktop build:debug      # sync-version + unbundled debug binary
pnpm --filter @cadence/desktop typecheck        # sync-version + fmt --check + clippy -D warnings
pnpm --filter @cadence/desktop e2e:smoke        # sync-version + debug build + mocha smoke suite (needs tauri-driver)
```

## 9. Anti-Patterns

- Editing the version in `tauri.conf.json`/`Cargo.toml` by hand instead of letting `sync-version.mjs` do it.
- Putting product UI or business logic in `src-tauri/` — it belongs in the frontend.
- Granting a native capability implicitly by calling a plugin API without adding the matching permission to `capabilities/*.json`.
- Adding a menu item or global shortcut in `lib.rs` without a corresponding frontend handler for the emitted command (or vice versa).
- Assuming every plugin here is desktop-only — most (deep-link, http, notification, opener, store, process) are cross-platform and must stay compatible with the eventual mobile target.
- Widening the desktop CSP or the frontend CSP without checking whether the other needs the same change.
- Hand-editing files under `src-tauri/gen/` (generated).

## 10. Checklist for New Native Behavior

1. Does the frontend actually need OS-level access, or can it stay pure web code behind `app/platform/web.ts` / `desktop.ts`? Prefer the latter.
2. Add/confirm the plugin in `Cargo.toml` + register it in `lib.rs` (respect `#[cfg(desktop)]` vs. cross-platform placement).
3. Add the exact permission(s) needed to `capabilities/*.json` — nothing broader.
4. If it's a menu item or shortcut: add the Rust handler (`emit_desktop_command`) **and** the frontend listener/command handler.
5. If it needs a new external host: add it to both `tauri.conf.json` CSP and, if the web app also needs it, `apps/frontend/public/_headers`.
6. Run `pnpm --filter @cadence/desktop typecheck` and, if behavior-affecting, the `e2e:smoke` suite.

If this document conflicts with a proposed change, this document is the baseline.
