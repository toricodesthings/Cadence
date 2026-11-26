import { daysBetweenLocal, type LocalDate, type NlpClock } from "../core/index.js";

export interface RankableTask {
    id: string;
    priority: number;
    isPinned: boolean;
    orderIndex: number;
    state: string;
    dueDate: LocalDate | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    effort: number | null;
    effortGuess?: number | null;
    waitingOn: string | null;
    notBefore: string | null;
    durationEstimate: number | null;
}

export interface RankedTask {
    task: RankableTask;
    score: number;
    reasons: TaskRankReason[];
}

export type TaskRankReason =
    | "overdue"
    | "due_today"
    | "due_soon"
    | "quick_win"
    | "looks_quick"
    | "high_priority"
    | "needs_date"
    | "waiting"
    | "not_yet"
    | "pinned"
    | "scheduled_now";

export interface RankingOptions {
    clock: NlpClock;
    dayOf: (instant: string) => LocalDate;
    now?: Date;
    routeContext?: "today" | "upcoming" | "project";
}

export function rankTasks(tasks: RankableTask[], options: RankingOptions): RankedTask[] {
    const now = options.now ?? new Date();
    const todayStr = options.clock.today;

    const ranked = tasks.map((task) => ({ task, ...computeScore(task, now, todayStr, options) }));

    ranked.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.task.orderIndex - b.task.orderIndex;
    });

    return ranked;
}

function dateSignal(day: string | null, today: string): [TaskRankReason, number] | null {
    if (!day) return null;
    if (day < today) return ["overdue", 40];
    if (day === today) return ["due_today", 30];
    return daysBetweenLocal(today, day) <= 3 ? ["due_soon", 15] : null;
}

type AddScore = (points: number, reason?: TaskRankReason) => void;

function addTiming(task: RankableTask, day: string | null, now: Date, todayStr: string, add: AddScore) {
    const date = dateSignal(day, todayStr);
    if (date) add(date[1], date[0]);
    const startsIn = task.scheduledStart ? new Date(task.scheduledStart).getTime() - now.getTime() : NaN;
    if (startsIn >= -30 * 60 * 1000 && startsIn <= 60 * 60 * 1000) add(35, "scheduled_now");
}

function addWeight(task: RankableTask, add: AddScore) {
    if (task.priority >= 3) add(task.priority * 5, "high_priority");
    else if (task.priority > 0) add(task.priority * 2);
    if (task.effort === 1 || (task.durationEstimate && task.durationEstimate <= 15)) add(8, "quick_win");
    else if (task.effort == null && task.effortGuess === 1) add(8, "looks_quick");
    if (task.isPinned) add(10, "pinned");
}

function computeScore(
    task: RankableTask,
    now: Date,
    todayStr: string,
    options: RankingOptions,
): { score: number; reasons: TaskRankReason[] } {
    let score = 0;
    const reasons: TaskRankReason[] = [];
    const add = (points: number, reason?: TaskRankReason) => {
        score += points;
        if (reason) reasons.push(reason);
    };
    const day = task.dueDate ?? (task.scheduledStart ? options.dayOf(task.scheduledStart) : null);

    if (task.notBefore && task.notBefore > todayStr) add(-50, "not_yet");
    if (task.waitingOn) add(-20, "waiting");
    addTiming(task, day, now, todayStr, add);
    addWeight(task, add);
    if (!day && options.routeContext === "today") add(2, "needs_date");

    return { score, reasons };
}
