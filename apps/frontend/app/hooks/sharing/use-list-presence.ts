import { useEffect, useSyncExternalStore } from "react";
import { presenceMessageSchema } from "@cadence/contracts/live";
import { API_BASE_URL } from "../../lib/env";
import { dropAuthJwt, getAuthJwt } from "../../lib/api/client";
import { useAuthState } from "../auth/use-auth-state";

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
    stopped: boolean;
    connecting: boolean;
}

const rooms = new Map<string, RoomEntry>();
const listeners = new Set<() => void>();

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
    if (entry.stopped || entry.connecting || entry.refs <= 0) return;
    entry.connecting = true;
    try {
        const jwt = await getAuthJwt();
        if (!jwt || entry.stopped || entry.refs <= 0) {
            entry.connecting = false;
            return;
        }
        entry.token = jwt;
        const ws = new WebSocket(presenceUrl(listId), [PRESENCE_PROTOCOL, jwt]);
        entry.socket = ws;

        ws.onopen = () => {
            entry.connecting = false;
            entry.attempt = 0;
            entry.authRetried = false;
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
            if (event.code === BAD_TOKEN && !entry.authRetried) {
                entry.authRetried = true;
                if (entry.token) dropAuthJwt(entry.token);
                void connectRoom(listId, entry);
                return;
            }
            const delay = Math.min(1000 * 2 ** entry.attempt, BACKOFF_CAP_MS);
            entry.attempt += 1;
            entry.retryTimer = window.setTimeout(() => void connectRoom(listId, entry), delay);
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
            stopped: false,
            connecting: false,
        };
        rooms.set(listId, entry);
    }
    entry.refs += 1;
    entry.stopped = false;
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
