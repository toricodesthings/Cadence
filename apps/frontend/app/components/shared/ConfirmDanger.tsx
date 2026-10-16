import type { ReactNode } from "react";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";

interface ConfirmDangerProps {
    /** The control that opens the confirm (rendered as the dialog's trigger). */
    trigger: ReactNode;
    title: ReactNode;
    description: ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

/** A "this can't be undone" confirm: say what goes, then Cancel or the red action. */
export function ConfirmDanger({ trigger, title, description, confirmLabel, onConfirm, open, onOpenChange }: ConfirmDangerProps) {
    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>{title}</AlertDialog.Title>
                    <AlertDialog.Description>{description}</AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button variant="danger" size="md" onClick={onConfirm}>{confirmLabel}</Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
