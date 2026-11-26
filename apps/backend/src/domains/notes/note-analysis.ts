import removeMarkdown from "remove-markdown";

export function generateExcerpt(body: string, maxLength = 120): string {
    const plain = removeMarkdown(body).replace(/\s+/g, " ").trim();
    if (plain.length <= maxLength) return plain;
    const cut = plain.lastIndexOf(" ", maxLength);
    return plain.slice(0, cut > 0 ? cut : maxLength) + "…";
}
