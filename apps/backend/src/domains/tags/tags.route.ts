import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { tags } from "../../db/schema";
import { insertTagSchema, updateTagSchema } from "@cadence/contracts/tag";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { createTag, deleteTag, updateTag } from "./tags.service";

export const tagRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

    // ── Create ──
    .post("/", apiValidator("json", insertTagSchema), async (c) => {
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const tag = await withCallerRls(c, (tx, userId) => createTag(tx, userId, body, idempotencyKey));

        return c.json({ data: tag }, 201);
    })

    // ── Update ──
    .patch(
        "/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", updateTagSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");

            const updated = await withCallerRls(c, (tx, userId) => updateTag(tx, userId, id, body));

            return c.json({ data: updated });
        },
    )

    // ── Read (List) ──
    .get("/", async (c) => {

        const userTags = await withCallerRls(c, (tx, userId) =>
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
        const { id } = c.req.valid("param");

        const [tag] = await withCallerRls(c, (tx, userId) =>
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
        const { id } = c.req.valid("param");

        const deleted = await withCallerRls(c, (tx, userId) => deleteTag(tx, userId, id));

        return c.json({ data: deleted });
    });
