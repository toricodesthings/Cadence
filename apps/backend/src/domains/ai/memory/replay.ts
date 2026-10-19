/**
 * What an earlier turn's memory reads may still tell the model. A `recall` or `search_past_chats` result stays in the
 * stored history, but a turn replays it only while the person's mode still allows what it shows: after Full → Basic,
 * or a Forget, the model gets `{ redacted: true }` instead. The stored history is untouched.
 */
import type { MemoryMode } from "@cadence/contracts/memory";

type Part = { type?: unknown; state?: unknown; output?: unknown };
type Message = { role: string; parts: unknown[] };

const isRead = (part: Part, tool: string) => part?.type === `tool-${tool}` && part.state === "output-available" && !!part.output && typeof part.output === "object";

/** The fact ids replayed `recall` results cite. */
export function citedFactIds(messages: readonly Message[]): string[] {
    const ids = new Set<string>();
    for (const message of messages) {
        if (message.role !== "assistant") continue;
        for (const part of message.parts as Part[]) {
            if (!isRead(part, "recall")) continue;
            for (const fact of ((part.output as { facts?: { id?: unknown }[] }).facts ?? [])) if (typeof fact.id === "string") ids.add(fact.id);
        }
    }
    return [...ids];
}

/**
 * Replaces the memory reads the person's mode no longer allows. `allowed` is the cited ids that may still be read
 * (active, and usable by the mode); with memory off nothing may be.
 */
export function redactMemoryReads<T extends Message>(messages: readonly T[], mode: MemoryMode, allowed: ReadonlySet<string>): T[] {
    const redacted = { redacted: true };
    return messages.map((message) => {
        if (message.role !== "assistant") return message;
        let changed = false;
        const parts = (message.parts as Part[]).map((part) => {
            if (isRead(part, "search_past_chats") && mode === "off") {
                changed = true;
                return { ...part, output: redacted };
            }
            if (isRead(part, "recall")) {
                const facts = (part.output as { facts?: { id?: unknown }[] }).facts ?? [];
                if (mode === "off" || facts.some((fact) => typeof fact.id !== "string" || !allowed.has(fact.id))) {
                    changed = true;
                    return { ...part, output: redacted };
                }
            }
            return part;
        });
        return changed ? { ...message, parts } : message;
    });
}
