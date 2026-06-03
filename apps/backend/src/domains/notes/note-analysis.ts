/** Note analysis and metrics extraction helpers. */

/** Generate a plain-text excerpt from markdown (first ~120 chars). */
export function generateExcerpt(body: string, maxLength = 120): string {
    // Strip markdown syntax for a clean preview
    const plain = body
        .replace(/^#{1,6}\s+/gm, "") // headings
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") // bold/italic
        .replace(/`{1,3}[^`]*`{1,3}/g, "") // inline code / code blocks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
        .replace(/^[-*+]\s+/gm, "") // list markers
        .replace(/^\d+\.\s+/gm, "") // ordered list markers
        .replace(/\n{2,}/g, " ") // collapse paragraph breaks
        .replace(/\n/g, " ")
        .trim();
    if (plain.length <= maxLength) return plain;
    // Cut at word boundary
    const cut = plain.lastIndexOf(" ", maxLength);
    return plain.slice(0, cut > 0 ? cut : maxLength) + "…";
}

/** Count words in markdown body. */
export function countWords(body: string): number {
    if (!body.trim()) return 0;
    return body.trim().split(/\s+/).length;
}

/** Count headings (lines starting with #). */
export function countHeadings(body: string): number {
    return (body.match(/^#{1,6}\s+/gm) || []).length;
}
