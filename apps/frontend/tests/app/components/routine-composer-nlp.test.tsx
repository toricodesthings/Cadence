import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateHabitDialog } from "../../../app/components/habits/CreateHabitDialog";
import { Provider } from "../../../app/components/primitives/Tooltip";

// Real parser and real composers: under four parallel zone runs a wait needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });

const create = vi.fn();
vi.mock("../../../app/hooks/habits/use-create-habit", () => ({ useCreateHabit: () => ({ mutate: create, isPending: false }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: {} }, dateTime: { dateStyle: "mdy" } } }) }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: false, isPhone: false, isWide: true }) }));
vi.mock("../../../app/components/habits/CadencePicker", () => ({ CadencePicker: ({ value }: { value: string }) => <div data-testid="cadence">{value}</div> }));
vi.mock("../../../app/components/shared/EmojiPickerPopover", () => ({ EmojiPickerPopover: ({ children }: { children: React.ReactNode }) => children }));

const setup = () => {
    render(<Provider><CreateHabitDialog open onOpenChange={() => {}} /></Provider>);
    return screen.getByRole("textbox", { name: "Routine name" });
};

beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});

describe("routine composer language", () => {
    it("reads cadence and time from the name and saves exactly what the fields show", async () => {
        const name = setup();
        fireEvent.change(name, { target: { value: "Stretch every weekday at 7am" } });
        await waitFor(() => expect(screen.getByTestId("cadence").textContent).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"));
        fireEvent.keyDown(name, { key: "Enter" });
        await waitFor(() => expect(create).toHaveBeenCalled());
        expect(create.mock.calls[0][0]).toMatchObject({
            title: "Stretch",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
            targetTime: "07:00",
        });
    });

    it("keeps daily and the plain name when nothing is said", async () => {
        const name = setup();
        fireEvent.change(name, { target: { value: "Read" } });
        fireEvent.keyDown(name, { key: "Enter" });
        await waitFor(() => expect(create).toHaveBeenCalled());
        expect(create.mock.calls[0][0]).toMatchObject({ title: "Read", recurrenceRule: "FREQ=DAILY", targetTime: null });
    });
});
