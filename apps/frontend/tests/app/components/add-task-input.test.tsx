import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddTaskInput } from "../../../app/components/tasks/AddTaskInput";

const createTaskMutateMock = vi.fn();
const useNlpParseMock = vi.fn();

vi.mock("../../../app/hooks/tasks", () => ({
    useCreateTask: () => ({
        mutate: createTaskMutateMock,
        isPending: false,
    }),
}));

vi.mock("../../../app/hooks/projects", () => ({
    useProjects: () => ({ data: [] }),
}));

vi.mock("../../../app/hooks/tags", () => ({
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

vi.mock("../../../app/hooks/use-nlp-parse", () => ({
    useNlpParse: (options: unknown) => useNlpParseMock(options),
}));

vi.mock("../../../app/components/tasks/QuickAddActionTray", () => ({
    QuickAddActionTray: () => <div data-testid="quick-add-action-tray" />,
}));

vi.mock("../../../app/components/tasks/ParseSummaryChips", () => ({
    ParseSummaryChips: () => null,
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

function renderInput() {
    return render(<AddTaskInput tasks={[]} />);
}

describe("AddTaskInput", () => {
    beforeEach(() => {
        createTaskMutateMock.mockReset();
        useNlpParseMock.mockReset();
        useNlpParseMock.mockReturnValue({
            cleanedTitle: "",
            dueDate: null,
            scheduledStart: null,
            recurrenceRule: null,
            priority: null,
            projectId: null,
            tagIds: [],
            tokens: [],
            parseResult: { entities: [] },
            summary: "",
            waitingOn: null,
            durationMinutes: null,
            dueHumanLabel: null,
        });
    });

    it("preserves the raw title when no accepted NLP entity is applied", () => {
        renderInput();

        const input = screen.getByLabelText("New task title");
        fireEvent.change(input, { target: { value: "Very long title that should stay exactly as typed on first save" } });
        fireEvent.submit(input.closest("form")!);

        expect(createTaskMutateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Very long title that should stay exactly as typed on first save",
            }),
        );
    });

    it("submits scheduledStart and non-all-day timing when NLP detects a time", () => {
        useNlpParseMock.mockReturnValue({
            cleanedTitle: "Submit report",
            dueDate: "2026-03-29",
            scheduledStart: "2026-03-29T17:00:00.000Z",
            recurrenceRule: null,
            priority: null,
            projectId: null,
            tagIds: [],
            tokens: [],
            parseResult: { entities: [] },
            summary: "",
            waitingOn: null,
            durationMinutes: null,
            dueHumanLabel: "Tomorrow at 5:00 PM",
        });

        renderInput();

        const input = screen.getByLabelText("New task title");
        fireEvent.change(input, { target: { value: "Submit report tomorrow at 5pm" } });
        fireEvent.submit(input.closest("form")!);

        expect(createTaskMutateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Submit report",
                dueDate: "2026-03-29",
                scheduledStart: "2026-03-29T17:00:00.000Z",
                isAllDay: false,
            }),
        );
    });
});
