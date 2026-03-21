import { Hono, type Context } from "hono";
import { getDbClient, type DbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { AppError } from "../../platform/errors";
import { isAdminUser } from "../../platform/auth";
import { scenarios, DEFAULT_SCENARIO } from "./scenarios";
import {
    aiMemories,
    habitLogs,
    habitTags,
    habits,
    inboxItems,
    inboxSections,
    mutationDedup,
    projects,
    savedFocusViews,
    subtasks,
    suggestions,
    tags,
    taskMetrics,
    taskNlpMetadata,
    taskNlpMetadataHistory,
    taskNotes,
    taskSections,
    tasks,
    usageEvents,
    userMetrics,
} from "../../db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";

export const debugRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type RlsClient = DbClient | TransactionClient;

function requireAdmin(c: Context<{ Bindings: Env; Variables: AuthVariables }>) {
    const userId = c.get("userId");
    const userEmail = c.get("userEmail");

    if (!isAdminUser(c.env, { userId, email: userEmail })) {
        throw new AppError(403, "FORBIDDEN", "Admin access required");
    }

    return { userId, userEmail };
}

// ── Schema-complete user data wipe ───────────────────────────────────
// Deletion order: children → parents. Every user-owned table is listed
// explicitly so that schema drift is immediately visible.
// Tables without a userId column (taskTags) cascade via FK and are
// not listed here — they are cleaned when the parent row is deleted.

async function clearUserData(db: RlsClient, userId: string) {
    // Standalone leaf tables
    await db.delete(savedFocusViews).where(eq(savedFocusViews.userId, userId));
    await db.delete(suggestions).where(eq(suggestions.userId, userId));
    await db.delete(usageEvents).where(eq(usageEvents.userId, userId));
    await db.delete(mutationDedup).where(eq(mutationDedup.userId, userId));
    await db.delete(aiMemories).where(eq(aiMemories.userId, userId));
    await db.delete(userMetrics).where(eq(userMetrics.userId, userId));

    // Task children (before tasks)
    await db.delete(taskNlpMetadataHistory).where(eq(taskNlpMetadataHistory.userId, userId));
    await db.delete(taskNlpMetadata).where(eq(taskNlpMetadata.userId, userId));
    await db.delete(taskNotes).where(eq(taskNotes.userId, userId));
    await db.delete(taskMetrics).where(eq(taskMetrics.userId, userId));
    await db.delete(subtasks).where(eq(subtasks.userId, userId));

    // Tasks
    await db.delete(tasks).where(eq(tasks.userId, userId));
    await db.delete(taskSections).where(eq(taskSections.userId, userId));

    // Habit children (before habits)
    await db.delete(habitTags).where(eq(habitTags.userId, userId));
    await db.delete(habitLogs).where(eq(habitLogs.userId, userId));

    // Habits
    await db.delete(habits).where(eq(habits.userId, userId));

    // Inbox
    await db.delete(inboxItems).where(eq(inboxItems.userId, userId));
    await db.delete(inboxSections).where(eq(inboxSections.userId, userId));

    // Shared parents
    await db.delete(tags).where(eq(tags.userId, userId));
    await db.delete(projects).where(eq(projects.userId, userId));
}

// ── Routes ───────────────────────────────────────────────────────────

debugRoutes.post("/clear", async (c) => {
    const { userId } = requireAdmin(c);
    const db = getDbClient(c.env);

    await withRls(db, userId, async (tx) => {
        await clearUserData(tx, userId);
    });

    return c.json({ data: { message: "Cleared all user data except the user profile." } });
});

debugRoutes.post("/seed", async (c) => {
    const { userId } = requireAdmin(c);
    const db = getDbClient(c.env);
    const scenarioKey = (c.req.query("scenario") ?? DEFAULT_SCENARIO).toLowerCase();

    const scenario = scenarios[scenarioKey];
    if (!scenario) {
        const available = Object.keys(scenarios).join(", ");
        throw new AppError(400, "INVALID_SCENARIO", `Unknown scenario "${scenarioKey}". Available: ${available}`);
    }

    try {
        await withRls(db, userId, async (tx) => {
            await clearUserData(tx, userId);
            await scenario.seed(tx, userId);
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
            message: `Seeded workspace with "${scenario.name}" scenario.`,
            scenario: scenarioKey,
            version: scenario.version,
        },
    });
});

debugRoutes.get("/capabilities", async (c) => {
    const { userId, userEmail } = requireAdmin(c);
    return c.json({ data: { canUseDeveloperTools: true, userId, email: userEmail ?? null } });
});
