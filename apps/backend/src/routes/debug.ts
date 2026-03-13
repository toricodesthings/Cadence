import { Hono, type Context } from "hono";
import { getDbClient, type DbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { AppError } from "../lib/errors";
import { isAdminUser } from "../lib/auth";
import {
    createSeedHabit,
    createSeedInboxItem,
    createSeedInboxSection,
    createSeedProject,
    createSeedSection,
    createSeedSubtask,
    createSeedTag,
    createSeedTask,
    seedDate,
    seedDateTime,
} from "../lib/debug-seed";
import {
    aiMemories,
    habitLogs,
    habits,
    inboxItems,
    inboxSections,
    projects,
    subtasks,
    tags,
    taskMetrics,
    taskSections,
    taskTags,
    tasks,
    userMetrics,
    users,
} from "../db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";

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

function getRequiredRow<T extends { id: string }>(rows: Map<string, T>, key: string, label: string) {
    const row = rows.get(key);
    if (!row) {
        throw new Error(`Missing ${label}: ${key}`);
    }
    return row;
}

async function clearUserData(db: RlsClient, userId: string) {
    await db.delete(taskMetrics).where(eq(taskMetrics.userId, userId));
    await db.delete(subtasks).where(eq(subtasks.userId, userId));
    await db.delete(tasks).where(eq(tasks.userId, userId));
    await db.delete(taskSections).where(eq(taskSections.userId, userId));
    await db.delete(tags).where(eq(tags.userId, userId));
    await db.delete(habitLogs).where(eq(habitLogs.userId, userId));
    await db.delete(habits).where(eq(habits.userId, userId));
    await db.delete(inboxItems).where(eq(inboxItems.userId, userId));
    await db.delete(inboxSections).where(eq(inboxSections.userId, userId));
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(aiMemories).where(eq(aiMemories.userId, userId));
    await db.delete(userMetrics).where(eq(userMetrics.userId, userId));
}

debugRoutes.post("/clear", async (c) => {
    const { userId } = requireAdmin(c);
    const db = getDbClient(c.env);

    await withRls(db, userId, async (tx) => {
        await clearUserData(tx, userId);
    });

    return c.json({ success: true, message: "Cleared all user data except the user profile." });
});

debugRoutes.post("/seed", async (c) => {
    const { userId } = requireAdmin(c);
    const db = getDbClient(c.env);

    await withRls(db, userId, async (db) => {
    await clearUserData(db, userId);

    const anchor = new Date();

    const seededProjects = await db.insert(projects).values([
        createSeedProject(userId, { name: "Feature Launch", colorAccent: "glacier", emoji: "🚀" }),
        createSeedProject(userId, { name: "Client Ops", colorAccent: "luminous-amber", emoji: "🧾" }),
        createSeedProject(userId, { name: "Home Reset", colorAccent: "emerald", emoji: "🏡" }),
        createSeedProject(userId, { name: "Spring Semester", colorAccent: "violet", emoji: "📚" }),
    ]).returning();
    const projectByName = new Map(seededProjects.map((project) => [project.name, project] as const));

    const featureLaunchId = getRequiredRow(projectByName, "Feature Launch", "project").id;
    const clientOpsId = getRequiredRow(projectByName, "Client Ops", "project").id;
    const homeResetId = getRequiredRow(projectByName, "Home Reset", "project").id;
    const springSemesterId = getRequiredRow(projectByName, "Spring Semester", "project").id;

    const seededSections = await db.insert(taskSections).values([
        createSeedSection(userId, { name: "Today Focus", orderIndex: 1, projectId: featureLaunchId }),
        createSeedSection(userId, { name: "Waiting On", orderIndex: 2, projectId: featureLaunchId }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 3, projectId: featureLaunchId }),
        createSeedSection(userId, { name: "Today Focus", orderIndex: 1, projectId: homeResetId }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 2, projectId: homeResetId }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 1, projectId: clientOpsId }),
        createSeedSection(userId, { name: "Weekly Anchors", orderIndex: 1, projectId: springSemesterId }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 1, projectId: null }),
    ]).returning();
    const sectionByProjectAndName = (projectId: string | null, name: string) => {
        const section = seededSections.find((s) => s.projectId === projectId && s.name === name);
        if (!section) throw new Error(`Section "${name}" not found for project ${projectId}`);
        return section;
    };

    const seededInboxSections = await db.insert(inboxSections).values([
        createSeedInboxSection(userId, { name: "Capture", orderIndex: 0 }),
        createSeedInboxSection(userId, { name: "Errands", orderIndex: 1 }),
        createSeedInboxSection(userId, { name: "Reference", orderIndex: 2 }),
    ]).returning();
    const inboxSectionByName = new Map(seededInboxSections.map((section) => [section.name, section] as const));

    const seededTags = await db.insert(tags).values([
        createSeedTag(userId, { name: "Deep Work", color: "#60a5fa" }),
        createSeedTag(userId, { name: "Admin", color: "default" }),
        createSeedTag(userId, { name: "Home", color: "#34d399" }),
        createSeedTag(userId, { name: "Follow-up", color: "#f59e0b" }),
    ]).returning();
    const tagByName = new Map(seededTags.map((tag) => [tag.name, tag] as const));

    const seededTasks = await db.insert(tasks).values([
        createSeedTask(userId, {
            projectId: featureLaunchId,
            sectionId: sectionByProjectAndName(featureLaunchId, "Today Focus").id,
            title: "Draft launch announcement",
            content: "## Messaging notes\n- tighten the opening line\n- confirm CTA with sales\n- link the release recap",
            state: "ACTIVE",
            orderIndex: 1,
            isAllDay: false,
            scheduledStart: seedDateTime(anchor, 0, 14, 0),
            scheduledEnd: seedDateTime(anchor, 0, 15, 30),
            durationEstimate: 90,
            priority: 3,
            isPinned: true,
            reminderAt: seedDateTime(anchor, 0, 13, 30),
            reminderSilenced: false,
            effort: 2,
        }),
        createSeedTask(userId, {
            projectId: homeResetId,
            sectionId: sectionByProjectAndName(homeResetId, "Today Focus").id,
            title: "Call landlord about hallway leak",
            state: "ACTIVE",
            orderIndex: 2,
            isAllDay: true,
            dueDate: seedDate(anchor, 0),
            priority: 4,
            isPinned: true,
            reminderAt: seedDateTime(anchor, 0, 16, 0),
            effort: 1,
        }),
        createSeedTask(userId, {
            projectId: clientOpsId,
            title: "Reconcile subscription invoices",
            content: "Finance sweep before the weekly reset.",
            state: "ACTIVE",
            orderIndex: 3,
            isAllDay: true,
            dueDate: seedDate(anchor, -1),
            priority: 2,
            reminderAt: seedDateTime(anchor, -1, 15, 0),
            recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1",
            effort: 1,
        }),
        createSeedTask(userId, {
            projectId: featureLaunchId,
            sectionId: sectionByProjectAndName(featureLaunchId, "Waiting On").id,
            title: "Wait for legal sign-off",
            state: "WAITING",
            orderIndex: 4,
            isAllDay: true,
            dueDate: seedDate(anchor, 1),
            waitingOn: "external counsel",
            waitingReminder: seedDateTime(anchor, 1, 15, 0),
            effort: 1,
        }),
        createSeedTask(userId, {
            projectId: clientOpsId,
            sectionId: sectionByProjectAndName(clientOpsId, "Later This Week").id,
            title: "Prepare weekly reset notes",
            state: "ACTIVE",
            orderIndex: 5,
            isAllDay: true,
            dueDate: seedDate(anchor, 1),
            recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
            priority: 1,
        }),
        createSeedTask(userId, {
            sectionId: sectionByProjectAndName(null, "Later This Week").id,
            title: "Outline Q2 research themes",
            content: "Collect wins, friction points, and three testable hypotheses for the next cycle.",
            state: "ACTIVE",
            orderIndex: 6,
            isAllDay: true,
            durationEstimate: 120,
            effort: 3,
        }),
        createSeedTask(userId, {
            projectId: homeResetId,
            sectionId: sectionByProjectAndName(homeResetId, "Later This Week").id,
            title: "Stage weekend reset window",
            state: "ACTIVE",
            orderIndex: 7,
            isAllDay: true,
            dueDate: seedDate(anchor, 2),
            scheduledEnd: seedDate(anchor, 3),
            priority: 1,
            effort: 2,
        }),
        createSeedTask(userId, {
            projectId: featureLaunchId,
            sectionId: sectionByProjectAndName(featureLaunchId, "Later This Week").id,
            title: "Pack samples for studio shoot",
            state: "ACTIVE",
            orderIndex: 8,
            isAllDay: false,
            scheduledStart: seedDateTime(anchor, 1, 16, 0),
            scheduledEnd: seedDateTime(anchor, 1, 17, 0),
            durationEstimate: 60,
            timezoneLocked: true,
            priority: 1,
            notBefore: seedDateTime(anchor, 1, 13, 0),
            effort: 2,
        }),
        createSeedTask(userId, {
            projectId: featureLaunchId,
            title: "Ship retrospective notes",
            content: "Published after the team recap.",
            state: "COMPLETE",
            orderIndex: 9,
            isAllDay: true,
            dueDate: seedDate(anchor, -1),
            priority: 1,
        }),
        createSeedTask(userId, {
            projectId: homeResetId,
            title: "Archive 2025 receipts",
            state: "ARCHIVED",
            orderIndex: 10,
            isAllDay: true,
            dueDate: seedDate(anchor, -3),
        }),
        createSeedTask(userId, {
            projectId: clientOpsId,
            sectionId: sectionByProjectAndName(clientOpsId, "Later This Week").id,
            title: "Clear inbox to zero",
            state: "ACTIVE",
            orderIndex: 11,
            isAllDay: false,
            scheduledStart: seedDateTime(anchor, 3, 13, 0),
            scheduledEnd: seedDateTime(anchor, 3, 13, 45),
            durationEstimate: 45,
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TH",
            effort: 2,
        }),
        createSeedTask(userId, {
            title: "Book dentist follow-up",
            state: "ACTIVE",
            orderIndex: 12,
            isAllDay: true,
            dueDate: seedDate(anchor, 5),
            reminderAt: seedDateTime(anchor, 4, 18, 0),
            effort: 1,
        }),
        createSeedTask(userId, {
            projectId: springSemesterId,
            sectionId: sectionByProjectAndName(springSemesterId, "Weekly Anchors").id,
            title: "Calculus II lecture",
            content: "Recurring timetable anchor for Tuesday and Thursday mornings during the spring term.",
            state: "ACTIVE",
            orderIndex: 13,
            isAllDay: false,
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            durationEstimate: 75,
            timezoneLocked: true,
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z",
            priority: 2,
            effort: 2,
        }),
    ]).returning();
    const taskByTitle = new Map(seededTasks.map((task) => [task.title, task] as const));

    await db.insert(subtasks).values([
        createSeedSubtask(userId, getRequiredRow(taskByTitle, "Draft launch announcement", "task").id, {
            title: "Pull retention numbers",
            isComplete: true,
            orderIndex: 1,
        }),
        createSeedSubtask(userId, getRequiredRow(taskByTitle, "Draft launch announcement", "task").id, {
            title: "Trim CTA copy",
            isComplete: false,
            orderIndex: 2,
        }),
        createSeedSubtask(userId, getRequiredRow(taskByTitle, "Draft launch announcement", "task").id, {
            title: "Send to brand review",
            isComplete: false,
            orderIndex: 3,
        }),
        createSeedSubtask(userId, getRequiredRow(taskByTitle, "Outline Q2 research themes", "task").id, {
            title: "Review interview notes",
            isComplete: true,
            orderIndex: 1,
        }),
        createSeedSubtask(userId, getRequiredRow(taskByTitle, "Outline Q2 research themes", "task").id, {
            title: "Cluster themes",
            isComplete: false,
            orderIndex: 2,
        }),
        createSeedSubtask(userId, getRequiredRow(taskByTitle, "Outline Q2 research themes", "task").id, {
            title: "Write three hypotheses",
            isComplete: false,
            orderIndex: 3,
        }),
    ]);

    await db.insert(taskMetrics).values([
        {
            userId,
            taskId: getRequiredRow(taskByTitle, "Draft launch announcement", "task").id,
            rescheduleCount: 2,
            delayCount: 1,
            firstScheduled: seedDateTime(anchor, -2, 14, 0),
        },
        {
            userId,
            taskId: getRequiredRow(taskByTitle, "Ship retrospective notes", "task").id,
            rescheduleCount: 1,
            delayCount: 0,
            createdToDone: 2880,
            firstScheduled: seedDateTime(anchor, -3, 13, 0),
            completedAt: seedDateTime(anchor, -1, 17, 0),
        },
    ]);

    await db.insert(taskTags).values([
        {
            taskId: getRequiredRow(taskByTitle, "Draft launch announcement", "task").id,
            tagId: getRequiredRow(tagByName, "Deep Work", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Draft launch announcement", "task").id,
            tagId: getRequiredRow(tagByName, "Admin", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Call landlord about hallway leak", "task").id,
            tagId: getRequiredRow(tagByName, "Home", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Reconcile subscription invoices", "task").id,
            tagId: getRequiredRow(tagByName, "Admin", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Wait for legal sign-off", "task").id,
            tagId: getRequiredRow(tagByName, "Follow-up", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Prepare weekly reset notes", "task").id,
            tagId: getRequiredRow(tagByName, "Admin", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Outline Q2 research themes", "task").id,
            tagId: getRequiredRow(tagByName, "Deep Work", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Stage weekend reset window", "task").id,
            tagId: getRequiredRow(tagByName, "Home", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Pack samples for studio shoot", "task").id,
            tagId: getRequiredRow(tagByName, "Follow-up", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Book dentist follow-up", "task").id,
            tagId: getRequiredRow(tagByName, "Home", "tag").id,
        },
        {
            taskId: getRequiredRow(taskByTitle, "Calculus II lecture", "task").id,
            tagId: getRequiredRow(tagByName, "Deep Work", "tag").id,
        },
    ]);

    const seededHabits = await db.insert(habits).values([
        createSeedHabit(userId, {
            title: "Morning review",
            description: "Open Cadence before messages.",
            recurrenceRule: "FREQ=DAILY",
            targetTime: "07:30",
            reminderEnabled: true,
            totalCompletions: 24,
            totalSkips: 3,
            currentStreak: 4,
            longestStreak: 11,
            colorAccent: "lantern",
            notes: "Best paired with tea and a five-minute calendar sweep.",
        }),
        createSeedHabit(userId, {
            title: "Hydrate before coffee",
            description: "One full glass of water before caffeine.",
            recurrenceRule: "FREQ=DAILY",
            reminderEnabled: false,
            totalCompletions: 17,
            totalSkips: 2,
            currentStreak: 2,
            longestStreak: 6,
            colorAccent: "glacier",
        }),
        createSeedHabit(userId, {
            title: "Strength session",
            description: "A short lift or resistance circuit.",
            recurrenceRule: "FREQ=DAILY",
            targetTime: "18:00",
            reminderEnabled: true,
            totalCompletions: 12,
            totalSkips: 1,
            currentStreak: 1,
            longestStreak: 4,
            colorAccent: "emerald",
        }),
        createSeedHabit(userId, {
            title: "Archive bedside reading",
            description: "Legacy habit kept for archive view testing.",
            recurrenceRule: "FREQ=DAILY",
            targetTime: "21:30",
            reminderEnabled: false,
            totalCompletions: 8,
            totalSkips: 5,
            currentStreak: 0,
            longestStreak: 3,
            colorAccent: "rose",
            archived: true,
            notes: "No longer active, but useful for archived-state QA.",
        }),
    ]).returning();
    const habitByTitle = new Map(seededHabits.map((habit) => [habit.title, habit] as const));

    await db.insert(habitLogs).values([
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Morning review", "habit").id,
            status: "COMPLETED",
            targetDate: seedDateTime(anchor, -3, 7, 30),
            completedAt: seedDateTime(anchor, -3, 7, 42),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Morning review", "habit").id,
            status: "COMPLETED",
            targetDate: seedDateTime(anchor, -2, 7, 30),
            completedAt: seedDateTime(anchor, -2, 7, 40),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Morning review", "habit").id,
            status: "COMPLETED",
            targetDate: seedDateTime(anchor, -1, 7, 30),
            completedAt: seedDateTime(anchor, -1, 7, 38),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Hydrate before coffee", "habit").id,
            status: "SKIPPED",
            targetDate: seedDateTime(anchor, -2, 9, 0),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Hydrate before coffee", "habit").id,
            status: "COMPLETED",
            targetDate: seedDateTime(anchor, -1, 9, 0),
            completedAt: seedDateTime(anchor, -1, 9, 5),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Strength session", "habit").id,
            status: "COMPLETED",
            targetDate: seedDateTime(anchor, -2, 18, 0),
            completedAt: seedDateTime(anchor, -2, 18, 50),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Strength session", "habit").id,
            status: "PENDING",
            targetDate: seedDateTime(anchor, 0, 18, 0),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Archive bedside reading", "habit").id,
            status: "COMPLETED",
            targetDate: seedDateTime(anchor, -4, 21, 30),
            completedAt: seedDateTime(anchor, -4, 21, 55),
        },
    ]);

    await db.insert(inboxItems).values([
        createSeedInboxItem(userId, {
            sectionId: getRequiredRow(inboxSectionByName, "Capture", "inbox section").id,
            orderIndex: 0,
            rawText: "Review customer interview transcript and pull quotable lines",
        }),
        createSeedInboxItem(userId, {
            sectionId: getRequiredRow(inboxSectionByName, "Errands", "inbox section").id,
            orderIndex: 1,
            rawText: "Pick up prescription before 6 PM",
        }),
        createSeedInboxItem(userId, {
            sectionId: getRequiredRow(inboxSectionByName, "Reference", "inbox section").id,
            orderIndex: 2,
            rawText: "Save the campaign teardown deck for next quarter planning",
        }),
        createSeedInboxItem(userId, {
            orderIndex: 3,
            rawText: "Ask Maya whether the onboarding checklist needs legal review",
        }),
    ]);

    await db.insert(aiMemories).values([
        {
            userId,
            content: "The user prefers deep work between 9 AM and noon when the inbox is empty.",
            type: "CORE",
        },
        {
            userId,
            content: "Weekly reset usually happens on Monday afternoon after the inbox is processed.",
            type: "EPHEMERAL",
        },
        {
            userId,
            content: "Home errands feel lighter when grouped into a single evening block.",
            type: "EPHEMERAL",
        },
    ]);

    await db.insert(userMetrics).values({
        userId,
        rescheduleVelocity: 1.6,
        currentBurnoutIndex: 34,
        lastCalculatedAt: seedDateTime(anchor, 0, 6, 0),
    });

    // ── Notification & feature-testing data ──────────────────────────


debugRoutes.get("/capabilities", async (c) => {
    const { userId, userEmail } = requireAdmin(c);
    return c.json({ data: { canUseDeveloperTools: true, userId, email: userEmail ?? null } });
});
    // Tasks that trigger notification center items:
    // 1. A task with a reminder ~30 min ago (should show as "task-reminder" notification)
    // 2. A task due today (should show as "task-due" notification)
    // 3. An overdue task from yesterday without project (routes to /inbox)
    const notifTasks = await db.insert(tasks).values([
        createSeedTask(userId, {
            projectId: getRequiredRow(projectByName, "Feature Launch", "project").id,
            title: "Review analytics dashboard mockups",
            content: "Check the latest Figma frames from design.",
            state: "ACTIVE",
            orderIndex: 20,
            isAllDay: true,
            reminderAt: seedDateTime(anchor, 0, anchor.getUTCHours() - 1, 0),
            reminderSilenced: false,
            priority: 3,
            effort: 2,
        }),
        createSeedTask(userId, {
            projectId: getRequiredRow(projectByName, "Client Ops", "project").id,
            title: "Send revised proposal to Acme Corp",
            state: "ACTIVE",
            orderIndex: 21,
            isAllDay: true,
            dueDate: seedDate(anchor, 0),
            priority: 4,
            effort: 1,
        }),
        createSeedTask(userId, {
            title: "Follow up on venue booking",
            state: "ACTIVE",
            orderIndex: 22,
            isAllDay: true,
            dueDate: seedDate(anchor, -1),
            priority: 2,
            effort: 1,
        }),
    ]).returning();

    // Unmanaged tasks (no date, no project) — exercises holding planner "Unmanaged" count
    await db.insert(tasks).values([
        createSeedTask(userId, {
            title: "Brainstorm podcast episode topics",
            state: "ACTIVE",
            orderIndex: 30,
            isAllDay: true,
            effort: 2,
        }),
        createSeedTask(userId, {
            title: "Research ergonomic keyboard options",
            state: "ACTIVE",
            orderIndex: 31,
            isAllDay: true,
            effort: 1,
        }),
    ]);

    // Tag the notification-test tasks for search diversity
    await db.insert(taskTags).values([
        {
            taskId: notifTasks[0].id,
            tagId: getRequiredRow(tagByName, "Deep Work", "tag").id,
        },
        {
            taskId: notifTasks[1].id,
            tagId: getRequiredRow(tagByName, "Follow-up", "tag").id,
        },
    ]);

    // Update user settings to enable all notification channels
    await db.update(users)
        .set({
            settings: {
                tasks: { defaultDueDate: null, hideTrash: false, hideCompleted: false },
                dateTime: { weekStart: "Sunday", timezone: "local", timeDisplay: "12h" },
                calendar: {
                    holidays: {
                        enabled: true,
                        usePreciseLocation: false,
                        locationMode: "auto",
                        countryCode: null,
                        subdivisionCode: null,
                        promptDismissedAt: null,
                    },
                },
                notifications: {
                    email: true,
                    browser: false,
                    taskReminders: true,
                    habitReminders: true,
                    dueDateAlerts: true,
                },
                shortcuts: {},
            },
        })
        .where(eq(users.id, userId));

    });

    return c.json({ success: true, message: "Seeded full test workspace." });
});
