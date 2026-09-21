import { describe, expect, it } from "vitest";
import { parseChangelog } from "../release-info";

describe("parseChangelog", () => {
    it("keeps the summary, date and grouped bullets, and skips Unreleased", () => {
        const [entry, ...rest] = parseChangelog([
            "## [Unreleased]", "", "### Added", "", "- Soon", "",
            "## [0.2.0] - 2026-09-21", "", "A calmer Today", "",
            "### Added", "", "- One", "- Two", "", "### Fixed", "", "- Three",
        ].join("\n"));

        expect(rest).toHaveLength(0);
        expect(entry).toEqual({
            version: "v0.2.0 Beta",
            date: "2026-09-21",
            title: "A calmer Today",
            groups: [{ kind: "added", items: ["One", "Two"] }, { kind: "fixed", items: ["Three"] }],
            glyph: "release",
        });
    });

    it("rejects bullets longer than one line", () => {
        expect(() => parseChangelog(`## [0.1.0]\n\n### Fixed\n\n- ${"x".repeat(121)}`)).toThrow(/120 characters/);
    });
});
