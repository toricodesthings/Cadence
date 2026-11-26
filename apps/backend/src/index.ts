import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "./types/env";
import { appOrigin, getDeploymentStage, getAllowedOrigins } from "./types/env";
import { authMiddleware } from "./platform/auth";
import { createErrorBody, formatErrorResponse } from "./platform/errors";
import { createRequestContext, getRequestId, logErrorResponse, setRequestErrorCode } from "./platform/request-log";
import { taskRoutes } from "./domains/tasks/tasks.route";
import { projectRoutes } from "./domains/projects/projects.route";
import { sharingRoutes } from "./domains/sharing/sharing.route";
import { inboxRoutes } from "./domains/inbox/inbox.route";
import { searchRoutes } from "./domains/decisions/search.route";
import { decisionRoutes } from "./domains/decisions/reset.route";
import { healthRoutes } from "./domains/health/health.route";
import { debugRoutes } from "./domains/debug/debug.route";
import { tagRoutes } from "./domains/tags/tags.route";
import { personalEventRoutes } from "./domains/personal-events/personal-events.route";
import { personalEventSharingRoutes } from "./domains/personal-events/personal-event-sharing.route";
import { habitRoutes } from "./domains/habits/habits.route";
import { routineSharingRoutes } from "./domains/habits/routine-sharing.route";
import { subtaskRoutes } from "./domains/subtasks/subtasks.route";
import { sectionRoutes } from "./domains/sections/sections.route";
import { settingsRoutes } from "./domains/settings/settings.route";
import { backgroundRoutes } from "./domains/settings/background.route";
import { pushRoutes } from "./domains/push/push.route";
import { eventRoutes } from "./domains/events/events.route";
import { proxyRoutes } from "./domains/proxy/proxy.route";
import { noteRoutes } from "./domains/notes/notes.route";
import { aiRoutes } from "./domains/ai/ai.route";
import { aiImageRoutes } from "./domains/ai/images/images.route";
import { memoryRoutes } from "./domains/ai/memory/memory.route";
import { connectionRoutes } from "./domains/mcp/connections.route";
import { accountRoutes } from "./domains/account/account.route";
import { meRoutes } from "./domains/account/me.route";
import { isMcpRequest, mcpOrigin, mcpProvider } from "./domains/mcp/oauth";
import { LIVE_PATH, ORIGIN_HEADER, connectLive, replanAfterWrites } from "./domains/push/reminder-clock";
import { PRESENCE_PATH_RE, connectPresence } from "./domains/sharing/list-presence";
import { NOTE_COLLAB_PATH_RE, connectNoteCollab } from "./domains/notes/note-collab";

const PRODUCTION_ORIGIN = "https://dashboard.cadenceapp.cloud";

export const app = new Hono<{ Bindings: Env; Variables: import("./platform/auth").AuthVariables }>();

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

function areDebugRoutesEnabled(env: Env): boolean {
    const stage = getDeploymentStage(env);
    if (stage === "production") return false;
    return env.ENABLE_DEBUG_ROUTES?.trim().toLowerCase() === "true";
}

app.use("*", createRequestContext());
app.use("*", secureHeaders());

const UPLOAD_PATHS = new Set(["/api/v1/settings/background", "/api/v1/ai/images"]);
const limitBody = bodyLimit({
    maxSize: 100 * 1024,
    onError: (c) =>
        c.json(createErrorBody({ code: "PAYLOAD_TOO_LARGE", message: "Request body too large", status: 413 }), 413),
});
app.use("/api/v1/*", (c, next) =>
    c.req.method === "POST" && UPLOAD_PATHS.has(c.req.path.replace(/\/$/, "")) ? next() : limitBody(c, next),
);
app.use(
    "*",
    cors({
        origin: (origin, c) => {
            if (!origin) return PRODUCTION_ORIGIN;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
            if (isAllowedOrigin(origin, (c as any).env)) {
                return origin;
            }
            return PRODUCTION_ORIGIN;
        },
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Queued-At", ORIGIN_HEADER],
        credentials: true,
        exposeHeaders: ["Retry-After", "Server-Timing"],
        maxAge: 7200,
    }),
);

app.onError(async (err, c) => {
    const res = formatErrorResponse(err, getRequestId(c));
    setRequestErrorCode(c, res.errorCode);
    await logErrorResponse(c, err, res.status, res.errorCode);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    return c.json(res.body, res.status as any);
});

app.route("/health", healthRoutes);

function rateLimitResponse(c: import("hono").Context) {
    setRequestErrorCode(c, "TOO_MANY_REQUESTS");
    return c.json(
        createErrorBody({
            code: "TOO_MANY_REQUESTS",
            message: "Rate limit exceeded. Please slow down.",
            status: 429,
            isRetryable: true,
            requestId: getRequestId(c),
        }),
        { status: 429, headers: { "Retry-After": "60" } },
    );
}

app.use("/api/v1/debug/*", async (c, next) => {
    if (!areDebugRoutesEnabled(c.env)) {
        return c.notFound();
    }
    await next();
});

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

app.use("/api/v1/*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const limiter = c.req.method === "GET" ? c.env.RATE_LIMITER_READ : c.env.RATE_LIMITER_WRITE;
    if (limiter && !(await limiter.limit({ key: c.get("userId") })).success) return rateLimitResponse(c);
    await next();
});

app.use("/api/v1/*", replanAfterWrites);

app.use("/api/v1/debug/*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const userId = c.get("userId");
    if (c.env.RATE_LIMITER_ADMIN) {
        const { success } = await c.env.RATE_LIMITER_ADMIN.limit({ key: userId });
        if (!success) return rateLimitResponse(c);
    }
    await next();
});
const apiApp = app
    .route("/api/v1/tasks", taskRoutes)
    .route("/api/v1/projects", projectRoutes)
    .route("/api/v1/lists", sharingRoutes)
    .route("/api/v1/inbox", inboxRoutes)
    .route("/api/v1/search", searchRoutes)
    .route("/api/v1/tags", tagRoutes)
    .route("/api/v1/personal-events", personalEventRoutes)
    .route("/api/v1/personal-events", personalEventSharingRoutes)
    .route("/api/v1/habits", habitRoutes)
    .route("/api/v1/habits", routineSharingRoutes)
    .route("/api/v1", subtaskRoutes)
    .route("/api/v1", noteRoutes)
    .route("/api/v1/sections", sectionRoutes)
    .route("/api/v1/settings/background", backgroundRoutes)
    .route("/api/v1/settings", settingsRoutes)
    .route("/api/v1/events", eventRoutes)
    .route("/api/v1/push", pushRoutes)
    .route("/api/v1/proxy", proxyRoutes)
    .route("/api/v1/debug", debugRoutes)
    .route("/api/v1/ai/images", aiImageRoutes)
    .route("/api/v1/ai/memory", memoryRoutes)
    .route("/api/v1/ai/decisions", decisionRoutes)
    .route("/api/v1/ai", aiRoutes)
    .route("/api/v1/connections", connectionRoutes)
    .route("/api/v1/account", accountRoutes)
    .route("/api/v1/me", meRoutes);

export type AppType = typeof apiApp;
export type { ToolIO } from "./domains/ai/tools/index";

import { runHourlyCron } from "./cron/overdue-check";
import { handleMemoryBatch } from "./domains/ai/memory/memory-job";

export { ReminderClock } from "./domains/push/reminder-clock";
export { CodeModeHost } from "./domains/mcp/code-mode";
export { ListPresence } from "./domains/sharing/list-presence";
export { NoteCollab } from "./domains/notes/note-collab";
export { CodemodeRuntime } from "@cloudflare/codemode";

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        if (url.pathname === "/favicon.ico" && url.origin === mcpOrigin(env))
            return Response.redirect(`${appOrigin(env)}/favicon.ico`, 301);
        if (!isMcpRequest(request, env)) {
            if (url.pathname === LIVE_PATH) return connectLive(request, env);
            const presenceMatch = PRESENCE_PATH_RE.exec(url.pathname);
            if (presenceMatch) return connectPresence(request, env, presenceMatch[1]!);
            const collabMatch = NOTE_COLLAB_PATH_RE.exec(url.pathname);
            if (collabMatch) return connectNoteCollab(request, env, collabMatch[1]!);
            return app.fetch(request, env, ctx);
        }
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const doorLimiter =
            url.pathname === "/oauth/register" || url.pathname === "/authorize" ? env.RATE_LIMITER_ADMIN : undefined;
        const limits = [env.RATE_LIMITER?.limit({ key: ip }), doorLimiter?.limit({ key: `${url.pathname}:${ip}` })];
        if ((await Promise.all(limits)).some((result) => result && !result.success)) {
            return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
        }
        if (!env.OAUTH_KV) return new Response("Connecting assistants isn't available right now.", { status: 503 });
        return mcpProvider(env).fetch(request, env, ctx);
    },
    async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(runHourlyCron(env));
    },
    async queue(batch: MessageBatch<unknown>, env: Env) {
        await handleMemoryBatch(batch, env);
    },
};
