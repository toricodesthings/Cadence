import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as DropdownMenu from "../../../app/components/primitives/DropdownMenu";
import * as ContextMenu from "../../../app/components/primitives/ContextMenu";
import * as Popover from "../../../app/components/primitives/Popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../app/components/primitives/Select";
import { ValueSelect } from "../../../app/components/shared/DetailPanelSections";
import { MENU_HOVER } from "../../../app/components/primitives/menu-styles";

vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: true, isPhone: true, isTouch: true }) }));

const morphs = (el: Element) => {
    expect(el.className).toContain("morph-surface");
    expect(el.className).toContain("surface-floating");
};
const hovers = (el: Element) => { for (const c of MENU_HOVER.split(" ")) expect(el.className).toContain(c); };

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
});

describe("floating surfaces grow out of their trigger", () => {
    it("DropdownMenu", () => {
        render(<DropdownMenu.Root open><DropdownMenu.Trigger>Sort</DropdownMenu.Trigger><DropdownMenu.Content><DropdownMenu.Item>Newest</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root>);
        morphs(screen.getByRole("menu"));
        hovers(screen.getByRole("menuitem"));
    });

    it("ContextMenu", () => {
        render(<ContextMenu.Root><ContextMenu.Trigger>Row</ContextMenu.Trigger><ContextMenu.Content><ContextMenu.Item>Pin</ContextMenu.Item></ContextMenu.Content></ContextMenu.Root>);
        fireEvent.contextMenu(screen.getByText("Row"));
        morphs(screen.getByRole("menu"));
        hovers(screen.getByRole("menuitem"));
    });

    it("Popover", () => {
        render(<Popover.Root open><Popover.Trigger>Open</Popover.Trigger><Popover.Content>Body</Popover.Content></Popover.Root>);
        morphs(screen.getByRole("dialog"));
    });

    it("Select", () => {
        render(<Select open value="a"><SelectTrigger aria-label="Pick"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a">A</SelectItem></SelectContent></Select>);
        morphs(screen.getByRole("listbox"));
        hovers(screen.getByRole("option"));
    });
});

describe("a menu opened by touch covers its trigger", () => {
    it("the lift of the opening tap chooses nothing; the next tap on an item does", () => {
        const onSelect = vi.fn();
        render(<DropdownMenu.Root><DropdownMenu.Trigger>Actions</DropdownMenu.Trigger><DropdownMenu.Content><DropdownMenu.Item onSelect={onSelect}>Today</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root>);
        fireEvent.pointerDown(screen.getByText("Actions"), { pointerType: "touch", button: 0 });
        const item = screen.getByRole("menuitem", { name: "Today" });
        // The finger lifts where the trigger was, now an item.
        fireEvent.pointerUp(item, { pointerType: "touch" });
        fireEvent.click(item, { detail: 1 });
        // Chrome's tap click can carry detail 0; its pointerType still says touch.
        act(() => { item.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true, detail: 0, pointerType: "touch" })); });
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.pointerDown(item, { pointerType: "touch" });
        fireEvent.pointerUp(item, { pointerType: "touch" });
        fireEvent.click(item, { detail: 1 });
        expect(onSelect).toHaveBeenCalledOnce();
    });

    it("keyboard selection still works", () => {
        const onSelect = vi.fn();
        render(<DropdownMenu.Root open><DropdownMenu.Trigger>Actions</DropdownMenu.Trigger><DropdownMenu.Content><DropdownMenu.Item onSelect={onSelect}>Today</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root>);
        fireEvent.keyDown(screen.getByRole("menuitem", { name: "Today" }), { key: "Enter" });
        expect(onSelect).toHaveBeenCalledOnce();
    });
});

describe("ValueSelect", () => {
    it("is the Cadence select on a phone too", () => {
        render(<ValueSelect label="Priority" value="" onChange={() => {}} options={[{ value: "", label: "None" }, { value: "high", label: "High" }]} />);
        const trigger = screen.getByRole("combobox", { name: "Priority" });
        expect(trigger.tagName).toBe("BUTTON");
        expect(document.querySelector("select")).toBeNull();
    });
});
