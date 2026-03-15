import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { suggestions } from "../db/schema";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError, throwIfNotFound } from "../lib/errors";
import { apiValidator } from "../lib/validation";
import { uuidParamSchema } from "../types/common";
import { resolveSuggestionSchema } from "../types/suggestion";

export const suggestionRoutes = new Hono<{
    Bindings: Env;
    Variables: AuthVariables;
}>();

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
                .set({ status, resolvedAt: new Date().toISOString() })
                .where(and(eq(suggestions.id, id), eq(suggestions.userId, userId)))
                .returning(),
        );

        throwIfNotFound(updated, "Suggestion");

        return c.json({ data: updated });
    },
);
