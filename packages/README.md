# Shared Packages

Dependency-light workspace packages reused across every Cadence client
(`apps/backend`, `apps/frontend`, downstream `desktop`/`mobile`). Dependencies
flow strictly downhill: `app → domain → contracts → nlp`. No package imports an
app, `drizzle-orm`, `hono`, `react`, or `@cloudflare/workers-types`.

| Package | Job | Deps |
|---|---|---|
| [`@cadence/nlp`](./nlp) | NLP parse / resolve / rank / focus-views | chrono-node, fuse.js, rrule |
| [`@cadence/contracts`](./contracts) | Zod schemas → inferred types (the single source of truth for wire shapes) | zod, @cadence/nlp |
| [`@cadence/domain`](./domain) | Pure domain logic — no I/O, no framework (`DomainError`) | rrule, date-fns, @cadence/contracts, @cadence/nlp |

**Before editing anything here, read [`AGENTS.md`](./AGENTS.md)** — it covers the
Row/Entity/Input schema split, `$inferSelect` parity, `z.input` vs `z.infer`,
the `DomainError` boundary, dependency enforcement, and version-pinning gotchas.

Each package is source-only (no build step): `package.json#exports` point at
`.ts` files, resolved by consumers under `moduleResolution: "Bundler"`.

Future homes (not yet extracted): shared UI primitives, generated SDKs, reusable
tooling presets.
