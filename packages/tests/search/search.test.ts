import { describe, expect, it } from "vitest";
import { createSearchIndex } from "@cadence/search";
import { searchTerms } from "@cadence/search/terms";

const documents = [
    { id: "release", title: "Implement 0.31.0", list: "CS App Projects", section: "Cadence" },
    { id: "next", title: "Implement 0.32.0" },
    { id: "digit", title: "Implement 0.31.01" },
    { id: "major", title: "Implement 10.31.0" },
    { id: "component", title: "Implement 0.31.0.1" },
    { id: "prerelease", title: "Implement 0.31.0-rc1" },
    { id: "parent", title: "Parent meeting" },
    { id: "rent", title: "Pay rent" },
    { id: "course", title: "COMP3005 Assignment 1" },
    { id: "note", title: "Retrospective", notes: "Review 0.31.0 and follow up" },
    { id: "passport", title: "Renew passport", subtasks: "Book appointment", tags: "Travel", notes: "Bring photograph" },
];
const index = createSearchIndex(documents);
const ids = (query: string, options = {}) => index.search(query, options).map((hit) => hit.id);

describe("shared conservative search", () => {
    it.each(["implementation 0.31.0", "implementing v0.31.0", '“implementation 0.31.0”,', "CS App Projects Cadence implementation 0.31.0"])("finds %s", (query) => {
        expect(ids(query)).toEqual(["release"]);
    });
    it("ranks title identity ahead of a note reference", () => expect(ids("0.31.0")).toEqual(["release", "note"]));
    it.each(["0.33.0", "0.31", "0,31.0", "0.31.0 0.32.0", "implementation nonexistent", "!!!", "_"])("never invents a result for %s", (query) => {
        expect(ids(query, { prefix: true, fuzzy: true })).toEqual([]);
    });
    it("requires every word even after the eighth", () => {
        const long = createSearchIndex([{ id: "long", title: "one two three four five six seven eight" }]);
        expect(long.search("one two three four five six seven eight nonexistent")).toEqual([]);
    });
    it("does not turn rent into parent, even with spelling tolerance", () => expect(ids("rent", { fuzzy: true, prefix: true })).toEqual(["rent"]));
    it("keeps numeric course identity, with a separate course family alias", () => {
        expect(ids("COMP3005 assignment")).toEqual(["course"]);
        expect(ids("comp assignment")).toEqual(["course"]);
        expect(ids("COMP300 assignment", { fuzzy: true, prefix: true })).toEqual([]);
    });
    it("uses cross-field AND and word forms for subtasks, tags and notes", () => {
        expect(ids("passport booking travel photograph")).toEqual(["passport"]);
        expect(index.search("passport booking")[0]?.fields).toContain("subtasks");
    });
    it("allows a one-letter typo only as an approximate result", () => {
        expect(index.search("implmentation 0.31.0", { fuzzy: true })[0]).toMatchObject({ id: "release", approximate: true });
        expect(ids("passpork")).toEqual([]);
        expect(index.search("passpork", { fuzzy: true })[0]).toMatchObject({ id: "passport", approximate: true });
        expect(ids("passxxxx", { fuzzy: true })).toEqual([]);
    });
    it("keeps distinct derivational meanings separate", () => {
        const meanings = createSearchIndex([{ id: "a", title: "Review university organization" }, { id: "b", title: "Review universe organ" }]);
        expect(meanings.search("universities organizations").map((hit) => hit.id)).toEqual(["a"]);
        expect(meanings.search("universes organs").map((hit) => hit.id)).toEqual(["b"]);
    });
    it("matches a one-letter typo before stemming a longer inflection", () => {
        const inflected = createSearchIndex([{ id: "a", title: "Booking appointment" }]);
        expect(inflected.search("booing", { fuzzy: true })[0]).toMatchObject({ id: "a", approximate: true });
    });
    it("allows only the last ordinary word to be a prefix", () => {
        expect(ids("renew pass", { prefix: true })).toEqual(["passport"]);
        expect(ids("rene passport", { prefix: true })).toEqual([]);
    });
    it("has no stale or cross-index documents after rebuilding", () => {
        expect(createSearchIndex([{ id: "release", title: "Buy groceries" }]).search("0.31.0")).toEqual([]);
        expect(ids("0.31.0")).toContain("release");
    });
    it("handles ordinary title punctuation without weakening numeric identifiers", () => {
        const prose = createSearchIndex([{ id: "a", title: "🚀 Implement (0.31.0). Follow-up with doctor's office" }]);
        expect(prose.search("implementation 0.31.0 follow up doctor").map((hit) => hit.id)).toEqual(["a"]);
        expect(prose.search("0.31", { prefix: true, fuzzy: true })).toEqual([]);
    });
    it("keeps symbols literal and supports unicode words", () => {
        const symbols = createSearchIndex([{ id: "a", title: "C++ résumé 100%" }, { id: "b", title: "C resume 1000" }]);
        expect(symbols.search("C++ résumé").map((hit) => hit.id)).toEqual(["a"]);
        expect(symbols.search("100%", { prefix: true, fuzzy: true }).map((hit) => hit.id)).toEqual(["a"]);
        expect(searchTerms("!!!")).toEqual([]);
    });
});
