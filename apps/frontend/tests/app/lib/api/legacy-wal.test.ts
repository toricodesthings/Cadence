import { describe, expect, it } from "vitest";
import { batchRescheduleSchema, insertTaskSchema, updateTaskSchema } from "@cadence/contracts/task";
import { processInboxItemSchema } from "@cadence/contracts/inbox";
import { resolveHabitActionSchema } from "@cadence/contracts/habit";
import { toRequests } from "../../../../app/lib/api/mutation-executor";
import { describeChange } from "../../../../app/lib/api/describe-change";
import type { MutationOp } from "../../../../app/lib/api/offline-wal";

// Entries queued before 0.26.3 sit in IndexedDB in the old shapes and replay unchanged. The server's
// time-legacy schemas must accept every one of them, so a queued edit survives the upgrade.
const ID = "10000000-0000-4000-8000-000000000001";
const legacy = (op: unknown) => op as MutationOp;
const bodyOf = (op: unknown) => toRequests(legacy(op))[0].json;

describe("old-shape queued operations", () => {
    it("replays a create_task with an instant dueDate and isAllDay", () => {
        const json = bodyOf({ type: "create_task", payload: { id: ID, title: "Pay rent", orderIndex: 1, dueDate: "2026-03-26T04:00:00.000Z", isAllDay: true } });
        expect(insertTaskSchema.safeParse(json).success).toBe(true);
    });

    it("replays an update_task that moves a timed block with isAllDay false", () => {
        const json = bodyOf({ type: "update_task", id: ID, payload: { scheduledStart: "2026-03-26T14:00:00-04:00", scheduledEnd: "2026-03-26T15:00:00-04:00", isAllDay: false, expectedUpdatedAt: "x" } });
        expect(json).not.toHaveProperty("expectedUpdatedAt");
        expect(updateTaskSchema.safeParse(json).success).toBe(true);
    });

    it("replays process_inbox_to_task with scheduledDate and isAllDay, and the new scheduledDay shape", () => {
        const old = bodyOf({ type: "process_inbox_to_task", payload: { inboxItemId: ID, rawText: "Call mum", scheduledDate: "2026-03-26T04:00:00.000Z", isAllDay: true } });
        expect(processInboxItemSchema.safeParse(old).success).toBe(true);
        const next = bodyOf({ type: "process_inbox_to_task", payload: { inboxItemId: ID, rawText: "Call mum", scheduledDay: "2026-03-26" } });
        expect(processInboxItemSchema.parse(next).scheduledDay).toBe("2026-03-26");
    });

    it("replays resolve_habit with a datetime targetDate and a timezone, keeping only the day", () => {
        const json = bodyOf({ type: "resolve_habit", id: ID, payload: { targetDate: "2026-03-26T00:00:00.000Z", status: "COMPLETED", timezone: "America/Toronto" } });
        expect(resolveHabitActionSchema.parse(json).targetDate).toBe("2026-03-26");
    });

    it("replays batch_reschedule in the old (start + isAllDay) and new (date) shapes", () => {
        const old = bodyOf({ type: "batch_reschedule", payload: { taskIds: [ID], scheduledStart: "2026-03-27T04:00:00.000Z", isAllDay: true } });
        expect(batchRescheduleSchema.safeParse(old).success).toBe(true);
        const next = bodyOf({ type: "batch_reschedule", payload: { taskIds: [ID], date: "2026-03-27" } });
        expect(batchRescheduleSchema.safeParse(next).success).toBe(true);
    });

    it("describes an old resolve_habit entry in the sync review", () => {
        const text = describeChange(legacy({ type: "resolve_habit", id: ID, payload: { targetDate: "2026-03-26T00:00:00.000Z", status: "COMPLETED" } }), () => "Gym");
        expect(text).toMatch(/^Log “Gym” for Mar 26$/);
    });
});
