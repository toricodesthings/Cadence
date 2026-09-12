import { readFileSync } from "node:fs";
import type { ChangelogEntry } from "./app/lib/constants/changelog.ts";

// Build-time release info. The version lives only in the root package.json and the release
// notes only in the root CHANGELOG.md (Keep a Changelog); vite.config.ts injects both.

const VERSION_HEADING = /^\[?(\d+\.\d+\.\d+)\]?/;

/** "0.9.1" → "v0.9.1 Beta" while Cadence is pre-1.0. */
export function formatVersionLabel(version: string): string {
    return version.startsWith("0.") ? `v${version} Beta` : `v${version}`;
}

/**
 * One entry per released version, newest first. `[Unreleased]` is skipped.
 * Title = the summary line under the heading; description = the bullets.
 * Glyph: Added/Removed → release, Changed → tune, otherwise fix.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
    return markdown.split(/^## /m).slice(1).flatMap((block) => {
        const [heading = "", ...lines] = block.split("\n");
        const version = VERSION_HEADING.exec(heading)?.[1];
        if (!version) return [];

        const sections = new Set<string>();
        const bullets: string[] = [];
        let summary: string | undefined;

        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith("### ")) sections.add(line.slice(4).trim().toLowerCase());
            else if (line.startsWith("- ")) bullets.push(line.slice(2).trim());
            else if (line && !summary && !line.startsWith("[")) summary = line;
        }

        const title = summary ?? bullets.shift() ?? "Improvements and fixes";
        const glyph = sections.has("added") || sections.has("removed")
            ? "release"
            : sections.has("changed") ? "tune" : "fix";

        return [{ version: formatVersionLabel(version), title, description: bullets.join(" "), glyph }];
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
