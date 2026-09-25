import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventCard } from "../../../app/components/events/EventCard";
import { toPersonalEventViewModel } from "../../../app/lib/utils/personal-events";

vi.mock("../../../app/lib/api/track-event", () => ({ trackUsageEvent: vi.fn() }));
const event = { id: "event-1", label: "Anniversary", emoji: null, monthDay: "09-20", startedOn: null, notify: true };
const onOpen = vi.fn();
const onEdit = vi.fn();
const onDelete = vi.fn();
const onToggleReminder = vi.fn();
const onOpenInSchedule = vi.fn();
beforeEach(() => vi.clearAllMocks());
function setup() {
    return render(<EventCard item={toPersonalEventViewModel(event)} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onToggleReminder={onToggleReminder} onOpenInSchedule={onOpenInSchedule} />);
}
describe("EventCard selection", () => {
    it("opens from the card background and informational surfaces", () => {
        const { container } = setup();
        fireEvent.click(container.querySelector("[data-event-card]")!);
        fireEvent.click(screen.getByText("Countdown"));
        fireEvent.click(screen.getByText("Date"));
        expect(onOpen).toHaveBeenCalledTimes(3);
        expect(onOpen).toHaveBeenLastCalledWith(event);
        expect(onEdit).not.toHaveBeenCalled();
    });
    it("keeps reminder, delete and schedule actions independent", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Disable reminder for Anniversary" }));
        fireEvent.click(screen.getByRole("button", { name: "Delete Anniversary" }));
        fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
        expect(onToggleReminder).toHaveBeenCalledOnce();
        expect(onDelete).toHaveBeenCalledOnce();
        expect(onOpenInSchedule).toHaveBeenCalledOnce();
        expect(onOpen).not.toHaveBeenCalled();
        expect(onEdit).not.toHaveBeenCalled();
    });
    it("opens once through each keyboard-accessible edit button", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Anniversary" }));
        expect(onOpen).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        expect(onEdit).toHaveBeenCalledTimes(1);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });
});
