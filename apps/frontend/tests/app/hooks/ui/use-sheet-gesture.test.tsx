import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { decide, rubber, shouldDismiss } from "../../../../app/hooks/ui/use-sheet-gesture";
import { ResponsiveOverlayPanel } from "../../../../app/components/shared/ResponsiveOverlayPanel";

vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { appearance: { motion: "reduced" } } }) }));
vi.mock("../../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: true, isTouch: true, isTablet: false }) }));

describe("decide", () => {
    it.each([
        [{ dx: 20, dy: 5, blocked: false, scroller: null }, "native"],
        [{ dx: 0, dy: 20, blocked: true, scroller: null }, "native"],
        [{ dx: 0, dy: 20, blocked: false, scroller: null }, "sheet"],
        [{ dx: 0, dy: 20, blocked: false, scroller: { scrollTop: 0 } }, "sheet"],
        [{ dx: 0, dy: 20, blocked: false, scroller: { scrollTop: 40 } }, "native"],
        [{ dx: 0, dy: -20, blocked: false, scroller: null }, "sheet"],
        [{ dx: 0, dy: -20, blocked: false, scroller: { scrollTop: 0 } }, "native"],
    ] as const)("%o → %s", (input, expected) => expect(decide(input)).toBe(expected));
});

describe("rubber", () => {
    it("resists more the further it goes, never past the sheet's height", () => {
        expect(rubber(0, 600)).toBeCloseTo(0);
        expect(rubber(-100, 600)).toBeLessThan(0);
        expect(Math.abs(rubber(-100, 600))).toBeLessThan(100);
        expect(Math.abs(rubber(-10_000, 600))).toBeLessThan(600);
    });
});

describe("shouldDismiss", () => {
    it.each([
        [130, 0, 800, true],
        [100, 0, 800, false],
        [100, 0, 300, true],
        [20, 700, 800, true],
        [0, 700, 800, false],
        [-30, 900, 800, false],
    ])("offset %d, velocity %d, height %d → %s", (offset, velocity, height, expected) =>
        expect(shouldDismiss(offset, velocity, height)).toBe(expected));
});

function drag(el: Element, path: [number, number][]) {
    const [[x0, y0], ...rest] = path;
    const at = (clientX: number, clientY: number) => [{ clientX, clientY }];
    fireEvent.touchStart(el, { touches: at(x0, y0), changedTouches: at(x0, y0) });
    for (const [x, y] of rest) fireEvent.touchMove(el, { touches: at(x, y), changedTouches: at(x, y) });
    const [xn, yn] = path[path.length - 1];
    fireEvent.touchEnd(el, { touches: [], changedTouches: at(xn, yn) });
}
const DOWN: [number, number][] = [[100, 100], [100, 120], [100, 200], [100, 320]];

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    return <ResponsiveOverlayPanel open onClose={onClose} ariaLabel="Sheet">{children}</ResponsiveOverlayPanel>;
}

describe("sheet drag from anywhere", () => {
    it("a pull down from the body closes it", async () => {
        const onClose = vi.fn();
        render(<Sheet onClose={onClose}><p>Body text</p></Sheet>);
        drag(await screen.findByText("Body text"), DOWN);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("the same pull inside a scrolled list scrolls instead", async () => {
        const onClose = vi.fn();
        render(<Sheet onClose={onClose}><div data-testid="list" style={{ overflowY: "auto" }}><p>Row</p></div></Sheet>);
        const list = await screen.findByTestId("list");
        Object.defineProperty(list, "scrollHeight", { value: 1000 });
        Object.defineProperty(list, "clientHeight", { value: 300 });
        list.scrollTop = 120;
        drag(screen.getByText("Row"), DOWN);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("a horizontal swipe doesn't", async () => {
        const onClose = vi.fn();
        render(<Sheet onClose={onClose}><p>Chips</p></Sheet>);
        drag(await screen.findByText("Chips"), [[100, 100], [140, 110], [260, 160], [400, 200]]);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("a pull on an inner drag surface (a reorder handle, the photo crop) doesn't", async () => {
        const onClose = vi.fn();
        render(<Sheet onClose={onClose}><div aria-roledescription="sortable">Handle</div><div data-sheet-no-drag>Crop</div></Sheet>);
        drag(await screen.findByText("Handle"), DOWN);
        drag(screen.getByText("Crop"), DOWN);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("a pull that starts in a text field doesn't", async () => {
        const onClose = vi.fn();
        render(<Sheet onClose={onClose}><textarea aria-label="Notes" /></Sheet>);
        drag(await screen.findByLabelText("Notes"), DOWN);
        expect(onClose).not.toHaveBeenCalled();
    });
});
