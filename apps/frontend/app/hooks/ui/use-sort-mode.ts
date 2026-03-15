import { useCallback } from "react";
import { useSearchParams } from "react-router";
import type { SortMode } from "../../lib/utils/sort-tasks";

/**
 * Reads/writes the sort mode for a route via URL search params.
 * Falls back to "smart" if no param is set.
 */
export function useSortMode() {
    const [searchParams, setSearchParams] = useSearchParams();

    const sortMode = (searchParams.get("sort") as SortMode) || "smart";

    const setSortMode = useCallback(
        (mode: SortMode) => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (mode === "smart") {
                        next.delete("sort");
                    } else {
                        next.set("sort", mode);
                    }
                    return next;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    return { sortMode, setSortMode } as const;
}
