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
    /** `null`: not chosen yet (the picker is waiting). Treated as off everywhere. */
    mode: MemoryMode | null;
    epoch: number;
}

/** What learning and recall may use: only a chosen Basic or Full. */
export const isLearning = (mode: MemoryMode | null): mode is "basic" | "full" => mode === "basic" || mode === "full";

export function memoryStateOf(settings: unknown): MemoryState {
    const assistant = (settings as { assistant?: { memoryMode?: unknown; memoryEpoch?: unknown } } | null)?.assistant;
    const mode = assistant?.memoryMode;
    return {
        mode: mode === "off" || mode === "basic" || mode === "full" ? mode : null,
        epoch: typeof assistant?.memoryEpoch === "number" ? assistant.memoryEpoch : 0,
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
