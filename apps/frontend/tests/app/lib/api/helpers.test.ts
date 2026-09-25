import { describe, expect, it } from "vitest";
import { parseApiError, unwrapResponse } from "../../../../app/lib/api/helpers";
import { ApiErrorResponse } from "../../../../app/types/api";

describe("api/helpers", () => {
    it("parses structured API errors into typed errors", async () => {
        const response = Response.json(
            { error: { code: "TOKEN_EXPIRED", message: "Session expired", isRetryable: false } },
            { status: 401 },
        );

        const error = await parseApiError(response);

        expect(error).toBeInstanceOf(ApiErrorResponse);
        expect(error.code).toBe("TOKEN_EXPIRED");
        expect(error.status).toBe(401);
        expect(error.isAuthError).toBe(true);
        expect(error.isRetryable).toBe(false);
    });

    it("falls back to a generic parse failure message for non-json responses", async () => {
        const response = new Response("gateway unavailable", { status: 503 });

        const error = await parseApiError(response);

        expect(error.code).toBe("UNPARSEABLE_ERROR");
        expect(error.status).toBe(503);
        expect(error.isRetryable).toBe(true);
        expect(error.message).toContain("503");
    });

    it("unwraps successful response envelopes", async () => {
        const response = Response.json({ data: { id: "task-1", title: "Write tests" } });

        await expect(unwrapResponse(response)).resolves.toEqual({
            id: "task-1",
            title: "Write tests",
        });
    });

    it("throws typed errors for failed responses", async () => {
        const response = Response.json({ error: { code: "UNAUTHORIZED", message: "Missing token" } }, { status: 401 });

        await expect(unwrapResponse(response)).rejects.toMatchObject({
            name: "ApiErrorResponse",
            code: "UNAUTHORIZED",
            status: 401,
        });
    });
});
