/**
 * Same-browser announcements that a note was saved, so another open tab refreshes at
 * once. It carries no text: receivers re-read through the typed query. Other devices,
 * the assistant and tabs without BroadcastChannel are caught by polling and by the
 * server's revision check.
 */
export interface NoteAnnouncement {
    userId: string;
    owner: string;
    version: number;
    opId?: string;
}

let channel: BroadcastChannel | null | undefined;
const get = () => (channel === undefined ? (channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("cadence-notes")) : channel);

export function announceNoteSaved(message: NoteAnnouncement) {
    get()?.postMessage(message);
}

export function onNoteSaved(userId: string, cb: (message: NoteAnnouncement) => void): () => void {
    const c = get();
    if (!c) return () => {};
    const handler = (event: MessageEvent<NoteAnnouncement>) => event.data?.userId === userId && cb(event.data);
    c.addEventListener("message", handler);
    return () => c.removeEventListener("message", handler);
}
