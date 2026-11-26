import { WS_CLOSE } from "@cadence/contracts/live";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../auth/use-auth-state";
import { API_BASE_URL } from "../../lib/env";
import { dropAuthJwt, getAuthJwt, isSessionHeld, PAGE_ORIGIN } from "../../lib/api/client";
import { getWalSnapshot, subscribeWal } from "../../lib/api/offline-wal";
import { WAKE_EVENT } from "./use-wake-refresh";
import { liveMessageSchema, type LiveChange } from "@cadence/contracts/live";
import { reconcileTaskInCaches, removeTaskFromCaches } from "../../lib/api/cache-sync";
import { queryKeys } from "../../lib/api/query-keys";

const LIVE_ROOTS = new Set([
    "tasks",
    "projects",
    "inbox",
    "tags",
    "personal-events",
    "habits",
    "sections",
    "subtasks",
    "settings",
]);
const PING_MS = 45_000;
const PONG_WAIT_MS = 10_000;
const DEBOUNCE_MS = 1_000;
const MAX_WAIT_MS = 5_000;
const BACKOFF_CAP_MS = 30 * 60_000;
const STABLE_MS = 60_000;

const liveUrl = () => `${API_BASE_URL.replace(/^http/, "ws")}/api/v1/live`;
const isLive = (q: { queryKey: readonly unknown[] }) => LIVE_ROOTS.has(String(q.queryKey[0]));
const isListRead = (q: { queryKey: readonly unknown[] }) =>
    ["projects", "sections", "tasks"].includes(String(q.queryKey[0]));

export function useLiveSync() {
    const queryClient = useQueryClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    const userId = session?.user.id;
    const enabled = authReady && isAuthenticated && Boolean(userId);

    useEffect(() => {
        if (!enabled) return;
        let disposed = false;
        let gone = false;
        let paused = false;
        let connecting = false;
        let socket: WebSocket | null = null;
        let lastV: number | null = null;
        let ticket: string | null = null;
        let pending = false;
        let attempt = 0;
        let authRetried = false;
        let openedAt = 0;
        let notBefore = 0;
        let retryTimer: number | undefined;
        let pingTimer: number | undefined;
        let pongTimer: number | undefined;
        let debounceTimer: number | undefined;
        let maxTimer: number | undefined;

        const writing = () =>
            queryClient.isMutating() > 0 || getWalSnapshot().some((entry) => entry.status !== "failed");
        const apply = (changes: LiveChange[]) => {
            for (const change of changes) {
                if (change.type === "task") reconcileTaskInCaches(queryClient, change.task);
                else if (change.type === "task.gone") removeTaskFromCaches(queryClient, change.id);
                else if (change.type === "event")
                    void queryClient.invalidateQueries({
                        queryKey: queryKeys.personalEvents.all,
                        refetchType: "active",
                    });
                else if (change.type === "routine")
                    void queryClient.invalidateQueries({
                        queryKey: queryKeys.habits.all,
                        refetchType: "active",
                    });
                else void queryClient.invalidateQueries({ predicate: isListRead, refetchType: "active" });
            }
        };
        const flush = () => {
            if (!pending) return;
            if (writing()) return;
            window.clearTimeout(debounceTimer);
            window.clearTimeout(maxTimer);
            debounceTimer = maxTimer = undefined;
            pending = false;
            void queryClient.invalidateQueries({ predicate: isLive, refetchType: "active" }, { cancelRefetch: false });
        };
        const markPending = () => {
            pending = true;
            window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(flush, DEBOUNCE_MS);
            maxTimer ??= window.setTimeout(flush, MAX_WAIT_MS);
        };
        const unsubscribeMutations = queryClient.getMutationCache().subscribe(flush);
        const unsubscribeWal = subscribeWal(flush);

        const stopTimers = () => {
            window.clearInterval(pingTimer);
            window.clearTimeout(pongTimer);
            pingTimer = pongTimer = undefined;
        };
        const schedule = (minimumMs = 0) => {
            window.clearTimeout(retryTimer);
            if (disposed || gone || paused) return;
            const backoff = Math.min(1000 * 2 ** attempt++, BACKOFF_CAP_MS) * (0.8 + Math.random() * 0.4);
            if (minimumMs) notBefore = Date.now() + minimumMs;
            retryTimer = window.setTimeout(() => void connect(), Math.max(backoff, minimumMs));
        };
        const closed = (ws: WebSocket, code: number, sentToken: string) => {
            if (socket !== ws) return;
            socket = null;
            stopTimers();
            if (disposed) return;
            if (Date.now() - openedAt >= STABLE_MS && openedAt) attempt = 0;
            openedAt = 0;
            if (code === WS_CLOSE.accountGone) {
                gone = true;
                return;
            }
            if (code === WS_CLOSE.badToken && sentToken === ticket) {
                ticket = null;
                void connect();
                return;
            }
            if (code === WS_CLOSE.badToken) {
                dropAuthJwt(sentToken);
                getAuthJwt().then(
                    (fresh) => {
                        if (disposed || socket || connecting) return;
                        if (fresh && fresh !== sentToken && !authRetried) {
                            authRetried = true;
                            void connect();
                        } else paused = true;
                    },
                    () => schedule(),
                );
                return;
            }
            schedule(code === WS_CLOSE.rateLimited ? 60_000 : 0);
        };
        const ping = (ws: WebSocket) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send("ping");
            window.clearTimeout(pongTimer);
            pongTimer = window.setTimeout(() => {
                try {
                    ws.close();
                } catch {}
                closed(ws, 1006, "");
            }, PONG_WAIT_MS);
        };
        async function connect() {
            if (disposed || gone || socket || connecting || !navigator.onLine) return;
            if (isSessionHeld()) return schedule();
            connecting = true;
            try {
                const token = ticket ?? (await getAuthJwt());
                if (disposed || socket) return;
                if (!token) return schedule();
                const ws = new WebSocket(liveUrl(), ["cadence.live", token, PAGE_ORIGIN]);
                let first = true;
                socket = ws;
                ws.onopen = () => {
                    openedAt = Date.now();
                    pingTimer = window.setInterval(() => ping(ws), PING_MS);
                };
                ws.onmessage = (event) => {
                    if (disposed || socket !== ws) return;
                    if (event.data === "pong") {
                        window.clearTimeout(pongTimer);
                        return;
                    }
                    let message: { v?: unknown; ticket?: unknown };
                    try {
                        message = JSON.parse(String(event.data)) as typeof message;
                    } catch {
                        return;
                    }
                    if (typeof message.ticket === "string") ticket = message.ticket;
                    const { v } = message;
                    if (typeof v !== "number") return;
                    const parsed = liveMessageSchema.safeParse(message);
                    const changes = parsed.success ? parsed.data.changes : undefined;
                    authRetried = false;
                    const missed =
                        first &&
                        queryClient
                            .getQueryCache()
                            .findAll({ type: "active", predicate: isLive })
                            .some((q) => q.state.status === "error");
                    const wasFirst = first;
                    first = false;
                    if (changes?.length && !wasFirst && lastV !== null && v === lastV + 1 && !writing()) apply(changes);
                    else if ((lastV !== null && v !== lastV) || missed) markPending();
                    lastV = v;
                };
                ws.onclose = (event) => closed(ws, event.code, token);
            } catch {
                schedule();
            } finally {
                connecting = false;
            }
        }

        const wake = () => {
            if (disposed || gone) return;
            paused = false;
            if (socket) return ping(socket);
            if (Date.now() < notBefore) return;
            window.clearTimeout(retryTimer);
            void connect();
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") wake();
        };
        window.addEventListener("online", wake);
        window.addEventListener(WAKE_EVENT, wake);
        document.addEventListener("visibilitychange", onVisible);
        void connect();

        return () => {
            disposed = true;
            window.removeEventListener("online", wake);
            window.removeEventListener(WAKE_EVENT, wake);
            document.removeEventListener("visibilitychange", onVisible);
            unsubscribeMutations();
            unsubscribeWal();
            stopTimers();
            for (const timer of [retryTimer, debounceTimer, maxTimer]) window.clearTimeout(timer);
            const ws = socket;
            socket = null;
            try {
                ws?.close(1000);
            } catch {}
        };
    }, [enabled, userId, queryClient]);
}
