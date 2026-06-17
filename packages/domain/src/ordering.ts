// Fractional ordering math shared across clients + server (Tier 3). Pure: no I/O.
//
// Items carry a `doublePrecision` order_index. Appending bumps past the max;
// inserting between two neighbours takes their midpoint; a full rebalance lays
// items out on an even gap so there's headroom to insert between any pair again.

/** Even spacing used when rebalancing a full ordered list. */
export const ORDER_INDEX_GAP = 1024;

/** Next order index for appending to the end of a list (1 when empty). */
export function computeNextOrderIndex(indices: number[]): number {
    if (indices.length === 0) return 1;
    return Math.max(...indices) + 1;
}

/** Order index for inserting between two neighbours, with a fallback. */
export function computeMidpointIndex(
    prevIndex: number | undefined,
    nextIndex: number | undefined,
    fallback: number,
): number {
    if (prevIndex !== undefined && nextIndex !== undefined) {
        return (prevIndex + nextIndex) / 2;
    }
    if (prevIndex !== undefined) return prevIndex + 1;
    if (nextIndex !== undefined) return nextIndex - 1;
    return fallback;
}

/** Evenly-gapped order index for the item at `position` in a full rebalance. */
export function computeGappedOrderIndex(position: number): number {
    return position * ORDER_INDEX_GAP;
}
