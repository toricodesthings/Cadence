/**
 * Suggest steps: 3–7 small first steps for one task, as structured output from the chat model. It reads only the
 * task's own content (title, the first 1,000 characters of its note, its list, its existing steps) and stores nothing:
 * the person keeps steps as subtasks from the draft, through the normal subtask write.
 */
import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { STEP_MAX_CHARS } from "@cadence/contracts/planning";
import { projects, subtasks, taskNotes, tasks } from "../../db/schema";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { logger } from "../../platform/log";
import { getModelId } from "./model-router";
import { addStepSpend } from "./safety/rate-limit";
import type { Env } from "../../types/env";
import type { Tx } from "../../types/db";
import stepsPrompt from "../../prompts/assistant/steps.md";

/** Past this the person has already moved on; the manual field stays focused meanwhile. */
export const STEPS_TIMEOUT_MS = 8_000;
const NOTE_CHARS = 1_000;
const INSTRUCTIONS = stepsPrompt.trimEnd();
// Bounds live in the prompt and the cleanup below: a schema bound makes a near miss (8 steps) a failed draft.
const replySchema = z.object({ steps: z.array(z.string()) });

export interface StepsInput {
    title: string;
    notes: string;
    listName: string | null;
    existing: string[];
}

/** Everything the model may see about a task, and nothing else. A task that isn't the caller's is a 404. */
export async function readStepsInput(tx: Tx, userId: string, taskId: string): Promise<StepsInput> {
    const [task] = await tx
        .select({ title: tasks.title, listName: projects.name, notes: taskNotes.body })
        .from(tasks)
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .leftJoin(taskNotes, eq(taskNotes.taskId, tasks.id))
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    throwIfNotFound(task, "Task");
    const steps = await tx.select({ title: subtasks.title }).from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(asc(subtasks.orderIndex));
    return { title: task.title, notes: (task.notes ?? "").slice(0, NOTE_CHARS), listName: task.listName, existing: steps.map((s) => s.title) };
}

/** The task as the model reads it: plain labelled data. */
export function stepsPromptFor(input: StepsInput, smaller?: string[]): string {
    return [
        `Task title: ${input.title}`,
        input.listName ? `List: ${input.listName}` : null,
        input.notes.trim() ? `Notes:\n${input.notes.trim()}` : null,
        input.existing.length ? `Existing steps:\n${input.existing.map((s) => `- ${s}`).join("\n")}` : null,
        smaller?.length ? `Previous draft, to break into smaller steps:\n${smaller.map((s) => `- ${s}`).join("\n")}` : null,
    ].filter(Boolean).join("\n\n");
}

/** Drafted steps, cleaned to ≤ 80 characters each, and the metered tokens it cost. Throws a 504 on timeout, else 502. */
export async function suggestSteps(env: Env, userHash: string, input: StepsInput, smaller?: string[]): Promise<{ steps: string[]; tokens: number }> {
    if (!env.OPENROUTER_API_KEY) throw new AppError(503, "AI_UPSTREAM_UNAVAILABLE", "The assistant isn't available");
    const startedAt = Date.now();
    try {
        const { output, usage, providerMetadata, response } = await generateText({
            model: createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })(getModelId(env), { user: userHash }),
            instructions: INSTRUCTIONS,
            prompt: stepsPromptFor(input, smaller),
            output: Output.object({ schema: replySchema }),
            maxOutputTokens: 800,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(STEPS_TIMEOUT_MS),
        });
        logger.info("ai", "ai_steps", {
            userHash,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            ms: Date.now() - startedAt,
            ...addStepSpend({}, { providerMetadata, response }),
        });
        const steps = output.steps
            .map((s) => s.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .map((s) => (s.length > STEP_MAX_CHARS ? `${s.slice(0, STEP_MAX_CHARS - 1).trimEnd()}…` : s))
            .slice(0, 7);
        if (!steps.length) throw new Error("no steps");
        return { steps, tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) };
    } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        logger.warn("ai", "ai_steps_failed", { userHash, reason: error instanceof Error ? error.name : "unknown", ms: Date.now() - startedAt });
        throw timedOut
            ? new AppError(504, "AI_TIMEOUT", "Couldn't suggest steps in time", true)
            : new AppError(502, "AI_UPSTREAM_UNAVAILABLE", "Couldn't suggest steps", true);
    }
}
