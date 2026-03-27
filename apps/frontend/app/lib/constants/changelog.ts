export type ChangelogGlyph = "release" | "fix" | "tune";

export interface ChangelogEntry {
    version: string;
    title: string;
    description: string;
    glyph: ChangelogGlyph;
}

/**
 * Keep the newest entry first.
 */
export const CADENCE_CHANGELOG: ChangelogEntry[] = [
    {
        version: "v0.7 Beta",
        title: "Better themes, and personalization",
        description: "Themes and personalization have been vastly improved.",
        glyph: "tune",
    },
    {
        version: "v0.6 Beta",
        title: "Events and minor tweaks",
        description: "Personal events support in the calendar, and various minor improvements and bug fixes across the app.",
        glyph: "fix",
    },
    {
        version: "v0.5 Beta",
        title: "The NLP Parser is here!",
        description: "Cadence can now understand natural language input across the app, making it easier than ever to capture and edit tasks on the go.",
        glyph: "release",
    },
    {
        version: "v0.4 Beta",
        title: "Holding that actually Holds",
        description: "Big changes to the holding page and task editor, capture is seamless and frictionless, and the task editor is more intuitive and powerful than ever.",
        glyph: "fix",
    },
    {
        version: "v0.3 Beta",
        title: "Task and Planner improvements",
        description: "New features and quality-of-life improvements to task management, including better support for all-day tasks, and revamp to the Upcoming and Today pages.",
        glyph: "fix",
    },
    {
        version: "v0.2 Beta",
        title: "Major bug fixes",
        description: "Stability improvements across the pre-release app, with a focus on fixing rough edges and regressions.",
        glyph: "fix",
    },
    {
        version: "v0.1 Beta",
        title: "Initial Release",
        description: "The first public Cadence beta, establishing the core planning experience and initial support pages.",
        glyph: "release",
    },
];
