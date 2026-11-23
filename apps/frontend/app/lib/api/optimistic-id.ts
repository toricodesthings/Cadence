const clientIds = new WeakMap<object, string>();

/**
 * A new row id: RFC 9562 UUIDv7 (48-bit ms timestamp, then random), the same kind the
 * database mints. Time-ordered ids append to the end of an index instead of splitting
 * random pages. Never treat the embedded time as data; `created_at` is the record.
 */
export function newRowId(now = Date.now()): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(now / 2 ** (8 * (5 - i))) & 0xff;
    bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The id a create sends as both the entity id and its Idempotency-Key. Stable
 * per input object, so the optimistic row, the request, a retry and an offline
 * replay all agree, and later edits can target it before it syncs (the server
 * keeps it). An `id` already on the input wins.
 */
export function clientIdFor(input: object): string {
    const given = (input as { id?: unknown }).id;
    if (typeof given === "string" && given) return given;
    let id = clientIds.get(input);
    if (!id) {
        id = newRowId();
        clientIds.set(input, id);
    }
    return id;
}
