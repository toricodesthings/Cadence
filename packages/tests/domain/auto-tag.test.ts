import { describe, expect, it } from "vitest";
import { foldName, tagsForPlace } from "@cadence/domain/auto-tag";

const tag = (id: string, name: string, sortOrder = 0) => ({ id, name, sortOrder });

describe("auto-tag", () => {
    it("folds case, spaces, hyphens and accents", () => {
        for (const n of ["COMPUTER2000", "Computer 2000", "computer-2000"]) expect(foldName(n)).toBe("computer2000");
        expect(foldName("Café")).toBe("cafe");
    });
    it("never crosses COMP2000 and COMP2001", () => {
        expect(tagsForPlace(["COMP2001"], [tag("a", "COMP2000")])).toEqual([]);
    });
    it("never matches an empty or punctuation-only name", () => {
        expect(tagsForPlace(["--", "", null, undefined], [tag("a", "!!"), tag("b", "")])).toEqual([]);
    });
    it("lower sortOrder wins when tags fold alike", () => {
        expect(tagsForPlace(["x y"], [tag("a", "X-Y", 2), tag("b", "x y", 1)])).toEqual(["b"]);
    });
    it("list and section give two ids; the same name gives one", () => {
        const tags = [tag("u", "University"), tag("c", "COMPUTER 2000")];
        expect(tagsForPlace(["University", "COMPUTER2000"], tags)).toEqual(["u", "c"]);
        expect(tagsForPlace(["University", "university"], tags)).toEqual(["u"]);
    });
});
