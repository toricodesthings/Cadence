/**
 * The person's memory choice, read from `users.settings.assistant`. Only `POST /ai/memory/mode`
 * writes it (the settings PATCH refuses these fields), and every background write is fenced by
 * `epoch` (`fenceMemoryState`): a job that started under another epoch writes nothing.
 */
import { eq } from "drizzle-orm";
import type { MemoryMode } from "@cadence/contracts/memory";
import { users } from "../../../db/schema";
import type { Tx } from "../../../types/db";

export interface MemoryState {
    /** What the person chose, or `null`: not chosen yet, which behaves as Basic (the page can still tell the two apart). */
    stored: MemoryMode | null;
    /** The mode in effect everywhere: learning, recall, the profile, `usableBy`. An unchosen memory is Basic. */
    mode: MemoryMode;
    epoch: number;
    /** Learning reads only what was said after this (Clear, or the release that made Basic the default). */
    notBefore: string | null;
}

/** Not chosen yet is Basic. */
export const resolveMode = (stored: MemoryMode | null | undefined): MemoryMode => stored ?? "basic";

/** What learning and recall may use: Basic or Full, chosen or by default (`null` counts as Basic). */
export const isLearning = (mode: MemoryMode | null | undefined): mode is "basic" | "full" | null | undefined => mode !== "off";

/** Full: the only state that records or applies how the person plans (when they like to do things, which offers help). */
export const planningOn = (state: Pick<MemoryState, "mode">): boolean => state.mode === "full";

export function memoryStateOf(settings: unknown): MemoryState {
    const assistant = (settings as { assistant?: Record<string, unknown> } | null)?.assistant;
    const raw = assistant?.memoryMode;
    const stored = raw === "off" || raw === "basic" || raw === "full" ? raw : null;
    const mode = resolveMode(stored);
    return {
        stored,
        mode,
        epoch: typeof assistant?.memoryEpoch === "number" ? assistant.memoryEpoch : 0,
        notBefore: typeof assistant?.memoryLearningNotBefore === "string" ? assistant.memoryLearningNotBefore : null,
    };
}

export async function readMemoryState(tx: Tx, userId: string): Promise<MemoryState> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    return memoryStateOf(row?.settings);
}

/**
 * The epoch check for a background write: holds the user row (FOR SHARE) until the transaction ends, so a mode
 * change (`writeMode`, FOR UPDATE) either committed before and is seen here, or waits until these writes commit.
 */
export async function fenceMemoryState(tx: Tx, userId: string): Promise<MemoryState> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1).for("share");
    return memoryStateOf(row?.settings);
}
