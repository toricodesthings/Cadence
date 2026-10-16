import { useState } from "react";
import * as Dialog from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { useUpdateProject } from "../../hooks/projects/use-update-project";
import { EmojiPickerPopover } from "./EmojiPickerPopover";
import { ProjectColorPicker } from "./ProjectColorPicker";

interface EditListDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    list: { id: string; name: string; colorAccent: string; emoji?: string | null };
}

/** Rename a list and restyle it (emoji + colour) in one place. The form mounts on open, so it always starts from the list's current look. */
export function EditListDialog({ open, onOpenChange, list }: EditListDialogProps) {
    return (
        <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
            <Dialog.DialogContent className="sm:max-w-sm" hideCloseButton>
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>Rename / Edit list</Dialog.DialogTitle>
                    <Dialog.DialogDescription>
                        Enter a new name or style for <span className="text-twilight-text">{list.name}</span>.
                    </Dialog.DialogDescription>
                </Dialog.DialogHeader>
                <EditListForm list={list} onDone={() => onOpenChange(false)} />
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}

function EditListForm({ list, onDone }: { list: EditListDialogProps["list"]; onDone: () => void }) {
    const updateProject = useUpdateProject();
    const [name, setName] = useState(list.name);
    const [color, setColor] = useState(list.colorAccent);
    const [emoji, setEmoji] = useState(list.emoji ?? "");

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed) updateProject.mutate({ id: list.id, name: trimmed, colorAccent: color, emoji: emoji || null });
        onDone();
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex gap-2">
                <EmojiPickerPopover emoji={emoji} onSelect={setEmoji} />
                <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="List name"
                    className="flex-1 w-full rounded-xl bg-white/[0.06] border border-twilight-border px-4 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted/80 outline-none focus:border-accent-primary/40 transition-colors"
                    onKeyDown={(e) => e.key === "Escape" && onDone()}
                />
            </div>
            <ProjectColorPicker value={color} onChange={setColor} />
            <Dialog.DialogFooter>
                <Button type="button" variant="ghost" size="md" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" variant="cardPrimary" size="md" disabled={!name.trim()}>
                    Save changes
                </Button>
            </Dialog.DialogFooter>
        </form>
    );
}
