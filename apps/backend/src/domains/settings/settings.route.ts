import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDbClient } from "../../platform/db";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { inboxItems, notificationState, savedFocusViews, taskNlpMetadata, taskNlpMetadataHistory, users } from "../../db/schema";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { throwIfNotFound } from "../../platform/errors";
import {
    savedFocusViewInputSchema,
    savedFocusViewPatchSchema,
    settingsPatchSchema,
} from "@cadence/contracts/settings";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";

function isObject(item: any): item is Record<string, any> {
    return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach((key) => {
            // Defense in depth: never let merge keys reach the object prototype.
            // Zod already strips unknown keys today, but guard here so a future
            // schema using .passthrough()/z.record() can't enable prototype pollution.
            if (key === "__proto__" || key === "constructor" || key === "prototype") return;
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

/**
 * Normalize stored settings against canonical defaults.
 * - Merges in missing sections/keys from defaults
 * - Migrates legacy `preferredView` into `tasks.defaultView`
 */
export function normalizeSettings(stored: Record<string, any>): Record<string, any> {
    const merged = deepMerge(SETTINGS_DEFAULTS, stored);

    // Migrate legacy preferredView → tasks.defaultView
    if (stored.preferredView && !stored.tasks?.defaultView) {
        merged.tasks = { ...merged.tasks, defaultView: stored.preferredView };
    }

    return merged;
}

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/intelligence-history/clear", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        await withRls(db, userId, async (tx) => {
            await tx.delete(taskNlpMetadataHistory).where(eq(taskNlpMetadataHistory.userId, userId));
            await tx.delete(taskNlpMetadata).where(eq(taskNlpMetadata.userId, userId));
            await tx.delete(notificationState).where(eq(notificationState.userId, userId));

            await tx
                .update(inboxItems)
                .set({
                    analysisStatus: "pending",
                    analysisVersion: null,
                    analysisSummary: null,
                    analysis: null,
                    analysisConfidenceTier: null,
                    analysisNeedsReview: false,
                    analysisReviewReason: null,
                    analysisEntityCount: 0,
                    clarifiedAt: null,
                    appliedAt: null,
                })
                .where(eq(inboxItems.userId, userId));

            const [user] = await tx
                .select({ settings: users.settings })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            const normalized = normalizeSettings((user?.settings ?? {}) as Record<string, any>);
            const merged = deepMerge(normalized, {
                tasks: {
                    intelligence: {
                        dismissedEntityIds: [],
                        dismissedEntities: [],
                    },
                },
            });

            await tx
                .update(users)
                .set({ settings: merged })
                .where(eq(users.id, userId));
        });

        return c.json({ data: { cleared: true } });
    })
    .post("/focus-views", apiValidator("json", savedFocusViewInputSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const view = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(savedFocusViews).where(and(eq(savedFocusViews.id, existingId), eq(savedFocusViews.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(savedFocusViews)
                .values({
                    ...body,
                    source: body.source ?? "manual",
                    userId,
                })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: view }, 201);
    })
    .post(
        "/notification-state",
        apiValidator(
            "json",
            z.object({
                objectType: z.enum(["task", "habit", "event"]),
                objectId: z.string().uuid(),
                triggerId: z.string().min(1).max(200),
                firstPresentedAt: z.string().datetime({ offset: true }).nullable().optional(),
                lastPresentedAt: z.string().datetime({ offset: true }).nullable().optional(),
                dismissedAt: z.string().datetime({ offset: true }).nullable().optional(),
                deferredUntil: z.string().datetime({ offset: true }).nullable().optional(),
                actionTaken: z.string().max(64).nullable().optional(),
                presentationCountIncrement: z.number().int().min(0).max(100).optional(),
            }),
        ),
        async (c) => {
            const userId = c.get("userId");
            const body = c.req.valid("json");
            const db = getDbClient(c.env);

            const row = await withRls(db, userId, async (tx) => {
                const presentationCount = body.presentationCountIncrement ?? 0;

                const [updated] = await tx
                    .insert(notificationState)
                    .values({
                        userId,
                        objectType: body.objectType,
                        objectId: body.objectId,
                        triggerId: body.triggerId,
                        firstPresentedAt: body.firstPresentedAt ?? null,
                        lastPresentedAt: body.lastPresentedAt ?? null,
                        dismissedAt: body.dismissedAt ?? null,
                        deferredUntil: body.deferredUntil ?? null,
                        actionTaken: body.actionTaken ?? null,
                        presentationCount,
                    })
                    .onConflictDoUpdate({
                        target: [notificationState.userId, notificationState.objectId, notificationState.triggerId],
                        set: {
                            objectType: body.objectType,
                            firstPresentedAt: sql`coalesce(${notificationState.firstPresentedAt}, ${body.firstPresentedAt ?? null})`,
                            lastPresentedAt: sql`coalesce(${body.lastPresentedAt ?? null}, ${notificationState.lastPresentedAt})`,
                            dismissedAt: body.dismissedAt !== undefined ? body.dismissedAt : notificationState.dismissedAt,
                            deferredUntil: body.deferredUntil !== undefined ? body.deferredUntil : notificationState.deferredUntil,
                            actionTaken: body.actionTaken !== undefined ? body.actionTaken : notificationState.actionTaken,
                            presentationCount: sql`${notificationState.presentationCount} + ${presentationCount}`,
                            updatedAt: sql`NOW()`,
                        },
                    })
                    .returning();

                return updated;
            });

            return c.json({ data: row }, 201);
        },
    )
    .patch("/", apiValidator("json", settingsPatchSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, async (tx) => {
            const [user] = await tx
                .select({ settings: users.settings })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            // Normalize stored settings first, then merge in patch
            const normalized = normalizeSettings((user?.settings || {}) as Record<string, any>);
            const merged = deepMerge(normalized, body);

            return tx
                .update(users)
                .set({
                    settings: merged,
                })
                .where(eq(users.id, userId))
                .returning({ settings: users.settings });
        });

        const normalizedResult = normalizeSettings((updated?.settings ?? {}) as Record<string, any>);
        return c.json({ data: normalizedResult });
    })
    .patch("/focus-views/:id", apiValidator("param", z.object({ id: z.string().uuid() })), apiValidator("json", savedFocusViewPatchSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const view = await withRls(db, userId, async (tx) => {
            const [existing] = await tx
                .select({ id: savedFocusViews.id })
                .from(savedFocusViews)
                .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)));
            if (!existing) return existing;

            const [row] = await tx
                .update(savedFocusViews)
                .set({ ...body, updatedAt: sql`NOW()` })
                .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)))
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);

            return row;
        });

        throwIfNotFound(view, "Focus view");

        return c.json({ data: view });
    })
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const [user] = await withRls(db, userId, async (tx) =>
            tx
                .select({ settings: users.settings })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1)
        );

        const normalized = normalizeSettings((user?.settings ?? {}) as Record<string, any>);
        return c.json({ data: normalized });
    })
    .get("/notification-state", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(notificationState)
                .where(eq(notificationState.userId, userId))
                .orderBy(desc(notificationState.updatedAt)),
        );

        return c.json({ data: items });
    })
    .get("/focus-views", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(savedFocusViews)
                .where(eq(savedFocusViews.userId, userId))
                .orderBy(desc(savedFocusViews.isPinned), savedFocusViews.orderIndex, savedFocusViews.createdAt),
        );

        return c.json({ data: items });
    })
    .delete("/focus-views/:id", apiValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(savedFocusViews)
                .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)))
                .returning(),
        );

        throwIfNotFound(deleted, "Focus view");

        return c.json({ data: deleted });
    });
