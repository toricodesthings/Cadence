export type ChangelogGlyph = "release" | "fix" | "tune";

export interface ChangelogEntry {
    version: string;
    title: string;
    description: string;
    glyph: ChangelogGlyph;
}

// Injected at build time from the root CHANGELOG.md (see vite.config.ts). Don't edit entries here.
declare const __CADENCE_CHANGELOG__: ChangelogEntry[];

/**
 * Newest first.
 */
export const CADENCE_CHANGELOG: ChangelogEntry[] = __CADENCE_CHANGELOG__;
