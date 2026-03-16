import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./types/env";
import { authMiddleware } from "./lib/auth";
import { formatErrorResponse } from "./lib/errors";
import { taskRoutes } from "./routes/tasks";
import { projectRoutes } from "./routes/projects";
import { inboxRoutes } from "./routes/inbox";
import { healthRoutes } from "./routes/health";
import { debugRoutes } from "./routes/debug";
import { tagRoutes } from "./routes/tags";
import { habitRoutes } from "./routes/habits";
import { subtaskRoutes } from "./routes/subtasks";
import { sectionRoutes } from "./routes/sections";
import { settingsRoutes } from "./routes/settings";
import { eventRoutes } from "./routes/events";
import { suggestionRoutes } from "./routes/suggestions";
import { proxyRoutes } from "./routes/proxy";
import { createRequestContext, getRequestId, logErrorResponse, setRequestErrorCode } from "./lib/request-log";

const CORS_ORIGIN = "https://dashboard.cadenceapp.cloud";

export const app = new Hono<{ Bindings: Env; Variables: import("./lib/auth").AuthVariables }>();

function areDebugRoutesEnabled(value?: string | null) {
  return value?.trim().toLowerCase() === "true";
}

// ── Global Middleware ──
app.use("*", createRequestContext());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return CORS_ORIGIN;
      if (
        origin.startsWith("http://localhost:") ||
        origin === CORS_ORIGIN
      ) {
        return origin;
      }
      return CORS_ORIGIN;
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  }),
);

// ── Global Error Handler ──
app.onError(async (err, c) => {
  const res = formatErrorResponse(err, getRequestId(c));
  setRequestErrorCode(c, res.errorCode);
  await logErrorResponse(c, err, res.status, res.errorCode);
  return c.json(res.body, res.status as any);
});

// ── Public ──
app.route("/health", healthRoutes);

// ── Rate-limit helper ──
function rateLimitResponse(c: import("hono").Context) {
  setRequestErrorCode(c, "TOO_MANY_REQUESTS");
  return c.json(
    {
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Please slow down.",
        status: 429,
        isRetryable: true,
        requestId: getRequestId(c),
      },
    },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

// ── Protected ──

// Keep admin debug tooling dark in production unless explicitly enabled.
app.use("/api/debug", async (c, next) => {
  if (!areDebugRoutesEnabled(c.env.ENABLE_DEBUG_ROUTES)) {
    return c.notFound();
  }
  await next();
});

app.use("/api/debug/*", async (c, next) => {
  if (!areDebugRoutesEnabled(c.env.ENABLE_DEBUG_ROUTES)) {
    return c.notFound();
  }
  await next();
});

// Tier 1: IP-based global limiter (pre-auth, catches abuse early)
app.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const ip = c.req.header("cf-connecting-ip") || "unknown";
  if (c.env.RATE_LIMITER) {
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) return rateLimitResponse(c);
  }
  await next();
});

app.use("/api/*", authMiddleware);

// Tier 2: User-scoped read/write limiters (post-auth)
app.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const userId = c.get("userId");
  const method = c.req.method;

  if (method === "GET") {
    if (c.env.RATE_LIMITER_READ) {
      const { success } = await c.env.RATE_LIMITER_READ.limit({ key: userId });
      if (!success) return rateLimitResponse(c);
    }
  } else {
    if (c.env.RATE_LIMITER_WRITE) {
      const { success } = await c.env.RATE_LIMITER_WRITE.limit({ key: userId });
      if (!success) return rateLimitResponse(c);
    }
  }
  await next();
});

// Tier 3: Admin route limiter (tighter ceiling on debug endpoints)
app.use("/api/debug/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const userId = c.get("userId");
  if (c.env.RATE_LIMITER_ADMIN) {
    const { success } = await c.env.RATE_LIMITER_ADMIN.limit({ key: userId });
    if (!success) return rateLimitResponse(c);
  }
  await next();
});
app.route("/api/tasks", taskRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/inbox", inboxRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/habits", habitRoutes);
app.route("/api", subtaskRoutes);
app.route("/api/sections", sectionRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/suggestions", suggestionRoutes);
app.route("/api/proxy", proxyRoutes);
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
