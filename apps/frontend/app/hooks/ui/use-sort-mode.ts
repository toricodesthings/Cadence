import type { SortMode } from "../../lib/utils/task/sort-tasks";
import { useDeviceValue } from "./use-device-flag";

const SORT_MODES: readonly SortMode[] = ["smart", "priority", "manual"];

/** A task page's sort ("today", "upcoming", "project:<id>"), kept on this device only; "smart" until picked. */
export function useSortMode(page: string) {
    const [saved, setSaved] = useDeviceValue(`cadence:sort:${page}`);
    const sortMode: SortMode = SORT_MODES.find((mode) => mode === saved) ?? "smart";
    return { sortMode, setSortMode: setSaved as (mode: SortMode) => void } as const;
}
