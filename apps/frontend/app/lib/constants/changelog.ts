export type ChangelogGlyph = "release" | "fix" | "tune";

export interface ChangelogGroup {
    kind: "added" | "changed" | "removed" | "fixed";
    items: string[];
}

export interface ChangelogEntry {
    version: string;
    date?: string;
    title: string;
    groups: ChangelogGroup[];
    glyph: ChangelogGlyph;
}

declare const __CADENCE_CHANGELOG__: ChangelogEntry[];

export const CADENCE_CHANGELOG: ChangelogEntry[] = __CADENCE_CHANGELOG__;
