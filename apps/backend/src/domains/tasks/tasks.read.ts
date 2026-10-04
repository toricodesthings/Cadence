/** Task list reads shared by the single-list route and offline batch. */
import { and, asc, between, desc, eq, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { tracing } from "cloudflare:workers";
import type { Task, TaskBatch, TaskBatchFilters } from "@cadence/contracts/task";
import { expandScheduleScopedTasks, isScheduleScopedTaskQuery } from "@cadence/domain/task-recurrence";
import { tasks } from "../../db/schema";
import type { Tx } from "../../types/db";
import { normalizeTaskFilters, type NormalizedTaskFilters } from "./task-filters";
import { toTask } from "./tasks.service";

function buildEffectiveTaskAnchorExpression() {
    return sql<string>`case
        when ${tasks.isAllDay} = true then coalesce(${tasks.dueDate}, ${tasks.scheduledStart})
        else coalesce(${tasks.scheduledStart}, ${tasks.dueDate})
    end`;
}

export function buildTaskWhereClause(userId: string, filters: NormalizedTaskFilters): (SQL<unknown> | undefined)[] {
    const conditions: (SQL<unknown> | undefined)[] = [eq(tasks.userId, userId)];

    if (filters.state) {
        conditions.push(eq(tasks.state, filters.state));
    }
    if (filters.projectId) {
        conditions.push(eq(tasks.projectId, filters.projectId));
    }

    // A date window: tasks anchored inside it, plus repeating series started by its end.
    // `expandScheduleScopedTasks` makes the final cut and expands the series.
    const window = filters.scheduledDate
        ? { start: `${filters.scheduledDate}T00:00:00.000Z`, end: `${filters.scheduledDate}T23:59:59.999Z` }
        : filters.scheduledRangeStart && filters.scheduledRangeEnd
            ? { start: filters.scheduledRangeStart, end: filters.scheduledRangeEnd }
            : undefined;
    if (window) {
        conditions.push(
            or(
                between(sql`coalesce(${tasks.scheduledStart}, ${tasks.dueDate})`, window.start, window.end),
                and(isNotNull(tasks.recurrenceRule), lte(tasks.scheduledStart, window.end)),
            ),
        );
    }

    if (filters.priority !== undefined) {
        conditions.push(eq(tasks.priority, filters.priority));
    }
    if (filters.isPinned !== undefined) {
        conditions.push(eq(tasks.isPinned, filters.isPinned));
    }
    if (filters.effort !== undefined) {
        conditions.push(eq(tasks.effort, filters.effort));
    }
    if (filters.notBeforeBefore !== undefined) {
        conditions.push(or(lte(tasks.notBefore, filters.notBeforeBefore), isNull(tasks.notBefore)));
    }
    if (filters.hasNoDate) {
        conditions.push(and(isNull(tasks.scheduledStart), isNull(tasks.dueDate)));
    }
    if (filters.hasNoProject) {
        conditions.push(isNull(tasks.projectId));
    }
    if (filters.effectiveOnOrBeforeDateTime) {
        conditions.push(lte(buildEffectiveTaskAnchorExpression(), filters.effectiveOnOrBeforeDateTime));
    }

    return conditions;
}

const tagLinks = { tags: { columns: { tagId: true as const } } };
const manualOrder = [desc(tasks.isPinned), asc(tasks.orderIndex), asc(tasks.id)];

function finishTaskList(rows: Task[], filters: NormalizedTaskFilters) {
    return isScheduleScopedTaskQuery(filters) ? expandScheduleScopedTasks(rows, filters) : rows;
}

export async function readTasks(tx: Tx, userId: string, filters: NormalizedTaskFilters): Promise<Task[]> {
    const newestFirst = filters.state === "COMPLETE" || filters.state === "ARCHIVED";
    const rows = await tx.query.tasks.findMany({
        where: and(...buildTaskWhereClause(userId, filters)),
        orderBy: newestFirst ? [desc(tasks.updatedAt), desc(tasks.id)] : manualOrder,
        ...(isScheduleScopedTaskQuery(filters) ? {} : { limit: filters.limit, offset: filters.offset }),
        with: tagLinks,
    });
    return finishTaskList(rows.map(({ tags: links, ...row }) => toTask(row, links.map((link) => link.tagId))), filters);
}

/**
 * Match each open-list predicate in SQL, fetching the union of rows + tags once.
 * Membership uses the exact single-read WHERE clauses; recurrence and paging
 * are applied per list afterwards. Completed/Trash paging stays on single reads.
 */
export async function readTaskBatch(tx: Tx, userId: string, queries: TaskBatchFilters): Promise<TaskBatch> {
    const filters = queries.map(normalizeTaskFilters);
    const predicates = filters.map((filter) => and(...buildTaskWhereClause(userId, filter))!);
    const rows = await tracing.enterSpan("tasks.batch.read", () => tx.query.tasks.findMany({
        where: or(...predicates),
        orderBy: manualOrder,
        with: tagLinks,
        extras: {
            batchMatches: sql<boolean[]>`json_build_array(${sql.join(predicates, sql`, `)})`
                .mapWith((value: string | boolean[]) => typeof value === "string" ? JSON.parse(value) as boolean[] : value)
                .as("batch_matches"),
        },
    }));
    const buckets: Task[][] = filters.map(() => []);
    for (const { tags: links, batchMatches, ...row } of rows) {
        const task = toTask(row, links.map((link) => link.tagId));
        batchMatches.forEach((matches, index) => { if (matches) buckets[index].push(task); });
    }
    const result: TaskBatch = { tasks: [], lists: [] };
    const indexById = new Map<string, number>();
    filters.forEach((filter, index) => {
        const list = finishTaskList(buckets[index], filter);
        result.lists.push(list.map((task) => {
            let taskIndex = indexById.get(task.id);
            if (taskIndex === undefined) {
                taskIndex = result.tasks.length;
                result.tasks.push(task);
                indexById.set(task.id, taskIndex);
            }
            return taskIndex;
        }));
    });
    return result;
}
