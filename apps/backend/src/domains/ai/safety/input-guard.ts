/**
 * AI-specific input caps and validation (docs/ai_upgrade/09 §2.1).
 *
 * The global 100 KB body limit (index.ts) already bounds the request; these caps
 * are tighter, AI-specific bounds that reject resource-exhaustion payloads and
 * keep context size predictable. Oversized input is rejected via the EXISTING 400
 * path (`AppError(400, "INVALID_REQUEST", …)`), so the route's normal error
 * envelope and logging cover it — no new error channel.
 */

import { AppError } from "../../../platform/errors";

/** Max summed length of all text parts in a single message. */
export const MAX_MESSAGE_CHARS = 8_000;

/** Max number of `parts` entries in a single message. */
export const MAX_PARTS_PER_MESSAGE = 32;

/** Max UTF-8 byte size of any single part (after JSON serialization). */
export const MAX_PART_BYTES = 16_000;

/** Max conversation turns loaded into model context (bounds prompt size & cost). */
export const MAX_HISTORY_TURNS = 40;

/** Max output tokens the model may emit per turn. */
export const MAX_OUTPUT_TOKENS = 2_048;

/** Max tool-loop iterations per turn (bounds runaway tool spend). */
export const MAX_TOOL_STEPS = 12;

const encoder = new TextEncoder();

/** Extract the displayable text length of a single UI message part. */
function textLengthOfPart(part: unknown): number {
    if (typeof part === "string") return part.length;
    if (part && typeof part === "object") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text.length;
    }
    return 0;
}

/** UTF-8 byte size of a part's serialized form. */
function byteSizeOfPart(part: unknown): number {
    const serialized = typeof part === "string" ? part : JSON.stringify(part ?? "");
    return encoder.encode(serialized).length;
}

/**
 * Throw `AppError(400, "INVALID_REQUEST")` when a message exceeds the AI-specific
 * char / parts-count / per-part-size caps. Sums text-part lengths for the char
 * cap. A message without `parts` (legacy `content`-only shape) passes — the schema
 * layer handles that surface.
 */
export function assertMessageWithinCaps(message: { role: string; parts?: unknown[] }): void {
    const parts = message.parts;
    if (!parts) return;

    if (parts.length > MAX_PARTS_PER_MESSAGE) {
        throw new AppError(
            400,
            "INVALID_REQUEST",
            `Message has too many parts (max ${MAX_PARTS_PER_MESSAGE}).`,
        );
    }

    let totalChars = 0;
    for (const part of parts) {
        if (byteSizeOfPart(part) > MAX_PART_BYTES) {
            throw new AppError(
                400,
                "INVALID_REQUEST",
                `A message part is too large (max ${MAX_PART_BYTES} bytes).`,
            );
        }
        totalChars += textLengthOfPart(part);
    }

    if (totalChars > MAX_MESSAGE_CHARS) {
        throw new AppError(
            400,
            "INVALID_REQUEST",
            `Message is too long (max ${MAX_MESSAGE_CHARS} characters).`,
        );
    }
}

/**
 * Return the last `MAX_HISTORY_TURNS` items, bounding how much conversation is
 * loaded into model context. Pure; never mutates the input array.
 */
export function clampHistory<T>(history: T[]): T[] {
    if (history.length <= MAX_HISTORY_TURNS) return history.slice();
    return history.slice(history.length - MAX_HISTORY_TURNS);
}
