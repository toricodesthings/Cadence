import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickScheduleSurface } from "../../../app/components/tasks/QuickScheduleSurface";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { setUserZone } from "../../../app/lib/utils/user-zone";

vi.mock("../../../app/hooks/ui/use-coarse-pointer", () => ({ useIsCoarsePointer: () => false }));

const props = { dueDate: null, scheduledStart: null, recurrenceRule: null };
const NONE = { endDate: null, scheduledStart: null, scheduledEnd: null, recurrenceRule: null };

function setup(extra: Partial<React.ComponentProps<typeof QuickScheduleSurface>> = {}) {
    const onChange = vi.fn();
    render(<Provider><QuickScheduleSurface {...props} {...extra} onChange={onChange} /></Provider>);
    return onChange;
}

describe("QuickScheduleSurface", () => {
    beforeEach(() => {
        setUserZone("America/Toronto");
        // Monday 2026-10-05, 10:00 in Toronto.
        vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date("2026-10-05T14:00:00.000Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("writes a deadline as a day: no time, no isAllDay", () => {
        const onChange = setup();
        fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
        expect(onChange).toHaveBeenLastCalledWith({ dueDate: "2026-10-06", ...NONE });
        fireEvent.click(screen.getByRole("button", { name: "Next Monday" }));
        expect(onChange).toHaveBeenLastCalledWith({ dueDate: "2026-10-12", ...NONE });
    });

    it("moves a timed block to another day at the same local time, as instants", () => {
        const onChange = setup({ scheduledStart: "2026-10-05T13:00:00.000Z", scheduledEnd: "2026-10-05T14:30:00.000Z" }); // 09:00-10:30 EDT
        fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
        expect(onChange).toHaveBeenLastCalledWith({
            dueDate: null,
            endDate: null,
            scheduledStart: "2026-10-06T13:00:00.000Z",
            scheduledEnd: "2026-10-06T14:30:00.000Z",
            recurrenceRule: null,
        });
    });

    it("keeps the same local time across a DST change", () => {
        // US DST ends Sun 2026-11-01: 09:00 is EDT (13:00Z) before it and EST (14:00Z) after.
        const onChange = setup({ scheduledStart: "2026-10-30T13:00:00.000Z" });
        vi.setSystemTime(new Date("2026-10-30T14:00:00.000Z"));
        fireEvent.click(screen.getByRole("button", { name: "Next Monday" })); // 2026-11-02
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scheduledStart: "2026-11-02T14:00:00.000Z" }));
    });

    it("clears every schedule field", () => {
        const onChange = setup({ dueDate: "2026-10-09" });
        fireEvent.click(screen.getByRole("button", { name: "Clear deadline" }));
        expect(onChange).toHaveBeenLastCalledWith({ dueDate: null, ...NONE });
    });
});
