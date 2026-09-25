import { describe, expect, it } from "vitest";
import { upsertNotificationStateSchema } from "@cadence/contracts/notification";

describe("upsertNotificationStateSchema", () => {
    const base = { objectType: "task", objectId: "3f1c2a54-9b1e-4c6d-8f2a-1b2c3d4e5f60", triggerId: "due_date_reminder" };

    it("leaves omitted fields out, so the stored value is kept", () => {
        expect(upsertNotificationStateSchema.parse({ ...base, dismissedAt: null })).toEqual({ ...base, dismissedAt: null });
    });

    it("needs a zoned timestamp", () => {
        expect(upsertNotificationStateSchema.safeParse({ ...base, deferredUntil: "2026-03-01T09:00:00" }).success).toBe(false);
    });
});
