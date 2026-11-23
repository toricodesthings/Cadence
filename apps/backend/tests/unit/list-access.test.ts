import { describe, expect, it } from "vitest";
import {
    audienceOf,
    requireEdit,
    requireOwner,
    roleIn,
    shapeFor,
    type ListAccess,
} from "../../src/platform/list-access";

const owner = "00000000-0000-4000-8000-000000000001";
const editor = "00000000-0000-4000-8000-000000000002";
const viewer = "00000000-0000-4000-8000-000000000003";
const members = [
    { userId: editor, role: "edit" as const },
    { userId: viewer, role: "view" as const },
];
const access = (role: ListAccess["role"]): ListAccess => ({ listId: "l", ownerId: owner, role, audience: [owner] });

describe("roles in a list", () => {
    it("finds the owner, each member's role, and nobody else", () => {
        expect(roleIn(owner, owner, members)).toBe("owner");
        expect(roleIn(editor, owner, members)).toBe("edit");
        expect(roleIn(viewer, owner, members)).toBe("view");
        expect(roleIn("00000000-0000-4000-8000-000000000009", owner, members)).toBeNull();
    });

    it("lists the owner and every member once", () => {
        expect(audienceOf(owner, members)).toEqual([owner, editor, viewer]);
        expect(audienceOf(owner, [{ userId: owner, role: "view" }])).toEqual([owner]);
    });

    it("lets owners and editors write, not viewers, and own the rest to the owner", () => {
        expect(() => requireEdit(null)).not.toThrow();
        expect(() => requireEdit(access("owner"))).not.toThrow();
        expect(() => requireEdit(access("edit"))).not.toThrow();
        expect(() => requireEdit(access("view"))).toThrowError(
            expect.objectContaining({ statusCode: 403, code: "VIEW_ONLY" }),
        );
        expect(() => requireOwner(null)).not.toThrow();
        expect(() => requireOwner(access("owner"))).not.toThrow();
        expect(() => requireOwner(access("edit"))).toThrowError(
            expect.objectContaining({ statusCode: 403, code: "OWNER_ONLY" }),
        );
    });
});

describe("what a pushed row shows each person", () => {
    const task = {
        userId: owner,
        id: "t",
        tagIds: ["a"],
        reminderAt: "2030-01-01T10:00:00.000Z",
        reminderSilenced: true,
    } as never;
    it("keeps the owner's tags and reminders for the owner only", () => {
        expect(shapeFor({ type: "task", task }, owner)).toEqual({ type: "task", task });
        expect(shapeFor({ type: "task", task }, editor)).toEqual({
            type: "task",
            task: { ...(task as object), tagIds: [], reminderAt: null, reminderSilenced: false },
        });
    });

    it("passes other changes through", () => {
        const gone = { type: "task.gone", id: "00000000-0000-4000-8000-000000000004" } as const;
        expect(shapeFor(gone, editor)).toBe(gone);
    });
});
