# Cadence Desktop Porting Plan

Context: this plan is based on the current Cadence monorepo and the current official Tauri v2 documentation reviewed on March 14, 2026.

## Executive Summary

Cadence is already in the right shape for a desktop port:

- the frontend is a React Router SPA in `apps/frontend`
- the backend is consumed over API contracts from `@cadence/backend`
- there is no server-rendering dependency to unwind

The correct architecture is not "copy the web app into a new desktop app". The correct architecture is:

1. Keep `apps/frontend` as the source of truth for Cadence UI, routes, hooks, and API behavior.
2. Build `apps/desktop` as a thin Tauri shell that embeds the frontend build output and adds only desktop-native concerns.
3. Add a small platform boundary inside the frontend so desktop-specific behavior is isolated and web updates continue to flow into desktop with minimal friction.

That gives us fast initial porting, low drift, and a release/update model that can stay maintainable.

This plan assumes one additional product rule:

- desktop exists to accurately reflect the Cadence application in a native shell for users who want that experience
- mobile is a separate product surface and should not shape the desktop architecture, packaging, runtime decisions, or CI design

## Goals

- Ship a Tauri desktop app for macOS, Windows, and Linux without backend code changes.
- Preserve feature parity with the current SPA wherever the browser runtime is not a hard blocker.
- Keep the frontend as the sole product source of truth so desktop reflects the web application accurately.
- Make frontend updates automatically validate against desktop in CI.
- Keep the desktop-specific code surface small and explicit.
- Add signed desktop release artifacts and signed in-app updates.

## Non-Goals

- No backend API redesign.
- No frontend fork.
- No mobile-driven abstractions or compromises in the desktop plan.
- No major design refresh during the port.
- No migration of all browser storage to native storage on day one unless a specific issue forces it.

## Current Repo Assessment

The current monorepo already suggests the right direction:

- `apps/frontend` is a client-rendered React Router v7 SPA with `ssr: false`.
- `apps/frontend` builds static client assets via `react-router build`.
- `apps/frontend/app/root.tsx` registers a service worker and links `manifest.webmanifest`.
- Browser notifications are implemented through the Web Notification API in `app/hooks/notifications/use-browser-notifications.ts`.
- Auth and social account linking currently depend on browser location callbacks such as `window.location.href`.
- `apps/desktop` exists only as a placeholder.
- `packages/` is effectively empty, so there is no shared frontend-core package yet.

Implication: the fastest safe path is to keep the frontend where it is, add a platform adapter layer, and have Tauri consume the frontend build output.

Critical repo-specific constraint:

- `apps/backend/src/index.ts` currently allows CORS only for `http://localhost:*` and `https://dashboard.cadenceapp.cloud`
- a packaged Tauri app will not present one of those browser origins by default

Implication:

- the desktop plan cannot rely on ordinary browser `fetch` to call the Cadence API from a packaged webview without either backend CORS changes or a native transport layer
- because the agreed architecture avoids backend changes, the desktop runtime should use Tauri's HTTP client plugin for API transport

## Recommended Target Architecture

### Principle

`apps/frontend` remains the product codebase. `apps/desktop` is the runtime shell, native plugins, release configuration, and desktop test harness.

### Target Layout

```text
apps/
├── frontend/                  # source of truth for Cadence UI
└── desktop/
    ├── package.json           # tauri scripts
    ├── docs/
    ├── e2e/                   # desktop smoke tests
    └── src-tauri/
        ├── Cargo.toml
        ├── tauri.conf.json
        ├── capabilities/
        ├── icons/
        └── src/
            ├── lib.rs
            └── main.rs
```

### Frontend Integration Model

Do not move routes/components into `apps/desktop`.

Instead:

- keep routes, components, hooks, and API code in `apps/frontend`
- add a small runtime abstraction, for example:
  - `apps/frontend/app/platform/runtime.ts`
  - `apps/frontend/app/platform/web.ts`
  - `apps/frontend/app/platform/desktop.ts`
- route browser-only and desktop-only behavior through that boundary

That boundary should own:

- notification implementation
- OAuth/account-link callback behavior
- external URL opening
- update checks
- any future file-system or native dialog integration

## Recommended Build and Dev Flow

Use Tauri exactly as intended for bundler-backed apps:

- `beforeDevCommand` starts the frontend dev server
- `devUrl` points the Tauri webview at that dev server
- `beforeBuildCommand` builds the frontend
- `frontendDist` points at the built frontend assets so they are embedded into the app binary
- `additionalWatchFolders` watches frontend and shared workspace paths so desktop hot reload follows frontend edits

For Cadence, the production asset source should be the existing React Router client build:

- frontend build output: `apps/frontend/build/client`
- from `apps/desktop/src-tauri/tauri.conf.json`, that is typically `../../frontend/build/client`

Recommended Tauri build config shape:

```json
{
  "identifier": "com.cadence.desktop",
  "build": {
    "beforeDevCommand": {
      "cwd": "../..",
      "script": "pnpm --filter @cadence/frontend dev:desktop",
      "wait": false
    },
    "devUrl": "http://localhost:8788",
    "beforeBuildCommand": {
      "cwd": "../..",
      "script": "pnpm --filter @cadence/frontend build:desktop"
    },
    "frontendDist": "../../frontend/build/client",
    "additionalWatchFolders": [
      "../../frontend",
      "../../../packages"
    ]
  }
}
```

Notes:

- Keep the existing frontend port `8788` unless there is a concrete reason to change it.
- Set the desktop package scripts so Tauri is invoked from `apps/desktop`, but frontend commands execute from the repo root.
- Choose the `identifier` once and keep it stable. Tauri uses it for bundle identity and the webview data directory.

Recommended script split:

- root `package.json`
  - `dev:desktop`: run the Tauri shell
  - `dev:desktop:full`: run backend + frontend + desktop together for local feature work
- `apps/frontend/package.json`
  - `dev:desktop`: same React Router dev server, but with desktop runtime env
  - `build:desktop`: production frontend build for Tauri embedding
- `apps/desktop/package.json`
  - `dev`: `tauri dev`
  - `build`: `tauri build`
  - `build:debug`: `tauri build --debug --no-bundle`
  - `typecheck`: Rust + desktop package checks

### Environment and Build Variable Strategy

This needs to be explicit because the current frontend production build hard-fails unless public env vars are set.

Current required frontend env:

- `VITE_API_BASE_URL`
- `VITE_NEON_AUTH_URL`

Desktop-specific additions:

- `VITE_RUNTIME_TARGET=desktop`

Required plan:

- desktop builds must not depend on Wrangler-managed frontend env
- define a dedicated desktop env source such as `.env.desktop` plus `.env.desktop.example`
- in CI, pass the public desktop env values through GitHub Actions variables or workflow env
- treat these as public build configuration, not secrets, unless a future value truly becomes sensitive

Recommended desktop env matrix:

- local desktop + local backend:
  - `VITE_API_BASE_URL=http://localhost:8787`
- local desktop + shared dev backend:
  - use the existing dev/staging API base URL
- CI/release desktop:
  - production API and Neon Auth URLs

## Frontend Refactor Plan

This is the critical part that keeps future updates easy.

### 1. Add explicit runtime targeting

Introduce a compile-time environment variable such as:

- `VITE_RUNTIME_TARGET=web`
- `VITE_RUNTIME_TARGET=desktop`

Use it for narrow runtime branching only. Do not scatter `if (isTauri)` checks across the app.

### 2. Add a platform adapter layer

Create a small interface such as:

- `sendNotification()`
- `requestNotificationPermission()`
- `openExternalUrl()`
- `getAuthCallbackUrl()`
- `listenForAuthCallback()`
- `checkForAppUpdate()`
- `platformFetch()`

The web implementation keeps current behavior. The desktop implementation uses Tauri plugins.

### 3. Keep product logic shared

All of the following should remain shared:

- routes
- TanStack Query hooks
- Hono RPC client usage
- optimistic mutation logic
- Zustand stores
- calendar/task/habit rendering
- command palette and keyboard workflows

### 4. Move web deployment concerns behind a guard

Desktop should not behave like a PWA.

Guard or remove for desktop builds:

- manifest link
- service worker registration
- any PWA install assumptions

Reason:

- service workers can cache stale assets and fight the desktop updater
- the app bundle itself becomes the distribution/update unit

### 5. Self-host fonts for desktop

`app/root.tsx` currently loads Google Fonts from a remote stylesheet.

For desktop builds:

- vendor the fonts into frontend assets
- switch links to local assets
- avoid unnecessary remote dependencies during app startup

This also simplifies security and offline behavior.

## Desktop-Native Feature Mapping

### Notifications

Current state:

- in-app notification center is app-level logic
- native notifications use the browser `Notification` API

Desktop plan:

- keep the in-app notification center exactly as-is
- replace the native notification transport with `@tauri-apps/plugin-notification`

Why:

- the official notification plugin is the correct native path
- on Windows it only fully works for installed apps; development uses a PowerShell identity/icon, which is expected

Implementation notes:

- keep current permission UX in settings
- map browser permission checks to Tauri notification permission APIs
- treat notification transport as platform infrastructure, not product logic

### Auth and Social Login

Current state:

- auth routes are web-native
- social account linking uses `window.location.href` callbacks

Desktop risk:

- embedded webviews are a fragile place for OAuth and some providers discourage or block embedded-browser flows

Desktop plan:

- keep email/password flows inside the app where they work
- open social/OAuth flows in the default system browser
- return to the app through a custom deep link

Recommended Tauri plugins:

- `@tauri-apps/plugin-opener` to open the external browser
- `@tauri-apps/plugin-deep-link`
- `tauri-plugin-single-instance` with deep-link integration

Recommended callback shape:

- desktop scheme: `cadence://auth/callback`
- web keeps its existing callback URLs

Non-code requirement:

- add the desktop redirect URI to Neon Auth / OAuth provider configuration

This is not a backend code change, but it is required platform configuration.

Important validation gate:

- do not assume Neon Auth's browser SDK will work unchanged from a Tauri custom-protocol origin
- verify the sign-in, session restore, and account-link flows against Neon Auth from a packaged desktop build early
- if browser-origin restrictions appear, prefer platform configuration or native transport adaptation over duplicating auth logic in desktop

### Deep Linking

Use deep links for:

- auth callbacks
- future open-in-app links from email, browser, or OS integrations

Important Tauri constraints:

- on Linux and Windows, deep links arrive as command-line args to a new process
- the deep-link plugin integrates with the single-instance plugin so the running app receives the event
- in development, `register_all()` should be used on Linux and Windows so testing works before installation
- on macOS, deep links are realistically tested against an installed app in `/Applications`

### App Updates

Use the Tauri updater plugin from the start. Do not bolt it on later.

Why:

- desktop shipping without a signed update path creates operational debt immediately
- Tauri requires signed updates and generates updater artifacts as part of bundling

Recommended updater model for v1:

- GitHub Releases + Tauri updater static `latest.json`

Why this is the right initial choice:

- lowest ops overhead
- official GitHub distribution guide already aligns with `tauri-action`
- no separate update server required for the first desktop release

When to outgrow it:

- if Cadence needs stable/beta/nightly channels
- if staged rollouts or org-specific channels are required

At that point, move to runtime-configured updater endpoints or a dedicated service.

### External URL Handling

Do not depend on raw browser behavior for desktop external links.

Use the opener plugin and allow only the URL patterns you actually need through capabilities.

### Network Transport and CORS

This is a mandatory item, not an implementation detail.

Because the current backend CORS policy does not allow a packaged Tauri origin, desktop should centralize all API transport behind a native-capable fetch boundary.

Recommended implementation:

- use `@tauri-apps/plugin-http` for desktop API requests
- keep ordinary browser `fetch` on web
- route both through the `platformFetch()` adapter so application code does not care which transport is active
- ensure the Tauri capability file only allows requests to the Cadence API and auth origins that are actually required

Important rule:

- do not scatter direct imports of the Tauri HTTP plugin across hooks/components
- all transport selection must stay centralized so frontend and desktop remain behaviorally aligned

### Storage

Keep the current browser-side persistence first:

- localStorage
- IndexedDB / `idb-keyval`

This will work inside the webview and avoids a large storage migration.

Only introduce native storage if one of these becomes true:

- you need OS-level file visibility/import-export
- you hit webview storage reliability issues on a target platform
- you need data outside the webview profile

## Security and Capability Model

Tauri v2 capabilities are one of the biggest places where teams either stay disciplined or create a mess.

Cadence should take the strict path.

### Rules

- define capability files in `apps/desktop/src-tauri/capabilities/`
- explicitly list enabled capabilities in `tauri.conf.json`
- grant only the plugins Cadence actually uses
- do not enable broad shell/process/file-system permissions unless a product feature requires them

Recommended initial capability split:

- `main-window.json`
  - core window/event/path defaults
  - http client permissions scoped to Cadence API and Neon Auth origins
  - opener default URL permissions
  - notification default
  - updater default
  - deep-link default
- optional platform-specific capability files later if Linux/macOS/Windows diverge

Reason:

- capability files in `src-tauri/capabilities` are auto-enabled unless the app explicitly enumerates which ones to use
- explicit enumeration prevents accidental permission growth

## Packaging Strategy

Start with the smallest release surface that still covers real users:

- macOS: DMG
- Windows: NSIS
- Linux: AppImage

Optional later:

- Windows MSI for enterprise deployment
- Linux DEB if package-manager install becomes important

Why this mix:

- it reduces release complexity
- it keeps the updater story straightforward
- it matches common direct-download expectations

## CI and Release Architecture

The desktop port should ship with two GitHub Actions workflows from day one.

### 1. `desktop-verify.yml`

Purpose:

- run on pull requests and pushes that touch desktop-relevant files
- ensure frontend changes do not silently break desktop

Path filters should include at minimum:

- `apps/frontend/**`
- `apps/desktop/**`
- `apps/backend/**`
- `packages/**`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `turbo.json`

Recommended job split:

1. `frontend-check`
   - `pnpm install --frozen-lockfile`
   - `pnpm --filter @cadence/frontend test`
   - `pnpm --filter @cadence/frontend typecheck`
   - optional `pnpm lint`

2. `desktop-build-smoke`
   - matrix: `ubuntu-latest`, `windows-latest`, `macos-latest`
   - install Rust stable
   - install Linux WebKit dependencies on Ubuntu
   - set desktop build env explicitly: `VITE_RUNTIME_TARGET`, `VITE_API_BASE_URL`, `VITE_NEON_AUTH_URL`
   - run `pnpm --filter @cadence/desktop build:debug` or `tauri build --debug --no-bundle`
   - run `cargo fmt --check`
   - run `cargo clippy --all-targets -- -D warnings`

3. `desktop-e2e-smoke`
   - matrix: `ubuntu-latest`, `windows-latest`
   - use Tauri WebDriver testing with `tauri-driver`
   - on Linux install `webkit2gtk-driver` and use `xvfb-run`

4. `desktop-sync-guard`
   - verify desktop builds the frontend from the same commit under test
   - do not allow the workflow to download or reuse a separately deployed web artifact
   - ensure the desktop bundle embeds a freshly built `apps/frontend/build/client`

Why no macOS WebDriver:

- official Tauri desktop WebDriver support does not exist on macOS because WKWebView has no desktop WebDriver client

### 2. `desktop-release.yml`

Purpose:

- build signed installers
- publish release artifacts
- generate updater artifacts

Recommended trigger:

- tag push such as `desktop-v*`
- plus `workflow_dispatch`

Recommended matrix:

- `macos-latest` with `--target aarch64-apple-darwin`
- `macos-latest` with `--target x86_64-apple-darwin`
- `windows-latest`
- `ubuntu-22.04`

Optional:

- `ubuntu-22.04-arm` only if Linux ARM distribution matters enough to justify the CI cost

Implementation notes:

- use `tauri-apps/tauri-action`
- because this is a monorepo, set `projectPath: apps/desktop`
- grant `contents: write` to the workflow token
- set desktop release env explicitly: `VITE_RUNTIME_TARGET=desktop` plus production `VITE_API_BASE_URL` and `VITE_NEON_AUTH_URL`
- use Rust and pnpm caching

Important note:

- the official Tauri GitHub pipeline guide still shows `tauri-action@v0`
- the action itself has newer tagged releases, so pin the current stable release explicitly when implementing the workflow
- the release workflow should build from the tagged commit directly; it should not pull frontend assets from a prior web deployment job

Recommended workflow hygiene:

- set branch protection so `desktop-verify` is a required status check for merges to the main branch
- use `concurrency` to cancel superseded desktop verification runs on the same branch
- cache pnpm store, Cargo registry, and Cargo target directories to keep desktop feedback loops tolerable
- pin Node, pnpm, and Rust toolchain versions explicitly in CI so local and CI behavior stay close

### Signing and Secret Inventory

Windows:

- code signing certificate or Azure signing setup
- if using a certificate in CI, store the base64 certificate and password as secrets

macOS:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- notarization credentials via App Store Connect API:
  - `APPLE_API_ISSUER`
  - `APPLE_API_KEY`
  - `APPLE_API_KEY_PATH` or equivalent CI materialization step

Updater:

- Tauri updater public key checked into config
- Tauri updater private key stored securely in CI only

GitHub:

- ensure Actions workflow permissions allow write access for releases

## Updater Configuration Plan

Use the updater in phase 1 of release hardening, not after GA.

Recommended config direction:

```json
{
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<PUBLIC_KEY>",
      "endpoints": [
        "https://github.com/<org>/<repo>/releases/latest/download/latest.json"
      ]
    }
  }
}
```

Recommended app behavior:

- check for updates on app start after auth settles
- expose a manual "Check for updates" action in Settings
- download in background
- prompt before restart
- keep release notes visible in the prompt

Platform notes:

- on Windows, the updater exits the app before install as part of the installer flow
- use Tauri's default Windows install mode unless product requirements prove otherwise

## Versioning Strategy

Do not manually bump version values in multiple places forever.

Make one version source authoritative for desktop releases and sync the rest in CI or a release script.

Recommended source of truth:

- `apps/desktop/package.json` or a dedicated release manifest

Then sync:

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`

If Cadence later adopts Changesets, desktop versioning can fold into that process.

## Implementation Phases

### Phase 0: Bootstrap and Skeleton

Deliverables:

- initialize a Tauri v2 app inside `apps/desktop`
- add root scripts:
  - `dev:desktop`
  - `build:desktop`
  - `typecheck:desktop`
- configure Tauri to point at the frontend dev server and build output
- verify the existing SPA renders in Tauri without feature work

Exit criteria:

- `pnpm dev:desktop` opens Cadence in a native shell
- a local production build embeds the frontend assets successfully

### Phase 1: Runtime Boundary

Deliverables:

- add `VITE_RUNTIME_TARGET`
- add the platform adapter layer
- gate service worker and manifest behavior for desktop
- self-host fonts for desktop builds
- add dedicated desktop env files and CI env wiring
- add centralized native HTTP transport for desktop API access

Exit criteria:

- web and desktop both build from the same frontend source tree
- no duplicate route/component trees exist

### Phase 2: Native Integrations

Deliverables:

- notification plugin integration
- opener plugin integration
- deep-link plugin integration
- single-instance plugin integration
- OAuth callback handling through custom scheme

Exit criteria:

- desktop notifications work on installed builds
- social login/account linking round-trips through the system browser back into the app

### Phase 3: Security Hardening

Deliverables:

- capability files with least privilege
- explicit capability enumeration in config
- no unnecessary shell/process/file access
- audit all desktop-specific permissions

Exit criteria:

- every enabled permission maps to a real feature
- no "temporary broad permission" remains in the main branch

### Phase 4: CI and Testing

Deliverables:

- `desktop-verify.yml`
- smoke e2e suite using `tauri-driver`
- Linux and Windows WebDriver coverage
- PR path filters wired so frontend changes trigger desktop validation

Suggested smoke tests:

- app boots to auth or home state
- core routes load
- notification permission flow does not crash
- updater UI entry renders safely
- auth callback deep link is handled
- desktop API requests succeed without browser CORS failures
- session restore works after app restart

Exit criteria:

- a frontend-only PR that breaks desktop fails before merge

### Phase 5: Release and Auto-Update

Deliverables:

- signed release pipeline
- updater keys
- draft GitHub release flow
- in-app update prompt

Exit criteria:

- a tagged build produces signed desktop artifacts
- the installed app can discover and install a signed update

## Risk Register

### OAuth in embedded webviews

Risk:

- provider restrictions or broken callback flows

Mitigation:

- use external browser + deep link callback from the start for social login

### Service worker asset staleness

Risk:

- desktop app keeps stale frontend code because the service worker caches assets independently of Tauri updates

Mitigation:

- disable service worker registration in desktop builds

### Permission sprawl

Risk:

- broad capabilities make the desktop app harder to audit

Mitigation:

- capability files per feature
- explicit capability enumeration

### Frontend drift

Risk:

- desktop becomes a fork of web

Mitigation:

- keep one frontend codebase
- put runtime differences behind adapters only
- make frontend changes trigger desktop CI
- never source desktop assets from a separate web deployment artifact

### Hidden network/origin regressions

Risk:

- desktop appears healthy in local dev but fails in packaged builds due to origin, auth, or CORS constraints

Mitigation:

- validate API, auth, and deep-link flows against packaged builds early
- centralize desktop transport in the native HTTP adapter
- keep a packaged-build smoke test in the release checklist

### Platform-specific auth testing gaps

Risk:

- deep-link flows appear fine on Linux/Windows dev but break on installed macOS builds

Mitigation:

- add a manual macOS installed-build auth checklist before the first public release

## Acceptance Criteria

The port is done when all of the following are true:

- desktop uses the existing Cadence SPA rather than a duplicated frontend
- backend API contracts are unchanged
- web and desktop are both built from the same route/component tree
- desktop network/auth behavior is explicitly validated against packaged builds, not only `tauri dev`
- desktop-native notifications, external auth return, and updater work
- GitHub Actions validates desktop whenever frontend code changes
- signed installers and signed updater artifacts are produced in CI

## Official Tauri References Used

- Configuration: https://v2.tauri.app/reference/config/
- Capabilities: https://v2.tauri.app/security/capabilities/
- Notifications plugin: https://v2.tauri.app/plugin/notification/
- Deep linking plugin: https://v2.tauri.app/plugin/deep-linking/
- Opener plugin: https://v2.tauri.app/plugin/opener/
- HTTP client plugin: https://v2.tauri.app/plugin/http-client/
- Updater plugin: https://v2.tauri.app/plugin/updater/
- GitHub distribution pipeline: https://v2.tauri.app/distribute/pipelines/github/
- General distribution: https://v2.tauri.app/distribute/
- Windows code signing: https://v2.tauri.app/distribute/sign/windows/
- macOS code signing: https://v2.tauri.app/distribute/sign/macos/
- WebDriver overview: https://v2.tauri.app/develop/tests/webdriver/
- WebDriver CI: https://v2.tauri.app/develop/tests/webdriver/ci/
