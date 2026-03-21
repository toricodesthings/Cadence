import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey, checkIdempotency, recordMutation } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { tags } from "../../db/schema";
import { insertTagSchema, updateTagSchema } from "./tags.schema";
import { uuidParamSchema } from "../../platform/common-schemas";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";

export const tagRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

    // ── Create ──
    .post("/", apiValidator("json", insertTagSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const tag = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(tags).where(and(eq(tags.id, existingId), eq(tags.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(tags)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: tag }, 201);
    })

    // ── Update ──
    .patch(
        "/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", updateTagSchema),
        async (c) => {
            const userId = c.get("userId");
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");
            const db = getDbClient(c.env);

            const [updated] = await withRls(db, userId, (tx) =>
                tx
                    .update(tags)
                    .set(body)
                    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
                    .returning(),
            );

            throwIfNotFound(updated, "Tag");

            return c.json({ data: updated });
        },
    )

    // ── Read (List) ──
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const userTags = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(tags)
                .where(eq(tags.userId, userId))
                .orderBy(tags.name),
        );

        return c.json({ data: userTags });
    })

    // ── Read (Single) ──
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [tag] = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(tags)
                .where(and(eq(tags.id, id), eq(tags.userId, userId))),
        );

        throwIfNotFound(tag, "Tag");

        return c.json({ data: tag });
    })

    // ── Delete ──
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(tags)
                .where(and(eq(tags.id, id), eq(tags.userId, userId)))
                .returning(),
        );

        throwIfNotFound(deleted, "Tag");

        return c.json({ data: deleted });
    });
