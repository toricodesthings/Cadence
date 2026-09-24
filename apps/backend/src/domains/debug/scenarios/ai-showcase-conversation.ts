/**
 * AI showcase conversation — one thread that fires every assistant tool once, so
 * every chip and proposal card can be eyeballed without talking to a model.
 *
 * Write-card states on display:
 * - approved (`output-available`): set_task_state, create_tasks, log_habit (in Auto),
 *   structure_inbox_item, create_project
 * - declined (`output-denied`): create_tag; not answered: reschedule_tasks
 * - waiting (`approval-requested`, last reply only): every other write tool
 *
 * Read outputs go through the real `projections.ts` helpers and approved writes
 * through the real services, so both match what the live tools do. Seeded
 * approvals carry no signature: approving one fails closed where
 * TOOL_APPROVAL_SECRET is set.
 */

import { eq } from "drizzle-orm";
import type { Tx } from "../../../types/db";
import {
    aiConversations,
    aiMessages,
    type habits,
    inboxItems,
    type projects,
    type subtasks,
    type tags,
    tasks,
    userMetrics,
} from "../../../db/schema";
import { seedDate, seedDateTime } from "../debug-seed";
import { createTasks, setTaskState } from "../../tasks/tasks.service";
import { resolveHabit } from "../../habits/habits.service";
import { processCapture } from "../../inbox/inbox.service";
import { createProject } from "../../projects/projects.service";
import { routinesDue } from "../../ai/tools/calendar";
import {
    toMinimalHabit,
    toMinimalInboxItem,
    toMinimalProject,
    toMinimalTag,
    toMinimalTask,
} from "../../ai/tools/projections";

type TaskRow = typeof tasks.$inferSelect;

interface ShowcaseRefs {
    anchor: Date;
    tasks: TaskRow[];
    habits: (typeof habits.$inferSelect)[];
    inboxItems: (typeof inboxItems.$inferSelect)[];
    projects: (typeof projects.$inferSelect)[];
    sections: { id: string; name: string; projectId: string | null }[];
    tags: (typeof tags.$inferSelect)[];
    subtasks: (typeof subtasks.$inferSelect)[];
}

// Seeded tool outputs render timed values in UTC; the live tools use the user's zone.
const TZ = "UTC";

function find<T>(rows: T[], match: (row: T) => boolean, label: string): T {
    const row = rows.find(match);
    if (!row) throw new Error(`Seed error: ${label} not found`);
    return row;
}

let callSeq = 0;
const read = (name: string, input: unknown, output: unknown) => ({
    type: `tool-${name}`,
    toolCallId: `call_seed_${++callSeq}`,
    state: "output-available",
    input,
    output,
});
const waiting = (name: string, input: unknown) => ({
    type: `tool-${name}`,
    toolCallId: `call_seed_${++callSeq}`,
    state: "approval-requested",
    input,
    approval: { id: `approval_seed_${callSeq}` },
});
const approved = (name: string, input: unknown, output: unknown, isAutomatic = false) => ({
    ...read(name, input, output),
    approval: { id: `approval_seed_${callSeq}`, approved: true, ...(isAutomatic && { isAutomatic }) },
});
const declined = (name: string, input: unknown, reason: string) => ({
    type: `tool-${name}`,
    toolCallId: `call_seed_${++callSeq}`,
    state: "output-denied",
    input,
    approval: { id: `approval_seed_${callSeq}`, approved: false, reason },
});
const text = (value: string) => ({ type: "text", text: value, state: "done" });
const step = { type: "step-start" };

export async function seedAiShowcaseConversation(db: Tx, userId: string, refs: ShowcaseRefs) {
    callSeq = 0;
    const { anchor } = refs;
    const today = seedDate(anchor, 0);
    const task = (title: string) => find(refs.tasks, (t) => t.title === title, `task "${title}"`);
    const habit = (title: string) => find(refs.habits, (h) => h.title === title, `habit "${title}"`);
    const inbox = (prefix: string) => find(refs.inboxItems, (i) => i.rawText.startsWith(prefix), `inbox "${prefix}"`);
    const project = (name: string) => find(refs.projects, (p) => p.name === name, `project "${name}"`);
    const mini = (row: TaskRow) => toMinimalTask(row, TZ);

    const invoices = task("Reconcile subscription invoices");
    const venue = task("Follow up on venue booking");
    const acme = task("Send revised proposal to Acme Corp");
    const receipts = task("Archive 2025 receipts");
    const launch = task("Draft launch announcement");
    const q2 = task("Outline Q2 research themes");
    const subtask = (title: string) => find(refs.subtasks, (s) => s.title === title, `subtask "${title}"`);
    const clusterThemes = subtask("Cluster themes");
    const hypotheses = subtask("Write three hypotheses");
    const clientOps = project("Client Ops");
    const featureLaunch = project("Feature Launch");
    const hydrate = habit("Hydrate before coffee");
    const strength = habit("Strength session");
    const transcript = inbox("Review customer interview");
    const prescription = inbox("Pick up prescription");

    // ── Side effects the conversation implies ───────────────────────────
    // capture_to_inbox writes immediately.
    const [passport] = await db.insert(inboxItems).values({
        userId,
        rawText: "Renew passport before March",
        captureKind: "task",
        orderIndex: 10,
    }).returning();

    // Approved: set_task_state.
    await setTaskState(db, userId, [invoices.id], "COMPLETE");

    // Approved: create_tasks.
    const slidesDraft = {
        title: "Prep slides for client review",
        note: "Pull Q3 numbers and the revised timeline.",
        subtasks: ["Pull Q3 numbers", "Update the timeline slide"],
        scheduledStart: seedDateTime(anchor, 2, 13, 0),
        scheduledEnd: seedDateTime(anchor, 2, 14, 0),
        durationEstimate: 60,
        projectId: clientOps.id,
        priority: 2 as const,
    };
    const slidesCreated = await createTasks(db, userId, [slidesDraft]);

    // Approved in Auto: log_habit ×2.
    const hydrateLog = await resolveHabit(db, userId, hydrate.id, { targetDate: today, status: "COMPLETED" });
    const strengthLog = await resolveHabit(db, userId, strength.id, { targetDate: today, status: "SKIPPED" });

    // Approved: structure_inbox_item, create_project.
    const transcriptDraft = {
        title: "Pull quotable lines from customer interview",
        dueDate: seedDate(anchor, 3),
        durationEstimate: 45,
        projectId: featureLaunch.id,
    };
    const { task: transcriptTask } = await processCapture(db, userId, transcript.id, { ...transcriptDraft, scheduledStart: null, isAllDay: true, tagIds: [] });
    const planningDraft = { name: "Q3 Planning", emoji: "🧭", colorAccent: "luminous-amber" };
    const planning = await createProject(db, userId, planningDraft);

    const [metrics] = await db
        .select({
            rescheduleVelocity: userMetrics.rescheduleVelocity,
            currentBurnoutIndex: userMetrics.currentBurnoutIndex,
            completionRatio: userMetrics.completionRatio,
            overdueCarryLoad: userMetrics.overdueCarryLoad,
            habitAdherenceRate: userMetrics.habitAdherenceRate,
            scheduleDensity: userMetrics.scheduleDensity,
        })
        .from(userMetrics)
        .where(eq(userMetrics.userId, userId));

    const isToday = (t: TaskRow) => (t.scheduledStart ?? t.dueDate)?.slice(0, 10) === today;
    const activeTasks = refs.tasks.filter((t) => t.state === "ACTIVE" || t.state === "WAITING");
    const weekEnd = seedDate(anchor, 6);
    const inWeek = activeTasks.filter((t) => {
        const day = (t.scheduledStart ?? t.dueDate)?.slice(0, 10);
        return !!day && day >= today && day <= weekEnd;
    });
    const activeHabits = refs.habits.filter((h) => !h.archived);

    // ── Thread ──────────────────────────────────────────────────────────
    const [conversation] = await db.insert(aiConversations).values({
        userId,
        title: "Planning a heavy day",
        lastMessageAt: seedDateTime(anchor, 0, 9, 18),
    }).returning();

    const turns: { role: "user" | "assistant"; minute: number; parts: unknown[] }[] = [
        {
            role: "user",
            minute: 0,
            parts: [text("Morning! What's on my plate today? I feel a bit behind.")],
        },
        {
            role: "assistant",
            minute: 1,
            parts: [
                step,
                read("get_user_metrics", {}, { metrics: metrics ?? null }),
                read("get_tasks", { dueWindow: "today", limit: 20 }, {
                    tasks: activeTasks.filter(isToday).map(mini),
                    count: activeTasks.filter(isToday).length,
                }),
                read("get_tasks", { dueWindow: "overdue", limit: 20 }, { tasks: [mini(venue)], count: 1 }),
                read("get_schedule_window", { start: today, end: weekEnd, limit: 50 }, {
                    range: { start: today, end: weekEnd, timezone: TZ },
                    tasks: inWeek.map(mini),
                    routines: routinesDue(activeHabits, today, weekEnd),
                }),
                read("get_habit_status_today", {}, {
                    date: today,
                    statuses: routinesDue(activeHabits, today, today).map((h) => ({ habitId: h.id, title: h.title, status: "PENDING" })),
                }),
                step,
                text(
                    "Today is full but doable. You have **the launch announcement block at 2 PM**, the " +
                        "invoice reconcile, the Acme proposal, and a call to your landlord.\n\n" +
                        "One thing slipped: **Follow up on venue booking** was due yesterday. " +
                        "Want me to move it to tomorrow so it stops nagging you?",
                ),
                declined("reschedule_tasks", { taskIds: [venue.id], targetDate: seedDate(anchor, 1) }, "Not answered"),
            ],
        },
        {
            role: "user",
            minute: 4,
            parts: [text(
                "Invoices are already done, mark them off. And add a task to prep slides for the client review in two days.",
            )],
        },
        {
            role: "assistant",
            minute: 5,
            parts: [
                step,
                read("get_tasks", { query: "invoice", limit: 20 }, { tasks: [mini(invoices)], count: 1 }),
                read("get_projects", {}, { projects: refs.projects.map((p) => toMinimalProject(p, refs.sections)) }),
                step,
                text("Nice, that's one off the list. I put the slides in **Client Ops** as a one-hour block."),
                approved("set_task_state", { taskIds: [invoices.id], state: "COMPLETE" }, { updated: 1 }),
                approved("create_tasks", { tasks: [slidesDraft] }, { created: slidesCreated }),
            ],
        },
        {
            role: "user",
            minute: 8,
            parts: [text("I drank water before coffee today! Log that. Skip strength though, my back is sore.")],
        },
        {
            role: "assistant",
            minute: 9,
            parts: [
                step,
                read("get_habits", { includeArchived: false, limit: 20 }, {
                    habits: activeHabits.map((h) => toMinimalHabit(h, today)),
                }),
                step,
                text("Good call resting your back. Here are both check-ins:"),
                approved("log_habit", { habitId: hydrate.id, status: "COMPLETED", targetDate: today }, {
                    status: "COMPLETED",
                    currentStreak: hydrateLog.habit.currentStreak,
                }, true),
                approved("log_habit", { habitId: strength.id, status: "SKIPPED", targetDate: today }, {
                    status: "SKIPPED",
                    currentStreak: strengthLog.habit.currentStreak,
                }, true),
            ],
        },
        {
            role: "user",
            minute: 12,
            parts: [text("Can you tidy up my inbox?")],
        },
        {
            role: "assistant",
            minute: 13,
            parts: [
                step,
                read("get_inbox_items", { includeProcessed: false, limit: 20 }, {
                    items: refs.inboxItems.map(toMinimalInboxItem),
                }),
                read("get_tags", {}, { tags: refs.tags.map(toMinimalTag) }),
                step,
                text(
                    "Four captures in there. The interview transcript is real work for the launch, so I drafted it as a task. " +
                        "The teardown deck feeds next quarter, so it could live in a new list once you say yes to it. " +
                        "I also suggested an **Errands** tag for things like the prescription.",
                ),
                approved("structure_inbox_item", { inboxItemId: transcript.id, ...transcriptDraft }, {
                    taskId: transcriptTask.id,
                    title: transcriptTask.title,
                }),
                approved("create_project", planningDraft, { projectId: planning.id, name: planning.name }),
                declined("create_tag", { name: "Errands", color: "default" }, "Declined"),
            ],
        },
        {
            role: "user",
            minute: 15,
            parts: [text(
                "Skip the tag. Random thought: renew my passport before March. Also the 2025 receipts task can go, " +
                    `and put the Acme proposal on hold until Maya signs off. Oh, and I still need to ${prescription.rawText.toLowerCase()}, ` +
                    "plus the essay on the handout I photographed.",
            )],
        },
        {
            role: "assistant",
            minute: 16,
            parts: [
                step,
                read("capture_to_inbox", {
                    rawText: passport.rawText,
                    captureKind: "task",
                }, { item: { id: passport.id, rawText: passport.rawText }, deduped: false }),
                read("get_task_detail", { taskId: acme.id }, {
                    task: mini(acme),
                    subtasks: [],
                    tags: [],
                    note: { text: "", truncated: false, version: 0 },
                }),
                step,
                text(
                    "Passport is saved to Capture. Below: Acme on hold for Maya, the checklist changes, " +
                        "deleting the receipts task for good, and the two new tasks.",
                ),
                waiting("set_task_state", { taskIds: [acme.id], state: "WAITING", waitingOn: "Maya: legal review" }),
                waiting("update_tasks", {
                    taskIds: [acme.id],
                    patch: { appendNote: "Waiting on Maya's legal review before sending.", noteVersion: 0 },
                }),
                waiting("edit_subtasks", { taskId: acme.id, add: ["Send redlines to Maya"] }),
                waiting("edit_subtasks", {
                    taskId: q2.id,
                    update: [{ subtaskId: clusterThemes.id, isComplete: true }],
                    remove: [{ subtaskId: hypotheses.id, title: hypotheses.title }],
                }),
                waiting("delete_tasks", { tasks: [{ taskId: receipts.id, title: receipts.title }] }),
                waiting("create_tasks", {
                    tasks: [
                        {
                            title: prescription.rawText,
                            scheduledStart: seedDateTime(anchor, 0, 17, 15),
                            scheduledEnd: seedDateTime(anchor, 0, 17, 45),
                            durationEstimate: 30,
                            priority: 3,
                            effort: 1,
                        },
                        {
                            title: "History essay: causes of the 1929 crash",
                            dueDate: seedDate(anchor, 4),
                            priority: 4,
                            subtasks: ["Pick three primary sources", "Outline the argument"],
                            fromImage: { dueDate: "due Friday", priority: "URGENT", subtasks: "1. sources 2. outline" },
                        },
                    ],
                }),
                text(`I left **${launch.title}** alone. That 2 PM block is still your best focus time today.`),
            ],
        },
    ];

    await db.insert(aiMessages).values(
        turns.map((turn, index) => ({
            id: crypto.randomUUID(),
            conversationId: conversation.id,
            userId,
            role: turn.role,
            parts: turn.parts,
            orderIndex: index + 1,
            createdAt: seedDateTime(anchor, 0, 9, turn.minute),
        })),
    );
}
