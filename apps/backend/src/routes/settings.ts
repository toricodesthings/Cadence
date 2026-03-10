import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { users } from "../db/schema";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { apiValidator } from "../lib/validation";
import { settingsPatchSchema } from "../types/settings";

function isObject(item: any): item is Record<string, any> {
    return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach((key) => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        await withRls(db, userId, async (tx) => {
            await tx.insert(users).values({ id: userId }).onConflictDoNothing();
        });

        const [user] = await withRls(db, userId, async (tx) =>
            tx
                .select({ settings: users.settings })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1)
        );

        return c.json({ data: (user?.settings ?? {}) as Record<string, unknown> });
    })
    .patch("/", apiValidator("json", settingsPatchSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        await withRls(db, userId, async (tx) => {
            await tx.insert(users).values({ id: userId }).onConflictDoNothing();
        });

        const [updated] = await withRls(db, userId, async (tx) => {
            const [user] = await tx
                .select({ settings: users.settings })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            const merged = deepMerge(user?.settings || {}, body);

            return tx
                .update(users)
                .set({
                    settings: merged,
                })
                .where(eq(users.id, userId))
                .returning({ settings: users.settings });
        });

        return c.json({ data: (updated?.settings ?? {}) as Record<string, unknown> });
    });
