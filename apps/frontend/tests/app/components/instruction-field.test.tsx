import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstructionField } from "../../../app/components/weekly-review/InstructionField";

// Real parser and real composers: under four parallel zone runs a wait needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });

vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [{ id: "p-work", name: "Work" }] }) }));
vi.mock("../../../app/hooks/sections/use-sections", () => ({ useAllSections: () => [{ id: "s-later", name: "Later This Week", projectId: "p-work" }] }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: {} }, dateTime: { dateStyle: "mdy" } } }) }));

const setup = (onApply = vi.fn()) => {
    render(<InstructionField placeholder="Say a change" applyLabel="Apply to 2 tasks" onApply={onApply} />);
    return { onApply, input: screen.getByRole("textbox", { name: "Say a change" }), apply: screen.getByRole("button", { name: /Apply to 2 tasks/ }) as HTMLButtonElement };
};

describe("InstructionField", () => {
    it("shows the change before anything is applied, and applies it once", async () => {
        const { onApply, input, apply } = setup();
        expect(apply.disabled).toBe(true);
        fireEvent.change(input, { target: { value: "keep waiting until Monday" } });
        await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Waiting · Hidden until/));
        await waitFor(() => expect(apply.disabled).toBe(false));
        fireEvent.click(apply);
        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        expect(onApply.mock.calls[0][0]).toMatchObject({ state: "WAITING", notBefore: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
        expect(onApply.mock.calls[0][0].dueDate).toBeUndefined();
    });

    it("names what it could not read and offers nothing for nonsense", async () => {
        const { input, apply } = setup();
        fireEvent.change(input, { target: { value: "sort of soon" } });
        expect((await screen.findByRole("status")).textContent).toMatch(/Nothing I can change/);
        expect(apply.disabled).toBe(true);
    });

    it("puts in an existing list by name and flags the leftover", async () => {
        const { input } = setup();
        fireEvent.change(input, { target: { value: "put these in Work / Admin" } });
        await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Work.*not read: “Admin”/));
    });

    it("names a section, shown as list › section, never as a date", async () => {
        const { onApply, input, apply } = setup();
        fireEvent.change(input, { target: { value: "put in Later This Week" } });
        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Work › Later This Week"));
        fireEvent.click(apply);
        await waitFor(() => expect(onApply).toHaveBeenCalledWith({ projectId: "p-work", sectionId: "s-later" }));
    });
});
