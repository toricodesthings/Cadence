export const textOf = (parts: unknown): string =>
    (Array.isArray(parts) ? parts : [])
        .map((p) =>
            p && typeof p === "object" && (p as { type?: unknown }).type === "text"
                ? String((p as { text?: unknown }).text ?? "")
                : "",
        )
        .filter(Boolean)
        .join("\n")
        .trim();
