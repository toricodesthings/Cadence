import { createContext, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useIsRestoring, useQueryClient, type Query } from "@tanstack/react-query";

const SLOW_START_MS = 4_000;
export const StartupRenderContext = createContext<(change: number) => void>(() => {});

// External decoration and the assistant can fall back independently; workspace data must be present.
const OPTIONAL_DOMAINS = new Set(["weather", "location", "holidays", "holiday-subdivisions", "appearance", "ai"]);

function needsInitialData(query: Query) {
    return query.isActive() && query.state.data === undefined;
}

/** Observe the mounted first screen, including queries enabled by earlier results.
 * No duplicate prefetch definitions, and no requests for unvisited routes.
 */
export function useWorkspaceStartup(enabled: boolean) {
    const client = useQueryClient();
    const cache = client.getQueryCache();
    const restoring = useIsRestoring();
    const [complete, setComplete] = useState(false);
    const [slow, setSlow] = useState(false);
    const [pendingChunks, setPendingChunks] = useState(0);
    const trackRender = useCallback((change: number) => setPendingChunks((count) => count + change), []);

    const blockers = useCallback(() => cache.getAll().filter((query) =>
        needsInitialData(query) && !(OPTIONAL_DOMAINS.has(String(query.queryKey[0]))
            && (slow || query.state.status === "error")),
    ), [cache, slow]);
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
                if (blockers().length === 0) setComplete(true);
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [blockers, complete, enabled, pendingChunks, restoring, state]);

    const retry = useCallback(() => {
        void client.refetchQueries({ predicate: needsInitialData, type: "active" });
    }, [client]);

    return { pending: enabled && !complete, state, slow, retry, trackRender };
}
