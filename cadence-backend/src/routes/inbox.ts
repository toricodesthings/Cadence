import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { setRlsContext } from "../lib/rls";
import { inboxItems, inboxSections } from "../db/schema";
import { insertInboxItemSchema, updateInboxItemSchema, insertInboxSectionSchema, updateInboxSectionSchema } from "../types/inbox";
import { uuidParamSchema } from "../types/common";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError } from "../lib/errors";

export const inboxRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", zValidator("json", insertInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const [item] = await db
            .insert(inboxItems)
            .values({
                ...body,
                userId,
            })
            .returning();

        return c.json({ data: item }, 201);
    })
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const items = await db
            .select()
            .from(inboxItems)
            .where(and(eq(inboxItems.userId, userId), eq(inboxItems.processed, false)))
            .orderBy(inboxItems.createdAt);

        return c.json({ data: items });
    })
    .delete("/:id", zValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const [deleted] = await db
            .delete(inboxItems)
            .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
            .returning();

        if (!deleted) {
            throw new AppError(404, "NOT_FOUND", "Inbox item not found");
        }

        return c.json({ data: deleted });
    })
    .patch("/:id", zValidator("param", uuidParamSchema), zValidator("json", updateInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const [updated] = await db
            .update(inboxItems)
            .set(body)
            .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
            .returning();

        if (!updated) {
            throw new AppError(404, "NOT_FOUND", "Inbox item not found");
        }

        return c.json({ data: updated });
    })
    // ── Inbox Sections ──
    .post("/sections", zValidator("json", insertInboxSectionSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const [section] = await db
            .insert(inboxSections)
            .values({ ...body, userId })
            .returning();

        return c.json({ data: section }, 201);
    })
    .get("/sections", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const sections = await db
            .select()
            .from(inboxSections)
            .where(eq(inboxSections.userId, userId))
            .orderBy(inboxSections.orderIndex);

        return c.json({ data: sections });
    })
    .patch("/sections/:id", zValidator("param", uuidParamSchema), zValidator("json", updateInboxSectionSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const [updated] = await db
            .update(inboxSections)
            .set(body)
            .where(and(eq(inboxSections.id, id), eq(inboxSections.userId, userId)))
            .returning();

        if (!updated) {
            throw new AppError(404, "NOT_FOUND", "Inbox section not found");
        }

        return c.json({ data: updated });
    })
    .delete("/sections/:id", zValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);
        await setRlsContext(db, userId);

        const [deleted] = await db
            .delete(inboxSections)
            .where(and(eq(inboxSections.id, id), eq(inboxSections.userId, userId)))
            .returning();

        if (!deleted) {
            throw new AppError(404, "NOT_FOUND", "Inbox section not found");
        }

        return c.json({ data: deleted });
    });
