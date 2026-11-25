import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { FocusPresetList, type PresetActions } from "../../../app/components/focus-views/FocusPresetList";
import type { SavedFocusView } from "../../../app/stores/focus-view-store";

const view = (over: Partial<SavedFocusView>): SavedFocusView =>
    ({
        id: over.name ?? "x",
        name: "x",
        isPinned: false,
        orderIndex: 0,
        source: "preset",
        presetKey: null,
        icon: null,
        color: null,
        definition: {} as SavedFocusView["definition"],
        ...over,
    }) as SavedFocusView;

const views = [
    view({ name: "Quick Wins", presetKey: "quick-wins", orderIndex: 0 }),
    view({ name: "Due Soon", presetKey: "due-soon", orderIndex: 1 }),
    view({ name: "Fresh save", orderIndex: -1, source: "composed" }),
    view({ name: "Pinned one", orderIndex: 5, isPinned: true, source: "composed" }),
];

const actions = (): PresetActions => ({ onSelect: vi.fn(), onEdit: vi.fn(), onTogglePin: vi.fn(), onDelete: vi.fn() });

const renderList = (a = actions()) => {
    render(
        <TooltipProvider>
            <FocusPresetList views={views} isActive={(v) => v.name === "Due Soon"} actions={a} />
        </TooltipProvider>,
    );
    return a;
};

/** Each row's name (its first line), in order. */
const names = () =>
    within(screen.getByRole("list", { name: "Presets" }))
        .getAllByRole("button")
        .filter((b) => b.hasAttribute("aria-pressed"))
        .map((b) => b.querySelector(".font-medium")?.textContent);

describe("FocusPresetList", () => {
    it("lists pinned first, then new saves above the built-ins", () => {
        renderList();
        expect(names()).toEqual(["Pinned one", "Fresh save", "Quick Wins", "Due Soon"]);
        expect(screen.getByRole("button", { name: /^Due Soon/ }).getAttribute("aria-pressed")).toBe("true");
    });

    it("searches names and descriptions", () => {
        renderList();
        fireEvent.change(screen.getByRole("searchbox", { name: "Search presets" }), { target: { value: "overdue" } });
        expect(names()).toEqual(["Due Soon"]);
        fireEvent.change(screen.getByRole("searchbox", { name: "Search presets" }), { target: { value: "zzz" } });
        expect(screen.getByRole("status").textContent).toContain("No presets match");
    });

    it("picks a preset on click", () => {
        const a = renderList();
        fireEvent.click(screen.getByRole("button", { name: /^Quick Wins/ }));
        expect(a.onSelect).toHaveBeenCalledWith(expect.objectContaining({ presetKey: "quick-wins" }));
    });
});
