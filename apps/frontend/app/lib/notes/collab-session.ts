import { WS_CLOSE } from "@cadence/contracts/live";
import * as Y from "yjs";
import { WebsocketProvider } from "y-partyserver/provider";
import type { Editor } from "@tiptap/core";
import { API_BASE_URL } from "../env";
import { dropAuthJwt, getAuthJwt } from "../api/client";
import { markdownToDoc } from "./note-markdown";

const COLLAB_PROTOCOL = "cadence.collab";
const CARET_PALETTE = ["#e8a44a", "#7eb8d4", "#5dba72", "#9b72cf", "#cf72a8", "#4a90d9"] as const;

export type CollabStatus = "connecting" | "synced" | "offline";

export interface CollabUser {
    id: string;
    name: string;
    color: string;
}

export interface CollabPeer {
    clientId: number;
    userId: string;
    name: string;
    color: string;
}

export interface CollabSnapshot {
    status: CollabStatus;
    peers: CollabPeer[];
}

export function collabColorFor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    return CARET_PALETTE[Math.abs(hash) % CARET_PALETTE.length]!;
}

function makeAuthWebSocket(getToken: () => string | null): typeof WebSocket {
    return class AuthCollabWebSocket extends WebSocket {
        constructor(url: string | URL, _protocols?: string | string[]) {
            const token = getToken();
            super(url, token ? [COLLAB_PROTOCOL, token] : [COLLAB_PROTOCOL]);
        }
    };
}

export class CollabNoteHandle {
    readonly taskId: string;
    readonly doc: Y.Doc;
    readonly provider: WebsocketProvider;

    private readonly user: CollabUser;
    private token: string | null = null;
    private authRetried = false;
    private disposed = false;
    private status: CollabStatus = "connecting";
    private peers: CollabPeer[] = [];
    private snapshot: CollabSnapshot = { status: "connecting", peers: [] };
    private listeners = new Set<() => void>();

    constructor(taskId: string, user: CollabUser) {
        this.taskId = taskId;
        this.user = user;
        this.doc = new Y.Doc();
        const url = `${API_BASE_URL.replace(/^http/, "ws")}/api/v1/notes/${taskId}/collab`;

        this.provider = new WebsocketProvider(url, taskId, this.doc, {
            connect: false,
            isPrefixedUrl: true,
            WebSocketPolyfill: makeAuthWebSocket(() => this.token),
        });

        this.setPresent(true);

        this.provider.on("status", ({ status }: { status: "connected" | "connecting" | "disconnected" }) => {
            if (status === "disconnected") this.updateStatus("offline");
            else if (status === "connecting") this.updateStatus("connecting");
            else {
                this.authRetried = false;
                if (this.provider.synced) this.updateStatus("synced");
            }
        });

        this.provider.on("sync", (synced: boolean) => {
            if (synced) this.updateStatus("synced");
        });

        this.provider.on("connection-close", (event: CloseEvent | null) => {
            if (event?.code === WS_CLOSE.badToken) {
                if (this.token) dropAuthJwt(this.token);
                this.token = null;
                if (this.authRetried) {
                    this.provider.disconnect();
                    this.updateStatus("offline");
                    return;
                }
                this.authRetried = true;
                void this.refreshAndReconnect();
            }
        });

        const refreshPeers = () => {
            const myId = this.doc.clientID;
            const next: CollabPeer[] = [];
            this.provider.awareness.getStates().forEach((state, clientId) => {
                if (clientId === myId) return;
                const u = (state as { user?: Partial<CollabUser> } | null)?.user;
                if (u?.name && u.id)
                    next.push({ clientId, userId: u.id, name: u.name, color: u.color ?? CARET_PALETTE[0] });
            });
            this.peers = next;
            this.emit();
        };
        this.provider.awareness.on("change", refreshPeers);

        void this.start();
    }

    setPresent(present: boolean) {
        this.provider.awareness.setLocalState(present ? { user: this.user } : null);
    }

    private async start() {
        const jwt = await getAuthJwt();
        if (this.disposed) return;
        this.token = jwt;
        if (!jwt) {
            this.updateStatus("offline");
            return;
        }
        this.provider.connect();
    }

    private async refreshAndReconnect() {
        this.provider.disconnect();
        const jwt = await getAuthJwt();
        if (this.disposed) return;
        this.token = jwt;
        if (!jwt) {
            this.updateStatus("offline");
            return;
        }
        this.provider.connect();
    }

    private updateStatus(next: CollabStatus) {
        if (this.status === next) return;
        this.status = next;
        this.emit();
    }

    private emit() {
        this.snapshot = { status: this.status, peers: this.peers };
        for (const fn of this.listeners) fn();
    }

    subscribe = (fn: () => void) => {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    };

    getSnapshot = (): CollabSnapshot => this.snapshot;

    seedOnce(editor: Editor, initialMarkdown: string) {
        if (this.disposed || editor.isDestroyed || !this.provider.synced) return;
        const meta = this.doc.getMap("meta");
        if (meta.get("seeded")) return;
        const fragment = this.doc.getXmlFragment("default");
        if (fragment.length > 0) {
            meta.set("seeded", true);
            return;
        }
        for (const clientId of this.provider.awareness.getStates().keys()) {
            if (clientId < this.doc.clientID) return;
        }
        this.doc.transact(() => {
            meta.set("seeded", true);
        });
        if (initialMarkdown.trim()) {
            editor.commands.setContent(markdownToDoc(initialMarkdown), { emitUpdate: false });
        }
    }

    sendSnapshot(markdown: string) {
        if (this.disposed) return;
        const ws = this.provider.ws;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(`__YPS:${JSON.stringify({ type: "snapshot", markdown })}`);
    }

    destroy() {
        this.disposed = true;
        this.listeners.clear();
        this.provider.destroy();
        this.doc.destroy();
    }
}
