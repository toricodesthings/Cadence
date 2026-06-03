import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { suggestions } from "../../db/schema";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { uuidParamSchema } from "../../platform/common-schemas";
import { resolveSuggestionSchema } from "./suggestions.schema";

export const suggestionRoutes = new Hono<{
    Bindings: Env;
    Variables: AuthVariables;
}>();

// PATCH /api/suggestions/:id — accept or dismiss
suggestionRoutes.patch(
    "/:id",
    apiValidator("param", uuidParamSchema),
    apiValidator("json", resolveSuggestionSchema),
    async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { status } = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, async (tx) =>
            tx
                .update(suggestions)
                .set({ status, resolvedAt: sql`NOW()` })
                .where(and(eq(suggestions.id, id), eq(suggestions.userId, userId)))
                .returning(),
        );

        throwIfNotFound(updated, "Suggestion");

        return c.json({ data: updated });
    },
);

// GET /api/suggestions — list pending suggestions
suggestionRoutes.get("/", async (c) => {
    const userId = c.get("userId");
    const db = getDbClient(c.env);

    const rows = await withRls(db, userId, async (tx) =>
        tx
            .select()
            .from(suggestions)
            .where(and(eq(suggestions.userId, userId), eq(suggestions.status, "PENDING"))),
    );

    return c.json({ data: rows });
});
