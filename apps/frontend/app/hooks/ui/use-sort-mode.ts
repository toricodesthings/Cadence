import type { SortMode } from "../../lib/utils/task/sort-tasks";
import { useUrlState } from "./use-url-state";

const SORT_MODES: readonly SortMode[] = ["smart", "priority", "manual"];
const parseSort = (raw: string | null) => SORT_MODES.find((mode) => mode === raw) ?? null;

/** A task page's sort ("today", "upcoming", "project:<id>"): `?sort=` in the address, else this device's choice; "smart" until picked. */
export function useSortMode(page: string) {
    const [sortMode, setSortMode] = useUrlState<SortMode>("sort", { parse: parseSort, fallback: "smart", deviceKey: `cadence:sort:${page}` });
    return { sortMode, setSortMode } as const;
}
