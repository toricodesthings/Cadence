import React, { useState } from "react";
import * as Popover from "../primitives/Popover";
import { UtilitySheet } from "../shared/UtilitySheet";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { Instant, LocalDate } from "@cadence/domain/time";
import { QuickScheduleSurface, type ScheduleUpdates } from "./QuickScheduleSurface";

interface DeadlinePickerPopoverProps {
    /** One element: the trigger. */
    children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
    /** A day: the deadline, or the first day of an all-day span. Never a time. */
    dueDate: LocalDate | null;
    /** Inclusive last day of an all-day span. */
    endDate?: LocalDate | null;
    /** A timed block (instants). */
    scheduledStart: Instant | null;
    scheduledEnd?: Instant | null;
    recurrenceRule: string | null;
    onChange: (updates: ScheduleUpdates) => void;
    /** "moment" picks one date and time (reminders, check-ins). */
    variant?: "schedule" | "moment";
    /** Optional control of the open state (e.g. open it from a switch). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** On close, focus goes here instead of back to the trigger (a field that keeps typing, then Enter saves). */
    returnFocus?: () => void;
}
export const DeadlinePickerPopover: React.FC<DeadlinePickerPopoverProps> = ({
    children,
    dueDate,
    endDate,
    scheduledStart,
    scheduledEnd,
    recurrenceRule,
    onChange,
    variant = "schedule",
    open: controlledOpen,
    onOpenChange,
    returnFocus,
}) => {
    const shell = useShellMode();
    const [ownOpen, setOwnOpen] = useState(false);
    const open = controlledOpen ?? ownOpen;
    const setOpen = (next: boolean) => { setOwnOpen(next); onOpenChange?.(next); };
    const moment = variant === "moment";
    const onCloseAutoFocus = returnFocus ? (event: Event) => { event.preventDefault(); returnFocus(); } : undefined;
    if (shell.isPhone) {
        // A phone gets the sheet every compact panel uses; its trigger only opens it.
        return (
            <>
                {React.cloneElement(children, {
                    "aria-haspopup": "dialog",
                    "aria-expanded": open,
                    onClick: (event: React.MouseEvent<HTMLElement>) => { children.props.onClick?.(event); setOpen(true); },
                })}
                <UtilitySheet
                    title={moment ? "Remind me" : "Schedule task"}
                    open={open}
                    onClose={() => setOpen(false)}
                    flush
                >
                    <QuickScheduleSurface
                        dueDate={dueDate}
                        endDate={endDate}
                        scheduledStart={scheduledStart}
                        scheduledEnd={scheduledEnd}
                        recurrenceRule={recurrenceRule}
                        isOpen={open}
                        onChange={onChange}
                        onRequestClose={() => setOpen(false)}
                        variant={variant}
                    />
                </UtilitySheet>
            </>
        );
    }

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>{children}</Popover.Trigger>
            <Popover.Content
                className="w-[320px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain p-0"
                side="bottom"
                align="start"
                role="dialog"
                aria-label={moment ? "Reminder picker" : "Deadline picker"}
                onCloseAutoFocus={onCloseAutoFocus}
            >
                <QuickScheduleSurface
                    dueDate={dueDate}
                    endDate={endDate}
                    scheduledStart={scheduledStart}
                    scheduledEnd={scheduledEnd}
                    recurrenceRule={recurrenceRule}
                    isOpen={open}
                    onChange={onChange}
                    onRequestClose={() => setOpen(false)}
                    variant={variant}
                />
            </Popover.Content>
        </Popover.Root>
    );
};
