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
 * Generates a short excerpt from markdown content.
 * Strips headings, bullets, and formatting for clean preview text.
 */
export function generateNoteExcerpt(markdown: string, maxLength = 120): string {
  if (!markdown) return "";
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")          // headings
        .replace(/^[-*+]\s+(\[[ x]\]\s+)?/, "") // bullets/checklists
        .replace(/^\d+\.\s+/, "")            // numbered lists
        .replace(/^>\s+/, "")                // quotes
        .replace(/\*\*(.+?)\*\*/g, "$1")    // bold
        .replace(/\*(.+?)\*/g, "$1")        // italic
        .replace(/`(.+?)`/g, "$1")          // inline code
        .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
        .trim()
    )
    .filter((line) => line.length > 0 && line !== "---");

  const joined = lines.join(" ");
  if (joined.length <= maxLength) return joined;
  return joined.slice(0, maxLength - 1) + "…";
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
