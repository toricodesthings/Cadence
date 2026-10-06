import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { approveMcpConnectSchema, mcpScopeSchema, type McpConnection } from "@cadence/contracts/connections";
import { mcpConnections } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { isZone } from "@cadence/domain/time";
import { syncUserZone } from "../../platform/user-zone";
import type { AuthVariables } from "../../platform/auth";
import type { Env } from "../../types/env";
import { approveConnectRequest, declineConnectUrl, liveConnectionIds, readConnectRequest, revokeConnection } from "./oauth";

// ── Utility ─────────────────────────────────────────────────────────────────

/** KV lists lag new writes by up to a minute, so a just-made connection shows before its grant does. */
const FRESH_MS = 10 * 60_000;

/** The opaque `state` the MCP origin put in the consent link. */
const requestParam = z.object({ request: z.string().min(16).max(512) });
const idParam = z.object({ id: z.uuid() });

/**
 * Connected assistants, for the signed-in person (app JWT). The OAuth side of the
 * flow lives on the MCP origin (`oauth.ts`); these routes are its consent page's API
 * and the Settings list.
 */
export const connectionRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // ── Create ──
    // POST /connections/requests/:request/approve — returns where the browser goes next
    .post("/requests/:request/approve", apiValidator("param", requestParam), apiValidator("json", approveMcpConnectSchema), async (c) => {
        const { request } = c.req.valid("param");
        const { scopes, timezone } = c.req.valid("json");
        if (!isZone(timezone)) throw new AppError(400, "VALIDATION_ERROR", "Unknown time zone");
        const userId = c.get("userId");
        // The browser's zone keeps users.time_zone current; MCP reads that, never the connection's copy.
        await withRls(getDbClient(c.env), userId, (tx) => syncUserZone(tx, userId, timezone));
        const redirectTo = await approveConnectRequest(c.env, userId, request, [...new Set(scopes)]);
        return c.json({ data: { redirectTo } }, 201);
    })
    // POST /connections/requests/:request/decline
    .post("/requests/:request/decline", apiValidator("param", requestParam), async (c) => {
        const { request } = c.req.valid("param");
        return c.json({ data: { redirectTo: declineConnectUrl(c.env, request) } }, 200);
    })

    // ── Read ──
    // GET /connections/requests/:request — what the consent page shows
    .get("/requests/:request", apiValidator("param", requestParam), async (c) => {
        const view = await readConnectRequest(c.env, c.req.valid("param").request);
        throwIfNotFound(view, "Connection request");
        c.header("Cache-Control", "no-store");
        return c.json({ data: view }, 200);
    })
    // GET /connections — active connected assistants, newest first
    .get("/", async (c) => {
        const userId = c.get("userId");
        const [rows, live] = await Promise.all([
            withRls(getDbClient(c.env), userId, (tx) =>
                tx
                    .select()
                    .from(mcpConnections)
                    .where(and(eq(mcpConnections.userId, userId), isNull(mcpConnections.revokedAt)))
                    .orderBy(desc(mcpConnections.createdAt)),
            ),
            liveConnectionIds(c.env, userId),
        ]);
        const working = rows.filter((row) => !live || live.has(row.id) || Date.now() - Date.parse(row.createdAt) < FRESH_MS);
        const data: McpConnection[] = working.map((row) => ({
            id: row.id,
            clientName: row.clientName,
            createdAt: row.createdAt,
            lastUsedAt: row.lastUsedAt,
            scopes: row.scopes.filter((s) => mcpScopeSchema.safeParse(s).success) as McpConnection["scopes"],
            redirectHost: new URL(row.redirectUri).hostname,
        }));
        c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
        return c.json({ data }, 200);
    })

    // ── Delete ──
    // DELETE /connections/:id — Disconnect
    .delete("/:id", apiValidator("param", idParam), async (c) => {
        const revoked = await revokeConnection(c.env, c.get("userId"), c.req.valid("param").id);
        throwIfNotFound(revoked || null, "Connection");
        return c.json({ data: { disconnected: true } }, 200);
    });
