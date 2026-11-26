import { Hono, type Context } from "hono";
import { getDbClient, type DbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { AppError } from "../../platform/errors";
import { isAdminUser } from "../../platform/auth";
import { seed } from "./scenarios";
import {
    aiConversations,
    aiMemories,
    aiMemorySignals,
    aiMessages,
    habitLogs,
    habitTags,
    habits,
    inboxItems,
    inboxSections,
    mutationDedup,
    projects,
    savedFocusViews,
    subtasks,
    tags,
    taskMetrics,
    taskNlpMetadata,
    taskNotes,
    taskSections,
    tasks,
    usageEvents,
    userMetrics,
} from "../../db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../../types/env";
import type { Tx } from "../../types/db";
import type { AuthVariables } from "../../platform/auth";

type RlsClient = DbClient | Tx;

function requireAdmin(c: Context<{ Bindings: Env; Variables: AuthVariables }>) {
    const userId = c.get("userId");
    const userEmail = c.get("userEmail");

    if (!isAdminUser(c.env, { userId, email: userEmail })) {
        throw new AppError(403, "FORBIDDEN", "Admin access required");
    }

    return { userId, userEmail };
}

async function clearUserData(db: RlsClient, userId: string) {
    await db.delete(savedFocusViews).where(eq(savedFocusViews.userId, userId));
    await db.delete(usageEvents).where(eq(usageEvents.userId, userId));
    await db.delete(mutationDedup).where(eq(mutationDedup.userId, userId));
    await db.delete(aiMessages).where(eq(aiMessages.userId, userId));
    await db.delete(aiMemories).where(eq(aiMemories.userId, userId));
    await db.delete(aiMemorySignals).where(eq(aiMemorySignals.userId, userId));
    await db.delete(aiConversations).where(eq(aiConversations.userId, userId));
    await db.delete(userMetrics).where(eq(userMetrics.userId, userId));

    await db.delete(taskNlpMetadata).where(eq(taskNlpMetadata.userId, userId));
    await db.delete(taskNotes).where(eq(taskNotes.userId, userId));
    await db.delete(taskMetrics).where(eq(taskMetrics.userId, userId));
    await db.delete(subtasks).where(eq(subtasks.userId, userId));

    await db.delete(tasks).where(eq(tasks.userId, userId));
    await db.delete(taskSections).where(eq(taskSections.userId, userId));

    await db.delete(habitTags).where(eq(habitTags.userId, userId));
    await db.delete(habitLogs).where(eq(habitLogs.userId, userId));

    await db.delete(habits).where(eq(habits.userId, userId));

    await db.delete(inboxItems).where(eq(inboxItems.userId, userId));
    await db.delete(inboxSections).where(eq(inboxSections.userId, userId));

    await db.delete(tags).where(eq(tags.userId, userId));
    await db.delete(projects).where(eq(projects.userId, userId));
}

export const debugRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/clear", async (c) => {
        const { userId } = requireAdmin(c);
        const db = getDbClient(c.env);

        await withRls(db, userId, async (tx) => {
            await clearUserData(tx, userId);
        });

        return c.json({ data: { message: "Cleared all user data except the user profile." } });
    })
    .post("/seed", async (c) => {
        const { userId } = requireAdmin(c);
        const db = getDbClient(c.env);

        try {
            await withRls(db, userId, async (tx) => {
                await clearUserData(tx, userId);
                await seed(tx, userId);
            });
        } catch (err: unknown) {
            const cause = err instanceof Error && err.cause ? err.cause : null;
            const detail = cause instanceof Error ? cause.message : String(cause ?? "");
            throw new AppError(
                500,
                "SEED_FAILED",
                `Seed failed: ${err instanceof Error ? err.message : String(err)}${detail ? ` — cause: ${detail}` : ""}`,
            );
        }

        return c.json({
            data: {
                message: "Seeded workspace with the Active Power User scenario.",
            },
        });
    })
    .get("/capabilities", async (c) => {
        const { userId, userEmail } = requireAdmin(c);
        return c.json({ data: { canUseDeveloperTools: true, userId, email: userEmail ?? null } });
    });
