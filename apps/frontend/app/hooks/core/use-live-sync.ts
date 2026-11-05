import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../auth/use-auth-state";
import { API_BASE_URL } from "../../lib/env";
import { dropAuthJwt, getAuthJwt, isSessionHeld } from "../../lib/api/client";
import { getWalSnapshot, subscribeWal } from "../../lib/api/offline-wal";
import { WAKE_EVENT } from "./use-wake-refresh";

/** Query roots a change on another device can touch. Weather, holidays, location, appearance, auth and assistant data stay out. */
const LIVE_ROOTS = new Set(["tasks", "projects", "inbox", "tags", "habits", "sections", "subtasks", "settings"]);
const PING_MS = 45_000;
const PONG_WAIT_MS = 10_000;
const DEBOUNCE_MS = 1_000;
const MAX_WAIT_MS = 5_000;
const BACKOFF_CAP_MS = 30 * 60_000;
const STABLE_MS = 60_000;
const BAD_TOKEN = 4401;
const RATE_LIMITED = 4429;
const ACCOUNT_GONE = 4001;

const liveUrl = () => `${API_BASE_URL.replace(/^http/, "ws")}/api/v1/live`;

/**
 * Cross-device freshness without polling. The server keeps one WebSocket per open copy of Cadence and sends
 * `{ v }` (a counter, never content) after any write of the account. A changed `v` refetches what is on screen,
 * so a routine logged on the phone reaches the desktop at once, even hidden in the tray, and nothing asks the
 * database on a timer. A dropped socket reconnects with backoff; an unchanged `v` after a reconnect costs no refetch.
 */
export function useLiveSync() {
    const queryClient = useQueryClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    const userId = session?.user.id;
    const enabled = authReady && isAuthenticated && Boolean(userId);

    useEffect(() => {
        if (!enabled) return;
        let disposed = false;
        let gone = false; // the account was deleted: never again
        let paused = false; // a second 4401: wait for a visible/online/wake/new-session signal
        let connecting = false;
        let socket: WebSocket | null = null;
        let lastV: number | null = null;
        let pending = false;
        let attempt = 0;
        let authRetried = false;
        let openedAt = 0;
        let retryTimer: number | undefined;
        let pingTimer: number | undefined;
        let pongTimer: number | undefined;
        let debounceTimer: number | undefined;
        let maxTimer: number | undefined;

        // ── Refresh: wait out local writes, then refetch what's on screen once ──
        const flush = () => {
            if (!pending) return;
            // A refetch now could undo an edit on screen; stay pending and retry as writes settle.
            if (queryClient.isMutating() > 0 || getWalSnapshot().some((entry) => entry.status !== "failed")) return;
            window.clearTimeout(debounceTimer);
            window.clearTimeout(maxTimer);
            debounceTimer = maxTimer = undefined;
            pending = false;
            // ponytail: "active" only, so the offline warm-up isn't re-downloaded on every ping; inactive lists catch up on mount or focus.
            void queryClient.invalidateQueries({ type: "active", predicate: (q) => LIVE_ROOTS.has(String(q.queryKey[0])) });
        };
        const markPending = () => {
            pending = true;
            window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(flush, DEBOUNCE_MS);
            maxTimer ??= window.setTimeout(flush, MAX_WAIT_MS);
        };
        const unsubscribeMutations = queryClient.getMutationCache().subscribe(flush);
        const unsubscribeWal = subscribeWal(flush);

        // ── Socket ──
        const stopTimers = () => {
            window.clearInterval(pingTimer);
            window.clearTimeout(pongTimer);
            pingTimer = pongTimer = undefined;
        };
        const schedule = (minimumMs = 0) => {
            window.clearTimeout(retryTimer);
            if (disposed || gone || paused) return;
            const backoff = Math.min(1000 * 2 ** attempt++, BACKOFF_CAP_MS) * (0.8 + Math.random() * 0.4);
            retryTimer = window.setTimeout(() => void connect(), Math.max(backoff, minimumMs));
        };
        const closed = (ws: WebSocket, code: number, sentToken: string) => {
            if (socket !== ws) return;
            socket = null;
            stopTimers();
            if (disposed) return;
            if (Date.now() - openedAt >= STABLE_MS && openedAt) attempt = 0;
            openedAt = 0;
            if (code === ACCOUNT_GONE) { gone = true; return; }
            if (code === BAD_TOKEN) {
                dropAuthJwt(sentToken);
                void getAuthJwt().then((fresh) => {
                    if (disposed) return;
                    if (fresh && fresh !== sentToken && !authRetried) { authRetried = true; void connect(); } else paused = true;
                });
                return;
            }
            schedule(code === RATE_LIMITED ? 60_000 : 0);
        };
        const ping = (ws: WebSocket) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send("ping");
            window.clearTimeout(pongTimer);
            // No answer: the connection is dead without saying so.
            pongTimer = window.setTimeout(() => { try { ws.close(); } catch { /* already closed */ } closed(ws, 1006, ""); }, PONG_WAIT_MS);
        };
        async function connect() {
            if (disposed || gone || socket || connecting || !navigator.onLine) return;
            if (isSessionHeld()) return schedule();
            connecting = true;
            try {
                const token = await getAuthJwt();
                if (disposed || socket || !token) return;
                const ws = new WebSocket(liveUrl(), ["cadence.live", token]);
                socket = ws;
                ws.onopen = () => {
                    openedAt = Date.now();
                    pingTimer = window.setInterval(() => ping(ws), PING_MS);
                };
                ws.onmessage = (event) => {
                    if (disposed || socket !== ws) return;
                    if (event.data === "pong") { window.clearTimeout(pongTimer); return; }
                    let v: unknown;
                    try { v = (JSON.parse(String(event.data)) as { v?: unknown }).v; } catch { return; }
                    if (typeof v !== "number") return;
                    authRetried = false;
                    // The first answer after mount only records: startup already refetched stale data.
                    if (lastV !== null && v !== lastV) markPending();
                    lastV = v;
                };
                ws.onclose = (event) => closed(ws, event.code, token);
            } finally {
                connecting = false;
            }
        }

        // A signal that the connection may have changed: check it now, or reconnect without waiting out a backoff.
        const wake = () => {
            if (disposed || gone) return;
            paused = false;
            if (socket) return ping(socket);
            window.clearTimeout(retryTimer);
            void connect();
        };
        const onVisible = () => { if (document.visibilityState === "visible") wake(); };
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
            try { ws?.close(1000); } catch { /* already closed */ }
        };
    }, [enabled, userId, queryClient]);
}
