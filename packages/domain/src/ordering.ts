export const ORDER_INDEX_GAP = 1024;

export function computeNextOrderIndex(indices: number[]): number {
    if (indices.length === 0) return 1;
    return Math.max(...indices) + 1;
}

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

export function computeGappedOrderIndex(position: number): number {
    return position * ORDER_INDEX_GAP;
}

export function reorderWrites(
    items: { id: string; order: number }[],
    id: string,
    to: number,
): { id: string; order: number }[] {
    const from = items.findIndex((item) => item.id === id);
    if (from < 0 || to < 0 || to >= items.length || from === to) return [];
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    const [prev, after] = [next[to - 1]?.order, next[to + 1]?.order];
    const mid = computeMidpointIndex(prev, after, 0);
    if ((prev === undefined || mid > prev) && (after === undefined || mid < after)) return [{ id, order: mid }];
    return next
        .map((item, index) => ({ id: item.id, order: computeGappedOrderIndex(index + 1) }))
        .filter((write, index) => next[index].order !== write.order);
}
