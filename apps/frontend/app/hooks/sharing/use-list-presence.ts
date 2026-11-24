import { useEffect, useSyncExternalStore } from "react";
import { presenceMessageSchema } from "@cadence/contracts/live";
import { API_BASE_URL } from "../../lib/env";
import { dropAuthJwt, getAuthJwt } from "../../lib/api/client";
import { useAuthState } from "../auth/use-auth-state";
import { WAKE_EVENT } from "../core/use-wake-refresh";

const PRESENCE_PROTOCOL = "cadence.presence";
const PING_MS = 45_000;
const BACKOFF_CAP_MS = 60_000;
const BAD_TOKEN = 4401;
const FORBIDDEN = 4403;
const EMPTY_SET: ReadonlySet<string> = new Set();

interface RoomEntry {
    refs: number;
    online: ReadonlySet<string>;
    socket: WebSocket | null;
    token: string | null;
    pingTimer: number | undefined;
    retryTimer: number | undefined;
    attempt: number;
    authRetried: boolean;
    paused: boolean;
    stopped: boolean;
    connecting: boolean;
}

const rooms = new Map<string, RoomEntry>();
const listeners = new Set<() => void>();
let wakeAttached = false;

function reconnectRooms() {
    for (const [listId, entry] of rooms) {
        if (entry.stopped || entry.refs <= 0) continue;
        entry.paused = false;
        entry.authRetried = false;
        if (!entry.connecting && (!entry.socket || entry.socket.readyState === WebSocket.CLOSED)) {
            clearTimers(entry);
            void connectRoom(listId, entry);
        }
    }
}

function syncWakeListeners() {
    if (typeof window === "undefined") return;
    if (rooms.size > 0 && !wakeAttached) {
        window.addEventListener("online", reconnectRooms);
        window.addEventListener(WAKE_EVENT, reconnectRooms);
        wakeAttached = true;
    } else if (rooms.size === 0 && wakeAttached) {
        window.removeEventListener("online", reconnectRooms);
        window.removeEventListener(WAKE_EVENT, reconnectRooms);
        wakeAttached = false;
    }
}

function scheduleRetry(listId: string, entry: RoomEntry) {
    if (entry.stopped || entry.paused || entry.refs <= 0) return;
    const delay = Math.min(1000 * 2 ** entry.attempt, BACKOFF_CAP_MS);
    entry.attempt += 1;
    entry.retryTimer = window.setTimeout(() => void connectRoom(listId, entry), delay);
}

function emit() {
    for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

function presenceUrl(listId: string) {
    return `${API_BASE_URL.replace(/^http/, "ws")}/api/v1/lists/${listId}/presence`;
}

function clearTimers(entry: RoomEntry) {
    if (entry.pingTimer !== undefined) {
        window.clearInterval(entry.pingTimer);
        entry.pingTimer = undefined;
    }
    if (entry.retryTimer !== undefined) {
        window.clearTimeout(entry.retryTimer);
        entry.retryTimer = undefined;
    }
}

async function connectRoom(listId: string, entry: RoomEntry) {
    if (entry.stopped || entry.paused || entry.connecting || entry.refs <= 0) return;
    entry.connecting = true;
    try {
        const jwt = await getAuthJwt();
        if (entry.stopped || entry.refs <= 0) {
            entry.connecting = false;
            return;
        }
        if (!jwt) {
            entry.connecting = false;
            scheduleRetry(listId, entry);
            return;
        }
        entry.token = jwt;
        const ws = new WebSocket(presenceUrl(listId), [PRESENCE_PROTOCOL, jwt]);
        entry.socket = ws;

        ws.onopen = () => {
            entry.connecting = false;
            entry.attempt = 0;
            entry.authRetried = false;
            entry.paused = false;
            clearTimers(entry);
            entry.pingTimer = window.setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send("ping");
            }, PING_MS);
        };

        ws.onmessage = (event) => {
            if (event.data === "pong" || typeof event.data !== "string") return;
            try {
                const parsed = presenceMessageSchema.safeParse(JSON.parse(event.data));
                if (!parsed.success) return;
                entry.online = new Set(parsed.data.userIds);
                emit();
            } catch {
                // Ignore malformed frames.
            }
        };

        ws.onclose = (event) => {
            entry.connecting = false;
            if (entry.socket === ws) entry.socket = null;
            clearTimers(entry);
            if (entry.stopped || entry.refs <= 0) return;
            if (event.code === FORBIDDEN) {
                entry.stopped = true;
                entry.online = EMPTY_SET;
                emit();
                return;
            }
            if (event.code === BAD_TOKEN) {
                if (entry.token) dropAuthJwt(entry.token);
                if (!entry.authRetried) {
                    entry.authRetried = true;
                    void connectRoom(listId, entry);
                    return;
                }
                // Second consecutive 4401: pause until online/wake rather than looping against Neon Auth.
                entry.paused = true;
                return;
            }
            scheduleRetry(listId, entry);
        };

        ws.onerror = () => {
            try {
                ws.close();
            } catch {
                // Already closing.
            }
        };
    } catch {
        entry.connecting = false;
        scheduleRetry(listId, entry);
    }
}

function retain(listId: string) {
    let entry = rooms.get(listId);
    if (!entry) {
        entry = {
            refs: 0,
            online: EMPTY_SET,
            socket: null,
            token: null,
            pingTimer: undefined,
            retryTimer: undefined,
            attempt: 0,
            authRetried: false,
            paused: false,
            stopped: false,
            connecting: false,
        };
        rooms.set(listId, entry);
    }
    entry.refs += 1;
    entry.stopped = false;
    syncWakeListeners();
    if (entry.refs === 1) void connectRoom(listId, entry);
    return () => {
        const current = rooms.get(listId);
        if (!current) return;
        current.refs -= 1;
        if (current.refs <= 0) {
            current.stopped = true;
            clearTimers(current);
            try {
                current.socket?.close(1000, "left");
            } catch {
                // Already closed.
            }
            rooms.delete(listId);
            syncWakeListeners();
            emit();
        }
    };
}

/**
 * Subscribe to live presence for a shared list (opens a ref-counted WebSocket to `ListPresence`).
 * Returns the set of user ids who currently have the list open.
 */
export function useListPresence(listId: string | null | undefined, enabled = true): ReadonlySet<string> {
    const { authReady, isAuthenticated } = useAuthState();
    const active = Boolean(listId && enabled && authReady && isAuthenticated && typeof WebSocket !== "undefined");

    useEffect(() => {
        if (!active || !listId) return;
        return retain(listId);
    }, [active, listId]);

    return useListOnlineIds(listId);
}

/** Read-only selector for a list's currently known online user ids without opening a new socket. */
export function useListOnlineIds(listId: string | null | undefined): ReadonlySet<string> {
    return useSyncExternalStore(
        subscribe,
        () => (listId ? (rooms.get(listId)?.online ?? EMPTY_SET) : EMPTY_SET),
        () => EMPTY_SET,
    );
}
