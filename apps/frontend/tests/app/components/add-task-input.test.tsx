import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddTaskInput } from "../../../app/components/tasks/AddTaskInput";

// Real parser and real composers: under four parallel zone runs a wait needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });

const createTaskMutateMock = vi.fn();

vi.mock("../../../app/hooks/tasks/use-create-task", () => ({
    useCreateTask: () => ({
        mutate: createTaskMutateMock,
        isPending: false,
    }),
}));

vi.mock("../../../app/hooks/tasks/use-effort-suggestion", () => ({ useEffortSuggestion: () => null }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({
    useProjects: () => ({ data: [{ id: "p-ops", name: "Client Ops" }] }),
}));

vi.mock("../../../app/hooks/tags/use-tags", () => ({
    useTags: () => ({ data: [] }),
}));

vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({
        data: {
            tasks: {
                newTaskPlacement: "bottom",
                intelligence: {
                    nlpEnabled: true,
                    autoParseOnCapture: true,
                    showExplanations: false,
                    confidenceThreshold: "medium",
                    lowStimulationMode: false,
                },
            },
            dateTime: {
                dateStyle: "mdy",
            },
            appearance: {
                motion: "full",
            },
        },
    }),
}));

vi.mock("../../../app/components/tasks/QuickAddActionTray", () => ({
    QuickAddActionTray: () => <div data-testid="quick-add-action-tray" />,
}));

vi.mock("../../../app/components/tasks/DeadlinePickerPopover", () => ({
    DeadlinePickerPopover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../app/components/calendar/AddPersonalEventDialog", () => ({
    AddPersonalEventDialog: () => null,
}));

vi.mock("../../../app/lib/api/track-event", () => ({
    trackUsageEvent: vi.fn(),
}));

function renderInput(projectId?: string) {
    return render(<AddTaskInput tasks={[]} projectId={projectId} />);
}

// The real parser runs here: the draft that saves is the one on screen.
const submitText = async (text: string, projectId?: string) => {
    renderInput(projectId);
    const input = screen.getByLabelText("New task title");
    fireEvent.change(input, { target: { value: text } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(createTaskMutateMock).toHaveBeenCalled());
    return createTaskMutateMock.mock.calls[0][0];
};

describe("AddTaskInput", () => {
    beforeEach(() => {
        createTaskMutateMock.mockReset();
    });

    it("inside a list, another list's name stays in the title instead of vanishing", async () => {
        const sent = await submitText("Plan budget in Client Ops", "p-home");
        expect(sent).toMatchObject({ title: "Plan budget in Client Ops", projectId: "p-home" });
    });

    it("outside a list, a list named in words is where it goes", async () => {
        expect(await submitText("Plan budget in Client Ops")).toMatchObject({ title: "Plan budget", projectId: "p-ops" });
    });

    it("waiting on someone saves as waiting work, so the person shows", async () => {
        const sent = await submitText("Waiting on Jordan for the contract");
        expect(sent).toMatchObject({ state: "WAITING", waitingOn: "Jordan" });
    });

    it("preserves the raw title when nothing is recognized", async () => {
        const sent = await submitText("Very long title that should stay exactly as typed on first save");
        expect(sent.title).toBe("Very long title that should stay exactly as typed on first save");
    });

    it("sends a timed block as instants only when a time is typed", async () => {
        const sent = await submitText("Submit report tomorrow at 5pm");
        expect(sent).toMatchObject({ title: "Submit report", nlp: { resolved: true } });
        expect(sent.scheduledStart).toBeDefined();
        expect(sent.dueDate).toBeUndefined();
        expect(sent).not.toHaveProperty("isAllDay");
    });

    it("sends a typed day alone as a deadline day with no time", async () => {
        const sent = await submitText("Pay rent Mar 31");
        expect(sent).toMatchObject({ title: "Pay rent", dueDate: expect.stringMatching(/-03-31$/) });
        expect(sent.scheduledStart).toBeUndefined();
    });

    it("keeps a flexible window in the title and sets no date", async () => {
        const sent = await submitText("do this thing in the next 2 days");
        expect(sent.title).toBe("do this thing in the next 2 days");
        expect(sent.dueDate).toBeUndefined();
    });

    it("never drops a clause: a second date stays in the title", async () => {
        const sent = await submitText("Review draft tomorrow and send Friday");
        expect(sent.title).toContain("Friday");
    });

    it("keeps typed words literal after Keep as written", async () => {
        renderInput();
        const input = screen.getByLabelText("New task title");
        fireEvent.change(input, { target: { value: "Call Sam tomorrow" } });
        fireEvent.click(await screen.findByRole("button", { name: "Keep as written" }));
        fireEvent.submit(input.closest("form")!);
        await waitFor(() => expect(createTaskMutateMock).toHaveBeenCalled());
        const sent = createTaskMutateMock.mock.calls[0][0];
        expect(sent.title).toBe("Call Sam tomorrow");
        expect(sent.dueDate).toBeUndefined();
    });

    it("saves once on a rapid double submit", async () => {
        renderInput();
        const input = screen.getByLabelText("New task title");
        fireEvent.change(input, { target: { value: "Call Sam tomorrow" } });
        fireEvent.submit(input.closest("form")!);
        fireEvent.submit(input.closest("form")!);
        await waitFor(() => expect(createTaskMutateMock).toHaveBeenCalled());
        expect(createTaskMutateMock).toHaveBeenCalledTimes(1);
    });
});
