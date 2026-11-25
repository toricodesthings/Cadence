import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickAddSurface } from "../../../app/components/quick-add/QuickAddSurface";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { stubTouch } from "../../helpers";

configure({ asyncUtilTimeout: 5000 });

const navigate = vi.fn();
const addEvent = vi.fn();
const toastSuccess = vi.fn();

vi.mock("react-router", () => ({
    useNavigate: () => navigate,
}));
vi.mock("sonner", () => ({
    toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({
    useTasks: () => ({ data: [] }),
}));
vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: { tasks: { intelligence: {} }, dateTime: { dateStyle: "mdy" } } }),
}));
vi.mock("../../../app/hooks/inbox/use-create-inbox-item", () => ({
    useCreateInboxItem: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../../app/components/calendar/AddPersonalEventDialog", () => ({
    useAddPersonalEvent: () => addEvent,
}));
vi.mock("../../../app/components/tasks/TaskComposer", () => ({
    useTaskComposer: () => ({
        title: "Add task",
        subtitle: "Lands in Capture unless you pick a list",
        isDirty: false,
        submit: { onSubmit: vi.fn(), submitLabel: "Add task", icon: () => null },
        reset: vi.fn(),
        children: <div>Task body</div>,
    }),
}));
vi.mock("../../../app/components/holding/CaptureInput", () => ({
    useCaptureComposer: () => ({
        title: "Add thought",
        subtitle: "Capture",
        isDirty: false,
        submit: { onSubmit: vi.fn(), submitLabel: "Save thought", icon: () => null },
        reset: vi.fn(),
        children: <div>Thought body</div>,
    }),
}));
vi.mock("../../../app/components/habits/CreateHabitDialog", () => ({
    useRoutineComposer: () => ({
        title: "Add routine",
        subtitle: "Routine",
        isDirty: false,
        submit: { onSubmit: vi.fn(), submitLabel: "Add routine", icon: () => null },
        reset: vi.fn(),
        children: <div>Routine body</div>,
    }),
}));
vi.mock("../../../app/components/shared/EmojiPickerPopover", () => ({
    EmojiPickerPopover: ({ children }: { children: React.ReactNode }) => children,
}));

stubTouch(true);

const onOpenChange = vi.fn();

function renderQuickAdd(initialTab?: "task" | "capture" | "habit" | "event") {
    return render(
        <Provider>
            <QuickAddSurface open onOpenChange={onOpenChange} initialTab={initialTab} />
        </Provider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("QuickAddSurface event tab", () => {
    it("switches to the Event tab and submits via the shared event composer", async () => {
        renderQuickAdd();

        const eventTab = screen.getByRole("tab", { name: "Event" });
        fireEvent.click(eventTab);

        expect(eventTab.getAttribute("aria-selected")).toBe("true");
        const nameInput = screen.getByRole("textbox", { name: "Event name" });
        fireEvent.change(nameInput, { target: { value: "Mom's birthday May 12" } });
        fireEvent.click(screen.getByRole("button", { name: "Add event" }));

        await waitFor(() => expect(addEvent).toHaveBeenCalled());
        expect(addEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Mom's birthday", monthDay: "05-12" }));
        expect(toastSuccess).toHaveBeenCalledWith("Event added");
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(navigate).toHaveBeenCalledWith("/events");
    });

    it("keeps the event draft when switching tabs and confirms before discarding", () => {
        renderQuickAdd("event");

        const nameInput = screen.getByRole("textbox", { name: "Event name" });
        fireEvent.change(nameInput, { target: { value: "Anniversary" } });

        fireEvent.click(screen.getByRole("tab", { name: "Task" }));
        expect(screen.getByText("Task body")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: "Event" }));
        expect((screen.getByRole("textbox", { name: "Event name" }) as HTMLInputElement).value).toBe("Anniversary");

        fireEvent.click(screen.getByRole("button", { name: "Close Add event" }));
        expect(screen.getByText("Discard this event?")).toBeTruthy();
        expect(onOpenChange).not.toHaveBeenCalled();
    });
});
