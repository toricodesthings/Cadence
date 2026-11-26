import { eq } from "drizzle-orm";
import type { MemoryMode } from "@cadence/contracts/memory";
import { users } from "../../../db/schema";
import type { Tx } from "../../../types/db";

export interface MemoryState {
    stored: MemoryMode | null;
    mode: MemoryMode;
    epoch: number;
    notBefore: string | null;
}

export const resolveMode = (stored: MemoryMode | null | undefined): MemoryMode => stored ?? "basic";

export const isLearning = (mode: MemoryMode | null | undefined): mode is "basic" | "full" | null | undefined =>
    mode !== "off";

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

export async function fenceMemoryState(tx: Tx, userId: string): Promise<MemoryState> {
    const [row] = await tx
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for("share");
    return memoryStateOf(row?.settings);
}
