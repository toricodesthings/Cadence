export type ChangelogGlyph = "release" | "fix";

export interface ChangelogEntry {
    version: string;
    title: string;
    description: string;
    glyph: ChangelogGlyph;
}

/**
 * Update this list on every public release.
 * Keep the newest entry first.
 */
export const CADENCE_CHANGELOG: ChangelogEntry[] = [
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
