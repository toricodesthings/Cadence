/**
 * Upload check for a PDF sent to the assistant. The Worker never parses a PDF (the
 * model provider reads its text); this only refuses what can't work: not a PDF,
 * password-protected, or over the page cap.
 */
import { CHAT_FILE_LIMITS } from "@cadence/contracts/ai";
import { AppError } from "./errors";

const latin1 = new TextDecoder("latin1");

/** shortcut: heuristic page count from the raw bytes, misses compressed page trees (then `pages` is null and the file is accepted); upgrade if a PDF ever blows the context window in logs (`ai_stream_error` with a context-length code). */
export function checkPdf(bytes: Uint8Array): { pages: number | null } {
    if (bytes.length < 5 || latin1.decode(bytes.subarray(0, 5)) !== "%PDF-") {
        throw new AppError(415, "FILE_UNSUPPORTED", "Only PDFs and photos can be sent");
    }
    const text = latin1.decode(bytes);
    if (/\/Encrypt\b/.test(text)) throw new AppError(400, "FILE_LOCKED", "That PDF is password-protected");

    // The page tree root is the `/Type /Pages` dictionary without a `/Parent`; its `/Count` is the total.
    let pages: number | null = null;
    for (const dict of text.matchAll(/<<(?:(?!<<|>>)[\s\S])*?>>/g)) {
        const body = dict[0];
        if (!/\/Type\s*\/Pages\b/.test(body) || /\/Parent\b/.test(body)) continue;
        const count = /\/Count\s+(\d+)/.exec(body);
        if (count) pages = Number(count[1]);
        break;
    }
    if (pages !== null && pages > CHAT_FILE_LIMITS.pdfMaxPages) {
        throw new AppError(413, "FILE_TOO_LONG", `That PDF is longer than ${CHAT_FILE_LIMITS.pdfMaxPages} pages`);
    }
    return { pages };
}
