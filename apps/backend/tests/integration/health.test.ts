import { describe, expect, it } from "vitest";
import { healthRoutes } from "../../src/domains/health/health.route";

describe("health route contracts", () => {
    it("returns 200 with status ok and ISO timestamp", async () => {
        const response = await healthRoutes.request("http://localhost/");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.status).toBe("ok");
        expect(body.data.timestamp).toBeDefined();
        expect(new Date(body.data.timestamp).toISOString()).toBe(body.data.timestamp);
    });
});
