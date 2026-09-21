/**
 * Note outline extraction — derives heading structure from markdown.
 */

export interface NoteHeading {
  level: number;      // 1-6
  text: string;
  lineIndex: number;  // 0-based line number in the source
}

/**
 * Extracts markdown headings from a note body. O(n) single pass.
 */
export function extractNoteOutline(markdown: string): NoteHeading[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const headings: NoteHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        lineIndex: i,
      });
    }
  }
  return headings;
}

/**
 * Counts words in a markdown string (rough count).
 */
export function countWords(markdown: string): number {
  if (!markdown) return 0;
  return markdown
    .replace(/[#*`>\[\]()~_\-|]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
