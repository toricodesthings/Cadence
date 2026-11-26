import { describe, expect, it } from "vitest";
import {
    invitePreviewSchema,
    inviteTokenSchema,
    joinedSchema,
    joinListSchema,
    listRoleSchema,
    shareRoleSchema,
} from "@cadence/contracts/sharing";
import { liveMessageSchema } from "@cadence/contracts/live";

const UUID1 = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";

describe("sharing contracts", () => {
    it("keeps roles in ascending order, the order the database enum ranks them by", () => {
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

    it("parses list and event invite previews and rejects mixed fields", () => {
        const listPreview = {
            kind: "list" as const,
            listId: UUID1,
            name: "Groceries",
            emoji: "🛒",
            colorAccent: "sage",
            ownerId: UUID2,
            ownerName: "Tori",
            ownerImage: null,
        };
        const eventPreview = {
            kind: "event" as const,
            eventId: UUID1,
            label: "Our anniversary",
            emoji: "💍",
            monthDay: "06-14",
            startedOn: "2019-06-14",
            color: "rose",
            ownerId: UUID2,
            ownerName: "Tori",
            ownerImage: null,
        };

        expect(invitePreviewSchema.parse(listPreview)).toEqual(listPreview);
        expect(invitePreviewSchema.parse(eventPreview)).toEqual(eventPreview);
        expect(invitePreviewSchema.safeParse({ ...listPreview, label: "Mixed" }).success).toBe(false);
        expect(invitePreviewSchema.safeParse({ ...eventPreview, listId: UUID1 }).success).toBe(false);
    });

    it("parses joined responses for lists and events", () => {
        expect(joinedSchema.parse({ kind: "list", listId: UUID1 })).toEqual({ kind: "list", listId: UUID1 });
        expect(joinedSchema.parse({ kind: "event", eventId: UUID1 })).toEqual({ kind: "event", eventId: UUID1 });
        expect(joinedSchema.parse({ kind: "routine", routineId: UUID1 })).toEqual({
            kind: "routine",
            routineId: UUID1,
        });
        expect(joinedSchema.safeParse({ kind: "event", listId: UUID1 }).success).toBe(false);
    });

    it.each(["together", "turns", "cheering"] as const)("parses routine invite preview with way=%s", (way) => {
        const preview = {
            kind: "routine" as const,
            routineId: UUID1,
            title: "Morning yoga",
            emoji: "🧘",
            colorAccent: "emerald",
            recurrenceRule: "FREQ=DAILY",
            targetTime: "07:00",
            times: null,
            way,
            ownerId: UUID2,
            ownerName: "Tori",
            ownerImage: null,
            people: [{ name: "Sam", image: null }],
        };
        expect(invitePreviewSchema.parse(preview)).toEqual(preview);
    });
});
