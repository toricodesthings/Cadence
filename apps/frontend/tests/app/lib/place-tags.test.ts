import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { placeTagIdsFromCache, tagIdsAfterMove } from "../../../app/lib/utils/task/place-tags";
import { queryKeys } from "../../../app/lib/api/query-keys";
import { makeTask } from "../../helpers";

const qc = new QueryClient();
qc.setQueryData(queryKeys.projects.all, [{ id: "uni", name: "University" }]);
qc.setQueryData(
    ["sections", "uni"],
    [
        { id: "c2", name: "COMPUTER2000" },
        { id: "c1", name: "COMPUTER1000" },
    ],
);
qc.setQueryData(queryKeys.tags.all, [
    { id: "tu", name: "University", sortOrder: 1 },
    { id: "t2", name: "COMPUTER 2000", sortOrder: 2 },
    { id: "t1", name: "Computer-1000", sortOrder: 3 },
]);

describe("optimistic auto-tag", () => {
    it("a new task in a section shows the list and section tags at once", () => {
        expect(placeTagIdsFromCache(qc, { projectId: "uni", sectionId: "c2" })).toEqual(["tu", "t2"]);
        expect(placeTagIdsFromCache(qc, {})).toEqual([]);
    });
    it("a move swaps the section tag and keeps the list tag", () => {
        const task = makeTask({ projectId: "uni", sectionId: "c2", tagIds: ["tu", "t2", "mine"] });
        expect(tagIdsAfterMove(qc, task, { sectionId: "c1" }).sort()).toEqual(["mine", "t1", "tu"]);
    });
    it("a cache miss adds nothing", () => {
        expect(placeTagIdsFromCache(new QueryClient(), { projectId: "uni", sectionId: "c2" })).toEqual([]);
    });
});
