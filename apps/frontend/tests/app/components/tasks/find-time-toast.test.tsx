import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { atLocal } from "@cadence/domain/time";

const dismiss = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { dismiss } }));

import { FindTimeToast, PlaceReceiptToast } from "../../../../app/components/tasks/FindTimeToast";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

// Times are shown in the person's zone, whatever zone this machine is in.
const zone = "America/Toronto";
setUserZone(zone);
const proposal = (start: string, end: string) => ({ start: atLocal("2026-10-20", start, zone), end: atLocal("2026-10-20", end, zone), bucket: "morning" as const });
const proposals = [proposal("09:00", "09:45"), proposal("13:00", "13:45"), proposal("19:00", "19:45")];

beforeEach(() => vi.clearAllMocks());

const setup = (over: object = {}) => {
    const props = { id: "t1", title: "Lab report", zone, proposals, onApply: vi.fn(async () => {}), onOtherDay: vi.fn(), onUndo: vi.fn(), ...over };
    render(<FindTimeToast {...props} />);
    return props;
};

describe("FindTimeToast", () => {
    it("names the task and the gap, and reads the whole sentence to a screen reader", () => {
        setup();
        expect(screen.getByRole("status").textContent).toContain("Lab report placed Tuesday");
        expect(screen.getByRole("status").textContent).toMatch(/9:00.*9:45/);
        expect(screen.getByRole("group", { name: "Find a time" })).toBeTruthy();
    });

    it("Another time steps through the gaps, one write each, then says that's every gap and keeps Other day and Undo", async () => {
        const props = setup();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Another time" })); });
        expect(props.onApply).toHaveBeenLastCalledWith(1);
        expect(screen.getByRole("status").textContent).toMatch(/1:00.*1:45/);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Another time" })); });
        expect(props.onApply).toHaveBeenLastCalledWith(2);
        expect(screen.getByText(/That’s every gap on Tue/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Another time" })).toBeNull();
        expect(screen.getByRole("button", { name: "Other day" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    });

    it("stays on the current gap when a write fails", async () => {
        const props = setup({ onApply: vi.fn(async () => { throw new Error("offline"); }) });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Another time" })); });
        expect(props.onApply).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("status").textContent).toMatch(/9:00.*9:45/);
    });

    it("Other day and Undo close the toast and hand over", () => {
        const props = setup();
        fireEvent.click(screen.getByRole("button", { name: "Other day" }));
        expect(props.onOtherDay).toHaveBeenCalled();
        expect(dismiss).toHaveBeenCalledWith("t1");
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(props.onUndo).toHaveBeenCalled();
    });

    it("has no Another time with a single gap, and says so when the calendar changed", () => {
        setup({ proposals: [proposals[0]], prefix: "Your calendar changed" });
        expect(screen.queryByRole("button", { name: "Another time" })).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("Your calendar changed");
    });

    it("closes with Escape", () => {
        setup();
        fireEvent.keyDown(screen.getByRole("group", { name: "Find a time" }), { key: "Escape" });
        expect(dismiss).toHaveBeenCalledWith("t1");
    });
});

describe("PlaceReceiptToast", () => {
    it("offers the first gap as a quiet question, and Undo always", () => {
        const onOffer = vi.fn();
        const onUndo = vi.fn();
        render(<PlaceReceiptToast id="p" title="Lab report" description="Moved to Tue" offer="2:00 PM" onOffer={onOffer} onUndo={onUndo} />);
        fireEvent.click(screen.getByRole("button", { name: "Put it at 2:00 PM" }));
        expect(onOffer).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(onUndo).toHaveBeenCalled();
    });

    it("shows only Undo when the day has no gap", () => {
        render(<PlaceReceiptToast id="p" title="Lab report" description="Moved to Tue" offer={null} onOffer={vi.fn()} onUndo={vi.fn()} />);
        expect(screen.queryByText(/\?/)).toBeNull();
        expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    });
});
