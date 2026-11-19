import { describe, expect, it } from "vitest";
import { accessOf, isOwnList } from "../../../app/hooks/sharing/use-list-access";

describe("what a person can do in a list", () => {
    it.each([
        ["owner", [], { role: "owner", isShared: false, canEdit: true, isOwner: true }],
        [
            "owner",
            [{ userId: "a", role: "view", invitedBy: null }],
            { role: "owner", isShared: true, canEdit: true, isOwner: true },
        ],
        ["edit", [], { role: "edit", isShared: true, canEdit: true, isOwner: false }],
        ["view", [], { role: "view", isShared: true, canEdit: false, isOwner: false }],
    ] as const)("%s with %j", (access, members, expected) => {
        expect(accessOf({ access, members: [...members] })).toEqual(expected);
    });

    it("reads a list it doesn't know, or one cached before sharing, as the person's own", () => {
        expect(accessOf(undefined)).toMatchObject({ role: "owner", canEdit: true, isShared: false });
        expect(accessOf({} as never)).toMatchObject({ role: "owner", canEdit: true, isShared: false });
        expect(isOwnList({} as never)).toBe(true);
        expect(isOwnList({ access: "view" })).toBe(false);
    });
});
