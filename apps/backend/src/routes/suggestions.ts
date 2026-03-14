import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { suggestions } from "../db/schema";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { apiValidator } from "../lib/validation";

const resolveSuggestionSchema = z.object({
    status: z.enum(["ACCEPTED", "DISMISSED"]),
});

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
    apiValidator("json", resolveSuggestionSchema),
    async (c) => {
        const userId = c.get("userId");
        const id = c.req.param("id");
        const { status } = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, async (tx) =>
            tx
                .update(suggestions)
                .set({ status, resolvedAt: new Date().toISOString() })
                .where(and(eq(suggestions.id, id), eq(suggestions.userId, userId)))
                .returning(),
        );

        if (!updated) {
            return c.json({ error: { code: "NOT_FOUND", message: "Suggestion not found" } }, 404);
        }

        return c.json({ data: updated });
    },
);
