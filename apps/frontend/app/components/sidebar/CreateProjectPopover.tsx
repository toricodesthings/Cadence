import { useState } from "react";
import { Plus } from "lucide-react";
import { useCreateProject } from "../../hooks/projects/use-create-project";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import { Button } from "../primitives/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../primitives/Dialog";
import { ProjectColorPicker } from "../shared/ProjectColorPicker";

/** Dialog form for creating a new project — optimistic insert */
export function CreateProjectPopover() {
    const [name, setName] = useState("");
    const [colorAccent, setColorAccent] = useState("luminous-amber");
    const [emoji, setEmoji] = useState("");
    const [open, setOpen] = useState(false);
    const createProject = useCreateProject();

    const handleSubmit = () => {
        if (!name.trim()) return;
        createProject.mutate({ name: name.trim(), colorAccent, emoji });
        setName("");
        setEmoji("");
        setColorAccent("luminous-amber");
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button
                variant="ghost"
                size="icon"
                aria-label="Create list"
                className="rounded-2xl text-twilight-text-muted hover:bg-accent-primary-dim hover:text-accent-primary"
                onClick={() => setOpen(true)}
            >
                <Plus size={16} />
            </Button>
            <DialogContent className="sm:max-w-md p-6 sm:p-7 gap-5">
                <DialogHeader className="space-y-0">
                    <DialogTitle>New List</DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-4">
                    <EmojiPickerPopover emoji={emoji} onSelect={setEmoji} />
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        placeholder="List name…"
                        autoFocus
                        className="flex-1 rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-2.5 text-[14px] text-twilight-text outline-none transition-colors placeholder:text-twilight-text-muted/80 focus:border-accent-primary/30"
                    />
                </div>
                <ProjectColorPicker value={colorAccent} onChange={setColorAccent} />
                <Button
                    variant="subtle"
                    size="md"
                    onClick={handleSubmit}
                    disabled={!name.trim()}
                    className="mt-1 w-full bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 disabled:cursor-not-allowed disabled:opacity-30"
                >
                    Create List
                </Button>
            </DialogContent>
        </Dialog>
    );
}
