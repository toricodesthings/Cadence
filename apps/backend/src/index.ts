import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./types/env";
import { getDeploymentStage, getAllowedOrigins } from "./types/env";
import { authMiddleware } from "./platform/auth";
import { formatErrorResponse } from "./platform/errors";
import { createRequestContext, getRequestId, logErrorResponse, setRequestErrorCode } from "./platform/request-log";
import { taskRoutes } from "./domains/tasks/tasks.route";
import { projectRoutes } from "./domains/projects/projects.route";
import { inboxRoutes } from "./domains/inbox/inbox.route";
import { healthRoutes } from "./domains/health/health.route";
import { debugRoutes } from "./domains/debug/debug.route";
import { tagRoutes } from "./domains/tags/tags.route";
import { habitRoutes } from "./domains/habits/habits.route";
import { subtaskRoutes } from "./domains/subtasks/subtasks.route";
import { sectionRoutes } from "./domains/sections/sections.route";
import { settingsRoutes } from "./domains/settings/settings.route";
import { eventRoutes } from "./domains/events/events.route";
import { suggestionRoutes } from "./domains/suggestions/suggestions.route";
import { proxyRoutes } from "./domains/proxy/proxy.route";
import { noteRoutes } from "./domains/notes/notes.route";

const PRODUCTION_ORIGIN = "https://dashboard.cadenceapp.cloud";

export const app = new Hono<{ Bindings: Env; Variables: import("./platform/auth").AuthVariables }>();

/**
 * Determine whether a given origin is allowed for CORS.
 * Production: only the production origin + explicit ALLOWED_ORIGINS.
 * Staging: same as production + explicit ALLOWED_ORIGINS.
 * Development: additionally allows any http://localhost:* origin.
 */
function isAllowedOrigin(origin: string, env: Env): boolean {
  if (origin === PRODUCTION_ORIGIN) return true;

  const extraOrigins = getAllowedOrigins(env);
  if (extraOrigins.includes(origin)) return true;

  const stage = getDeploymentStage(env);
  if (stage === "development" && origin.startsWith("http://localhost:")) {
    return true;
  }

  return false;
}

/**
 * Debug routes are ONLY available when ALL of the following are true:
 * 1. DEPLOYMENT_STAGE is NOT "production"
 * 2. ENABLE_DEBUG_ROUTES is explicitly "true"
 */
function areDebugRoutesEnabled(env: Env): boolean {
  const stage = getDeploymentStage(env);
  if (stage === "production") return false;
  return env.ENABLE_DEBUG_ROUTES?.trim().toLowerCase() === "true";
}

// ── Global Middleware ──
app.use("*", createRequestContext());
app.use("*", secureHeaders());

// ── Request Body Size Limit (100KB) ──
app.use("/api/v1/*", async (c, next) => {
  const contentLength = c.req.header("content-length");
  if (contentLength && parseInt(contentLength, 10) > 102400) {
    return c.json(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large", status: 413 } },
      413,
    );
  }
  await next();
});
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) return PRODUCTION_ORIGIN;
      if (isAllowedOrigin(origin, (c as any).env)) {
        return origin;
      }
      return PRODUCTION_ORIGIN;
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
app.use("/api/v1/debug", async (c, next) => {
  if (!areDebugRoutesEnabled(c.env)) {
    return c.notFound();
  }
  await next();
});

app.use("/api/v1/debug/*", async (c, next) => {
  if (!areDebugRoutesEnabled(c.env)) {
    return c.notFound();
  }
  await next();
});

// Tier 1: IP-based global limiter (pre-auth, catches abuse early)
app.use("/api/v1/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const ip = c.req.header("cf-connecting-ip") || "unknown";
  if (c.env.RATE_LIMITER) {
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) return rateLimitResponse(c);
  }
  await next();
});

app.use("/api/v1/*", authMiddleware);

// Tier 2: User-scoped read/write limiters (post-auth)
app.use("/api/v1/*", async (c, next) => {
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
app.use("/api/v1/debug/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const userId = c.get("userId");
  if (c.env.RATE_LIMITER_ADMIN) {
    const { success } = await c.env.RATE_LIMITER_ADMIN.limit({ key: userId });
    if (!success) return rateLimitResponse(c);
  }
  await next();
});
app.route("/api/v1/tasks", taskRoutes);
app.route("/api/v1/projects", projectRoutes);
app.route("/api/v1/inbox", inboxRoutes);
app.route("/api/v1/tags", tagRoutes);
app.route("/api/v1/habits", habitRoutes);
app.route("/api/v1", subtaskRoutes);
app.route("/api/v1", noteRoutes);
app.route("/api/v1/sections", sectionRoutes);
app.route("/api/v1/settings", settingsRoutes);
app.route("/api/v1/events", eventRoutes);
app.route("/api/v1/suggestions", suggestionRoutes);
app.route("/api/v1/proxy", proxyRoutes);
app.route("/api/v1/debug", debugRoutes);

// ── Type export for Hono RPC ──
export type AppType = typeof app;

import { handleOverdueCheck, pruneStaleMutations } from "./cron/overdue-check";

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleOverdueCheck(env));
    ctx.waitUntil(pruneStaleMutations(env));
  },
};
