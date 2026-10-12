/**
 * S1: pick a list and section for a saved capture, in the background.
 *
 * Save never waits for this. The user's lists are read in one short transaction, the model is called with
 * none open, and the suggestion is stored (only if it clears the threshold and still exists) at
 * `inbox_items.analysis.suggestedPlacement`. Clarify and Sort all read it from there.
 */
import { and, eq, sql } from "drizzle-orm";
import type { SuggestedPlacement } from "@cadence/contracts/inbox";
import { inboxItems, projects, taskSections } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier, logger } from "../../platform/log";
import { withRls } from "../../platform/rls";
import type { Env } from "../../types/env";
import { decideChoice, decisionModel, smartPlacementOn, type DecisionCandidate } from "./decision";

const MAX_TEXT = 1_000;
const MAX_PAIRS = 255;

const INSTRUCTIONS =
    "The state is a thought the user just captured. Which of the user's lists (and section within it) does it belong in? " +
    "Choose none unless one option clearly fits. A thought that is not about any option, or says it is not for one, is none.";

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/** Over the cap: keep the pairs sharing the most words with the capture. ponytail: word overlap, add recency when users pass 255 pairs. */
function shortlist(pairs: DecisionCandidate[], text: string): DecisionCandidate[] {
    if (pairs.length <= MAX_PAIRS) return pairs;
    const have = words(text);
    const overlap = (label: string) => [...words(label)].filter((word) => have.has(word)).length;
    return pairs
        .map((pair, index) => ({ pair, index, score: overlap(pair.label) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, MAX_PAIRS)
        .map(({ pair }) => pair);
}

export async function suggestPlacement(env: Env, userId: string, captureId: string): Promise<void> {
    try {
        if (!decisionModel(env)) return;
        const db = getDbClient(env);

        const loaded = await withRls(db, userId, async (tx) => {
            if (!(await smartPlacementOn(tx, userId))) return null;
            const [capture] = await tx
                .select({ rawText: inboxItems.rawText })
                .from(inboxItems)
                .where(and(eq(inboxItems.id, captureId), eq(inboxItems.userId, userId), eq(inboxItems.captureStatus, "clarifying"), eq(inboxItems.processed, false)));
            if (!capture) return null;
            const [lists, sections] = await Promise.all([
                tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
                tx.select({ id: taskSections.id, name: taskSections.name, projectId: taskSections.projectId }).from(taskSections).where(eq(taskSections.userId, userId)),
            ]);
            return { text: capture.rawText, lists, sections };
        });
        if (!loaded || loaded.lists.length === 0) return;

        const pairs: DecisionCandidate[] = loaded.lists.flatMap((list) => [
            { id: `${list.id}|`, label: list.name },
            ...loaded.sections
                .filter((section) => section.projectId === list.id)
                .map((section) => ({ id: `${list.id}|${section.id}`, label: `${list.name} › ${section.name}` })),
        ]);
        const text = loaded.text.slice(0, MAX_TEXT);
        const decision = await decideChoice(env, {
            kind: "placement",
            state: text,
            instructions: INSTRUCTIONS,
            candidates: shortlist(pairs, text),
            userHash: await hashIdentifier(userId),
        });
        if (!decision?.id) return;

        const [projectId, sectionId = ""] = decision.id.split("|");
        const suggestion: SuggestedPlacement = {
            projectId,
            sectionId: sectionId || null,
            model: decision.model,
            probability: decision.probability,
            ...(decision.costUsd !== undefined && { costUsd: decision.costUsd }),
            ms: decision.ms,
        };

        // Re-check in a fresh transaction: the pair and the capture may have changed during the call.
        await withRls(db, userId, async (tx) => {
            const [list] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
            if (!list) return;
            if (suggestion.sectionId) {
                const [section] = await tx
                    .select({ id: taskSections.id })
                    .from(taskSections)
                    .where(and(eq(taskSections.id, suggestion.sectionId), eq(taskSections.userId, userId), eq(taskSections.projectId, projectId)));
                if (!section) return;
            }
            // Merged in SQL so a concurrent edit of `analysis` (userOverrides) is never overwritten.
            await tx
                .update(inboxItems)
                .set({ analysis: sql`coalesce(${inboxItems.analysis}, '{}'::jsonb) || ${JSON.stringify({ suggestedPlacement: suggestion })}::jsonb` })
                .where(and(eq(inboxItems.id, captureId), eq(inboxItems.userId, userId), eq(inboxItems.captureStatus, "clarifying"), eq(inboxItems.processed, false)));
        });
    } catch (error) {
        logger.warn("ai", "placement_suggestion_failed", { reason: error instanceof Error ? error.message.slice(0, 117) : "unknown_error" });
    }
}
