/** Note analysis and metrics extraction helpers. */
import removeMarkdown from "remove-markdown";

/** Generate a plain-text excerpt from markdown (first ~120 chars). */
export function generateExcerpt(body: string, maxLength = 120): string {
    const plain = removeMarkdown(body).replace(/\s+/g, " ").trim();
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
