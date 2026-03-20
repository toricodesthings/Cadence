/**
 * Client-side note suggestion engine.
 * Analyzes note body and returns quiet, optional, non-intrusive suggestions
 * that help the user structure their writing without any AI dependency.
 *
 * Server-assisted AI suggestions can be layered on top in the future.
 */

export interface NoteSuggestion {
    id: string;
    type: "structure" | "actionable" | "format";
    title: string;
    description: string;
    /** Suggested text to insert (if applicable) */
    insert?: string;
    /** Where to insert (if applicable) */
    insertAt?: "cursor" | "end";
}

/** Detect unstructured long notes that could benefit from headings. */
function suggestHeadings(body: string): NoteSuggestion | null {
    const lines = body.split("\n");
    const hasHeading = lines.some((l) => /^#{1,6}\s+/.test(l));
    const wordCount = body.trim().split(/\s+/).length;

    if (!hasHeading && wordCount > 100) {
        return {
            id: "add-headings",
            type: "structure",
            title: "Add headings",
            description: "This note is getting long — consider adding ## headings to organize sections.",
        };
    }
    return null;
}

/** Detect actionable lines (todo-like items without checkboxes). */
function suggestCheckboxes(body: string): NoteSuggestion | null {
    const actionablePatterns = /^[-*]\s+(need to|must|should|remember to|don't forget|TODO|FIXME)/im;
    const hasCheckboxes = /^- \[[ x]\]/m.test(body);

    if (actionablePatterns.test(body) && !hasCheckboxes) {
        return {
            id: "convert-to-checklist",
            type: "actionable",
            title: "Convert to checklist",
            description: "Some lines look like action items — use checkboxes to track them.",
        };
    }
    return null;
}

/** Suggest splitting very long single-paragraph notes. */
function suggestParagraphBreaks(body: string): NoteSuggestion | null {
    const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim());
    if (paragraphs.length === 1 && body.trim().split(/\s+/).length > 150) {
        return {
            id: "break-paragraphs",
            type: "format",
            title: "Break into paragraphs",
            description: "This is one large block of text — adding paragraph breaks improves readability.",
        };
    }
    return null;
}

/** Detect notes with many bullet points that could become subtasks. */
function suggestSubtaskConversion(body: string): NoteSuggestion | null {
    const bulletLines = body.split("\n").filter((l) => /^[-*+]\s+\S/.test(l.trim()));
    if (bulletLines.length >= 5) {
        return {
            id: "convert-to-subtasks",
            type: "actionable",
            title: "Convert items to subtasks",
            description: `${bulletLines.length} bullet points detected — consider converting some to trackable subtasks.`,
        };
    }
    return null;
}

/**
 * Run all suggestion checks against the note body.
 * Returns at most 2 suggestions to keep UI quiet.
 */
export function deriveNoteSuggestions(body: string): NoteSuggestion[] {
    if (!body || body.trim().length < 50) return [];

    const all = [
        suggestHeadings(body),
        suggestCheckboxes(body),
        suggestParagraphBreaks(body),
        suggestSubtaskConversion(body),
    ].filter((s): s is NoteSuggestion => s !== null);

    return all.slice(0, 2);
}
