import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { tags } from "../db/schema";
import { insertTagSchema, updateTagSchema } from "../types/tag";
import { uuidParamSchema } from "../types/common";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError } from "../lib/errors";
import { apiValidator } from "../lib/validation";

export const tagRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

    // ── Create ──
    .post("/", apiValidator("json", insertTagSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [tag] = await withRls(db, userId, (tx) =>
            tx
                .insert(tags)
                .values({ ...body, userId })
                .returning(),
        );

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

            if (!updated) {
                throw new AppError(404, "NOT_FOUND", "Tag not found");
            }

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

        if (!tag) {
            throw new AppError(404, "NOT_FOUND", "Tag not found");
        }

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

        if (!deleted) {
            throw new AppError(404, "NOT_FOUND", "Tag not found");
        }

        return c.json({ data: deleted });
    });
