/**
 * AI showcase conversation — one thread that fires every assistant tool once, so
 * every chip and proposal card can be eyeballed without talking to a model.
 *
 * Proposal states on display:
 * - approved (`output-available`, decision "commit"): propose_complete_tasks, propose_create_task
 * - declined (`output-available`, decision "discard"): propose_create_tag
 * - pending  (`input-available`): every other propose_* tool
 *
 * Tool outputs go through the real `projections.ts` helpers, so they match what
 * the live tools return. Approved writes are applied to the workspace too.
 */

import { eq } from "drizzle-orm";
import type { Tx } from "../../../types/db";
import {
    aiConversations,
    aiMessages,
    type habits,
    inboxItems,
    type projects,
    suggestions,
    type subtasks,
    type tags,
    tasks,
    userMetrics,
} from "../../../db/schema";
import { createSeedTask, seedDate, seedDateTime } from "../debug-seed";
import {
    toMinimalHabit,
    toMinimalInboxItem,
    toMinimalProject,
    toMinimalSection,
    toMinimalSuggestion,
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
const pending = (name: string, input: unknown) => ({
    type: `tool-${name}`,
    toolCallId: `call_seed_${++callSeq}`,
    state: "input-available",
    input,
});
const resolved = (name: string, input: unknown, output: Record<string, unknown>) => read(name, input, output);
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
    const teardown = inbox("Save the campaign teardown");
    const prescription = inbox("Pick up prescription");

    // ── Side effects the conversation implies ───────────────────────────
    const [suggestion] = await db.insert(suggestions).values({
        userId,
        type: "move_overdue",
        title: "Move 1 overdue task to tomorrow",
        body: "“Follow up on venue booking” slipped past its date.",
        relatedTaskIds: [venue.id],
    }).returning();

    // capture_to_inbox writes immediately.
    const [passport] = await db.insert(inboxItems).values({
        userId,
        rawText: "Renew passport before March",
        captureKind: "task",
        orderIndex: 10,
    }).returning();

    // Approved: propose_complete_tasks.
    await db.update(tasks).set({ state: "COMPLETE" }).where(eq(tasks.id, invoices.id));

    // Approved: propose_create_task.
    const slidesDraft = {
        title: "Prep slides for client review",
        content: "Pull Q3 numbers and the revised timeline.",
        isAllDay: false,
        scheduledStart: seedDateTime(anchor, 2, 13, 0),
        scheduledEnd: seedDateTime(anchor, 2, 14, 0),
        durationEstimate: 60,
        projectId: clientOps.id,
        priority: 2 as const,
    };
    await db.insert(tasks).values(createSeedTask(userId, { ...slidesDraft, state: "ACTIVE", orderIndex: 40 }));

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
                    habits: activeHabits.map((h) => ({
                        id: h.id,
                        title: h.title,
                        recurrenceRule: h.recurrenceRule,
                        targetTime: h.targetTime,
                    })),
                }),
                read("get_habit_status_today", {}, {
                    date: today,
                    statuses: activeHabits.map((h) => ({ habitId: h.id, title: h.title, status: "PENDING" })),
                }),
                step,
                text(
                    "Today is full but doable. You have **the launch announcement block at 2 PM**, the " +
                        "invoice reconcile, the Acme proposal, and a call to your landlord.\n\n" +
                        "One thing slipped: **Follow up on venue booking** was due yesterday. " +
                        "Want me to move it to tomorrow so it stops nagging you?",
                ),
                pending("propose_batch_reschedule", {
                    taskIds: [venue.id],
                    targetDate: seedDate(anchor, 1),
                    field: "dueDate",
                }),
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
                read("search_tasks", { query: "invoice", limit: 20 }, { tasks: [mini(invoices)], count: 1 }),
                read("get_projects", {}, { projects: refs.projects.map(toMinimalProject) }),
                step,
                text("Nice, that's one off the list. I put the slides in **Client Ops** as a one-hour block."),
                resolved("propose_complete_tasks", { taskIds: [invoices.id] }, { decision: "commit", count: 1 }),
                resolved("propose_create_task", slidesDraft, { decision: "commit", title: slidesDraft.title }),
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
                pending("propose_log_habit", { habitId: hydrate.id, status: "COMPLETED" }),
                pending("propose_log_habit", { habitId: strength.id, status: "SKIPPED" }),
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
                read("get_sections", { projectId: featureLaunch.id }, {
                    sections: refs.sections.filter((s) => s.projectId === featureLaunch.id).map(toMinimalSection),
                }),
                read("get_tags", {}, { tags: refs.tags.map(toMinimalTag) }),
                step,
                text(
                    "Four captures in there. The interview transcript is real work for the launch, so I drafted it as a task. " +
                        "The transcript and teardown deck both feed next quarter, so they could live together in a new project. " +
                        "I also suggested an **Errands** tag for things like the prescription.",
                ),
                pending("propose_structure_inbox_item", {
                    inboxItemId: transcript.id,
                    title: "Pull quotable lines from customer interview",
                    dueDate: seedDate(anchor, 3),
                    durationEstimate: 45,
                    projectId: featureLaunch.id,
                }),
                pending("propose_create_project", { name: "Q3 Planning", emoji: "🧭", colorAccent: "luminous-amber" }),
                pending("propose_cluster_inbox", {
                    projectName: "Q3 Planning",
                    inboxItemIds: [transcript.id, teardown.id],
                }),
                resolved("propose_create_tag", { name: "Errands", color: "default" }, { decision: "discard" }),
            ],
        },
        {
            role: "user",
            minute: 15,
            parts: [text(
                "Skip the tag. Random thought: renew my passport before March. Also the 2025 receipts task can go, " +
                    `and put the Acme proposal on hold until Maya signs off. Oh, and I still need to ${prescription.rawText.toLowerCase()}.`,
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
                    clientMutationId: "seed-capture-passport",
                }, { item: { id: passport.id, rawText: passport.rawText }, deduped: false }),
                read("get_task_detail", { taskId: acme.id }, { task: mini(acme), subtasks: [], tags: [] }),
                read("get_suggestions", { limit: 20 }, { suggestions: [toMinimalSuggestion(suggestion)] }),
                step,
                text(
                    "Passport is saved to your inbox. Below: putting Acme on hold for Maya, and deleting the receipts task for good.\n\n" +
                        "Cadence also noticed the overdue venue follow-up. Accepting that suggestion does the same thing as the " +
                        "reschedule I offered earlier, so pick whichever.",
                ),
                pending("propose_update_task", {
                    taskId: acme.id,
                    state: "WAITING",
                    waitingOn: "Maya: legal review",
                }),
                pending("propose_add_subtask", { taskId: acme.id, title: "Send redlines to Maya" }),
                pending("propose_update_subtask", { taskId: q2.id, subtaskId: clusterThemes.id, isComplete: true }),
                pending("propose_delete_subtask", { taskId: q2.id, subtaskId: hypotheses.id, title: hypotheses.title }),
                pending("propose_delete_task", { taskId: receipts.id, title: receipts.title }),
                pending("propose_suggestion_action", { suggestionId: suggestion.id, action: "accept" }),
                pending("propose_create_task", {
                    title: prescription.rawText,
                    isAllDay: false,
                    scheduledStart: seedDateTime(anchor, 0, 17, 15),
                    scheduledEnd: seedDateTime(anchor, 0, 17, 45),
                    durationEstimate: 30,
                    priority: 3,
                    effort: 1,
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
