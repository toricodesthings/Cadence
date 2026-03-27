# Cadence Desktop Release Pipeline

Date: 2026-03-24

Scope: how Cadence Desktop should be built, signed, published, and updated across macOS, Windows, and Linux.

This document is written against the current repository state in `apps/desktop`, the current Tauri v2 configuration, and the current desktop updater integration in the shared frontend runtime.

---

## 1. Goal

Cadence Desktop ships as a proper native installer on all supported desktop platforms and can update itself through signed in-app updates.

The release pipeline must produce:

- a signed macOS installer
- a signed Windows installer
- a Linux desktop bundle
- Tauri updater artifacts for every release
- a published release endpoint that the app can check at runtime

The release pipeline must also guarantee:

- version consistency across package metadata and Tauri config
- builds happen in CI, not on developer laptops
- update artifacts are signed with the updater private key
- macOS and Windows binaries are code-signed before distribution

---

## 2. Current Repository State

Cadence already has the core updater and packaging foundation in place.

### Existing Desktop Build Commands

Defined in `apps/desktop/package.json`:

- `pnpm --filter @cadence/desktop build`
- `pnpm --filter @cadence/desktop build:debug`
- `pnpm --filter @cadence/desktop sync-version`

Current release build behavior:

- `sync-version` runs first
- Tauri builds the native desktop bundles
- the frontend desktop build is produced through `beforeBuildCommand`

### Existing Bundle Targets

Defined in `apps/desktop/src-tauri/tauri.conf.json`:

- macOS: `dmg`
- Windows: `nsis`
- Linux: `appimage`

Updater artifacts are already enabled with:

- `createUpdaterArtifacts: true`

### Existing Updater Configuration

Cadence already has:

- updater public key embedded in `tauri.conf.json`
- updater endpoint pointing at GitHub Releases `latest.json`
- updater plugin initialized in `src-tauri/src/lib.rs`
- frontend runtime code using `@tauri-apps/plugin-updater`

This means Cadence does not need a new update architecture. It needs a complete release pipeline around the updater that is already configured.

---

## 3. Release Artifacts by Platform

Cadence uses one installer format per platform in the first production release lane.

### macOS

Ship:

- signed and notarized `.dmg`

Do not ship unsigned or non-notarized macOS builds to end users.

### Windows

Ship:

- signed NSIS installer `.exe`

Do not ship unsigned Windows installers to end users.

### Linux

Ship:

- `.AppImage`

Do not expand Linux packaging beyond AppImage in the first stable release lane. Add `.deb` or `.rpm` only after the core release and updater flow is stable.

---

## 4. Release Source of Truth

Git tags are the release trigger.

Cadence release versions must be cut from tags in the form:

- `v0.1.0`
- `v0.1.1`
- `v0.2.0`

The release version must be synchronized into:

- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`

This is already supported by the existing `sync-version` script and must remain part of every release build.

---

## 5. CI Build Strategy

Cadence must build desktop releases in a native runner matrix.

Do not rely on one machine to cross-build every platform.

### Required CI Matrix

Use three native runners:

- `macos-latest`
- `windows-latest`
- `ubuntu-latest`

Each job must:

1. check out the repository
2. install Node
3. install pnpm
4. install Rust toolchain
5. install platform-native build dependencies
6. install workspace dependencies
7. run `pnpm --filter @cadence/desktop build`
8. collect installer artifacts
9. collect updater artifacts
10. upload artifacts to the release job or directly to GitHub Releases

### Required Build Discipline

- CI builds are the release artifacts of record
- local developer builds are not release artifacts
- every release build must run from a clean tag or release commit
- every release build must use the same signing and updater secrets configured in CI

---

## 6. Code Signing and Notarization

Proper desktop distribution requires more than producing an installer.

### macOS Requirements

Cadence must use:

- Apple Developer account
- Developer ID signing certificate
- notarization credentials

Required macOS release sequence:

1. build the app on macOS
2. sign the app bundle
3. build the DMG
4. notarize the build with Apple
5. staple notarization results
6. publish the notarized DMG and updater artifacts

Without notarization, the macOS release is not production-ready.

### Windows Requirements

Cadence must use:

- code signing certificate for Windows binaries/installers

Required Windows release sequence:

1. build the NSIS installer on Windows
2. sign the installer
3. publish the signed installer and updater artifacts

Without signing, Windows distribution quality is materially worse because of SmartScreen and trust prompts.

### Linux Requirements

Linux does not require the same signing/notarization flow for AppImage distribution, but the release artifacts still need to be generated from CI and paired with updater metadata.

---

## 7. Tauri Updater Model

Cadence uses the Tauri v2 updater plugin.

The updater flow is:

1. app checks a remote `latest.json`
2. app verifies the release metadata and artifact signatures using the embedded public key
3. app downloads the correct platform update artifact
4. app installs the update
5. app relaunches

### What Cadence Already Has

Already configured:

- updater plugin in Rust
- updater endpoint in `tauri.conf.json`
- updater public key in `tauri.conf.json`
- frontend runtime update check path

### What the Release Pipeline Must Add

The CI pipeline must:

- sign update artifacts using the updater private key
- publish the generated update metadata and artifacts to GitHub Releases
- ensure the published `latest.json` matches the latest tagged release

### Updater Rule

No desktop release is valid unless both of these are published:

- manual installer artifacts for users who download the app directly
- updater artifacts for users already running the app

---

## 8. Private Key and Secret Handling

The updater requires a private signing key.

### Required Secrets

At minimum, CI must store:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key uses one

For macOS, CI must also store the Apple signing and notarization credentials required by the chosen signing workflow.

For Windows, CI must store the certificate material and password required by the chosen signing workflow.

### Secret Rules

- updater private keys live only in CI secrets or other secured release infrastructure
- updater private keys do not live in the repository
- updater private keys do not live in `.env` files
- code signing certificates do not live in the repository
- release builds must fail if required signing secrets are missing

---

## 9. GitHub Releases Publishing Model

Cadence uses GitHub Releases as the release host in the first production lane.

### Release Outputs

Each GitHub Release must publish:

- macOS DMG
- Windows NSIS installer
- Linux AppImage
- updater metadata files
- updater signatures
- release notes

### Updater Endpoint Rule

The updater endpoint configured in `tauri.conf.json` points at:

- `https://github.com/toricodesthings/Cadence/releases/latest/download/latest.json`

That means the release pipeline must guarantee that the newest release always publishes the expected `latest.json` asset at the exact path the app already uses.

If the asset naming or release-hosting model changes, the updater endpoint in `tauri.conf.json` must be updated in lockstep.

---

## 10. Release Workflow Structure

Cadence should use a release workflow with this structure.

### Workflow Trigger

Trigger on pushed git tags matching:

- `v*`

### Workflow Stages

#### Stage 1: Prepare Release

- validate tag format
- derive release version
- install dependencies
- run version sync
- fail if repository version metadata is inconsistent

#### Stage 2: Build Matrix

Run native build jobs for:

- macOS
- Windows
- Linux

Each build job:

- installs dependencies
- runs the desktop production build
- signs artifacts where required
- produces updater metadata and signatures
- uploads job artifacts

#### Stage 3: Publish Release

- create or update the GitHub Release for the tag
- attach platform installers
- attach updater metadata
- attach signatures
- publish release notes

#### Stage 4: Post-Release Validation

- verify the `latest.json` asset is reachable
- verify release artifacts exist for all three platforms
- optionally run smoke tests against downloaded installers or release metadata

---

## 11. In-App Update UX Policy

Cadence can perform auto-updates, but the product must define how they are presented.

### Required Update UX

Cadence Desktop must:

- check for updates in the background
- surface update availability in a quiet, visible desktop state
- allow the user to install now or defer
- relaunch after successful install

### Update UX Rules

- update checks do not block startup
- update checks do not interrupt first interaction
- update download and install do not happen silently without user awareness
- update status is visible in desktop chrome or settings

### Initial Product Policy

The first production update policy is:

- background check on launch
- user-visible update available state
- explicit user-triggered install
- relaunch after install completes

Forced updates are out of scope for the first release lane.

---

## 12. Recommended Initial Platform Scope

For the first stable desktop release lane, Cadence uses exactly this distribution scope:

- macOS: `.dmg`
- Windows: `nsis`
- Linux: `AppImage`
- release host: GitHub Releases
- update channel: stable only

Do not add these in the first lane:

- MSI in parallel with NSIS
- Linux `.deb` and `.rpm`
- beta and nightly updater channels
- staged rollout infrastructure
- custom release hosting

Those can be added later once the stable release lane is reliable.

---

## 13. Smoke Testing Requirements

Every tagged release should include minimum smoke validation.

### Required Checks

- app boots on each platform
- updater metadata exists and is fetchable
- updater metadata references the correct current version
- primary window opens successfully
- desktop runtime target is correct

### Existing Repo Support

Cadence already has an end-to-end smoke harness in `apps/desktop/e2e` and should continue using that as the base for release validation.

---

## 14. Production Readiness Checklist

Cadence Desktop is release-ready only when all of the following are true.

### Build and Packaging

- native CI matrix builds pass on macOS, Windows, and Linux
- all release artifacts are produced from CI
- versions are synchronized before build

### Signing and Trust

- macOS builds are signed and notarized
- Windows builds are signed
- updater artifacts are signed with the updater private key

### Publishing

- GitHub Release contains platform installers
- GitHub Release contains updater artifacts
- `latest.json` is published at the expected release path

### Runtime Updating

- app can check for updates successfully
- app can download and install an update successfully
- app relaunches cleanly after update

### Product UX

- update state is visible in-app
- startup is not blocked by update checks
- install is user-triggered in the initial stable policy

---

## 15. Final Decision

Cadence Desktop uses this release model:

- Git tags trigger releases
- GitHub Actions builds installers on native runners
- GitHub Releases host both installers and updater artifacts
- Tauri updater handles signed in-app updates
- macOS and Windows artifacts are signed before publishing
- macOS builds are notarized before publishing
- updates are checked automatically in the background and installed when the user confirms

This is the correct first production-grade release pipeline for Cadence Desktop.