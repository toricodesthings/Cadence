import { describe, expect, it } from "vitest";
import { inviteTokenSchema, joinListSchema, listRoleSchema, shareRoleSchema } from "@cadence/contracts/sharing";
import { liveMessageSchema } from "@cadence/contracts/live";

describe("sharing contracts", () => {
    it("keeps roles in ascending order, the order the database enum ranks them by", () => {
        // `share_role` is `('view', 'edit')` in core.ts; a new role goes in between by ALTER TYPE ... BEFORE.
        expect(shareRoleSchema.options).toEqual(["view", "edit"]);
        expect(listRoleSchema.options).toEqual(["owner", "view", "edit"]);
    });

    it("accepts 32 random bytes as base64url, and nothing else", () => {
        const token = "A".repeat(43);
        expect(joinListSchema.parse({ token })).toEqual({ token });
        for (const bad of ["", "short", `${token}=`, "!".repeat(43), `${token}A`])
            expect(inviteTokenSchema.safeParse(bad).success, bad).toBe(false);
    });

    it("reads a bare version or a version with rows, and caps the rows", () => {
        expect(liveMessageSchema.parse({ v: 3 })).toEqual({ v: 3 });
        const gone = { type: "task.gone", id: "00000000-0000-4000-8000-000000000001" };
        expect(liveMessageSchema.safeParse({ v: 3, changes: [gone] }).success).toBe(true);
        expect(liveMessageSchema.safeParse({ v: 3, changes: Array(51).fill(gone) }).success).toBe(false);
        expect(liveMessageSchema.safeParse({ v: 3, changes: [{ type: "nope" }] }).success).toBe(false);
    });
});
