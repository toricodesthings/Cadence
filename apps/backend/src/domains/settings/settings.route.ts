import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { inboxItems, notificationState, savedFocusViews, taskNlpMetadata, users } from "../../db/schema";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { throwIfNotFound } from "../../platform/errors";
import { ensureFocusPresets, hideOrDeleteFocusView } from "./focus-presets";
import { normalizeSettings, patchSettings } from "./settings.service";
import {
    deepMerge,
    savedFocusViewInputSchema,
    savedFocusViewPatchSchema,
    settingsPatchSchema,
    type SavedFocusView,
    type SavedFocusViewRow,
    type SettingsView,
} from "@cadence/contracts/settings";
import {
    upsertNotificationStateSchema,
    type NotificationState,
    type NotificationStateRow,
} from "@cadence/contracts/notification";
import { uuidParamSchema } from "@cadence/contracts/common";

const toSavedFocusView = (row: SavedFocusViewRow): SavedFocusView => ({
    ...row,
    definition: row.definition as SavedFocusView["definition"],
});
const toNotificationState = (row: NotificationStateRow): NotificationState => ({
    ...row,
    objectType: row.objectType as NotificationState["objectType"],
});

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/intelligence-history/clear", async (c) => {
        await withCallerRls(c, async (tx, userId) => {
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
            const normalized = normalizeSettings((user?.settings ?? {}) as Record<string, any>);
            const merged = deepMerge<SettingsView>(normalized, {
                tasks: {
                    intelligence: {
                        dismissedEntityIds: [],
                        dismissedEntities: [],
                    },
                },
            });

            await tx.update(users).set({ settings: merged }).where(eq(users.id, userId));
        });

        return c.json({ data: { cleared: true } });
    })
    .post("/focus-views", apiValidator("json", savedFocusViewInputSchema), async (c) => {
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const view = await withCallerRls(c, async (tx, userId) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx
                    .select()
                    .from(savedFocusViews)
                    .where(and(eq(savedFocusViews.id, existingId), eq(savedFocusViews.userId, userId)));
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

        return c.json({ data: toSavedFocusView(view) }, 201);
    })
    .post("/notification-state", apiValidator("json", upsertNotificationStateSchema), async (c) => {
        const body = c.req.valid("json");

        const row = await withCallerRls(c, async (tx, userId) => {
            const {
                firstPresentedAt = null,
                lastPresentedAt = null,
                dismissedAt = null,
                deferredUntil = null,
                actionTaken = null,
                presentationCountIncrement: presentationCount = 0,
            } = body;

            const [updated] = await tx
                .insert(notificationState)
                .values({
                    userId,
                    objectType: body.objectType,
                    objectId: body.objectId,
                    triggerId: body.triggerId,
                    firstPresentedAt,
                    lastPresentedAt,
                    dismissedAt,
                    deferredUntil,
                    actionTaken,
                    presentationCount,
                })
                .onConflictDoUpdate({
                    target: [notificationState.userId, notificationState.objectId, notificationState.triggerId],
                    set: {
                        objectType: body.objectType,
                        firstPresentedAt: sql`coalesce(${notificationState.firstPresentedAt}, ${firstPresentedAt})`,
                        lastPresentedAt: sql`coalesce(${lastPresentedAt}, ${notificationState.lastPresentedAt})`,
                        dismissedAt: body.dismissedAt !== undefined ? body.dismissedAt : notificationState.dismissedAt,
                        deferredUntil:
                            body.deferredUntil !== undefined ? body.deferredUntil : notificationState.deferredUntil,
                        actionTaken: body.actionTaken !== undefined ? body.actionTaken : notificationState.actionTaken,
                        presentationCount: sql`${notificationState.presentationCount} + ${presentationCount}`,
                        updatedAt: sql`NOW()`,
                    },
                })
                .returning();

            return updated;
        });

        return c.json({ data: toNotificationState(row) }, 201);
    })
    .patch("/", apiValidator("json", settingsPatchSchema), async (c) => {
        const body = c.req.valid("json");

        const { after } = await withCallerRls(c, (tx, userId) => patchSettings(tx, userId, body));
        return c.json({ data: after });
    })
    .patch(
        "/focus-views/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", savedFocusViewPatchSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");

            const view = await withCallerRls(c, async (tx, userId) => {
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

                return row;
            });

            throwIfNotFound(view, "Focus view");

            return c.json({ data: toSavedFocusView(view) });
        },
    )
    .get("/", async (c) => {
        const [user] = await withCallerRls(c, async (tx, userId) =>
            tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1),
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
        const normalized = normalizeSettings((user?.settings ?? {}) as Record<string, any>);
        return c.json({ data: normalized });
    })
    .get("/notification-state", async (c) => {
        const items = await withCallerRls(c, (tx, userId) =>
            tx
                .select()
                .from(notificationState)
                .where(eq(notificationState.userId, userId))
                .orderBy(desc(notificationState.updatedAt)),
        );

        return c.json({ data: items.map(toNotificationState) });
    })
    .get("/focus-views", async (c) => {
        const items = await withCallerRls(c, async (tx, userId) => {
            await ensureFocusPresets(tx, userId);
            return tx
                .select()
                .from(savedFocusViews)
                .where(and(eq(savedFocusViews.userId, userId), eq(savedFocusViews.isHidden, false)))
                .orderBy(desc(savedFocusViews.isPinned), savedFocusViews.orderIndex, savedFocusViews.createdAt);
        });

        return c.json({ data: items.map(toSavedFocusView) });
    })
    .delete("/focus-views/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const [deleted] = await withCallerRls(c, (tx, userId) => hideOrDeleteFocusView(tx, userId, id));

        throwIfNotFound(deleted, "Focus view");

        return c.json({ data: toSavedFocusView(deleted) });
    });
