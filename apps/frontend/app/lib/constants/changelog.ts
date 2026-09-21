export type ChangelogGlyph = "release" | "fix" | "tune";

export interface ChangelogGroup {
    kind: "added" | "changed" | "removed" | "fixed";
    items: string[];
}

export interface ChangelogEntry {
    version: string;
    /** ISO date (YYYY-MM-DD) from the release heading. */
    date?: string;
    title: string;
    groups: ChangelogGroup[];
    glyph: ChangelogGlyph;
}

// Injected at build time from the root CHANGELOG.md (see vite.config.ts). Don't edit entries here.
declare const __CADENCE_CHANGELOG__: ChangelogEntry[];

/**
 * Newest first.
 */
export const CADENCE_CHANGELOG: ChangelogEntry[] = __CADENCE_CHANGELOG__;
