/**
 * Scenario: Active Power User
 *
 * A fully-loaded Cadence workspace representing an engaged user with:
 * - 4 projects across work/personal/academic domains
 * - 8 task sections + 3 inbox sections
 * - 4 tags spanning work styles
 * - 17+ tasks covering every schedule kind (timed, deadline, duration, unmanaged, timetable)
 * - Subtasks, task metrics, task–tag associations
 * - 4 habits (active + archived) with log history
 * - Habit–tag associations
 * - 4 inbox items across capture/errands/reference
 * - AI memories (core + ephemeral)
 * - User metrics with burnout index
 * - Task notes on selected tasks
 * - NLP metadata on quick-added tasks
 * - Saved focus views (preset + composed)
 * - Notification-exercising tasks (reminder, due-today, overdue)
 * - Unmanaged tasks for backlog testing
 * - Full user settings with all notification channels enabled
 */

import type { DbClient } from "../../../platform/db";
import {
    createSeedProject,
    createSeedSection,
    createSeedInboxSection,
    createSeedTag,
    createSeedTask,
    createSeedSubtask,
    createSeedHabit,
    createSeedInboxItem,
    createSeedTaskNote,
    createSeedNlpMetadata,
    createSeedSavedFocusView,
    seedDate,
    seedDateTime,
} from "../debug-seed";
import {
    aiMemories,
    habitLogs,
    habitTags,
    habits,
    inboxItems,
    inboxSections,
    projects,
    savedFocusViews,
    subtasks,
    tags,
    taskMetrics,
    taskNlpMetadata,
    taskNotes,
    taskSections,
    taskTags,
    tasks,
    userMetrics,
    users,
} from "../../../db/schema";
import { eq } from "drizzle-orm";

export const SCENARIO_VERSION = "2.2.0";

type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

function getRequiredRow<T>(map: Map<string, T>, key: string, label: string): T {
    const row = map.get(key);
    if (!row) throw new Error(`Seed error: ${label} "${key}" not found`);
    return row;
}

function seedMonthDay(anchor: Date, dayOffset: number): string {
    const date = new Date(anchor);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);

    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${month}-${day}`;
}

function seedStartedOn(anchor: Date, dayOffset: number, yearsAgo: number): string {
    const date = new Date(anchor);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    date.setFullYear(date.getFullYear() - yearsAgo);

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export async function seed(db: Tx, userId: string) {
    const anchor = new Date();

    // ── Projects ─────────────────────────────────────────────────────
    const seededProjects = await db.insert(projects).values([
        createSeedProject(userId, { name: "Feature Launch" }),
        createSeedProject(userId, { name: "Client Ops", colorAccent: "glacier" }),
        createSeedProject(userId, { name: "Home Reset", colorAccent: "emerald" }),
        createSeedProject(userId, { name: "Spring Semester", colorAccent: "rose" }),
    ]).returning();

    const projectByName = new Map(seededProjects.map((p) => [p.name, p] as const));
    const featureLaunchId = getRequiredRow(projectByName, "Feature Launch", "project").id;
    const clientOpsId = getRequiredRow(projectByName, "Client Ops", "project").id;
    const homeResetId = getRequiredRow(projectByName, "Home Reset", "project").id;
    const springSemesterId = getRequiredRow(projectByName, "Spring Semester", "project").id;

    // ── Task sections ────────────────────────────────────────────────
    const seededSections = await db.insert(taskSections).values([
        createSeedSection(userId, { name: "Today", orderIndex: 0, projectId: null }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 1, projectId: null }),
        createSeedSection(userId, { name: "Today", orderIndex: 0, projectId: featureLaunchId }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 1, projectId: featureLaunchId }),
        createSeedSection(userId, { name: "Today", orderIndex: 0, projectId: clientOpsId }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 1, projectId: clientOpsId }),
        createSeedSection(userId, { name: "Later This Week", orderIndex: 0, projectId: homeResetId }),
        createSeedSection(userId, { name: "Weekly Anchors", orderIndex: 0, projectId: springSemesterId }),
    ]).returning();

    const sectionByProjectAndName = (projectId: string | null, name: string) => {
        const match = seededSections.find((s) => s.projectId === projectId && s.name === name);
        if (!match) throw new Error(`Seed error: section "${name}" for project ${projectId} not found`);
        return match;
    };

    // ── Inbox sections ───────────────────────────────────────────────
    const seededInboxSections = await db.insert(inboxSections).values([
        createSeedInboxSection(userId, { name: "Capture", orderIndex: 0 }),
        createSeedInboxSection(userId, { name: "Errands", orderIndex: 1 }),
        createSeedInboxSection(userId, { name: "Reference", orderIndex: 2 }),
    ]).returning();

    const inboxSectionByName = new Map(seededInboxSections.map((s) => [s.name, s] as const));

    // ── Tags ─────────────────────────────────────────────────────────
    const seededTags = await db.insert(tags).values([
        createSeedTag(userId, { name: "Deep Work", color: "#f2cc60" }),
        createSeedTag(userId, { name: "Admin", color: "#79c0ff" }),
        createSeedTag(userId, { name: "Home", color: "#7ee787" }),
        createSeedTag(userId, { name: "Follow-up", color: "#f472b6" }),
    ]).returning();

    const tagByName = new Map(seededTags.map((t) => [t.name, t] as const));

    // ── Tasks ────────────────────────────────────────────────────────
    const seededTasks = await db.insert(tasks).values([
        // 0 — Timed block today (Feature Launch)
        createSeedTask(userId, {
            projectId: featureLaunchId,
            sectionId: sectionByProjectAndName(featureLaunchId, "Today").id,
            title: "Draft launch announcement",
            content: "Include retention numbers and revised CTA.",
            state: "ACTIVE",
            orderIndex: 1,
            isAllDay: false,
            scheduledStart: seedDateTime(anchor, 0, 14, 0),
            scheduledEnd: seedDateTime(anchor, 0, 15, 30),
            durationEstimate: 90,
            priority: 3,
            isPinned: true,
            reminderAt: seedDateTime(anchor, 0, 13, 30),
            effort: 2,
        }),
        // 1 — All-day deadline today (no project)
        createSeedTask(userId, {
            sectionId: sectionByProjectAndName(null, "Today").id,
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
        // 2 — Timed block today (Client Ops)
        createSeedTask(userId, {
            projectId: clientOpsId,
            sectionId: sectionByProjectAndName(clientOpsId, "Today").id,
            title: "Reconcile subscription invoices",
            state: "ACTIVE",
            orderIndex: 3,
            isAllDay: false,
            scheduledStart: seedDateTime(anchor, 0, 10, 0),
            scheduledEnd: seedDateTime(anchor, 0, 10, 30),
            durationEstimate: 30,
            priority: 2,
            effort: 1,
        }),
        // 3 — Waiting task (Client Ops)
        createSeedTask(userId, {
            projectId: clientOpsId,
            sectionId: sectionByProjectAndName(clientOpsId, "Today").id,
            title: "Wait for legal sign-off",
            state: "WAITING",
            orderIndex: 4,
            isAllDay: true,
            waitingOn: "external counsel",
            waitingReminder: seedDateTime(anchor, 1, 15, 0),
            effort: 1,
        }),
        // 4 — Recurring weekly (Client Ops)
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
        // 5 — Duration task (no project)
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
        // 6 — All-day duration with date range (Home Reset)
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
        // 7 — Timezone-locked timed block (Feature Launch)
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
        // 8 — Completed task (Feature Launch)
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
        // 9 — Archived task (Home Reset)
        createSeedTask(userId, {
            projectId: homeResetId,
            title: "Archive 2025 receipts",
            state: "ARCHIVED",
            orderIndex: 10,
            isAllDay: true,
            dueDate: seedDate(anchor, -3),
        }),
        // 10 — Recurring weekly timed (Client Ops)
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
        // 11 — Future deadline with reminder (no project)
        createSeedTask(userId, {
            title: "Book dentist follow-up",
            state: "ACTIVE",
            orderIndex: 12,
            isAllDay: true,
            dueDate: seedDate(anchor, 5),
            reminderAt: seedDateTime(anchor, 4, 18, 0),
            effort: 1,
        }),
        // 12 — Timetable anchor (Spring Semester)
        createSeedTask(userId, {
            projectId: springSemesterId,
            sectionId: sectionByProjectAndName(springSemesterId, "Weekly Anchors").id,
            title: "Calculus II lecture",
            content: "Recurring timetable anchor for Tuesday and Thursday mornings during the spring term.",
            state: "ACTIVE",
            orderIndex: 13,
            isAllDay: false,
            interactionMode: "timetable",
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

    // ── Subtasks ─────────────────────────────────────────────────────
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

    // ── Task metrics ─────────────────────────────────────────────────
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

    // ── Task–tag associations ────────────────────────────────────────
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

    // ── Habits ───────────────────────────────────────────────────────
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

    // ── Habit logs ───────────────────────────────────────────────────
    await db.insert(habitLogs).values([
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Morning review", "habit").id,
            status: "COMPLETED",
            targetDate: seedDate(anchor, -3),
            completedAt: seedDateTime(anchor, -3, 7, 42),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Morning review", "habit").id,
            status: "COMPLETED",
            targetDate: seedDate(anchor, -2),
            completedAt: seedDateTime(anchor, -2, 7, 40),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Morning review", "habit").id,
            status: "COMPLETED",
            targetDate: seedDate(anchor, -1),
            completedAt: seedDateTime(anchor, -1, 7, 38),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Hydrate before coffee", "habit").id,
            status: "SKIPPED",
            targetDate: seedDate(anchor, -2),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Hydrate before coffee", "habit").id,
            status: "COMPLETED",
            targetDate: seedDate(anchor, -1),
            completedAt: seedDateTime(anchor, -1, 9, 5),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Strength session", "habit").id,
            status: "COMPLETED",
            targetDate: seedDate(anchor, -2),
            completedAt: seedDateTime(anchor, -2, 18, 50),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Strength session", "habit").id,
            status: "PENDING",
            targetDate: seedDate(anchor, 0),
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Archive bedside reading", "habit").id,
            status: "COMPLETED",
            targetDate: seedDate(anchor, -4),
            completedAt: seedDateTime(anchor, -4, 21, 55),
        },
    ]);

    // ── Habit–tag associations ───────────────────────────────────────
    await db.insert(habitTags).values([
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Morning review", "habit").id,
            tagId: getRequiredRow(tagByName, "Admin", "tag").id,
        },
        {
            userId,
            habitId: getRequiredRow(habitByTitle, "Strength session", "habit").id,
            tagId: getRequiredRow(tagByName, "Home", "tag").id,
        },
    ]);

    // ── Inbox items ──────────────────────────────────────────────────
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

    // ── AI memories ──────────────────────────────────────────────────
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

    // ── User metrics ─────────────────────────────────────────────────
    await db.insert(userMetrics).values({
        userId,
        rescheduleVelocity: 1.6,
        currentBurnoutIndex: 34,
        lastCalculatedAt: seedDateTime(anchor, 0, 6, 0),
    });

    // ── Task notes ───────────────────────────────────────────────────
    await db.insert(taskNotes).values([
        createSeedTaskNote(
            userId,
            getRequiredRow(taskByTitle, "Draft launch announcement", "task").id,
            { body: "## Key Points\n\n- Retention up 14% QoQ\n- New onboarding funnel live\n- CTA needs A/B variant copy\n\nCheck with design before finalising the hero." },
        ),
        createSeedTaskNote(
            userId,
            getRequiredRow(taskByTitle, "Outline Q2 research themes", "task").id,
            { body: "# Research Themes\n\n## Wins\n- Reduced churn by 8%\n- NPS score improved\n\n## Friction\n- Onboarding drop-off at step 3\n- Mobile sessions shorter than expected\n\n## Hypotheses\n1. Guided tour reduces drop-off\n2. Push notifications improve retention\n3. Simplified dashboard increases engagement" },
        ),
    ]);

    // ── NLP metadata ─────────────────────────────────────────────────
    await db.insert(taskNlpMetadata).values([
        createSeedNlpMetadata(
            userId,
            getRequiredRow(taskByTitle, "Call landlord about hallway leak", "task").id,
            {
                sourceSurface: "quick_add",
                rawInput: "call landlord about hallway leak today p4",
                cleanedTitle: "Call landlord about hallway leak",
                confidenceTier: "high",
                parseResult: {
                    dueDate: "today",
                    priority: 4,
                    tokens: ["call", "landlord", "about", "hallway", "leak"],
                },
            },
        ),
        createSeedNlpMetadata(
            userId,
            getRequiredRow(taskByTitle, "Book dentist follow-up", "task").id,
            {
                sourceSurface: "inline_add",
                rawInput: "book dentist follow-up next friday",
                cleanedTitle: "Book dentist follow-up",
                confidenceTier: "medium",
                parseResult: {
                    dueDate: "next friday",
                    tokens: ["book", "dentist", "follow-up"],
                },
            },
        ),
    ]);

    // ── Saved focus views ────────────────────────────────────────────
    await db.insert(savedFocusViews).values([
        createSeedSavedFocusView(userId, {
            name: "Deep Work Only",
            definition: { tagIds: [getRequiredRow(tagByName, "Deep Work", "tag").id], states: ["ACTIVE"] },
            isPinned: true,
            source: "composed",
            orderIndex: 0,
        }),
        createSeedSavedFocusView(userId, {
            name: "This Week",
            definition: { dateRange: "this_week", states: ["ACTIVE"] },
            isPinned: true,
            source: "preset",
            orderIndex: 1,
        }),
        createSeedSavedFocusView(userId, {
            name: "Overdue Review",
            definition: { overdue: true, states: ["ACTIVE"] },
            isPinned: false,
            source: "composed",
            orderIndex: 2,
        }),
    ]);

    // ── Notification & feature-testing tasks ─────────────────────────
    const notifTasks = await db.insert(tasks).values([
        createSeedTask(userId, {
            projectId: featureLaunchId,
            title: "Review analytics dashboard mockups",
            content: "Check the latest Figma frames from design.",
            state: "ACTIVE",
            orderIndex: 20,
            isAllDay: true,
            reminderAt: seedDateTime(anchor, 0, Math.max(anchor.getUTCHours() - 1, 0), 0),
            reminderSilenced: false,
            priority: 3,
            effort: 2,
        }),
        createSeedTask(userId, {
            projectId: clientOpsId,
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

    // ── Unmanaged tasks (no date, no project) ────────────────────────
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

    // ── Tag the notification-test tasks ──────────────────────────────
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

    // ── User settings (all notification channels enabled) ────────────
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
                    personalEvents: {
                        enabled: true,
                        items: [
                            {
                                id: "coffeeversary",
                                label: "First coffee date",
                                monthDay: seedMonthDay(anchor, 0),
                                emoji: "☕",
                                notify: true,
                                startedOn: seedStartedOn(anchor, 0, 2),
                            },
                            {
                                id: "mom-birthday",
                                label: "Mom's Birthday",
                                monthDay: seedMonthDay(anchor, 4),
                                emoji: "🎂",
                                notify: true,
                                startedOn: null,
                            },
                            {
                                id: "cadence-launch",
                                label: "Cadence launch day",
                                monthDay: seedMonthDay(anchor, 11),
                                emoji: "🚀",
                                notify: false,
                                startedOn: seedStartedOn(anchor, 11, 1),
                            },
                            {
                                id: "move-in-day",
                                label: "Move-in anniversary",
                                monthDay: seedMonthDay(anchor, 26),
                                emoji: "🏡",
                                notify: true,
                                startedOn: seedStartedOn(anchor, 26, 4),
                            },
                            {
                                id: "wedding-day",
                                label: "Wedding anniversary",
                                monthDay: seedMonthDay(anchor, 63),
                                emoji: "💍",
                                notify: true,
                                startedOn: seedStartedOn(anchor, 63, 7),
                            },
                        ],
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
}
