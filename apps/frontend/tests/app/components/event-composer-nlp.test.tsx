import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalEventEditorDialog } from "../../../app/components/events/PersonalEventEditorDialog";
import { Provider } from "../../../app/components/primitives/Tooltip";

// Real parser and real composers: under four parallel zone runs a wait needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 });

const saveThought = vi.fn();
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: {} }, dateTime: { dateStyle: "mdy" } } }) }));
vi.mock("../../../app/hooks/inbox/use-create-inbox-item", () => ({ useCreateInboxItem: () => ({ mutate: saveThought }) }));
vi.mock("../../../app/hooks/ui/use-coarse-pointer", () => ({ useIsCoarsePointer: () => true }));
vi.mock("../../../app/components/shared/EmojiPickerPopover", () => ({ EmojiPickerPopover: ({ children }: { children: React.ReactNode }) => children }));

const onSubmit = vi.fn();
const setup = () => {
    render(<Provider><PersonalEventEditorDialog open onClose={() => {}} onSubmit={onSubmit} /></Provider>);
    return screen.getByRole("textbox", { name: "Event name" });
};

beforeEach(() => vi.clearAllMocks());

describe("event composer language", () => {
    it("reads a month and day from the name", async () => {
        const name = setup();
        fireEvent.change(name, { target: { value: "Mom's birthday May 12" } });
        fireEvent.keyDown(name, { key: "Enter" });
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ label: "Mom's birthday", monthDay: "05-12" });
    });

    it("does not turn a timed request into a yearly event, and keeps the words", async () => {
        const name = setup();
        fireEvent.change(name, { target: { value: "Dinner Friday 7pm" } });
        expect(await screen.findByText(/can't be saved here/)).toBeTruthy();
        fireEvent.keyDown(name, { key: "Enter" });
        expect(onSubmit).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Save as thought" }));
        expect(saveThought).toHaveBeenCalledWith(expect.objectContaining({ rawText: "Dinner Friday 7pm" }));
    });

    it("keeps a year out of a yearly event instead of dropping it", async () => {
        const name = setup();
        fireEvent.change(name, { target: { value: "Launch May 12, 2027" } });
        expect(await screen.findByText(/can't be saved here/)).toBeTruthy();
    });
});
