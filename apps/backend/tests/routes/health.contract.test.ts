import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { healthRoutes } from "../../src/routes/health";

function createHealthApp() {
    const app = new Hono();
    app.route("/health", healthRoutes);
    return app;
}

describe("health route contracts", () => {
    it("returns 200 with status ok and ISO timestamp", async () => {
        const app = createHealthApp();
        const response = await app.request("http://localhost/health");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.status).toBe("ok");
        expect(body.timestamp).toBeDefined();
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it("returns proper JSON content-type header", async () => {
        const app = createHealthApp();
        const response = await app.request("http://localhost/health");

        expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("rejects non-GET methods", async () => {
        const app = createHealthApp();

        const postResponse = await app.request("http://localhost/health", { method: "POST" });
        expect(postResponse.status).toBe(404);

        const deleteResponse = await app.request("http://localhost/health", { method: "DELETE" });
        expect(deleteResponse.status).toBe(404);
    });
});
