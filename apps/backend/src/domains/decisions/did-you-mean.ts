import { OPEN_TASK_STATES } from "@cadence/contracts/task";
import { createSearchIndex } from "@cadence/search";
import { taskSearch, taskPlaceColumns, taskSearchColumns } from "../tasks/task-search.service";
import { and, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { tasks } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier } from "../../platform/log";
import { withRls } from "../../platform/rls";
import type { Env } from "../../types/env";
import { decideChoice, decisionModel, smartPlacementOn, type DecisionKind } from "./decision";
import instructions from "../../prompts/decisions/did-you-mean.md";

const INSTRUCTIONS = instructions.trimEnd();
const MAX_DOCUMENTS = 500;
const NOTES_CHARS = 2000;

export async function didYouMean(
    env: Env,
    userId: string,
    query: string,
    kind: Extract<DecisionKind, "search" | "assistant_search"> = "search",
    scope?: SQL,
): Promise<{ id: string; title: string } | null> {
    if (!query.trim()) return null;
    const db = getDbClient(env);
    const selection = await withRls(db, userId, async (tx) => {
        if (!(await smartPlacementOn(tx, userId))) return { fuzzy: [], recent: [] };
        const base = and(
            eq(tasks.userId, userId),
            scope ??
                and(
                    inArray(tasks.state, OPEN_TASK_STATES),
                    taskSearch(query, Object.values(taskPlaceColumns)).identifiers,
                ),
            ne(tasks.interactionMode, "timetable"),
        );
        const documents = await tx
            .select({
                id: tasks.id,
                title: tasks.title,
                ...taskPlaceColumns,
                ...taskSearchColumns,
                notes: sql<string>`left(${taskSearchColumns.notes}, ${NOTES_CHARS})`,
            })
            .from(tasks)
            .where(and(base, taskSearch(query, Object.values(taskPlaceColumns), true).condition))
            .orderBy(desc(tasks.updatedAt), desc(tasks.id))
            .limit(MAX_DOCUMENTS);
        const hits = createSearchIndex(
            documents.map((doc) => ({ ...doc, list: doc.listName ?? "", section: doc.sectionName ?? "" })),
        ).search(query, { fuzzy: true });
        const byId = new Map(documents.map((doc) => [doc.id, doc]));
        const fuzzy = hits.map((hit) => byId.get(hit.id)!);
        if (fuzzy.length === 1 || !decisionModel(env)) return { fuzzy, recent: [] };
        const recent = await tx
            .select({ id: tasks.id, title: tasks.title })
            .from(tasks)
            .where(base)
            .orderBy(desc(sql`word_similarity(${query}, ${tasks.title})`), desc(tasks.updatedAt), desc(tasks.id))
            .limit(255);
        return { fuzzy, recent };
    });
    if (selection.fuzzy.length === 1) {
        const { id, title } = selection.fuzzy[0]!;
        return { id, title };
    }
    const recent = selection.recent;
    if (!recent.length) return null;
    const decision = await decideChoice(env, {
        kind,
        state: query.slice(0, 200),
        instructions: INSTRUCTIONS,
        candidates: recent.map((task) => ({ id: task.id, label: task.title.slice(0, 120) })),
        userHash: await hashIdentifier(userId),
    });
    return recent.find((task) => task.id === decision?.id) ?? null;
}
