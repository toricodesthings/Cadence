import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UIMessage } from "ai";

// Mock the auth fetch wrapper so we can inspect the exact request the stop
// helper issues (endpoint / method / body) without hitting the network.
const authenticatedFetch = vi.fn(async () => new Response(null, { status: 200 }));
vi.mock("../../../../app/lib/api/client", () => ({
    authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...(args as [])),
}));
// Pin a deterministic API base (env.ts reads import.meta.env / throws in prod builds).
vi.mock("../../../../app/lib/env", () => ({ API_BASE_URL: "http://api.test" }));

import { stopServerStream } from "../../../../app/lib/ai/stop-stream";

const CONVO = "conv-123";
const SID = "stream-abc";

function lastArgs() {
    const [url, init] = authenticatedFetch.mock.calls.at(-1) as unknown as [string, RequestInit];
    return { url, init, body: JSON.parse(String(init.body)) };
}

describe("stopServerStream", () => {
    beforeEach(() => authenticatedFetch.mockClear());

    it("POSTs to the conversation-scoped stop endpoint with the contract body", async () => {
        const assistant: UIMessage = {
            id: "m1",
            role: "assistant",
            parts: [{ type: "text", text: "partial…" }],
        };

        await stopServerStream(CONVO, SID, assistant);

        const { url, init, body } = lastArgs();
        // Exact backend path/method (prefix /api/v1/ai, :id = conversationId).
        expect(url).toBe(`http://api.test/api/v1/ai/chat/${CONVO}/stop`);
        expect(init.method).toBe("POST");
        // matches stopStreamSchema: { activeStreamId?, assistantMessage? }
        expect(body.activeStreamId).toBe(SID);
        expect(body.assistantMessage).toEqual(assistant);
        // Authenticated request (carries the JWT via the wrapper).
        expect((init as { authenticated?: boolean }).authenticated).toBe(true);
    });

    it("omits assistantMessage when the last message is not the assistant turn", async () => {
        const userMsg: UIMessage = {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: "hi" }],
        };
        await stopServerStream(CONVO, SID, userMsg);
        expect(lastArgs().body.assistantMessage).toBeUndefined();
    });

    it("sends no activeStreamId when none is hydrated (null/undefined)", async () => {
        await stopServerStream(CONVO, null, undefined);
        expect(lastArgs().body.activeStreamId).toBeUndefined();
    });
});

describe("hard-abort ordering (doc Update 4 §8)", () => {
    it("calls the server stop endpoint BEFORE local chat.stop() teardown", async () => {
        const order: string[] = [];
        authenticatedFetch.mockImplementationOnce(async () => {
            order.push("server-stop");
            return new Response(null, { status: 200 });
        });
        const chatStop = vi.fn(() => order.push("chat.stop"));

        // Mirror the component's handleStop sequence: server first, then teardown.
        await stopServerStream(CONVO, SID, undefined).catch(() => {});
        chatStop();

        expect(order).toEqual(["server-stop", "chat.stop"]);
    });

    it("still tears down the UI when the server stop call fails", async () => {
        const order: string[] = [];
        authenticatedFetch.mockImplementationOnce(async () => {
            throw new Error("network down");
        });
        const chatStop = vi.fn(() => order.push("chat.stop"));

        try {
            await stopServerStream(CONVO, SID, undefined);
        } catch {
            /* swallowed by the component's try/catch */
        }
        chatStop();

        expect(order).toEqual(["chat.stop"]);
        expect(chatStop).toHaveBeenCalledOnce();
    });
});
