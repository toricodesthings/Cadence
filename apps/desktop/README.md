# Cadence Desktop

Cadence Desktop is a wrapped version of the web app built with Tauri.

It embeds the frontend build output, keeps desktop-native code in `src-tauri`, and uses a small runtime boundary inside the frontend for notifications, deep links, external auth, updater checks, and native HTTP transport.

Local commands:

- `pnpm dev:desktop` from the repo root starts the desktop shell against the frontend dev server
- `pnpm --filter @cadence/desktop build:debug` builds an unbundled debug binary
- `pnpm --filter @cadence/desktop e2e:smoke` runs the desktop smoke suite after `tauri-driver` is installed

## Cadence Desktop vs Web

Both apps share the same codebase and features, but the desktop app has some additional capabilities:
- **Native Notifications**: Desktop notifications for updates, messages, and alerts.
- **Better Performance**: Optimized for desktop hardware, with faster load times and smoother interactions.
- **Native Integrations**: Access to native OS features like file system, clipboard, and more.
