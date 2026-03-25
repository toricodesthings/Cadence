# Cadence Desktop Improvement Plan

Date: 2026-03-24

Scope: Cadence desktop application built with Tauri v2 wrapping the shared React Router SPA in `apps/frontend`, with backend communication to the Cloudflare Worker API in `apps/backend` and Neon Auth.

Method:

- codebase analysis of `apps/desktop`, `apps/frontend`, and selected backend auth and transport files
- targeted Tauri v2 documentation research for security, capabilities, updater, global shortcuts, menus, tray, and secure storage
- OWASP ASVS Level 2 oriented review of the current desktop implementation
- desktop-native UX review focused on making the product feel like a real application rather than a browser experience in a window

This document is intentionally architecture-heavy. It does not propose code in place. It defines the quality bar, remediation sequence, and platform direction for the next phase of Cadence Desktop.

---

## 1. Executive Summary

Cadence Desktop is already beyond a naive webview wrapper. The current implementation has a real platform boundary and several important native integrations:

- Tauri native HTTP transport
- deep-link based auth return path
- external-browser OAuth flow
- single-instance enforcement
- updater integration with signed updates
- native notifications
- native key-value persistence

That foundation is good enough to justify serious desktop investment. The app is not starting from zero.

However, the current implementation is still in a middle state:

- security posture is not yet acceptable for a trusted productivity desktop app
- performance strategy is still mostly inherited from the web SPA rather than tuned for desktop sessions
- native integrations exist, but they are incomplete and do not yet form a coherent desktop operating model
- the UI still behaves more like a route-driven web application than a desktop application with a stable application frame

The most important conclusion is this:

Cadence Desktop should continue to treat `apps/frontend` as the shared product surface, but it now needs a deliberate desktop foundation layer with stronger security boundaries, a proper native frame model, and a more explicit offline and sync architecture.

If that is done well, Cadence can keep the current architectural advantage:

- one shared product codebase
- a thin but meaningful desktop shell
- low drift between web and desktop
- native behavior only where it materially improves trust, speed, or usability

---

## 2. Current State Snapshot

### 2.1 Architecture Today

Current desktop architecture:

- `apps/frontend` remains the source of truth for routes, UI, hooks, data fetching, and most product behavior
- `apps/desktop` initializes Tauri plugins, package/build configuration, and desktop-only runtime behavior
- `app/platform/runtime.ts` in the frontend is the platform boundary that switches between `desktop.ts` and `web.ts`
- desktop API calls use Tauri HTTP instead of browser fetch where needed
- desktop auth uses an external browser and a local OAuth callback server plus deep-link return flow

This architecture is fundamentally sound. It preserves reuse while allowing targeted desktop adaptation.

### 2.2 Implemented Native Features

Implemented now:

- single-instance handling
- deep-link protocol `cadence://`
- native HTTP transport via Tauri plugin
- external browser opener
- OAuth local callback server
- native notifications
- native store
- updater integration
- process relaunch for updates
- debug-only logging plugin

Not implemented or not mature enough yet:

- encrypted credential storage
- CSP hardening
- native tray or menu bar presence
- global shortcuts
- offline-first local database
- background sync engine
- deterministic sync inspector UX
- platform-native menu model
- desktop-specific title bar and frame
- multi-window model for quick capture or focused work

### 2.3 Existing Frontend Resilience Work

Desktop is not starting from zero on offline behavior because the frontend already has:

- TanStack Query persistence
- a write-ahead log for mutations
- offline replay infrastructure
- query caching and background invalidation patterns
- in-app and browser-notification derivation logic

That matters because the next phase should build on those patterns rather than replace them blindly.

---

## 3. Top Findings

### 3.1 Security and Backend Communication

Highest-risk findings:

1. `csp` is disabled in Tauri config
2. desktop auth/session data is persisted in plaintext via the store plugin
3. deep-link callback payload handling is not strong enough to be treated as trusted input
4. localhost HTTP allowlisting is broader than it should be
5. the OAuth browser flow lacks a clearly app-owned CSRF state verification step
6. production desktop logging and security observability are too weak

### 3.2 Performance and Tauri Best Practices

Highest-impact performance findings:

1. desktop currently ships essentially the same SPA bundle and interaction model as web
2. desktop startup still behaves like route bootstrapping rather than application shell restoration
3. there is no desktop-specific density, frame, or loading strategy
4. long-lived desktop sessions are not yet backed by a real local database or background sync model
5. native functionality exists, but the app still lacks a stable desktop operational surface for sync, updates, and connectivity

### 3.3 Native Experience and UX

Biggest UX gap:

Cadence Desktop has native APIs, but not yet a native application model.

That gap shows up as:

- a browser-like shell rather than an application frame
- no menu or tray strategy
- no quick capture window
- keyboard behavior that is strong internally but not surfaced as a desktop command system
- sync and offline behavior that is functional but not confidently visible

---

## 4. Target Desktop Principles

All decisions in this plan should follow these principles.

### 4.1 Product Principles

- Keep `apps/frontend` as the product source of truth.
- Add desktop-specific behavior through the existing runtime boundary, not by forking the application.
- Preserve the Twilight Sanctuary identity.
- Make desktop feel native through frame behavior, command model, and operational visibility rather than by flattening the visual design into generic system UI.

### 4.2 Security Principles

- Desktop should be treated as a privileged client, not a browser tab.
- Secrets must not live in plaintext storage.
- Every native capability must justify its existence.
- Webview compromise must be assumed possible and contained.
- Deep links, local callback servers, and updater flows must be treated as hostile boundaries until validated.

### 4.3 Performance Principles

- Optimize for long-lived desktop sessions, not short browser visits.
- Favor predictable startup and steady-state responsiveness over flashy motion.
- Move from browser-style resilience to desktop-grade local persistence and sync transparency.
- Avoid introducing native complexity unless it directly improves trust, speed, or input fluency.

### 4.4 UX Principles

- Calm permanence over novelty
- visible trustworthiness over hidden cleverness
- keyboard fluency over pointer-only affordances
- platform-aware behavior over one-size-fits-all uniformity

---

## 5. Security and Backend Communication Plan

This section is based on an OWASP ASVS Level 2 minimum bar, adapted to the realities of a Tauri desktop application.

## 5.1 Desired End State

Cadence Desktop should reach a state where:

- the webview has a meaningful CSP
- auth credentials are stored only in secure OS-backed or encrypted storage
- local callback and deep-link auth flows are resistant to spoofing and replay
- backend communication is explicitly trusted, observable, and tightly scoped
- desktop-specific threat boundaries are documented and testable
- release builds emit useful security telemetry without leaking secrets

## 5.2 Current Strengths

Already good:

- backend JWT verification is robust and centralized
- backend auth model is platform-neutral bearer auth
- production backend CORS is relatively strict
- rate limiting exists at multiple layers
- updater artifacts are signed
- redirect normalization already reduces open-redirect risk
- the Tauri capability system is being used instead of exposing everything by default

## 5.3 Critical Gaps

### A. Webview Hardening Is Incomplete

Current issue:

- Tauri config sets `csp` to `null`

Why it matters:

- if the webview ever gets an XSS primitive, the attacker operates in a privileged environment with access to Tauri-exposed capabilities
- CSP is one of the few meaningful browser-style containment layers still available inside a desktop webview

Required direction:

- enable a strict production CSP
- define a separate development CSP if needed rather than disabling CSP globally
- minimize script, connect, img, font, and style sources
- remove any future reliance on remote-hosted assets in desktop mode

Target policy direction:

- `default-src 'self'`
- `script-src 'self'`
- `connect-src` restricted to the API base, Neon Auth endpoints, and any strictly necessary update endpoint domains
- `img-src` limited to self, data URLs if required, and explicit trusted origins only
- `font-src 'self'`
- `frame-ancestors 'none'`
- `base-uri 'self'`

### B. Session Storage Is Not Acceptable Yet

Current issue:

- desktop auth/session data is stored via the store plugin in plaintext

Why it matters:

- user-level malware or any process with access to the profile directory can exfiltrate tokens
- local compromise becomes account compromise
- a trusted productivity app cannot treat token theft from disk as an acceptable default

Required direction:

- move auth tokens out of plaintext store files
- store bearer or refresh secrets in the OS keychain or credential vault
- reserve the general key-value store for non-sensitive preferences and cached metadata only
- do not use Stronghold for auth secrets in this phase

Storage split:

- secrets: OS keychain or equivalent secure credential store
- sync metadata, UI state, non-secret cache: Tauri store or local database
- local database encryption keys: secure storage, not plaintext config

### C. OAuth and Deep-Link Trust Boundaries Need Stronger Validation, Not a Different Fundamental Flow

Current issues:

- the current external-browser plus local callback architecture is likely the correct practical foundation for Cadence Desktop, but it is not yet hardened enough
- local OAuth callback flow needs explicit app-owned anti-CSRF state handling
- deep-link payloads should not be treated as trusted simply because they arrive via the custom scheme
- current payload validation appears structural rather than cryptographic

Why it matters:

- desktop auth flows are a high-risk edge where browser, OS, local server, and application state meet
- login CSRF, replay, malicious local invocation, and crafted deep links are realistic attack classes
- in this specific stack, trying to force the entire identity-provider flow back into the embedded webview is more likely to create reliability bugs than to improve security

Architectural position:

- keep the external-browser OAuth flow
- keep the local callback server
- keep deep-link or single-instance routing back into the app
- do not treat embedded-webview OAuth as the target state unless the auth stack and platform constraints materially change

Reasoning:

- the current desktop auth stack already depends on Tauri-native transport and deep-link coordination because browser-style auth behavior inside the webview is brittle
- the Neon Auth integration constraints and current fetch patching make the external-browser path the most realistic way to get stable provider auth behavior today
- for a desktop app, the correct improvement is to make this flow safer and more deterministic, not to replace it with a theoretically cleaner flow that is operationally less reliable

Required direction:

- generate and verify a cryptographically strong state token for every OAuth initiation
- add nonce and expiry to any desktop auth handoff payload
- cryptographically bind the return payload to the session that initiated auth
- reject stale, duplicate, or mismatched callbacks
- ensure local callback servers accept only the minimum number of requests and shut down immediately after success or timeout

Hardened model:

- external browser continues to handle identity provider login
- local callback server remains the primary handshake point back into the desktop flow
- deep link continues to be used for focus restoration and app routing, not as an implicitly trusted security boundary
- the app must minimize how much durable secret material crosses the deep-link layer
- the local callback must carry short-lived proof material and the app must finalize or validate session state through the existing trusted auth path rather than trusting a loosely validated payload blob

Plan changes for this flow:

- do not plan a rewrite away from external-browser OAuth as a near-term objective
- instead, define a formal contract for the existing callback and deep-link handshake
- document the exact trust boundaries between provider, browser, localhost callback server, deep link, single-instance event, and frontend session restore
- add negative-path testing for duplicate callbacks, stale callbacks, mismatched state, malformed payloads, and repeated app-invocation events
- reduce accidental complexity in the current flow before considering any architectural auth replacement

### D. HTTP Permissions Are Broader Than Necessary

Current issue:

- allowlist includes `http://localhost:*` and `http://127.0.0.1:*`

Why it matters:

- a compromised webview can probe or communicate with arbitrary local services
- the wildcard is broader than the current desktop workflow actually requires

Required direction:

- restrict localhost access to explicit ports used by dev and auth callback flows
- if the callback port is dynamic, scope it more carefully or isolate it behind a narrower runtime permission model
- review every allowed remote origin and remove any legacy or transitional endpoints

### E. Communication Security Needs a Desktop Threat Model

Current issue:

- Tauri HTTP uses the system trust store and there is no certificate pinning
- there is no formal decision record documenting whether this is acceptable risk

Why it matters:

- desktop apps often run on managed enterprise machines with injected local trust roots
- this trust model must be explicit because Cadence is intentionally relying on the system trust store in the current phase

Required direction:

- document the trust model for API and auth transport
- certificate pinning is deferred for the current phase
- enforce these compensating controls:
	- strict domain allowlists
	- robust token expiry and refresh
	- suspicious-auth telemetry
	- anomaly detection for session reuse where feasible

### F. Production Observability Is Too Thin

Current issue:

- logging plugin is enabled only in debug
- production has weak visibility into auth recovery, failed sign-ins, update failures, sync loops, and local-state corruption

Why it matters:

- desktop failures become expensive to diagnose without structured logs
- security-sensitive flows need auditability even when the UI appears healthy

Required direction:

- add release-safe logging with redaction
- define explicit security and sync event categories
- never log bearer tokens, auth codes, or sensitive payload contents
- capture event metadata such as timestamp, action, outcome, and correlation identifiers

## 5.4 OWASP ASVS L2 Workstreams

### Workstream 1: Threat Modeling and Trust Boundaries

Map and document:

- webview boundary
- Tauri capability boundary
- native store boundary
- local OAuth callback boundary
- deep-link boundary
- backend API boundary
- updater boundary

Deliverables:

- desktop threat model
- attack tree for auth and sync flows
- security ADRs for credential storage, CSP, and callback trust

### Workstream 2: Authentication and Session Handling

Scope:

- desktop token lifecycle
- refresh strategy
- sign-out guarantees
- expired-token behavior
- device revocation story

Required decisions:

- what is the canonical secret stored on disk
- when is re-authentication required
- how long can offline desktop sessions continue without network
- whether refresh tokens, if used, are allowed on desktop and where they live

### Workstream 3: Secure Storage and Data Protection

Scope:

- move secrets out of plaintext store
- classify every persisted desktop datum as secret, sensitive, operational, or cosmetic
- define retention rules and file locations

Classification:

- secret: bearer tokens, refresh tokens, encryption keys
- sensitive: email, profile identifiers, sync metadata tied to user identity
- operational: pending WAL entries, last sync time, update state
- cosmetic: window geometry, density, theme, panel state

### Workstream 4: Input Validation and Hostile Event Surfaces

Scope:

- deep-link parser hardening
- OAuth callback validation
- notification click routing
- update metadata handling
- any future file import/drop flows

Rule:

- OS-provided inputs are not trusted by default

### Workstream 5: Secure Communications

Scope:

- explicit endpoint inventory
- TLS assumptions
- allowlist minimization
- auth-origin normalization
- retry and replay behavior during degraded connectivity

### Workstream 6: Logging, Monitoring, and Recovery

Scope:

- auth failures
- sync failures
- updater failures
- local storage corruption
- version mismatch and migration failures

Release gate:

- no desktop release should ship without actionable local diagnostics and a redaction policy

## 5.5 Security Roadmap

### Immediate

1. enable production CSP
2. remove plaintext secret storage for auth/session material
3. tighten HTTP capability allowlists
4. add cryptographic state and replay protection to desktop auth handoff
5. add structured production logging for auth, sync, and updater paths

### Near-Term

1. formal desktop threat model
2. security ADRs for storage and callback trust
3. audit all desktop persistence locations and classify data
4. add negative tests for malicious deep links and replayed callbacks
5. add build-time checks that reject insecure desktop config drift

### Longer-Term

1. implement certificate pinning if the transport stack and operational constraints allow it without destabilizing auth
2. introduce device/session management UX if backend support matures
3. add stronger local encryption and database key management for offline-first storage

## 5.6 Security Release Gates

Before calling desktop security production-ready:

- CSP is enabled and tested
- no auth token is persisted in plaintext
- deep-link auth payloads are cryptographically bound and replay-resistant
- localhost access is explicitly minimized
- production logs are redacted and useful
- a desktop threat model exists and is current

---

## 6. Performance, Optimization, and Tauri Best Practices Plan

This section focuses on making Cadence Desktop behave like a high-quality native productivity app during long daily sessions.

## 6.1 Desired End State

Cadence Desktop should feel:

- fast on cold launch
- immediate on keyboard-driven workflows
- stable during long sessions
- resilient when offline or reconnecting
- quiet and predictable during background work

The target is not only lower raw latency. It is better perceived performance.

## 6.2 Current Strengths

Already good:

- SPA avoids server-rendering overhead in desktop mode
- runtime abstraction prevents platform logic from sprawling across the app
- TanStack Query already provides a mature server-state model
- mutation WAL provides a foundation for offline writes
- desktop uses native HTTP where browser fetch would be limiting
- desktop disables PWA manifest and service worker registration

## 6.3 Current Weaknesses

### A. Desktop Ships the Web Application Model Too Directly

Current issue:

- desktop receives essentially the full SPA bundle and route behavior with only selective runtime divergence

Impact:

- desktop pays for web-oriented code paths and interactions that are not always needed
- perceived performance is constrained by route bootstrapping and web-style hydration expectations

Required direction:

- identify heavy desktop-critical routes and components
- lazy-load non-critical surfaces more aggressively
- pre-load likely next interactions based on desktop workflows rather than generic web navigation assumptions

### B. Startup Is Not Yet Application-First

Current issue:

- startup still resembles the app loading a route rather than restoring a persistent desktop workspace

Impact:

- cold launch feels more like website initialization than app restoration
- update checks, auth restoration, and route content can compete in the startup path

Required direction:

- render shell first
- restore window and workspace state immediately
- hydrate route data progressively
- never block first interaction on update checks or non-critical background work

### C. No Desktop-Specific Density and Motion Strategy

Current issue:

- the visual system is atmospheric and strong, but still primarily tuned like a premium SPA

Impact:

- large datasets may feel more spacious than efficient
- animation may feel expressive but slower than necessary for desktop throughput

Required direction:

- add desktop density modes
- shorten interaction transitions on desktop
- reduce blur-heavy or long-travel animation during task-heavy workflows
- preserve atmospheric identity while making interaction loops tighter

### D. Long-Session Data Strategy Needs to Evolve Beyond Browser Assumptions

Current issue:

- query persistence and WAL exist, but there is no real desktop local database or background sync engine

Impact:

- desktop resilience is partly real, but still shaped like offline web support
- as data size grows, browser-style persistence patterns will become less convincing and less inspectable

Required direction:

- move toward a desktop-first local persistence model
- separate transient server cache from durable local application state
- make sync state explicit and inspectable

## 6.4 Tauri Best-Practice Alignment

Based on Tauri v2 guidance, Cadence should align with these practices.

### A. Capabilities Must Remain Explicit and Minimal

Tauri v2 is built around permissioned plugin use.

Action:

- keep capabilities granular per window
- do not add plugins without a documented use case and permission review
- revisit every existing permission before adding new native features

### B. CSP Should Be Part of the Desktop Performance Story Too

A correct CSP is primarily a security measure, but it also forces discipline around remote dependencies and hidden runtime costs.

Action:

- self-host fonts and desktop-critical assets
- avoid remote asset fetching in desktop mode unless absolutely necessary

### C. Updater Flow Should Stay Background-Friendly

Tauri updater supports signed updates and check/download/install workflows.

Action:

- check for updates in the background
- do not block startup on updater
- surface update state as ambient application status
- allow deferral and explicit install timing for active users

### D. Native Integrations Should Improve Throughput, Not Just Add Surface Area

Shortcuts, menus, and tray are valuable only if they reduce friction.

Action:

- add them with a specific workflow benefit in mind
- avoid native feature sprawl that increases maintenance without improving daily use

## 6.5 Performance Workstreams

### Workstream 1: Startup and Shell Restoration

Goals:

- fast window presentation
- shell-first rendering
- last-workspace restoration
- non-blocking auth recovery and updater checks

Actions:

- persist last section, window geometry, and key panel state
- separate app-frame readiness from content readiness
- introduce desktop-specific shell skeletons instead of full-screen load blockers

### Workstream 2: Bundle and Route Cost Reduction

Goals:

- reduce initial desktop JS cost
- defer non-critical modules
- optimize likely user paths

Actions:

- audit route bundles for schedule, command palette, notification center, settings, and heavy interaction surfaces
- dynamically load heavy optional features
- preload based on intent for likely next actions on desktop

### Workstream 3: Rendering and Interaction Throughput

Goals:

- lower input latency
- reduce unnecessary re-render cascades
- maintain responsive typing and navigation with large data sets

Actions:

- profile command palette, quick add, schedule, inbox, and large task lists
- use transitions for non-urgent recomputation
- apply virtualization to long lists and dense views where needed
- ensure virtualized views preserve keyboard navigation and drag/drop semantics

### Workstream 4: Local Persistence and Sync Efficiency

Goals:

- reduce needless refetch churn
- improve offline reliability
- prepare for larger local datasets

Actions:

- distinguish ephemeral query cache from durable local data
- adopt a local database for desktop-only persistent state
- batch sync operations and reduce visible UI flicker during replay or reconciliation

### Workstream 5: Motion and Density Tuning

Goals:

- maintain premium feel without sacrificing speed

Actions:

- create desktop-specific density presets: cozy, comfortable, compact
- add a controlled desktop layout scale system with persisted user preference
- shorten common transitions
- reduce heavy blur, large-distance transforms, and decorative motion in task-heavy contexts

## 6.6 Metrics to Track

The plan needs measurable targets.

Track at minimum:

- cold launch time to visible shell
- time to interactive for command palette
- time to restore last workspace
- keystroke-to-render latency in quick add and search
- route transition latency for core sections
- memory growth over long sessions
- mutation replay time after reconnect
- number of blocking startup tasks

Proposed quality targets:

- visible shell in under 1 second on a typical developer laptop
- command palette interaction subjectively instant after shell readiness
- no full-app blocking spinner during ordinary background refetches
- stable memory profile over prolonged use

## 6.7 Performance Roadmap

### Immediate

1. define startup budget and measure current desktop boot path
2. implement shell-first restoration strategy
3. audit heavy routes and introduce targeted lazy loading
4. tune desktop motion and density separately from web defaults
5. expose sync and update activity as background status rather than blocking UI
6. define and ship native layout scale commands and view controls

### Near-Term

1. virtualize long lists and dense panels where profiling justifies it
2. reduce redundant recomputation in search and planner-heavy surfaces
3. introduce desktop-specific preload strategy for likely interactions
4. separate durable local state from server cache more clearly

### Longer-Term

1. adopt an offline-capable local database for desktop
2. add background sync engine and conflict handling
3. support quick capture and focused windows with independent startup budgets

## 6.8 Performance Release Gates

Before calling desktop performance mature:

- startup path is measured and budgeted
- shell renders before non-critical background work completes
- proper skeleton screens are in place instead of blank or spinner blockers
- core keyboard workflows are effectively instant
- long lists remain responsive under real project scale
- reconnect and WAL replay are visible, reliable, and non-blocking

---

## 7. Native Integrations, Offline Database, Sync, Notifications, and Shortcuts Plan

This section defines the missing native application model.

## 7.1 Desired End State

Cadence Desktop should behave like an application with:

- a stable desktop frame
- explicit sync and connectivity status
- a coherent notification model
- a real command system through shortcuts and menus
- an offline-capable local database and sync engine
- a restrained but meaningful OS presence

## 7.2 Native UX Mismatch Today

Current mismatch between the web SPA and a desktop application:

- routes behave like pages rather than application workspaces
- no native menu model exists
- no tray or menu bar presence exists
- no global shortcuts exist
- no quick capture mini-window exists
- sync state is not elevated into the application frame
- offline safety is more functional than legible
- startup continuity is weaker than users expect from a desktop app

### A. Desktop Shell Refinement Direction

Cadence should take inspiration from mature desktop-first communication and workspace apps such as Discord, not by copying their interface literally, but by adopting the parts of their desktop model that work well:

- a persistent application shell that stays stable while content changes
- clear separation between app chrome, primary navigation, and content workspace
- a command-driven interaction model where keyboard shortcuts, menus, and routing feel like app commands rather than page controls
- built-in layout scaling so users can quickly adjust information density without depending on browser chrome
- a frame that tolerates long sessions and rapid context switching without feeling like repeated page navigation

For Cadence, that means the desktop target should feel like a calm, atmospheric workspace shell with strong navigation memory and controllable density, not just the web app stretched into a desktop window.

Manifesto guardrails for this inspiration:

- use Discord as a reference for shell durability and command flow only, not for visual language, density defaults, or social-app aesthetics
- the resulting shell must still read as Twilight Sanctuary: frosted, moonlit, warm, calm, and handcrafted rather than industrial or corporate
- no boxed admin rails, hard dividers, sterile pane grids, or generic productivity chrome should enter the desktop shell under the banner of “native refinement”
- shell persistence must increase calm and comprehension first, not front-load more controls into the frame

## 7.3 Desktop Frame and Window Model

### A. Introduce a Desktop Application Frame

Cadence needs a desktop-specific frame that answers:

- what section am I in
- am I online or offline
- is sync pending or healthy
- is an update available
- where is universal command/search access

This should live in app chrome, not only inside route content.

Frame contents:

- platform-aware title bar or custom frame
- compact sync status
- offline indicator
- update indicator
- command/search trigger
- current workspace or section identity

Shell model:

- a persistent outer frame that rarely reflows during route changes
- stable primary navigation with desktop-biased sizing and spacing
- a central workspace area that changes independently of the frame
- room in the chrome for app-level state, especially sync, updates, and layout scale

Visual and interaction constraints for the shell:

- frame surfaces should remain soft, atmospheric, and low-noise rather than mimicking dense chat-app or enterprise shells
- app-level status should be visible but quiet, with trust states like `offline`, `syncing`, `saved`, `retry`, and `conflict` staying legible without turning the chrome into a dashboard
- navigation should stay obvious within 10 seconds, with one clear primary route context and progressive disclosure for deeper controls

This is the part of the desktop refinement that should most clearly draw inspiration from Discord's desktop model: not aesthetic cloning, but a durable application shell that makes context switching feel immediate and anchored.

### B. Define Window Policy Explicitly

Window policy:

- one main workspace window by default
- one future quick-capture window
- detached editor windows are out of scope until the local-first data model and conflict strategy are in place
- deep links and notifications must focus and route the main window by default

Avoid:

- uncontrolled multi-window behavior
- route-per-window sprawl
- duplicate windows with conflicting state ownership

### C. Persist Desktop Session Context

Persist:

- window size and position
- maximized or fullscreen state according to the host platform's normal window lifecycle
- last open section
- last focused workspace context
- desktop density preference
- desktop layout scale preference
- whether side panels were open

### D. Add Native Layout Scale and Zoom Controls

The web app currently benefits from browser zoom controls. The desktop app needs a first-class equivalent that is integrated into the application itself.

Cadence desktop uses a dedicated layout scale model with the following goals:

- allow users to quickly make the interface denser or larger without relying on window-manager or browser controls
- preserve usability across large monitors, small laptops, and accessibility needs
- support information density adjustments independently from OS display scaling when needed

Interaction model:

- `Ctrl/Cmd +` increases layout scale
- `Ctrl/Cmd -` decreases layout scale
- `Ctrl/Cmd 0` resets to default scale
- equivalent menu items exist under `View`
- layout scale is surfaced in settings and persisted per device
- users must be able to understand and discover the feature in under 10 seconds through the `View` menu and settings even if they never use keyboard shortcuts

Implementation rules:

- treat this as an app-level view scale, not a hidden webview hack
- scale spacing, panel widths, text rhythm, and key UI density tokens in a controlled way
- do not rely purely on raw webview zoom if it degrades crispness, causes layout bugs, or scales the wrong things
- keep scale bounded to a safe range with sensible steps
- preserve minimum readable contrast, touch target integrity, and focus visibility at every scale
- never let compact scaling turn the app into a cramped or spreadsheet-like workspace

Preset language:

- compact
- default
- comfortable
- large

This works alongside the density model. Density governs how much UI chrome and spacing is shown. Layout scale governs how large the interface feels overall.

Manifesto constraints for density and scale:

- compact must still feel calm and architectural, not compressed or enterprise-like
- comfortable and large modes should preserve the sanctuary atmosphere rather than feeling like browser zoomed cards
- scale changes should animate calmly and interruptibly using the existing motion principles, not snap harshly or bounce

## 7.4 Notifications

Cadence already has notification transport. It now needs a stronger desktop notification policy.

### Notification Classes

Differentiate:

- task reminder
- due-soon or overdue alert
- habit reminder
- sync issue
- sync completed after offline replay
- update ready to install

### Rules

- clicking a notification should focus the app and route deterministically to the right context
- if the relevant item no longer exists, route to the nearest meaningful fallback screen
- avoid sending notifications that duplicate what the focused user can already see unless urgency justifies it
- desktop notification preferences should be richer than web preferences

### Future Enhancements

- quiet hours
- work-hours profiles
- reduced notification mode while app is frontmost
- OS-specific action buttons when they map cleanly to an existing Cadence action without creating parallel interaction models

## 7.5 Shortcuts, Menus, and Commands

Cadence already has strong in-app keyboard behavior. It should now evolve into a desktop command system.

### A. Application Shortcut Model

Keep or formalize:

- command palette
- section navigation
- search
- quick add
- task actions

Desktop additions:

- platform-specific modifier conventions
- menu-discoverable shortcuts
- conflict-aware global shortcuts exposed behind user settings
- native layout scaling commands

Deferred global shortcuts after Phase 1:

- show or focus Cadence
- quick capture
- open command palette

Global shortcuts remain opt-in and user-configurable.

Required desktop-resident shortcuts:

- `Ctrl/Cmd +` for larger layout scale
- `Ctrl/Cmd -` for smaller layout scale
- `Ctrl/Cmd 0` to reset layout scale

These should behave as first-class app commands in desktop mode, not as incidental browser behavior.

### B. Native Menu Model

Implement a real menu structure.

Top-level menus:

- File
- Edit
- View
- App
- Navigate
- Window
- Help

Menus expose:

- quick capture
- sync now
- check for updates
- search and command palette
- section navigation
- zoom in
- zoom out
- reset zoom
- density and layout scale controls
- settings and shortcut help
- window management actions

On macOS, the menu is first-class and must be treated as part of the primary application surface.

## 7.6 Tray or Menu Bar Presence

Tray support is deferred out of Phase 1 and becomes part of Phase 2 only if Cadence is intentionally operating as an ambient desktop companion.

Tray use cases:

- quick capture
- open today or inbox
- show sync state
- pause or resume background sync if that model exists later
- keep the app ambient during the day

Tray rules:

- do not use it as a second navigation system
- keep it lightweight and status-oriented
- ensure the app still works perfectly without tray dependency, especially on Linux desktop environments with inconsistent support

## 7.7 Offline Database and Sync Architecture

This is the single biggest architecture expansion beyond the current desktop implementation.

### A. Why the Current Model Is Not Enough Long-Term

The current stack has:

- persisted query cache
- mutation WAL
- replay logic
- native store fallback for desktop WAL

That is useful, but it is still not the same thing as a real local-first desktop data model.

Limitations of the current model:

- query cache is not a durable domain store
- native key-value store is not a scalable structured local database
- background reconciliation is limited
- conflict inspection and repair are not first-class
- local search and large offline datasets will eventually strain browser-style patterns

### B. Local Database Direction

Desktop adopts a structured local database.

Database architecture:

- local SQLite database through a Tauri-supported database path
- domain tables for tasks, habits, projects, inbox items, settings, sync metadata, and mutation queue
- explicit sync cursor and replay metadata
- separation between read models and outbound mutation journal

### C. Target Sync Model

Cadence Desktop evolves to:

- local-first reads for core data
- append outbound user actions to a durable mutation journal
- sync in the background when online
- reconcile server responses into the local database
- expose sync state clearly in the UI
- surface conflicts rather than silently discarding them

### D. Sync State Model

Cadence should display one of these states at all times in the desktop frame:

- up to date
- syncing
- pending local changes
- offline with local changes queued
- reconnecting
- sync error requiring action

This is essential for desktop trust.

### E. Conflict Strategy

Before implementing full local-first sync, lock these decisions:

- what is the source of truth when edits collide
- whether last-write-wins is acceptable for all entities
- which fields deserve merge strategies
- how users inspect and recover from conflicts

### F. Migration Path

Migration path:

1. keep current Query + WAL model as the transitional base
2. add sync state instrumentation and inspector UX first
3. adopt a local database for desktop durable state
4. migrate selected read paths to local-first
5. keep backend API contracts unchanged while introducing desktop sync infrastructure

## 7.8 Startup, Quick Capture, and Background Presence

### A. Startup

Desktop startup must:

- reopen the previous working context
- show the shell immediately
- restore pending local state without drama
- re-establish auth and sync quietly where possible

### B. Quick Capture Window

Quick capture window specification:

- a lightweight window for task, inbox, or thought capture
- summoned by shortcut or tray/menu action
- optimized for low startup cost
- must not require the full application shell to feel usable

### C. Background Presence

Cadence uses background presence in Phase 2 when ambient operation is enabled:

- tray or menu bar entry becomes more valuable
- update checks and sync should remain background-friendly
- notifications should route back into an existing app context

## 7.9 Platform-Specific Guidance

### macOS

- prioritize menu quality and command discoverability
- preserve traffic-light window expectations
- lean into app-level menus and keyboard flow
- ship menu-bar presence before Windows or Linux only if ambient operation is enabled in Phase 2

### Windows

- make window controls and app state more visibly explicit
- tray support is particularly valuable
- notifications and update state should feel clear and actionable
- quick capture via global shortcut has strong value

### Linux

- assume variability in tray, notifications, and windowing behavior
- ensure core flows work without relying on any one shell integration
- keep features configurable and degrade gracefully

## 7.10 Native Integrations Roadmap

### Immediate

1. introduce desktop frame with sync, offline, and update status
2. define and implement native menu model
3. formalize desktop keyboard model and shortcut discoverability
4. persist workspace and window context
5. improve notification click routing
6. add desktop layout scale controls with `Ctrl/Cmd +/-/0` parity

### Near-Term

1. add quick capture window
2. add tray or menu-bar presence only if ambient operation is enabled
3. add richer notification preferences and quiet-hours logic
4. build sync inspector UI
5. add file drag/drop architecture if attachments or imports are in scope

### Longer-Term

1. adopt local database
2. implement background sync engine
3. add conflict handling UX
4. add detached editor windows only after local-first state ownership rules are finalized

## 7.11 Native Experience Release Gates

Before calling the desktop app truly native-like:

- the app has a desktop frame, not just route chrome
- core commands are discoverable through menus and shortcuts
- sync state is always visible and understandable
- offline edits are durable and confidence-inspiring
- notification routing is deterministic
- startup restores the previous workspace predictably

---

## 8. Prioritized Delivery Plan

## Phase 0: Hardening and Instrumentation

Goal:

- make the current implementation safe enough and measurable enough to evolve with confidence

Scope:

- CSP
- secure credential storage
- auth flow validation
- capability tightening
- production logging
- startup and interaction measurements

Exit criteria:

- no plaintext secrets
- basic desktop diagnostics exist
- startup path is measurable

## Phase 1: Desktop Foundation

Goal:

- stop feeling like a browser shell

Scope:

- desktop frame
- title bar strategy
- sync and offline state indicators
- menu model
- desktop keyboard model
- workspace restoration

Exit criteria:

- application frame is stable and informative
- primary actions are accessible as app commands, not just route-local controls

## Phase 2: Native Workflow Depth

Goal:

- make Cadence behave like a daily-use desktop productivity tool

Scope:

- quick capture window
- notification routing
- tray or menu bar presence for ambient operation
- sync inspector
- motion and density tuning

Exit criteria:

- quick capture and background presence materially improve daily workflows

## Phase 3: Local-First Desktop Reliability

Goal:

- move from offline-tolerant to genuinely desktop-resilient

Scope:

- local database
- background sync engine
- conflict handling
- richer local search and durable offline read models

Exit criteria:

- the app remains useful, trustworthy, and comprehensible with flaky or absent connectivity

---

## 9. Architectural Decisions

### ADR-001: Keep the Shared Frontend as the Product Surface

Decision:

- continue to keep `apps/frontend` as the shared product codebase

Consequence:

- low drift remains achievable, but desktop-specific behavior must stay disciplined and explicit

### ADR-002: Treat Desktop as a Privileged Client

Decision:

- hold desktop security to a higher standard than web for local persistence and native capability review

Consequence:

- more work now, significantly lower long-term risk

### ADR-003: Introduce a Desktop Frame Model

Decision:

- elevate sync, offline, updates, and commands into a stable application frame

Consequence:

- clearer native feel without rewriting the product UI from scratch

### ADR-004: Move Toward Local Database Backing for Desktop

Decision:

- treat current query persistence and WAL as transitional infrastructure, not the final offline architecture

Consequence:

- additional complexity, but a much stronger desktop trust story

### ADR-005: Keep Native Feature Surface Intentional

Decision:

- add shortcuts, menus, tray, quick capture, and multi-window behavior only where they demonstrably improve daily use

Consequence:

- lower native maintenance cost and less feature sprawl

---

## 10. Final Recommendation

Cadence Desktop should not be rebuilt. It should be hardened and matured.

The current architecture is good enough to justify continued investment, but only if the next work is sequenced correctly.

The correct order is:

1. harden security and credential handling
2. instrument and optimize startup and interaction performance
3. introduce a real desktop frame and command model
4. deepen native workflows with notifications, menus, shortcuts, and quick capture
5. evolve from offline-tolerant web persistence to a true desktop local database and sync engine

If that order is followed, Cadence becomes:

- secure enough to trust with daily work
- fast enough to feel native
- atmospheric without being sluggish
- shared across web and desktop without becoming compromised on either platform

That is the right ambition for this codebase.
