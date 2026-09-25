import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UIMessage } from "ai";

// The real RPC client over a fake fetch, so we can inspect the exact request the
// stop helper issues (endpoint / method / body) without hitting the network.
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }));
vi.mock("../../../../app/lib/api/client", async () => {
    const { hc } = await import("hono/client");
    const { api } = hc<import("@cadence/backend").AppType>("http://api.test", {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetchMock(String(input), init),
    });
    return { apiClient: { api: api.v1 } };
});

import { stopServerStream } from "../../../../app/lib/ai/stop-stream";

const CONVO = "conv-123";
const SID = "stream-abc";

function lastArgs() {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, body: JSON.parse(String(init.body)) };
}

describe("stopServerStream", () => {
    beforeEach(() => fetchMock.mockClear());

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
