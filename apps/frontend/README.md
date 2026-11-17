# Cadence Frontend

The Cadence web app: Capture, Today, Lists, Schedule, Routines and the assistant. The same code also runs inside the [desktop app](../desktop/README.md).

## How it works

- A **React** single-page app on **React Router**, served as static files from **Cloudflare Workers**.
- Talks to the [backend](../backend/README.md) through a typed **Hono RPC** client. If the API changes shape, the build fails instead of the app.
- **TanStack Query** holds server data. Edits show instantly and roll back only if the server refuses them.
- Works offline: edits queue on the device and sync when you're back online.
- Styled with **Tailwind CSS** and the Twilight design tokens in `app/app.css`.
- Web-vs-desktop differences live in `app/platform/`.

## Commands

From the repo root:

```bash
pnpm dev:frontend       # web app on http://localhost:8788
pnpm --filter @cadence/frontend test
pnpm --filter @cadence/frontend build
pnpm deploy:frontend
```

## See also

[Workspace](../../README.md) · [Backend](../backend/README.md) · [Desktop](../desktop/README.md) · [Changelog](../../CHANGELOG.md)
