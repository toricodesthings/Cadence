/**
 * S2: when a search finds nothing, ask which recent open task was meant.
 *
 * The user's 255 most recent open tasks are read in one short transaction; the model is called with none open.
 * Returns null when off, abstained or below its threshold.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { tasks } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier } from "../../platform/log";
import { withRls } from "../../platform/rls";
import type { Env } from "../../types/env";
import { decideChoice, decisionModel, smartPlacementOn, type DecisionKind } from "./decision";

const INSTRUCTIONS =
    "The state is a search the user typed that found nothing. Which of the user's tasks did they most likely mean? " +
    "Choose none unless one task clearly matches what they were looking for.";

export async function didYouMean(
    env: Env,
    userId: string,
    query: string,
    kind: Extract<DecisionKind, "search" | "assistant_search"> = "search",
): Promise<{ id: string; title: string } | null> {
    if (!decisionModel(env) || !query.trim()) return null;
    const db = getDbClient(env);
    const recent = await withRls(db, userId, async (tx) => {
        if (!(await smartPlacementOn(tx, userId))) return [];
        return tx
            .select({ id: tasks.id, title: tasks.title })
            .from(tasks)
            .where(and(eq(tasks.userId, userId), inArray(tasks.state, ["ACTIVE", "WAITING"]), ne(tasks.interactionMode, "timetable")))
            .orderBy(desc(tasks.updatedAt), desc(tasks.id))
            .limit(255);
    });
    if (recent.length === 0) return null;
    const decision = await decideChoice(env, {
        kind,
        state: query.slice(0, 200),
        instructions: INSTRUCTIONS,
        candidates: recent.map((task) => ({ id: task.id, label: task.title.slice(0, 120) })),
        userHash: await hashIdentifier(userId),
    });
    return recent.find((task) => task.id === decision?.id) ?? null;
}
