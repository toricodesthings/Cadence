import { useCallback, useState, type FocusEvent, type KeyboardEvent } from "react";

type Cell = { row: number; col: number };

const STEPS: Record<string, [number, number]> = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
};

function positionOf(el: HTMLElement): Cell {
    return { row: Number(el.dataset.cellRow), col: Number(el.dataset.cellCol) };
}

/**
 * One tab stop for a grid of cells marked `data-cell-row` / `data-cell-col`;
 * arrows move between them, skipping gaps. Spread `gridProps` on the container
 * and give each cell `tabIndexFor(row, col)`. `first` is the cell that holds
 * the tab stop before any has had focus.
 */
export function useRovingGrid(first: Cell | null) {
    const [active, setActive] = useState<Cell | null>(null);

    const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
        const step = STEPS[e.key];
        const current = (e.target as HTMLElement).closest<HTMLElement>("[data-cell-row]");
        if (!step || !current) return;
        const from = positionOf(current);
        let best: HTMLElement | null = null;
        let bestScore = Infinity;
        for (const el of e.currentTarget.querySelectorAll<HTMLElement>("[data-cell-row]")) {
            const { row, col } = positionOf(el);
            const dr = row - from.row;
            const dc = col - from.col;
            const ahead = step[0] ? Math.sign(dr) === step[0] : dr === 0 && Math.sign(dc) === step[1];
            if (!ahead) continue;
            const score = step[0] ? Math.abs(dr) * 100 + Math.abs(dc) : Math.abs(dc);
            if (score < bestScore) {
                best = el;
                bestScore = score;
            }
        }
        if (!best) return;
        e.preventDefault();
        best.focus();
    }, []);

    const onFocus = useCallback((e: FocusEvent<HTMLElement>) => {
        const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell-row]");
        if (cell) setActive(positionOf(cell));
    }, []);

    const stop = active ?? first;
    const tabIndexFor = (row: number, col: number) => (stop && stop.row === row && stop.col === col ? 0 : -1);

    return { gridProps: { onKeyDown, onFocus }, tabIndexFor };
}
