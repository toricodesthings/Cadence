import { useState } from "react";
import { Trash2 } from "lucide-react";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { useClearArchive } from "../../hooks/ai/use-conversation-mutations";
import { cn } from "../../lib/utils";

/**
 * "Clear archive": deletes EVERY archived conversation after a confirm. Shared by
 * the Conversations drawer and Settings › Assistant.
 */
export function ClearArchiveButton({ disabled, className }: { disabled?: boolean; className?: string }) {
    const [open, setOpen] = useState(false);
    const clear = useClearArchive();

    return (
        <AlertDialog.Root open={open} onOpenChange={setOpen}>
            <AlertDialog.Trigger asChild>
                <Button variant="danger" size="sm" disabled={disabled || clear.isPending} className={cn("gap-1.5", className)}>
                    <Trash2 size={14} aria-hidden />
                    Clear archive
                </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>Clear the archive?</AlertDialog.Title>
                    <AlertDialog.Description>
                        Every archived conversation is deleted for good, with its messages and photos. It
                        can&rsquo;t be undone. Conversations that aren&rsquo;t archived stay.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md">
                            Cancel
                        </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button variant="danger" size="md" onClick={() => clear.mutate()}>
                            Delete all archived
                        </Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
