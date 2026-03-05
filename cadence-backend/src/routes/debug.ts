import { Hono } from "hono";
import { getDbClient } from "../lib/db";
import { tasks, projects, inboxItems, aiMemories, userMetrics } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";

export const debugRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

debugRoutes.post("/clear", async (c) => {
    const userId = c.get("userId");
    const db = getDbClient(c.env);

    await db.delete(tasks).where(eq(tasks.userId, userId));
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(inboxItems).where(eq(inboxItems.userId, userId));
    await db.delete(aiMemories).where(eq(aiMemories.userId, userId));
    await db.delete(userMetrics).where(eq(userMetrics.userId, userId));

    return c.json({ success: true, message: "Cleared all test data." });
});

debugRoutes.post("/seed", async (c) => {
    const userId = c.get("userId");
    const db = getDbClient(c.env);

    // Wipe old explicitly
    await db.delete(tasks).where(eq(tasks.userId, userId));
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(inboxItems).where(eq(inboxItems.userId, userId));
    await db.delete(aiMemories).where(eq(aiMemories.userId, userId));

    const [project1] = await db.insert(projects).values({
        userId,
        name: "Feature Launch",
        colorAccent: "ocean-breeze",
    }).returning();

    const [project2] = await db.insert(projects).values({
        userId,
        name: "Personal Errands",
        colorAccent: "luminous-amber",
    }).returning();

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await db.insert(tasks).values([
        {
            userId,
            projectId: project1.id,
            title: "Draft launch announcement",
            state: "ACTIVE",
            orderIndex: 1,
            isAllDay: false,
            scheduledStart: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0).toISOString(),
            scheduledEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).toISOString(),
        },
        {
            userId,
            projectId: project1.id,
            title: "Finalize marketing assets",
            state: "ACTIVE",
            orderIndex: 2,
            isAllDay: true,
        },
        {
            userId,
            projectId: project2.id,
            title: "Buy groceries",
            state: "ACTIVE",
            orderIndex: 3,
            isAllDay: true,
        },
        {
            userId,
            projectId: null,
            title: "Clean the garage",
            state: "ACTIVE",
            orderIndex: 4,
            isAllDay: true,
        },
        {
            userId,
            projectId: project1.id,
            title: "Refactor core module",
            state: "COMPLETE",
            orderIndex: 5,
            isAllDay: true,
        }
    ]);

    await db.insert(inboxItems).values([
        { userId, rawText: "Call mechanic about the brakes", processed: false },
        { userId, rawText: "Review the new AI safety paper", processed: false },
        { userId, rawText: "Pay electricity bill", processed: false },
    ]);

    return c.json({ success: true, message: "Seeded test data." });
});
