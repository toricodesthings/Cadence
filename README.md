<div align="center">

# ✦ Cadence

### _The planner you can actually stick with._

Cadence is a calm, fully-featured but also simple productivity app designed for real human brains — the kind that spiral, reschedule, abandon systems, and start over. It adapts to you. It does not punish you for being inconsistent.

**[Live App](https://dashboard.cadenceapp.cloud) · [Open Source](#contributing) · [Privacy First](#privacy--trust) · [Always Free](#philosophy)**

</div>

---

## The Idea

Most productivity apps are built around the fantasy version of you — the one who plans perfectly, executes flawlessly, and never misses a deadline. Cadence is built around the real version.

It is designed to absorb inconsistency without breaking. To reduce cognitive load before adding features. To feel like entering a warm, quiet room and immediately knowing what needs to happen — not like staring at an overwhelming wall of overdue red badges.

> **Opening Cadence should feel like a sanctuary, not a task.**

---

## What's Inside

### ✦ Planner
A full task management surface with **list and kanban views**, sections, subtasks, tags, projects, and drag-and-drop reordering. Tasks are containers, not just checkboxes. They can hold notes, due dates, scheduled blocks, recurrence rules, dependencies, time estimates, and more — but remain completely valid even when 80% of that is empty.

### ✦ Schedule
A unified **calendar** (day, week, month, year) that renders tasks and habits side by side. See your full week at a glance, not just disconnected lists.

### ✦ Inbox
A frictionless **capture surface** for the thoughts that arrive at the worst possible moments. Get the idea out of your head first, sort it later.

### ✦ Habits
**Weekly and monthly habit tracking** with resolution flows and gentle nudge toasts. No streaks designed to guilt you. Just a clear, honest picture of your patterns.

### ✦ Projects & Areas
Group related work into **projects**, giving tasks context and structure without forcing you into a rigid hierarchy you have to maintain forever.

### ✦ Holding Planner
A slide-out right panel for tasks that belong nowhere yet. Instead of letting orphaned tasks create anxiety, the Holding Planner surfaces them for calm, deliberate triage when you're ready.

### ✦ Universal Search
`Cmd/Ctrl+K` opens a **command palette** with instant fuzzy search across tasks, projects, and habits. Everything is one keystroke away.

### ✦ Quick Add
Press `N` from anywhere to open a tabbed creation surface for tasks, inbox thoughts, and habits — without breaking your current context.

### ✦ Notification Center
Client-side notifications derived from your actual data: reminders, due dates, and approaching deadlines. Opt into browser notifications for foreground alerts. No external push infrastructure, no telemetry.

### ✦ Settings
**Deep-linkable settings** covering notifications, appearance, date and time format, keyboard shortcuts, AI configuration, and integrations. Your preferences, your way.

---

## What's Being Built

Cadence is actively developed. Here is where things stand:

| Area | Status |
|------|--------|
| Web app (tasks, inbox, habits, schedule) | ✅ Live |
| Projects, sections, tags | ✅ Live |
| Subtasks and task notes | ✅ Live |
| Events and calendar | ✅ Live |
| Notification center | ✅ Live |
| Universal search + quick add | ✅ Live |
| Settings (appearance, notifications, AI) | ✅ Live |
| Mobile app (Expo) | 🔄 In Progress — behind the web app |
| AI natural language input parsing | 🔄 In Progress |
| AI inbox processing (background queue) | 🧭 Planned |
| Morning readout (overnight schedule generation) | 🧭 Planned |
| Burnout detection + load balancing | 🧭 Planned |
| Adaptive AI memory (pgvector RAG) | 🧭 Planned |
| Webhook API for iOS Shortcuts / external ingest | 🧭 Planned |
| Weekly Reset routine | 🧭 Planned |
| Desktop app (Tauri) | 🧭 Planned |

---

## Privacy & Trust

Cadence handles your most intimate mental state — your undone work, your brain dumps, your raw thoughts. That is not taken lightly.

- **Open source.** Every line of backend logic, database schema, and frontend component is auditable.
- **Self-hostable.** The entire stack (Hono + Cloudflare + Neon) can be deployed to your own infrastructure in under 10 minutes.
- **No telemetry without consent.** No analytics pixels, no behavioral heatmaps, no keystroke tracking. Server health is measured via Cloudflare's anonymized edge metrics only.
- **Passwords never stored.** Authentication is delegated entirely to Neon Auth. The app only ever sees a signed JWT.
- **Row-Level Security, always.** Every database query is scoped to the authenticated user's ID at the Postgres policy layer — not just the application layer.
- **AI memory is visible and deletable.** When the AI learns something about you, it is surfaced in a readable list you can inspect and wipe with one click.
- **Zero-retention endpoints.** AI operations use provider APIs with data-training opt-out. Your data does not train foundation models.

---

## Philosophy

Six laws, in order. Never reversed.

1. **Clarity** — the user should understand any feature in under 10 seconds.
2. **Calm** — features that add guilt, noise, or decisions do not ship.
3. **Confidence** — every mutation has a visible state: saving, saved, offline, retry.
4. **Speed** — the app must feel instant.
5. **Power** — depth is available, never front-loaded.

> Cadence may be deep. It may not be overwhelming.

---

## Getting Started

**Prerequisites:** Node `>=20`, `pnpm`

```bash
corepack enable
pnpm install

# Start everything
pnpm dev

# Or start individual apps
pnpm dev:frontend
pnpm dev:backend
pnpm dev:mobile
```

The local frontend runs at `http://localhost:8788` and the backend at `http://localhost:8787`.

---

## Contributing

Cadence is open source and welcomes contributions. A few things to know before diving in:

- Read the [Frontend guide](./apps/frontend/AGENTS.md) and [Backend guide](./apps/backend/AGENTS.md) before touching those apps — they document conventions that are not obvious from the code alone.
- The [Design Manifesto](./docs/Design%20Manifesto.md) is the visual and UX north star. New UI should feel like it belongs in the same calm, atmospheric world.
- The six philosophy laws above are non-negotiable. Features that add cognitive load are reverted regardless of how clever they are.
- Shared cross-app code lives in `packages/`. Do not create filesystem-relative imports across app boundaries.

```bash
pnpm typecheck   # Type check all apps
pnpm lint        # Lint all apps
pnpm build       # Build all apps

pnpm db:generate # Generate a new Drizzle migration
pnpm db:migrate  # Run pending migrations against Neon
pnpm db:studio   # Open Drizzle Studio
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7, Tailwind CSS v4, Cloudflare Workers |
| Backend | Hono v4, Drizzle ORM, Neon Postgres, Cloudflare Workers |
| Auth | Neon Auth (JWT, OAuth) |
| Mobile | Expo (React Native) |
| Desktop | Tauri _(planned)_ |
| AI | Vercel AI SDK, OpenRouter, pgvector |
| Monorepo | pnpm workspaces + Turborepo |

---

## Docs

- [Frontend](./apps/frontend/README.md)
- [Backend](./apps/backend/README.md)
- [Mobile](./apps/mobile/README.md)
- [Desktop](./apps/desktop/README.md)
- [Design Manifesto](./docs/Design%20Manifesto.md)
- [Base Architecture](./docs/Base%20Architecture.md)

---

<div align="center">

_Built with care for the chaotic, the busy, and the beautifully inconsistent._

</div>
