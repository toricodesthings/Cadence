# Cadence Desktop

Cadence Desktop is the Tauri v2 shell for the shared Cadence SPA in `apps/frontend`.

It embeds the frontend build output, keeps desktop-native code in `src-tauri`, and uses a small runtime boundary inside the frontend for notifications, deep links, external auth, updater checks, and native HTTP transport.

Local commands:

- `pnpm dev:desktop` from the repo root starts the desktop shell against the frontend dev server
- `pnpm --filter @cadence/desktop build:debug` builds an unbundled debug binary
- `pnpm --filter @cadence/desktop e2e:smoke` runs the desktop smoke suite after `tauri-driver` is installed

Reference docs:

- [`docs/tauri-porting-plan.md`](./docs/tauri-porting-plan.md)
