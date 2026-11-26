import {
    CHAT_IMAGE_LIMITS,
    CHAT_IMAGE_MEDIA_TYPE,
    CHAT_PDF_MEDIA_TYPE,
    MAX_MESSAGE_CHARS as SHARED_MAX_MESSAGE_CHARS,
    MAX_PARTS_PER_MESSAGE as SHARED_MAX_PARTS_PER_MESSAGE,
    parseChatImageUrl,
} from "@cadence/contracts/ai";
import { AppError } from "../../../platform/errors";

export const MAX_MESSAGE_CHARS = SHARED_MAX_MESSAGE_CHARS;

export const MAX_PARTS_PER_MESSAGE = SHARED_MAX_PARTS_PER_MESSAGE;

export const MAX_PART_BYTES = 16_000;

export const MAX_HISTORY_TURNS = 40;

export const HISTORY_DROP_STEP = 16;

export const MAX_OUTPUT_TOKENS = 2_048;

export const MAX_TOOL_STEPS = 15;

const encoder = new TextEncoder();

function textLengthOfPart(part: unknown): number {
    if (typeof part === "string") return part.length;
    if (part && typeof part === "object") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text.length;
    }
    return 0;
}

function byteSizeOfPart(part: unknown): number {
    const serialized = typeof part === "string" ? part : JSON.stringify(part ?? "");
    return encoder.encode(serialized).length;
}

function isAttachmentReference(part: unknown): boolean {
    if (!part || typeof part !== "object") return false;
    const { type, mediaType, url, ...rest } = part as Record<string, unknown>;
    return (
        type === "file" &&
        (mediaType === CHAT_IMAGE_MEDIA_TYPE || mediaType === CHAT_PDF_MEDIA_TYPE) &&
        parseChatImageUrl(url) !== null &&
        Object.keys(rest).length === 0
    );
}

export function assertMessageWithinCaps(
    message: { role: string; parts?: unknown[] },
    maxImages: number = CHAT_IMAGE_LIMITS.perMessage,
): void {
    const parts = message.parts;
    if (!parts) return;

    const files = parts.filter((part) => (part as { type?: unknown } | null)?.type === "file");
    if (!files.every(isAttachmentReference)) {
        throw new AppError(400, "INVALID_REQUEST", "Only attached files can be sent.");
    }
    if (files.length > maxImages) {
        throw new AppError(400, "INVALID_REQUEST", `Up to ${maxImages} files per message.`);
    }

    if (parts.length > MAX_PARTS_PER_MESSAGE) {
        throw new AppError(400, "INVALID_REQUEST", `Message has too many parts (max ${MAX_PARTS_PER_MESSAGE}).`);
    }

    let totalChars = 0;
    for (const part of parts) {
        if (byteSizeOfPart(part) > MAX_PART_BYTES) {
            throw new AppError(400, "INVALID_REQUEST", `A message part is too large (max ${MAX_PART_BYTES} bytes).`);
        }
        totalChars += textLengthOfPart(part);
    }

    if (totalChars > MAX_MESSAGE_CHARS) {
        throw new AppError(400, "INVALID_REQUEST", `Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);
    }
}

export function historyWindowStart(total: number): number {
    if (total <= MAX_HISTORY_TURNS) return 0;
    return Math.ceil((total - MAX_HISTORY_TURNS) / HISTORY_DROP_STEP) * HISTORY_DROP_STEP;
}

export function startAtUser<T extends { role: string }>(history: T[]): T[] {
    const first = history.findIndex((m) => m.role === "user");
    return first < 0 ? [] : history.slice(first);
}
