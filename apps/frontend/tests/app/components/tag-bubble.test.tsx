import { fireEvent, render, screen } from "@testing-library/react";
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
    const reorder = (over: object = {}) => ({ first: false, last: false, onMove: vi.fn(), onDragStart: vi.fn(), dragging: false, ...over });

    it("picking it up starts the reorder and still carries the tag for capture rows", () => {
        const props = reorder();
        render(<TagBubble tag={tag} isActive={false} onClick={vi.fn()} reorder={props} />);
        const setData = vi.fn();
        fireEvent.dragStart(screen.getByRole("button", { name: "Filter by tag: work" }), { dataTransfer: { setData } });
        expect(setData).toHaveBeenCalledWith("application/x-cadence-tag", "tag-1");
        expect(props.onDragStart).toHaveBeenCalledOnce();
    });

    it("Move later in the menu moves one step", () => {
        const props = reorder();
        render(<TagBubble tag={tag} isActive={false} onClick={vi.fn()} reorder={props} />);
        fireEvent.contextMenu(screen.getByRole("button", { name: "Filter by tag: work" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Move later" }));
        expect(props.onMove).toHaveBeenCalledWith(1);
    });
});
