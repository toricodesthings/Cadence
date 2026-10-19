import { describe, expect, it } from "vitest";
import { eligibleOffers, leaveUntil, type OfferDecline, type OfferTask } from "@cadence/domain/planning-offers";

const today = "2026-10-20";
const task = (id: string, over: Partial<OfferTask> = {}): OfferTask => ({ id, state: "ACTIVE", waitingOn: null, dueDate: null, notBefore: null, openSteps: 0, fingerprint: `f-${id}`, movedOn: [], ...over });
const slipping = (id: string, over: Partial<OfferTask> = {}) => task(id, { movedOn: ["2026-10-10", "2026-10-12", "2026-10-12"], ...over });
const ctx = (declines: OfferDecline[] = [], avoid: ("steps" | "later")[] = []) => ({ today, declines, avoid });
const nope = (taskId: string, kind: "steps" | "later", saidOn = "2026-10-15", fingerprint = `f-${taskId}`): OfferDecline => ({ taskId, kind, saidOn, fingerprint });

describe("Break into steps", () => {
  it("needs no open steps, 3 moves on 2 days in 28 days", () => {
    expect(eligibleOffers([slipping("a")], ctx()).steps).toEqual(["a"]);
    expect(eligibleOffers([slipping("a", { openSteps: 1 })], ctx()).steps).toEqual([]);
    expect(eligibleOffers([task("a", { movedOn: ["2026-10-10", "2026-10-10", "2026-10-10"] })], ctx()).steps).toEqual([]);
    expect(eligibleOffers([task("a", { movedOn: ["2026-10-10", "2026-10-12"] })], ctx()).steps).toEqual([]);
    expect(eligibleOffers([task("a", { movedOn: ["2026-08-01", "2026-08-02", "2026-08-03"] })], ctx()).steps).toEqual([]);
  });
  it("is never offered on a waiting task, or a finished one", () => {
    expect(eligibleOffers([slipping("a", { state: "WAITING", waitingOn: "Sam" })], ctx()).steps).toEqual([]);
    expect(eligibleOffers([slipping("a", { state: "COMPLETE" })], ctx()).steps).toEqual([]);
  });
});

describe("Leave for later", () => {
  const waiting = (id: string, over: Partial<OfferTask> = {}) => task(id, { state: "WAITING", waitingOn: "Sam", ...over });
  it("is for waiting tasks, not ones with a deadline in the next 7 days or already hidden", () => {
    expect(eligibleOffers([waiting("a")], ctx()).later).toEqual(["a"]);
    expect(eligibleOffers([waiting("a", { dueDate: "2026-10-25" })], ctx()).later).toEqual([]);
    expect(eligibleOffers([waiting("a", { dueDate: "2026-11-30" })], ctx()).later).toEqual(["a"]);
    expect(eligibleOffers([waiting("a", { notBefore: "2026-10-28" })], ctx()).later).toEqual([]);
    expect(eligibleOffers([task("a")], ctx()).later).toEqual([]);
  });
  it("hides until the check-in day if ahead, else a week out", () => {
    expect(leaveUntil({ waitingReminderDay: "2026-10-24" }, today)).toBe("2026-10-24");
    expect(leaveUntil({ waitingReminderDay: "2026-10-18" }, today)).toBe("2026-10-27");
    expect(leaveUntil({ waitingReminderDay: null }, today)).toBe("2026-10-27");
  });
});

describe("declines", () => {
  it("Not now silences that offer on that task until something about it changes", () => {
    expect(eligibleOffers([slipping("a")], ctx([nope("a", "steps")])).steps).toEqual([]);
    expect(eligibleOffers([slipping("a", { fingerprint: "changed" })], ctx([nope("a", "steps")])).steps).toEqual(["a"]);
    expect(eligibleOffers([slipping("a")], ctx([nope("a", "later")])).steps).toEqual(["a"]);
  });
  it("three Not nows on three tasks in 30 days stop the offer; older ones don't count", () => {
    const three = [nope("x", "steps"), nope("y", "steps"), nope("z", "steps")];
    expect(eligibleOffers([slipping("a")], ctx(three)).steps).toEqual([]);
    expect(eligibleOffers([slipping("a")], ctx([nope("x", "steps"), nope("y", "steps"), nope("z", "steps", "2026-09-01")])).steps).toEqual(["a"]);
    expect(eligibleOffers([slipping("a"), task("w", { state: "WAITING", waitingOn: "S" })], ctx(three)).later).toEqual(["w"]);
    // Three Nots on the same task are one task.
    expect(eligibleOffers([slipping("a")], ctx([nope("x", "steps"), nope("x", "steps", "2026-10-16"), nope("x", "steps", "2026-10-17")])).steps).toEqual(["a"]);
  });
  it("a stated 'this doesn't help me' turns the offer off", () => {
    expect(eligibleOffers([slipping("a")], ctx([], ["steps"])).steps).toEqual([]);
    expect(eligibleOffers([task("w", { state: "WAITING", waitingOn: "S" })], ctx([], ["steps"])).later).toEqual(["w"]);
  });
});
