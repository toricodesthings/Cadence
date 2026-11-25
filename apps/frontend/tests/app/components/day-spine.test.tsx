import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaySpine, SpinePeek, SpineTimeline, type SpineItem } from "../../../app/components/today/DaySpine";
import { setDateFormatConfig } from "../../../app/lib/utils/date-format";
import { deviceZone, setUserZone } from "../../../app/lib/utils/user-zone";

let mockNow = new Date("2026-11-24T15:37:00.000Z");

vi.mock("../../../app/hooks/ui/use-realtime-clock", () => ({
    useMinuteClock: () => mockNow,
}));

const ITEMS: SpineItem[] = [
    {
        id: "stat-lecture",
        title: "STAT3503",
        start: new Date("2026-11-24T14:35:00.000Z"),
        end: new Date("2026-11-24T15:55:00.000Z"),
    },
    {
        id: "stat-tutorial",
        title: "STAT3503 Tutorial",
        start: new Date("2026-11-24T16:35:00.000Z"),
        end: new Date("2026-11-24T17:25:00.000Z"),
    },
];

describe("DaySpine and SpineTimeline", () => {
    beforeEach(() => {
        setUserZone("UTC");
        setDateFormatConfig({ timeDisplay: "24h", dateStyle: "mdy", weekStartsOn: 1 });
        mockNow = new Date("2026-11-24T15:37:00.000Z");
    });

    afterEach(() => {
        setUserZone(deviceZone());
    });

    it("anchors the active block in list view without inserting an out-of-order now separator", () => {
        const onOpen = vi.fn();
        render(<DaySpine items={ITEMS} onOpen={onOpen} />);

        const currentBtn = screen.getByRole("button", { name: "STAT3503, 14:35 – 15:55, happening now" });
        const upcomingBtn = screen.getByRole("button", { name: "STAT3503 Tutorial, 16:35 – 17:25" });

        expect(currentBtn.getAttribute("aria-current")).toBe("time");
        expect(upcomingBtn.getAttribute("aria-current")).toBeNull();
        expect(screen.queryByRole("separator")).toBeNull();

        fireEvent.click(currentBtn);
        expect(onOpen).toHaveBeenCalledWith(ITEMS[0]);
    });

    it("anchors the active block in board view and omits duplicate start times or out-of-order dividers", () => {
        const onOpen = vi.fn();
        render(<SpineTimeline items={ITEMS} onOpen={onOpen} />);

        const currentBtn = screen.getByRole("button", { name: "STAT3503, 14:35 – 15:55, happening now" });
        expect(currentBtn.getAttribute("aria-current")).toBe("time");
        expect(screen.queryByRole("separator")).toBeNull();
        expect(screen.getAllByText("14:35 – 15:55")).toHaveLength(1);
        expect(screen.getAllByText("16:35 – 17:25")).toHaveLength(1);

        fireEvent.click(screen.getByRole("button", { name: "STAT3503 Tutorial, 16:35 – 17:25" }));
        expect(onOpen).toHaveBeenCalledWith(ITEMS[1]);
    });

    it("shows the now separator only in a gap between a passed block and the next upcoming block", () => {
        mockNow = new Date("2026-11-24T16:10:00.000Z");

        const { unmount } = render(<DaySpine items={ITEMS} onOpen={vi.fn()} />);
        expect(screen.getByRole("separator", { name: "Now, 16:10" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "STAT3503, 14:35 – 15:55, passed" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "STAT3503 Tutorial, 16:35 – 17:25, up next" })).toBeTruthy();
        unmount();

        render(<SpineTimeline items={ITEMS} onOpen={vi.fn()} />);
        expect(screen.getByRole("separator", { name: "Now, 16:10" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "STAT3503 Tutorial, 16:35 – 17:25, up next" })).toBeTruthy();
    });

    it("marks the first block as next before the day begins without an orphan separator", () => {
        mockNow = new Date("2026-11-24T12:00:00.000Z");

        render(<DaySpine items={ITEMS} onOpen={vi.fn()} />);
        expect(screen.queryByRole("separator")).toBeNull();
        expect(screen.getByRole("button", { name: "STAT3503, 14:35 – 15:55, up next" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "STAT3503 Tutorial, 16:35 – 17:25" })).toBeTruthy();
    });

    it("connects blocks with live accent fill matching elapsed progress in both row and board views", () => {
        const day: SpineItem[] = [
            {
                id: "past",
                title: "PSYC1001",
                start: new Date("2026-11-24T13:05:00.000Z"),
                end: new Date("2026-11-24T14:25:00.000Z"),
            },
            ...ITEMS,
            {
                id: "later",
                title: "STAT3553 Lab",
                start: new Date("2026-11-24T18:00:00.000Z"),
                end: new Date("2026-11-24T19:00:00.000Z"),
            },
        ];
        // At 15:35, past->current (13:05->14:35) is 100%, current->upcoming (14:35->16:35) is 50%, upcoming->later is 0%.
        mockNow = new Date("2026-11-24T15:35:00.000Z");

        const { container: rowContainer, unmount } = render(<DaySpine items={day} onOpen={vi.fn()} />);
        const rowFills = [...rowContainer.querySelectorAll("[data-spine-fill]")].map((el) =>
            el.getAttribute("data-spine-fill"),
        );
        expect(rowFills).toEqual(["100", "50"]);
        unmount();

        const { container: boardContainer } = render(<SpineTimeline items={day} onOpen={vi.fn()} />);
        const boardFills = [...boardContainer.querySelectorAll("[data-spine-fill]")].map((el) =>
            el.getAttribute("data-spine-fill"),
        );
        expect(boardFills).toEqual(["100", "50"]);
    });

    it("auto-centers the upcoming or active block when earlier blocks are complete and the strip overflows", () => {
        const scrollTo = vi.fn();
        const proto = HTMLElement.prototype;
        const origScrollTo = proto.scrollTo;
        const origRect = proto.getBoundingClientRect;
        const origScrollWidth = Object.getOwnPropertyDescriptor(proto, "scrollWidth");
        const origClientWidth = Object.getOwnPropertyDescriptor(proto, "clientWidth");

        proto.scrollTo = scrollTo;
        Object.defineProperty(proto, "scrollWidth", { configurable: true, get: () => 1200 });
        Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 500 });
        proto.getBoundingClientRect = function (this: HTMLElement) {
            if (this.dataset.spineAnchor === "true") {
                return {
                    left: 620,
                    top: 0,
                    width: 240,
                    height: 70,
                    right: 860,
                    bottom: 70,
                    x: 620,
                    y: 0,
                    toJSON: () => ({}),
                };
            }
            return { left: 0, top: 0, width: 500, height: 70, right: 500, bottom: 70, x: 0, y: 0, toJSON: () => ({}) };
        };

        try {
            // Before any block completes: should not auto-scroll.
            mockNow = new Date("2026-11-24T12:00:00.000Z");
            const { rerender } = render(<DaySpine items={ITEMS} onOpen={vi.fn()} />);
            expect(scrollTo).not.toHaveBeenCalled();

            // After first block finishes, second block is up next: center it (620 + 120 - 250 = 490).
            mockNow = new Date("2026-11-24T16:10:00.000Z");
            rerender(<DaySpine items={ITEMS} onOpen={vi.fn()} />);
            expect(scrollTo).toHaveBeenCalledTimes(1);
            expect(scrollTo).toHaveBeenCalledWith({ left: 490, behavior: "auto" });

            // Minute tick while still on the same anchor: do not fight user scroll.
            mockNow = new Date("2026-11-24T16:15:00.000Z");
            rerender(<DaySpine items={ITEMS} onOpen={vi.fn()} />);
            expect(scrollTo).toHaveBeenCalledTimes(1);
        } finally {
            proto.scrollTo = origScrollTo;
            proto.getBoundingClientRect = origRect;
            if (origScrollWidth) Object.defineProperty(proto, "scrollWidth", origScrollWidth);
            else delete (proto as unknown as Record<string, unknown>).scrollWidth;
            if (origClientWidth) Object.defineProperty(proto, "clientWidth", origClientWidth);
            else delete (proto as unknown as Record<string, unknown>).clientWidth;
        }
    });

    it("renders a quiet folded peek for live, upcoming, and finished states", () => {
        const onOpen = vi.fn();
        const { rerender } = render(<SpinePeek items={ITEMS} onOpen={onOpen} />);
        const nowPeek = screen.getByRole("button", { name: "Show 2 fixed. Now: STAT3503, until 15:55" });
        fireEvent.click(nowPeek);
        expect(onOpen).toHaveBeenCalledTimes(1);

        mockNow = new Date("2026-11-24T16:10:00.000Z");
        rerender(<SpinePeek items={ITEMS} onOpen={onOpen} />);
        expect(
            screen.getByRole("button", { name: "Show 2 fixed. Next: STAT3503 Tutorial, 16:35 – 17:25" }),
        ).toBeTruthy();

        mockNow = new Date("2026-11-24T18:00:00.000Z");
        rerender(<SpinePeek items={ITEMS} onOpen={onOpen} />);
        expect(screen.getByRole("button", { name: "Show 2 fixed. Done for today" })).toBeTruthy();
    });
});
