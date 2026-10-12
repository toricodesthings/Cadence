import { createSearchIndex } from "@cadence/search";
import { taskSearch, taskPlaceColumns } from "../tasks/task-search.service";
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

export async function didYouMean(
    env: Env,
    userId: string,
    query: string,
    kind: Extract<DecisionKind, "search" | "assistant_search"> = "search",
    scope?: SQL, // The assistant's complete filters, including state and literal identifiers.
): Promise<{ id: string; title: string } | null> {
    if (!query.trim()) return null;
    const db = getDbClient(env);
    const recent = await withRls(db, userId, async (tx) => {
        if (!(await smartPlacementOn(tx, userId))) return [];
        return tx
            .select({ id: tasks.id, title: tasks.title })
            .from(tasks)
            .where(and(eq(tasks.userId, userId), scope ?? and(inArray(tasks.state, ["ACTIVE", "WAITING"]), taskSearch(query, Object.values(taskPlaceColumns)).identifiers), ne(tasks.interactionMode, "timetable")))
            // ponytail: unindexed sort over one person's scoped tasks; a GiST trigram index if those reach six figures.
            .orderBy(desc(sql`word_similarity(${query}, ${tasks.title})`), desc(tasks.updatedAt), desc(tasks.id));
    });
    if (recent.length === 0) return null;
    const fuzzy = createSearchIndex(recent).search(query, { fuzzy: true });
    // A spelling candidate is still a suggestion, never permission to mutate a task.
    if (fuzzy.length === 1) return recent.find((task) => task.id === fuzzy[0]!.id) ?? null;
    if (!decisionModel(env)) return null;
    const decision = await decideChoice(env, {
        kind,
        state: query.slice(0, 200),
        instructions: INSTRUCTIONS,
        candidates: recent.slice(0, 255).map((task) => ({ id: task.id, label: task.title.slice(0, 120) })),
        userHash: await hashIdentifier(userId),
    });
    return recent.find((task) => task.id === decision?.id) ?? null;
}
