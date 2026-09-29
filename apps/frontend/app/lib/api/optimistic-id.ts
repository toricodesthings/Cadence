const clientIds = new WeakMap<object, string>();

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
        id = crypto.randomUUID();
        clientIds.set(input, id);
    }
    return id;
}
