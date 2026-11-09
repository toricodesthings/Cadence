import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventCard } from "../../../app/components/events/EventCard";
import { toPersonalEventViewModel } from "../../../app/lib/utils/personal-events";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";

vi.mock("../../../app/lib/api/track-event", () => ({ trackUsageEvent: vi.fn() }));
const event = { id: "event-1", label: "Anniversary", emoji: null, monthDay: "09-20", startedOn: null, notify: true };
const onOpen = vi.fn();
const onEdit = vi.fn();
const onDelete = vi.fn();
const onToggleReminder = vi.fn();
const onOpenInSchedule = vi.fn();
const onRename = vi.fn();
beforeEach(() => vi.clearAllMocks());
function setup() {
    return render(<TooltipProvider><EventCard item={toPersonalEventViewModel(event)} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onToggleReminder={onToggleReminder} onOpenInSchedule={onOpenInSchedule} onRename={onRename} /></TooltipProvider>);
}
describe("EventCard selection", () => {
    it("opens from the card background and informational surfaces", () => {
        const { container } = setup();
        fireEvent.click(container.querySelector("[data-event-card]")!);
        fireEvent.click(screen.getByText(toPersonalEventViewModel(event).countdownLabel));
        expect(onOpen).toHaveBeenCalledTimes(2);
        expect(onOpen).toHaveBeenLastCalledWith(event);
        expect(onEdit).not.toHaveBeenCalled();
    });
    it("keeps reminder, delete and schedule actions independent", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Turn off reminder for Anniversary" }));
        fireEvent.click(screen.getByRole("button", { name: "Delete Anniversary" }));
        fireEvent.click(screen.getByRole("button", { name: "Open in Schedule" }));
        expect(onToggleReminder).toHaveBeenCalledOnce();
        expect(onDelete).toHaveBeenCalledOnce();
        expect(onOpenInSchedule).toHaveBeenCalledOnce();
        expect(onOpen).not.toHaveBeenCalled();
        expect(onEdit).not.toHaveBeenCalled();
    });
    it("opens details only through Edit", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        expect(onEdit).toHaveBeenCalledTimes(1);
        expect(onOpen).not.toHaveBeenCalled();
    });
    it("renames from the title in place, and Escape keeps the old name", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Rename Anniversary" }));
        const input = screen.getByRole("textbox", { name: "Event name" });
        fireEvent.change(input, { target: { value: "Our anniversary" } });
        fireEvent.keyDown(input, { key: "Enter" });
        fireEvent.blur(input);
        expect(onRename).toHaveBeenCalledWith(event, "Our anniversary");
        fireEvent.click(screen.getByRole("button", { name: "Rename Anniversary" }));
        const again = screen.getByRole("textbox", { name: "Event name" });
        fireEvent.change(again, { target: { value: "Nope" } });
        fireEvent.keyDown(again, { key: "Escape" });
        fireEvent.blur(again);
        expect(onRename).toHaveBeenCalledOnce();
        expect(onOpen).not.toHaveBeenCalled();
    });
});
