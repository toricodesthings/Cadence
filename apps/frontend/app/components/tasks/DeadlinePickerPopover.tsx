import React, { useState } from "react";
import * as Popover from "../primitives/Popover";
import * as Dialog from "../primitives/Dialog";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { QuickScheduleSurface } from "./QuickScheduleSurface";

interface DeadlinePickerPopoverProps {
    children: React.ReactNode;
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd?: string | null;
    recurrenceRule: string | null;
    onChange: (updates: {
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd?: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }) => void;
}
export const DeadlinePickerPopover: React.FC<DeadlinePickerPopoverProps> = ({
    children,
    dueDate,
    scheduledStart,
    scheduledEnd,
    recurrenceRule,
    onChange,
}) => {
    const shell = useShellMode();
    const [open, setOpen] = useState(false);
    if (shell.isPhone) {
        return (
            <Dialog.Dialog open={open} onOpenChange={setOpen}>
                <Dialog.DialogTrigger asChild>{children}</Dialog.DialogTrigger>
                <Dialog.DialogContent className="max-w-lg overflow-hidden p-0 sm:max-w-lg">
                    <div className="border-b border-twilight-border/40 px-5 py-4">
                        <Dialog.DialogHeader className="text-left">
                            <Dialog.DialogTitle>Schedule task</Dialog.DialogTitle>
                            <Dialog.DialogDescription>Choose a date, time, range, or recurrence.</Dialog.DialogDescription>
                        </Dialog.DialogHeader>
                    </div>
                    <QuickScheduleSurface
                        dueDate={dueDate}
                        scheduledStart={scheduledStart}
                        scheduledEnd={scheduledEnd}
                        recurrenceRule={recurrenceRule}
                        isOpen={open}
                        onChange={onChange}
                        onRequestClose={() => setOpen(false)}
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
                aria-label="Deadline picker"
            >
                <QuickScheduleSurface
                    dueDate={dueDate}
                    scheduledStart={scheduledStart}
                    scheduledEnd={scheduledEnd}
                    recurrenceRule={recurrenceRule}
                    isOpen={open}
                    onChange={onChange}
                    onRequestClose={() => setOpen(false)}
                />
            </Popover.Content>
        </Popover.Root>
    );
};
