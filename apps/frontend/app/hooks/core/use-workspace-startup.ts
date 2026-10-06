import { createContext, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useIsRestoring, useQueryClient, type Query } from "@tanstack/react-query";
import { startupMark, startupRoute } from "../../lib/startup-timing";

const SLOW_START_MS = 4_000;
export const StartupRenderContext = createContext<(change: number) => void>(() => {});
export const StartupReadyContext = createContext(true);

type QueryKey = readonly unknown[];
type StartupRoute = ReturnType<typeof startupRoute>;

// Never part of the first screen: decoration, the assistant, the developer tools probe.
// They fill in after reveal with their own skeleton or fade.
const NEVER_GATES = new Set(["weather", "location", "holidays", "holiday-subdivisions", "holiday-country-options", "ai", "admin-capabilities"]);
// The photo background: waits, but falls back after SLOW_START_MS or an error.
const OPTIONAL_DOMAINS = new Set(["appearance"]);

const filtersOf = (key: QueryKey) => (typeof key[1] === "object" && key[1] !== null ? key[1] as Record<string, unknown> : {});
// ["settings", userId] is the settings row; longer keys (notification state, focus views) are not.
const isSettingsRow = (key: QueryKey) => key[0] === "settings" && key.length === 2;
const isDomain = (key: QueryKey, ...domains: string[]) => domains.includes(String(key[0]));

/** Each entry route's first-screen data. Routes not listed wait for every mounted query
 * except the never-gating ones. Sidebar counts, the planner rail and badges fill in after reveal. */
const FIRST_SCREEN: Partial<Record<StartupRoute, (key: QueryKey) => boolean>> = {
    // The feed (thoughts, No day yet tasks, kept notes) and the chips its rows show.
    capture: (key) => isSettingsRow(key) || isDomain(key, "inbox", "projects", "tags", "subtasks")
        || (key[0] === "tasks" && filtersOf(key).hasNoDate === true && filtersOf(key).hasNoProject === true),
    // That list's tasks, sections and routines.
    list: (key) => isSettingsRow(key) || isDomain(key, "projects", "tags", "sections", "subtasks")
        || (key[0] === "tasks" && typeof filtersOf(key).projectId === "string")
        || (key[0] === "habits" && key[1] === "weekly"),
};

function gatesStartup(route: StartupRoute, key: QueryKey) {
    if (NEVER_GATES.has(String(key[0])) || (key[0] === "settings" && !isSettingsRow(key))) return false;
    if (OPTIONAL_DOMAINS.has(String(key[0]))) return true;
    return FIRST_SCREEN[route]?.(key) ?? true;
}

function needsInitialData(query: Query) {
    return query.isActive() && query.state.data === undefined;
}

/** Observe the mounted first screen, including queries enabled by earlier results.
 * No duplicate prefetch definitions, and no requests for unvisited routes.
 */
export function useWorkspaceStartup(enabled: boolean, pathname: string) {
    const client = useQueryClient();
    const cache = client.getQueryCache();
    const restoring = useIsRestoring();
    const [complete, setComplete] = useState(false);
    const [slow, setSlow] = useState(false);
    const [pendingChunks, setPendingChunks] = useState(0);
    const trackRender = useCallback((change: number) => setPendingChunks((count) => count + change), []);

    const route = startupRoute(pathname);
    const blockers = useCallback(() => {
        const queries = cache.getAll();
        // Offline with a saved workspace: open it; a view without saved data says so itself.
        const hasSavedWorkspace = queries.some((query) => query.state.data !== undefined
            && gatesStartup(route, query.queryKey) && !OPTIONAL_DOMAINS.has(String(query.queryKey[0])));
        return queries.filter((query) =>
            needsInitialData(query)
            && gatesStartup(route, query.queryKey)
            && !(hasSavedWorkspace && query.state.fetchStatus === "paused")
            && !(OPTIONAL_DOMAINS.has(String(query.queryKey[0])) && (slow || query.state.status === "error")));
    }, [cache, route, slow]);
    const subscribe = useCallback((onChange: () => void) => cache.subscribe(onChange), [cache]);
    const snapshot = useCallback(() => {
        if (!enabled || complete) return "ready";
        const queries = blockers();
        if (queries.some((query) => query.state.fetchStatus === "paused")) return "offline";
        if (queries.some((query) => query.state.status === "error" && query.state.fetchStatus === "idle")) return "error";
        return queries.length ? "pending" : "ready";
    }, [blockers, complete, enabled]);
    const state = useSyncExternalStore(subscribe, snapshot, () => "pending");

    useEffect(() => {
        if (!enabled || complete) return;
        const timer = window.setTimeout(() => setSlow(true), SLOW_START_MS);
        return () => window.clearTimeout(timer);
    }, [complete, enabled]);

    useEffect(() => {
        if (!enabled || complete || restoring || pendingChunks > 0 || state !== "ready") return;
        // Let query observers mount and dependent children commit before reveal.
        // Recheck the live cache, since subscriptions can change between frames.
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                if (blockers().length === 0) {
                    startupMark("required_data.ready");
                    setComplete(true);
                }
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [blockers, complete, enabled, pendingChunks, restoring, state]);

    const retry = useCallback(() => {
        void client.refetchQueries({ predicate: needsInitialData, type: "active" });
    }, [client]);

    return { pending: enabled && !complete, state, slow, retry, trackRender };
}
