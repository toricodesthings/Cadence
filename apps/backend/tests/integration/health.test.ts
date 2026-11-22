import { describe, expect, it } from "vitest";
import { healthRoutes } from "../../src/domains/health/health.route";
import type { Env } from "../../src/types/env";

describe("health route contracts", () => {
    it("returns 200 with status ok, ISO timestamp, and null minDesktopVersion when unset", async () => {
        const response = await healthRoutes.request("http://localhost/");

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            data: { status: string; timestamp: string; minDesktopVersion: string | null };
        };
        expect(body.data.status).toBe("ok");
        expect(new Date(body.data.timestamp).toISOString()).toBe(body.data.timestamp);
        expect(body.data.minDesktopVersion).toBeNull();
    });

    it("returns trimmed minDesktopVersion when configured in env", async () => {
        const response = await healthRoutes.request("http://localhost/", {}, {
            MIN_DESKTOP_VERSION: " 2.1.0 ",
        } as Env);

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { minDesktopVersion: string | null } };
        expect(body.data.minDesktopVersion).toBe("2.1.0");
    });
});
