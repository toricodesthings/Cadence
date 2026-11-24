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
