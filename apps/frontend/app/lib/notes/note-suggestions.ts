export interface NoteSuggestion {
    id: string;
    type: "structure" | "actionable" | "format";
    title: string;
    description: string;
    insert?: string;
    insertAt?: "cursor" | "end";
    command?: "heading" | "checklist" | "convert-subtasks";
}

function suggestHeadings(body: string): NoteSuggestion | null {
    const lines = body.split("\n");
    const hasHeading = lines.some((l) => /^#{1,6}\s+/.test(l));
    const wordCount = body.trim().split(/\s+/).length;

    if (!hasHeading && wordCount > 100) {
        return {
            id: "add-headings",
            type: "structure",
            title: "Add headings",
            description: "This note is getting long. Headings would break it into sections.",
            command: "heading",
        };
    }
    return null;
}

function suggestCheckboxes(body: string): NoteSuggestion | null {
    const actionablePatterns = /^[-*]\s+(need to|must|should|remember to|don't forget|TODO|FIXME)/im;
    const hasCheckboxes = /^- \[[ x]\]/m.test(body);

    if (actionablePatterns.test(body) && !hasCheckboxes) {
        return {
            id: "convert-to-checklist",
            type: "actionable",
            title: "Convert to checklist",
            description: "Some lines look like action items. A checklist lets you tick them off.",
            command: "checklist",
        };
    }
    return null;
}

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

function suggestSubtaskConversion(body: string): NoteSuggestion | null {
    const bulletLines = body.split("\n").filter((l) => /^[-*+]\s+\S/.test(l.trim()));
    if (bulletLines.length >= 5) {
        return {
            id: "convert-to-subtasks",
            type: "actionable",
            title: "Convert items to subtasks",
            description: `${bulletLines.length} list lines could become trackable subtasks.`,
            command: "convert-subtasks",
        };
    }
    return null;
}

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
