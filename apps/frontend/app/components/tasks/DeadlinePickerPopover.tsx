import React, { useState } from "react";
import * as Popover from "../primitives/Popover";
import * as Dialog from "../primitives/Dialog";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { Instant, LocalDate } from "@cadence/domain/time";
import { QuickScheduleSurface, type ScheduleUpdates } from "./QuickScheduleSurface";

interface DeadlinePickerPopoverProps {
    children: React.ReactNode;
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
}) => {
    const shell = useShellMode();
    const [ownOpen, setOwnOpen] = useState(false);
    const open = controlledOpen ?? ownOpen;
    const setOpen = (next: boolean) => { setOwnOpen(next); onOpenChange?.(next); };
    const moment = variant === "moment";
    if (shell.isPhone) {
        return (
            <Dialog.Dialog open={open} onOpenChange={setOpen}>
                <Dialog.DialogTrigger asChild>{children}</Dialog.DialogTrigger>
                <Dialog.DialogContent className="max-w-lg overflow-hidden p-0 sm:max-w-lg">
                    <div className="border-b border-twilight-border/40 px-5 py-4">
                        <Dialog.DialogHeader className="text-left">
                            <Dialog.DialogTitle>{moment ? "Remind me" : "Schedule task"}</Dialog.DialogTitle>
                            <Dialog.DialogDescription>{moment ? "Choose a day and time." : "Choose a date, time, range, or recurrence."}</Dialog.DialogDescription>
                        </Dialog.DialogHeader>
                    </div>
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
                </Dialog.DialogContent>
            </Dialog.Dialog>
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
