import type { SortMode } from "../../lib/utils/task/sort-tasks";
import { useUrlState } from "./use-url-state";

const SORT_MODES: readonly SortMode[] = ["smart", "priority", "manual"];
const parseSort = (raw: string | null) => SORT_MODES.find((mode) => mode === raw) ?? null;

export function useSortMode(page: string) {
    const [sortMode, setSortMode] = useUrlState<SortMode>("sort", {
        parse: parseSort,
        fallback: "smart",
        deviceKey: `cadence:sort:${page}`,
    });
    return { sortMode, setSortMode } as const;
}
