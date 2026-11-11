# Account — Agent Instructions

Part of the backend: `apps/backend/AGENTS.md` §6 applies.

## Routes

- **account** (`/account`): `POST /delete` (below), `POST /export` emails the person a JSON copy of their data (202; one an hour, else 429) and `GET /export` returns the latest request or null

**Account deletion** (`domains/account`): `POST /account/delete` (body carries `ACCOUNT_DELETE_PHRASE` plus a `password` or emailed sign-in `otp`, checked server-side against Neon Auth by `verifyPresence`, so a stolen JWT alone can't delete; 10 checks a person per UTC day, then 429; the session a password check opens is signed out again) erases R2 files, MCP grants, the `users` row (everything cascades), then the Neon Auth identity through the Neon API (`markAccountDeleted` keeps a still-valid JWT from recreating the row for an hour). The identity goes last so a failure leaves a signed-in user who can retry (this route is exempt from the auth check that refuses a marked account, so the retry reaches it). Needs secrets `NEON_API_KEY` (project-scoped), `NEON_PROJECT_ID`, `NEON_BRANCH_ID`; without them it answers 503 before touching anything.

**Data export** (`domains/account/data-export.service.ts`): `POST /account/export` inserts a `data_exports` row (the record: email sent to, status `pending`/`sent`/`failed`, bytes, times; erased with the account), answers 202, and builds + sends in `waitUntil`. `buildExport` walks every table in `schema.ts` scoped to the user (`mutation_dedup` and embedding vectors skipped; `task_tags` through its task), so a new table is exported without edits. The file goes out as a JSON attachment through the `EMAIL` (`send_email`) binding from `noreply@mail.cadenceapp.cloud`, to the JWT's email; over 20 MB it fails (25 MiB email cap). Without `EMAIL` the route answers 503 `DATA_EXPORT_UNAVAILABLE`. Photos in R2 aren't included.
