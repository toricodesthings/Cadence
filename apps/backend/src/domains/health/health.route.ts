import { Hono } from "hono";

export const healthRoutes = new Hono().get("/", (c) => {
    return c.json({
        data: { status: "ok", timestamp: new Date().toISOString() },
    });
});
