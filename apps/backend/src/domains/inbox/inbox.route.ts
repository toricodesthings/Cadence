import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { withRls } from "../../platform/rls";
import { inboxItems, inboxSections, tasks } from "../../db/schema";
import { inboxQuerySchema, insertInboxItemSchema, updateInboxItemSchema, insertInboxSectionSchema, updateInboxSectionSchema, processInboxItemSchema } from "@cadence/contracts/inbox";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { processCapture } from "./inbox.service";

export const inboxRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // ── Atomic Inbox→Task Processing (Section 11.2C) ──
    .post("/:id/process", apiValidator("param", uuidParamSchema), apiValidator("json", processInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const result = await withRls(db, userId, (tx) => processCapture(tx, userId, id, body, { idempotencyKey }));

        return c.json({ data: result.task }, result.alreadyProcessed ? 200 : 201);
    })
    .post("/:id/unprocess", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);
        const item = await withRls(db, userId, async (tx) => {
            const [capture] = await tx.select().from(inboxItems)
                .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).for("update");
            throwIfNotFound(capture, "Inbox item");
            if (capture.placedTaskId) {
                await tx.update(tasks).set({ state: "ARCHIVED", updatedAt: new Date().toISOString() })
                    .where(and(eq(tasks.id, capture.placedTaskId), eq(tasks.userId, userId)));
            }
            const [restored] = await tx.update(inboxItems)
                .set({ processed: false, captureStatus: "clarifying", placedTaskId: null })
                .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).returning();
            return restored;
        });
        return c.json({ data: item });
    })
    .post("/", apiValidator("json", insertInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const item = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, existingId), eq(inboxItems.userId, userId)));
                if (existing) return existing;
            }

            await assertOwnership(tx, userId, { inboxSectionId: body.sectionId });
            const [row] = await tx
                .insert(inboxItems)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: item }, 201);
    })
    // ── Inbox Sections ──
    .post("/sections", apiValidator("json", insertInboxSectionSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const section = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(inboxSections).where(and(eq(inboxSections.id, existingId), eq(inboxSections.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(inboxSections)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: section }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, async (tx) => {
            await assertOwnership(tx, userId, { inboxSectionId: body.sectionId });
            return tx
                .update(inboxItems)
                .set(body)
                .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
                .returning();
        });

        throwIfNotFound(updated, "Inbox item");

        return c.json({ data: updated });
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
    .get("/", apiValidator("query", inboxQuerySchema), async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(inboxItems)
                .where(and(eq(inboxItems.userId, userId), eq(inboxItems.captureStatus, c.req.valid("query").status)))
                .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id)),
        );

        return c.json({ data: items });
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
