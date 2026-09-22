import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { healthRoutes } from "../../src/domains/health/health.route";

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
        expect(body.data.status).toBe("ok");
        expect(body.data.timestamp).toBeDefined();
        expect(new Date(body.data.timestamp).toISOString()).toBe(body.data.timestamp);
    });

});
