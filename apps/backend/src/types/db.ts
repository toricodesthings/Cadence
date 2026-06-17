/**
 * Shared database type aliases.
 *
 * These describe the per-request Drizzle client and the RLS-scoped transaction
 * handle, both reused across the platform layer and many domains. They live here
 * so there is a single home for the database types instead of redefining them
 * inline in every file that touches a transaction.
 */
import type { DbClient } from "../platform/db";

/**
 * Per-request Drizzle client — the return type of `getDbClient` (platform/db.ts).
 * Re-exported from `types/` so all shared database type aliases resolve to one place.
 */
export type { DbClient };

/**
 * RLS-scoped transaction handle passed to `withRls` callbacks. Preserves full
 * Drizzle schema inference. Centralized here to replace the identical alias that
 * was previously redefined in six separate files.
 */
export type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
