import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagBubble } from "../../../app/components/sidebar/TagBubble";

const update = vi.fn();
vi.mock("../../../app/hooks/tags/use-update-tag", () => ({ useUpdateTag: () => ({ mutate: update }) }));
vi.mock("../../../app/hooks/tags/use-delete-tag", () => ({ useDeleteTag: () => ({ mutate: vi.fn() }) }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: false }) }));

const tag = { id: "tag-1", name: "work", color: "default", sortOrder: 1000 } as never;
beforeEach(() => vi.clearAllMocks());

describe("TagBubble colour menu", () => {
    it("right-click → Colour → Blue recolours the tag", () => {
        render(<TagBubble tag={tag} isActive={false} onClick={vi.fn()} />);
        fireEvent.contextMenu(screen.getByRole("button", { name: "Filter by tag: work" }));
        const trigger = screen.getByRole("menuitem", { name: "Colour" });
        trigger.focus();
        fireEvent.keyDown(trigger, { key: "ArrowRight" });
        fireEvent.click(screen.getByRole("menuitem", { name: /^blue$/i }));
        expect(update).toHaveBeenCalledWith({ id: "tag-1", color: "#79c0ff" });
    });
});

describe("TagBubble reordering", () => {
    const onDropNear = vi.fn();
    const setup = () => {
        render(<TagBubble tag={tag} isActive={false} onClick={vi.fn()} reorder={{ first: false, last: false, onMove: vi.fn(), onDropNear }} />);
        const chip = screen.getByRole("button", { name: "Filter by tag: work" });
        chip.getBoundingClientRect = () => ({ left: 100, width: 100, top: 0, right: 200, bottom: 20, height: 20, x: 100, y: 0, toJSON: () => ({}) });
        return chip;
    };
    /** jsdom's DragEvent drops clientX, so set it on the event. */
    const drag = (type: "dragOver" | "drop", chip: HTMLElement, clientX: number, dataTransfer: object) => {
        const event = createEvent[type](chip, { dataTransfer });
        Object.defineProperty(event, "clientX", { value: clientX });
        fireEvent(chip, event);
    };
    const data = { types: ["application/x-cadence-tag"], getData: () => "tag-9", dropEffect: "" };

    it("a tag dropped on the left half lands before, on the right half after", () => {
        const chip = setup();
        drag("dragOver", chip, 120, data);
        drag("drop", chip, 120, data);
        drag("dragOver", chip, 180, data);
        drag("drop", chip, 180, data);
        expect(onDropNear.mock.calls).toEqual([["tag-9", "before"], ["tag-9", "after"]]);
    });

    it("ignores drags that aren't tags", () => {
        const chip = setup();
        fireEvent.dragOver(chip, { clientX: 120, dataTransfer: { types: ["text/plain"], getData: () => "" } });
        fireEvent.drop(chip, { clientX: 120, dataTransfer: { types: ["text/plain"], getData: () => "" } });
        expect(onDropNear).not.toHaveBeenCalled();
    });

    it("Move later in the menu moves one step", () => {
        const onMove = vi.fn();
        render(<TagBubble tag={tag} isActive={false} onClick={vi.fn()} reorder={{ first: false, last: false, onMove, onDropNear }} />);
        fireEvent.contextMenu(screen.getByRole("button", { name: "Filter by tag: work" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Move later" }));
        expect(onMove).toHaveBeenCalledWith(1);
    });
});
