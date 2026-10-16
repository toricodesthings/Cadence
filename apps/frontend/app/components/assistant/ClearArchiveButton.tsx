import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDanger } from "../shared/ConfirmDanger";
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
        <ConfirmDanger
            open={open}
            onOpenChange={setOpen}
            trigger={
                <Button variant="danger" size="sm" disabled={disabled || clear.isPending} className={cn("gap-1.5", className)}>
                    <Trash2 size={14} aria-hidden />
                    Clear archive
                </Button>
            }
            title="Clear the archive?"
            description={<>Every archived conversation is deleted for good, with its messages and photos. It can&rsquo;t be undone. Conversations that aren&rsquo;t archived stay.</>}
            confirmLabel="Delete all archived"
            onConfirm={() => clear.mutate()}
        />
    );
}
