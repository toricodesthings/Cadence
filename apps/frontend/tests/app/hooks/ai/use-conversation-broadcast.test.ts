import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConversationBroadcast } from "../../../../app/hooks/ai/use-conversation-broadcast";

const CHANNEL = "cadence:ai:chat";

/** Flush the BroadcastChannel delivery queue (async in Node/jsdom). */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("useConversationBroadcast", () => {
    const channels: BroadcastChannel[] = [];
    const open = () => {
        const c = new BroadcastChannel(CHANNEL);
        channels.push(c);
        return c;
    };
    afterEach(() => {
        for (const c of channels.splice(0)) c.close();
    });

    it("invokes the handler for a message from another tab", async () => {
        const handler = vi.fn();
        renderHook(() => useConversationBroadcast(handler));

        open().postMessage({ type: "stream-started", conversationId: "conv-1", senderId: "other-tab" });
        await tick();

        expect(handler).toHaveBeenCalledWith("stream-started", "conv-1");
    });

    it("delivers the finished payload verbatim", async () => {
        const handler = vi.fn();
        renderHook(() => useConversationBroadcast(handler));

        open().postMessage({ type: "stream-finished", conversationId: "abc", senderId: "x" });
        await tick();

        expect(handler).toHaveBeenCalledWith("stream-finished", "abc");
    });

    it("ignores echoes carrying this tab's own senderId", async () => {
        // Sniff what the hook broadcasts to learn this tab's senderId.
        const sniff = open();
        let ownId: string | undefined;
        sniff.onmessage = (e) => {
            ownId = (e.data as { senderId?: string }).senderId;
        };

        const handler = vi.fn();
        const { result } = renderHook(() => useConversationBroadcast(handler));

        result.current("stream-finished", "conv-1"); // hook posts, stamped with its TAB_ID
        await tick();
        expect(ownId).toBeDefined();
        expect(handler).not.toHaveBeenCalled(); // the hook never reacts to its own post

        // A different channel replaying a message stamped with our id is still ignored.
        open().postMessage({ type: "stream-started", conversationId: "conv-2", senderId: ownId });
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it("broadcast() posts the typed payload to other tabs", async () => {
        const received: unknown[] = [];
        const listener = open();
        listener.onmessage = (e) => received.push(e.data);

        const { result } = renderHook(() => useConversationBroadcast(vi.fn()));
        result.current("stream-started", "conv-9");
        await tick();

        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({ type: "stream-started", conversationId: "conv-9" });
        expect((received[0] as { senderId?: string }).senderId).toBeTruthy();
    });
});
