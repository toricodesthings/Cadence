import { createSearchIndex } from "@cadence/search";
import { taskSearch, taskPlaceColumns, taskSearchColumns } from "../tasks/task-search.service";
/**
 * S2: when a search finds nothing, ask which recent open task was meant.
 *
 * Read tasks in the supplied search scope (otherwise open tasks), closest spelling first, then most recent; verify spelling with shared search before a model fallback.
 * The model is called with no transaction open; only a returned candidate id can be offered.
 * Returns null when off, abstained or below its threshold.
 */
import { and, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { tasks } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier } from "../../platform/log";
import { withRls } from "../../platform/rls";
import type { Env } from "../../types/env";
import { decideChoice, decisionModel, smartPlacementOn, type DecisionKind } from "./decision";
import instructions from "../../prompts/decisions/did-you-mean.md";

const INSTRUCTIONS = instructions.trimEnd();
// Bound what one request can pull into the Worker: newest candidates, notes cut to what spelling checks need.
const MAX_DOCUMENTS = 500;
const NOTES_CHARS = 2000;

export async function didYouMean(
    env: Env,
    userId: string,
    query: string,
    kind: Extract<DecisionKind, "search" | "assistant_search"> = "search",
    scope?: SQL, // The assistant's complete filters, including state and literal identifiers.
): Promise<{ id: string; title: string } | null> {
    if (!query.trim()) return null;
    const db = getDbClient(env);
    const selection = await withRls(db, userId, async (tx) => {
        if (!(await smartPlacementOn(tx, userId))) return { fuzzy: [], recent: [] };
        const base = and(
            eq(tasks.userId, userId),
            scope ?? and(inArray(tasks.state, ["ACTIVE", "WAITING"]), taskSearch(query, Object.values(taskPlaceColumns)).identifiers),
            ne(tasks.interactionMode, "timetable"),
        );
        // Broad SQL retrieval only; shared search verifies every term across the canonical fields.
        const documents = await tx.select({
            id: tasks.id, title: tasks.title, ...taskPlaceColumns, ...taskSearchColumns,
            notes: sql<string>`left(${taskSearchColumns.notes}, ${NOTES_CHARS})`,
        })
            .from(tasks).where(and(base, taskSearch(query, Object.values(taskPlaceColumns), true).condition))
            .orderBy(desc(tasks.updatedAt), desc(tasks.id)).limit(MAX_DOCUMENTS);
        const hits = createSearchIndex(documents.map((doc) => ({ ...doc, list: doc.listName ?? "", section: doc.sectionName ?? "" })))
            .search(query, { fuzzy: true });
        const byId = new Map(documents.map((doc) => [doc.id, doc]));
        const fuzzy = hits.map((hit) => byId.get(hit.id)!);
        if (fuzzy.length === 1 || !decisionModel(env)) return { fuzzy, recent: [] };
        // Semantic fallback is confirmation-only; rank by spelling before limiting the model's options.
        const recent = await tx.select({ id: tasks.id, title: tasks.title }).from(tasks).where(base)
            .orderBy(desc(sql`word_similarity(${query}, ${tasks.title})`), desc(tasks.updatedAt), desc(tasks.id)).limit(255);
        return { fuzzy, recent };
    });
    // A spelling candidate is still a suggestion, never permission to mutate a task.
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
