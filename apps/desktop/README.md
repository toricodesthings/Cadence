# Cadence Desktop

Cadence as a native app for Windows and Linux (Ubuntu). It is the web app inside a small **[Tauri](https://tauri.app/)** shell, so it stays light and looks the same everywhere.

## What the shell adds

- Global shortcuts and a quick-capture window
- A native menu, notifications and deep links
- Sign-in tokens kept in the OS keyring
- Automatic updates
- On Windows, an optional tray icon that keeps reminders coming while the window is closed

## Commands

From the repo root (needs the Rust and Tauri toolchain):

```bash
pnpm dev:desktop        # desktop shell against the local web app
pnpm dev:desktop:full   # same, plus the local API
pnpm build:desktop      # build an installer
```

Releases are built by CI from `pnpm release`. The version comes from the root `package.json`.

## See also

[Workspace](../../README.md) · [Frontend](../frontend/README.md) · [Backend](../backend/README.md) · [Changelog](../../CHANGELOG.md)
