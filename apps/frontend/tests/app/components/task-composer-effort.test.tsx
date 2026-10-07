import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskComposer } from "../../../app/components/tasks/TaskComposer";
import { Composer } from "../../../app/components/shared/Composer";
import { projectEffortSuggestion } from "@cadence/domain/effort-evidence";

// Real parser and real composers: under four parallel zone runs a wait needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });

const create = vi.fn();
vi.mock("../../../app/hooks/tasks/use-create-task", () => ({ useCreateTask: () => ({ mutate: create, isPending: false }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/sections/use-sections", () => ({ useSections: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: {} }, dateTime: { dateStyle: "mdy" } } }) }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: false, isPhone: false, isWide: true }) }));
// The real policy over a fixed history of High lab choices; the network read is the only thing replaced.
vi.mock("../../../app/hooks/tasks/use-effort-suggestion", () => ({
    useEffortSuggestion: (i: { title: string; projectId: string | null; chosen: 1 | 2 | 3 | null | undefined; dismissed: boolean; literal?: boolean }) =>
        projectEffortSuggestion({
            ...i,
            literal: i.literal ?? false,
            today: "2026-10-06",
            enabled: true,
            supported: true,
            evidence: [1, 2, 3, 4].map((n) => ({ title: `Class X Lab ${n}`, projectId: null, level: 3 as const, origin: "manual" as const, day: `2026-09-${10 + n}` })),
        }),
}));

function Host() {
    const { reset: _reset, ...draft } = useTaskComposer({ open: true, tasks: [], onSaved: () => {} });
    return <Composer open inline onClose={() => {}} {...draft} />;
}

const type = (text: string) => fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), { target: { value: text } });
const add = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    return create.mock.calls[0][0];
};

beforeEach(() => vi.clearAllMocks());

describe("Effort suggestion in the task composer", () => {
    it("suggests from the person's own choices, and ignoring it saves with Effort unset", async () => {
        render(<Host />);
        type("Class X Lab");
        expect(await screen.findByText("Suggested effort: High")).toBeTruthy();
        const sent = await add();
        expect(sent.title).toBe("Class X Lab");
        expect(sent.effort ?? null).toBeNull();
        expect(sent.effortOrigin).toBeUndefined();
    });

    it("using it fills Effort and records that it was accepted; the title keeps every word", async () => {
        render(<Host />);
        type("Class X Lab");
        fireEvent.click(await screen.findByRole("button", { name: "Use High effort" }));
        const sent = await add();
        expect(sent).toMatchObject({ title: "Class X Lab", effort: 3, effortOrigin: "accepted" });
    });

    it("dismissing hides it for this draft", async () => {
        render(<Host />);
        type("Class X Lab");
        fireEvent.click(await screen.findByRole("button", { name: "Dismiss suggested effort" }));
        expect(screen.queryByText(/Suggested effort/)).toBeNull();
        type("Class X Lab 2");
        expect(screen.queryByText(/Suggested effort/)).toBeNull();
        expect((await add()).effort ?? null).toBeNull();
    });

    it("suggests nothing for a different class", async () => {
        render(<Host />);
        type("Class Y Lab");
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Task title" })).toBeTruthy());
        expect(screen.queryByText(/Suggested effort/)).toBeNull();
    });
});
