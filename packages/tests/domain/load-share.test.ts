import { describe, expect, it } from "vitest";
import { loadShare } from "@cadence/domain/load-share";

const [me, ada, ben] = ["me", "ada", "ben"];
const doersOf = (id: string) => ({ house: [ada, me, ben], watch: [ada] })[id];

describe("loadShare", () => {
    it("counts my own work fully, in no list or in an unshared one", () => {
        expect(loadShare({ projectId: null }, me, doersOf)).toBe(1);
        expect(loadShare({ projectId: "solo" }, me, doersOf)).toBe(1);
    });

    it("counts a shared task I took fully, and one someone else took not at all", () => {
        expect(loadShare({ projectId: "house", takenBy: me }, me, doersOf)).toBe(1);
        expect(loadShare({ projectId: "house", takenBy: ada }, me, doersOf)).toBe(0);
    });

    it("splits an untaken shared task across the people who can take it, owner and member alike", () => {
        expect(loadShare({ projectId: "house", takenBy: null }, me, doersOf)).toBeCloseTo(1 / 3);
        expect(loadShare({ projectId: "house", takenBy: null }, ada, doersOf)).toBeCloseTo(1 / 3);
    });

    it("gives a viewer no share: they can't take it", () => {
        expect(loadShare({ projectId: "watch", takenBy: null }, me, doersOf)).toBe(0);
        expect(loadShare({ projectId: "watch", takenBy: null }, ada, doersOf)).toBe(1);
    });
});
