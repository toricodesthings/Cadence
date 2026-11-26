export function countWords(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function countHeadings(body: string): number {
    return (body.match(/^#{1,6}\s+/gm) || []).length;
}
