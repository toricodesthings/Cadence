import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger } from "hono/logger";
import type { Env } from "./types/env";
import { authMiddleware } from "./lib/auth";
import { formatErrorResponse } from "./lib/errors";
import { taskRoutes } from "./routes/tasks";
import { projectRoutes } from "./routes/projects";
import { inboxRoutes } from "./routes/inbox";
import { healthRoutes } from "./routes/health";
import { debugRoutes } from "./routes/debug";
import { tagRoutes } from "./routes/tags";
import { habitsRoutes } from "./routes/habits";
import { subtasksRoutes } from "./routes/subtasks";
import { sectionRoutes } from "./routes/sections";
import { settingsRoutes } from "./routes/settings";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// ── Global Middleware ──
app.use("*", secureHeaders());
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "https://cadence.app";
      if (origin.startsWith("http://localhost:") || origin === "https://cadence.app" || origin.endsWith(".cadence.app")) {
        return origin;
      }
      return "https://cadence.app";
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  }),
);

// ── Global Error Handler ──
app.onError((err, c) => {
  const res = formatErrorResponse(err);
  return c.json(res.body, res.status as any);
});

// ── Public ──
app.route("/health", healthRoutes);

// ── Protected ──
app.use("/api/*", async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") || "unknown";
  if (c.env.RATE_LIMITER) {
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return c.json(
        {
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Rate limit exceeded",
          },
        },
        429,
      );
    }
  }
  await next();
});
app.use("/api/*", authMiddleware);
app.route("/api/tasks", taskRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/inbox", inboxRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/habits", habitsRoutes);
app.route("/api", subtasksRoutes);
app.route("/api/sections", sectionRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/debug", debugRoutes);

// ── Type export for Hono RPC ──
export type AppType = typeof app;

import { handleOverdueCheck } from "./cron/overdue-check";

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleOverdueCheck(env));
  },
};
