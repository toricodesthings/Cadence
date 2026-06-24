/**
 * Optimistic (client-generated) entity IDs.
 *
 * When a mutation creates an entity, we insert an optimistic row into the cache
 * with a temporary id (`temp-<timestamp>`) so the UI updates instantly. That row
 * is later reconciled to the server row (with a real UUID) once the create
 * resolves. Until then the entity does not exist on the server, so any follow-up
 * mutation that targets it by id (process, patch, delete) would 400 with
 * "Invalid UUID".
 *
 * Use {@link isPersistedId} to gate such follow-up actions until the create has
 * been reconciled.
 */
export const TEMP_ID_PREFIX = "temp-";

/** Build an optimistic id for a not-yet-persisted entity. */
export function createTempId(): string {
    return `${TEMP_ID_PREFIX}${Date.now()}`;
}

/** True when `id` is a real server id (not a pending optimistic placeholder). */
export function isPersistedId(id: string | null | undefined): boolean {
    return typeof id === "string" && id.length > 0 && !id.startsWith(TEMP_ID_PREFIX);
}
