import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { checkIdempotency, recordMutation } from "../lib/idempotency";
import { withRls } from "../lib/rls";
import { inboxItems, inboxSections } from "../db/schema";
import { insertInboxItemSchema, updateInboxItemSchema, insertInboxSectionSchema, updateInboxSectionSchema } from "../types/inbox";
import { uuidParamSchema } from "../types/common";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError, throwIfNotFound } from "../lib/errors";
import { apiValidator } from "../lib/validation";

export const inboxRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { clientMutationId, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const item = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, clientMutationId);
            if (existingId) {
                const [existing] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, existingId), eq(inboxItems.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(inboxItems)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, clientMutationId, row.id);
            return row;
        });

        return c.json({ data: item }, 201);
    })
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(inboxItems)
                .where(and(eq(inboxItems.userId, userId), eq(inboxItems.processed, false)))
                .orderBy(inboxItems.createdAt),
        );

        return c.json({ data: items });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(inboxItems)
                .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
                .returning(),
        );

        throwIfNotFound(deleted, "Inbox item");

        return c.json({ data: deleted });
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, (tx) =>
            tx
                .update(inboxItems)
                .set(body)
                .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
                .returning(),
        );

        throwIfNotFound(updated, "Inbox item");

        return c.json({ data: updated });
    })
    // ── Inbox Sections ──
    .post("/sections", apiValidator("json", insertInboxSectionSchema), async (c) => {
        const userId = c.get("userId");
        const { clientMutationId, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const section = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, clientMutationId);
            if (existingId) {
                const [existing] = await tx.select().from(inboxSections).where(and(eq(inboxSections.id, existingId), eq(inboxSections.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(inboxSections)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, clientMutationId, row.id);
            return row;
        });

        return c.json({ data: section }, 201);
    })
    .get("/sections", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const sections = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(inboxSections)
                .where(eq(inboxSections.userId, userId))
                .orderBy(inboxSections.orderIndex),
        );

        return c.json({ data: sections });
    })
    .patch("/sections/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateInboxSectionSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, (tx) =>
            tx
                .update(inboxSections)
                .set(body)
                .where(and(eq(inboxSections.id, id), eq(inboxSections.userId, userId)))
                .returning(),
        );

        throwIfNotFound(updated, "Inbox section");

        return c.json({ data: updated });
    })
    .delete("/sections/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(inboxSections)
                .where(and(eq(inboxSections.id, id), eq(inboxSections.userId, userId)))
                .returning(),
        );

        throwIfNotFound(deleted, "Inbox section");

        return c.json({ data: deleted });
    });
