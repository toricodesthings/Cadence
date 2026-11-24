/** Words in a note body or its visible text. */
export function countWords(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Count headings (lines starting with 1–6 #s and a space). */
export function countHeadings(body: string): number {
    return (body.match(/^#{1,6}\s+/gm) || []).length;
}
