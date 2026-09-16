import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalEventEditor } from "../../../app/components/events/PersonalEventEditor";
import { Provider } from "../../../app/components/primitives/Tooltip";
import type { PersonalEvent } from "../../../app/types/settings";

vi.mock("../../../app/components/events/EventDatePicker", () => ({
    EventDatePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Event date" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("../../../app/components/shared/EmojiPickerPopover", () => ({
    EmojiPickerPopover: ({ children }: { children: React.ReactNode }) => children,
}));

const event: PersonalEvent = { id: "event-1", label: "Birthday", emoji: null, monthDay: "10-12", notify: true, startedOn: null };
const onChange = vi.fn();
const onClose = vi.fn();
const onDelete = vi.fn();
function editor(value = event) {
    return <Provider><PersonalEventEditor event={value} onChange={onChange} onClose={onClose} onDelete={onDelete} /></Provider>;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});

afterEach(() => vi.unstubAllGlobals());

describe("PersonalEventEditor", () => {
    it("saves a trimmed title on blur and rejects empty titles", () => {
        render(editor());
        const title = screen.getByRole("textbox", { name: "Event title" });
        fireEvent.change(title, { target: { value: "  Anniversary  " } });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.blur(title);
        expect(onChange).toHaveBeenCalledWith({ label: "Anniversary" });
        onChange.mockClear();
        fireEvent.change(title, { target: { value: "  " } });
        fireEvent.blur(title);
        expect(onChange).not.toHaveBeenCalled();
        expect((title as HTMLTextAreaElement).value).toBe("Birthday");
    });

    it("saves date, milestone and reminder fields in place", () => {
        render(editor());
        fireEvent.click(screen.getByRole("button", { name: /Details/ }));
        fireEvent.change(screen.getByRole("textbox", { name: "Event date" }), { target: { value: "2027-03-15" } });
        expect(onChange).toHaveBeenCalledWith({ monthDay: "03-15" });
        fireEvent.click(screen.getByRole("switch", { name: "Enable milestone tracking for this personal event" }));
        expect(onChange).toHaveBeenCalledWith({ startedOn: expect.stringMatching(/^\d{4}-10-12$/) });
        fireEvent.click(screen.getByRole("switch", { name: "Enable notifications for this personal event" }));
        expect(onChange).toHaveBeenCalledWith({ notify: false });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("reflects updated data and keeps delete separate from close", () => {
        const view = render(editor());
        view.rerender(editor({ ...event, label: "Updated elsewhere" }));
        expect((screen.getByRole("textbox", { name: "Event title" }) as HTMLTextAreaElement).value).toBe("Updated elsewhere");
        fireEvent.click(screen.getByRole("button", { name: /Delete event/ }));
        expect(onDelete).toHaveBeenCalledOnce();
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Close event details" }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
