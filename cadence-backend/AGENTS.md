# Cadence Backend - Agent Instructions

> **ATTENTION AGENTS**: This document outlines the absolute rules, architecture, and constraints for modifying the `cadence-backend`. Read carefully before writing any code.

## 0. The Core Principle

**The Universal Edge API.**
This backend is a standalone Cloudflare Worker running Hono. It serves TWO distinct clients: `cadence-frontend` (React Web) and `cadence-mobile` (Expo React Native) with **absolute 1:1 parity**.

- **Rule 1:** NEVER create platform-specific endpoints.
- **Rule 2:** NEVER use Next.js Server Actions, cookies, or platform-coupled auth. Both Web and Mobile authenticate universally by sending `Authorization: Bearer <JWT>`.
- **Rule 3:** The API shape is shared via Hono RPC (`typeof app`). If you break a route's input/output schema, you break both clients' builds instantly.

## 1. Coding Rules & Structure (Non-Negotiable)

### Project Layout

```text
src/
├── index.ts        # App entry, middleware, & AppType export
├── types/          # ALL Zod schemas & TS interfaces
├── lib/            # Shared logic (db, auth, rls, errors)
├── routes/         # Thin route controllers
└── db/schema.ts    # Drizzle schema (source of truth)
```

### The 4 Pillars

1. **UCURD Ordering:** Every file handling database operations MUST organize exports/routes sequentially: **U**tility helpers → **C**reate → **U**pdate → **R**ead → **D**elete.
2. **DRY (Don't Repeat Yourself):** Shared logic lives exclusively in `src/lib/`. NEVER duplicate queries, validation schemas, or error formatting.
3. **Clean Functions:** One function = One job. Maximum 3–4 parameters. If more are needed, accept a single typed object. Keep route handlers under 100 lines.
4. **Centralized Types:** ALL Zod schemas and TS interfaces live in `src/types/`. Route files import them. NEVER define types inline within logic/route files.

## 2. Technology Stack & Data Flow

- **Framework:** Hono v4 (Edge-native).
- **ORM:** Drizzle ORM (Schema-driven migrations).
- **Database:** Neon Postgres accessed via Cloudflare Hyperdrive (connection pooling).
- **Validation:** Zod + `@hono/zod-validator`.
- **Auth:** Neon Auth JWTs verified at the edge using the standard Web Crypto API (no Node.js crypto dependencies).

### The Standard Request Lifecycle

1. Edge Rate Limiter natively throttles the request.
2. Auth Middleware verifies the JWT against JWKS and attaches `userId` to the Hono context.
3. `zValidator` strictly validates the request payload/query/params.
4. Database client is instantiated via Hyperdrive.
5. `setRlsContext` injects the `userId` into the Postgres session for Row-Level Security.
6. Drizzle executes the query and returns the typed response.

## 3. Security & UX Mandates

- **RLS is Mandatory:** You must always call `setRlsContext(db, userId)` before executing queries. Postgres Row-Level Security is our bulletproof guard against cross-tenant data leaks.
- **Never Trust Input:** Every endpoint MUST use `zValidator`. If it's invalid, Hono rejects it before it hits our logic.
- **Optimistic UI Contract:** Every mutation (`POST`, `PATCH`) MUST return the **full updated entity**. The clients rely on this to reconcile or rollback their optimistic UI caches seamlessly.

## 4. Current Phase Constraints

We are currently in **Phase 1 (No AI)**.
Do NOT attempt to implement AI parsing, Cloudflare Cron triggers, or routes for `user_metrics`/`ai_memories`. All work must be strictly focused on rock-solid UCURD operations for tasks, projects, and simple inbox text capture.

### 5. Coding Best Practices

The Dos:

- **Always use Zod for validation.**
- \*\*Always use TypeScript fundamentals.
- **Always consult context7 for up-to-date information on packages and their usage when in doubt.**
- **Always use UCURD ordering for database operations.**
- **Always code using the DRY principle.**
- **Always use clean functions. One function = One job. Maximum 3–4 parameters. If more are needed, accept a single typed object. Keep route handlers under 100 lines.**
- **Always keep code organized and modular.**
- **Always name functions and variables descriptively. No excessive shortcuts**
- **Always write short, concise and appropriate comments outlining the purpose of the function or block of code**

  The Don'ts:

- **Never use `any` type.**
- **Never create unsecured endpoints.**
- **Never use Node.js-only dependencies like `fs`, `path`, `crypto`, etc. Use Cloudflare Workers-compatible alternatives.**
- **Never design a function to do more than one job. Split them.**
- **Never use excessive shortcuts or abbreviations in function or variable names**
- **Never use excessive comments. Only use comments to outline the purpose of the function or block of code**

### 6. Logging Principles

- **Always use console.log for debugging.**
- **Always use console.error for errors.**
- **Always use console.warn for warnings.**
- **Always use console.info for informational messages.**
- **Always use console.trace for stack traces.**

Cloudflare Observability will automatically capture console information, implement logging but sparringly and only if useful for debugging and request tracing. Focus on errors over success and verbose logging, errors must always be logged with the full error object, do not send the full error object to the client ever.

### 7. Development Principles

- **Always use bun for development.**
- **Always use Hono v4 coding standards.**
- **Always use Drizzle for database operations.**
- **When requiring env, ensure it is done so in a way that is compatible with Cloudflare Workers. Cloudflare exposes bindings. In production, secrets are set in the Cloudflare dashboard. In development, they are imported from a .dev.vars file. For public variables, use the wrangler.jsonc only and always via bindings.**
