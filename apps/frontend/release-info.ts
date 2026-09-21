import { readFileSync } from "node:fs";
import type { ChangelogEntry, ChangelogGroup } from "./app/lib/constants/changelog.ts";

// Build-time release info. The version lives only in the root package.json and the release
// notes only in the root CHANGELOG.md (Keep a Changelog); vite.config.ts injects both.

const VERSION_HEADING = /^\[?(\d+\.\d+\.\d+)\]?(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/;
const MAX_BULLET_LENGTH = 120;
const GROUP_KINDS = new Set<ChangelogGroup["kind"]>(["added", "changed", "removed", "fixed"]);

/** "0.9.1" → "v0.9.1 Beta" while Cadence is pre-1.0. */
function formatVersionLabel(version: string): string {
    return version.startsWith("0.") ? `v${version} Beta` : `v${version}`;
}

/**
 * One entry per released version, newest first. `[Unreleased]` is skipped.
 * Title = the summary line under the heading; groups = the bullets under each `###` section.
 * Glyph: Added/Removed → release, Changed → tune, otherwise fix.
 * Throws when any bullet (including Unreleased) runs past one line, so the page stays scannable.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
    const tooLong = markdown.split("\n").filter((line) => line.startsWith("- ") && line.length - 2 > MAX_BULLET_LENGTH);
    if (tooLong.length > 0) {
        throw new Error(`CHANGELOG.md bullets must be ${MAX_BULLET_LENGTH} characters or fewer:\n${tooLong.join("\n")}`);
    }

    return markdown.split(/^## /m).slice(1).flatMap((block) => {
        const [heading = "", ...lines] = block.split("\n");
        const [, version, date] = VERSION_HEADING.exec(heading) ?? [];
        if (!version) return [];

        const groups: ChangelogGroup[] = [];
        let summary: string | undefined;

        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith("### ")) {
                const kind = line.slice(4).trim().toLowerCase() as ChangelogGroup["kind"];
                if (GROUP_KINDS.has(kind)) groups.push({ kind, items: [] });
            } else if (line.startsWith("- ")) {
                groups.at(-1)?.items.push(line.slice(2).trim());
            } else if (line && !summary && !line.startsWith("[")) {
                summary = line;
            }
        }

        const kinds = new Set(groups.map((group) => group.kind));
        const glyph = kinds.has("added") || kinds.has("removed") ? "release" : kinds.has("changed") ? "tune" : "fix";

        return [{
            version: formatVersionLabel(version),
            date,
            title: summary ?? "Improvements and fixes",
            groups: groups.filter((group) => group.items.length > 0),
            glyph,
        }];
    });
}

export function readReleaseInfo(repoRoot: URL) {
    const { version } = JSON.parse(readFileSync(new URL("package.json", repoRoot), "utf8")) as { version?: string };
    if (!version) throw new Error("Root package.json is missing \"version\".");

    return {
        version: formatVersionLabel(version),
        changelog: parseChangelog(readFileSync(new URL("CHANGELOG.md", repoRoot), "utf8")),
    };
}
