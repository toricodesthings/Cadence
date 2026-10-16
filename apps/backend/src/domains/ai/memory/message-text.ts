/** The words in a stored message's parts, joined by line. Non-text parts are skipped. */
export const textOf = (parts: unknown): string =>
    (Array.isArray(parts) ? parts : [])
        .map((p) => (p && typeof p === "object" && (p as { type?: unknown }).type === "text" ? String((p as { text?: unknown }).text ?? "") : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
