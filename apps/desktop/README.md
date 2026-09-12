# Cadence Desktop

Cadence Desktop is the native desktop app — the same Cadence you'd use in a browser, wrapped in a small native shell so it feels like a real app on your machine: it lives in your dock/taskbar, has a real menu bar, fires OS-level notifications, and can be brought up instantly with a global keyboard shortcut.

## In plain terms

- It's built with **[Tauri](https://tauri.app/) v2** — a framework that pairs a native Rust "shell" with a webview showing your existing web frontend, instead of bundling a whole separate browser (that's what Electron does; Tauri apps are much smaller).
- The native Rust code lives in `src-tauri/`. It doesn't reimplement the app — it just gives the embedded frontend access to things a browser page normally can't do.
- The frontend itself is the exact same [`@cadence/frontend`](../frontend) codebase, built in a special "desktop" mode. Code that needs to behave differently between web and desktop lives behind a small runtime boundary in `apps/frontend/app/platform/` (e.g. "store this token in the OS keychain" vs. "store it in the browser").

## What the native shell actually adds

Defined in `src-tauri/capabilities/` (Tauri's permission system — the app can only do what's explicitly listed there) and `src-tauri/src/lib.rs`:

- **Global keyboard shortcuts** — bring up quick-capture, search, or the command palette from anywhere on your desktop, even if Cadence isn't focused
- **A quick-capture window** — a separate lightweight window for jotting a task down fast, without switching to the full app
- **Native app menu** — real OS menu bar entries for settings, sync, shortcuts, and navigation
- **Secure credential storage** — auth tokens are stored in the OS keyring (Keychain/Credential Manager/Secret Service), not browser local storage
- **Deep links & native OAuth** — sign-in redirects work through the OS instead of a browser tab
- **Native notifications** — real OS notifications instead of browser web notifications
- **Auto-updater** — the app can check for and install new versions
- **Single-instance enforcement** — opening Cadence again focuses the existing window instead of launching a second one

## Commands

Run from the repository root:

```bash
pnpm dev:desktop              # starts the desktop shell against the frontend dev server
pnpm dev:desktop:full         # backend + desktop together, in parallel
pnpm --filter @cadence/desktop build            # production build (installer/bundle)
pnpm --filter @cadence/desktop build:debug      # unbundled debug binary
pnpm --filter @cadence/desktop typecheck        # cargo check + fmt + clippy
pnpm --filter @cadence/desktop e2e:smoke        # desktop smoke suite (requires tauri-driver)
```

Or run them from this directory with `pnpm <script>`.

## Structure

```text
apps/desktop/
├── src-tauri/
│   ├── src/            Rust: window/menu setup, global shortcuts, deep-link + tray wiring
│   ├── capabilities/   Permission manifests — exactly what the webview is allowed to do
│   └── icons/          App icons for every platform
├── e2e/                 Smoke tests driven by tauri-driver + Selenium WebDriver
├── scripts/
│   ├── sync-version.mjs      Copies the version from the root package.json into Tauri/Cargo files
│   └── dev-with-bridge.mjs   Runs the frontend dev server in desktop-bridge mode
└── package.json
```

The version number is never set by hand here — `pnpm release` at the repo root bumps the root `package.json`, and `sync-version.mjs` copies it into `tauri.conf.json` and `Cargo.toml` at build time.

## Related Docs

- [Workspace root](../../README.md)
- [Frontend app](../frontend/README.md)
- [Backend app](../backend/README.md)
- [Changelog](../../CHANGELOG.md)
