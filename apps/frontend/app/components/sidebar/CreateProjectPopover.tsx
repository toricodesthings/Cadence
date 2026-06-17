import { useState } from "react";
import { Plus } from "lucide-react";
import { useCreateProject } from "../../hooks/projects";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import { Button } from "../primitives/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../primitives/Dialog";
import { Tip } from "../primitives";
import { PROJECT_ACCENT_OPTIONS, PROJECT_FALLBACK_COLOR } from "../../lib/constants/colors";

const ACCENT_OPTIONS = PROJECT_ACCENT_OPTIONS;

/** Dialog form for creating a new project — optimistic insert */
export function CreateProjectPopover() {
    const [name, setName] = useState("");
    const [colorAccent, setColorAccent] = useState("luminous-amber");
    const [isCustomColor, setIsCustomColor] = useState(false);
    const [emoji, setEmoji] = useState("");
    const [open, setOpen] = useState(false);
    const createProject = useCreateProject();

    const handleSubmit = () => {
        if (!name.trim()) return;
        createProject.mutate({ name: name.trim(), colorAccent, emoji });
        setName("");
        setEmoji("");
        setColorAccent("luminous-amber");
        setIsCustomColor(false);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button
                variant="ghost"
                size="icon"
                aria-label="Create project"
                className="rounded-2xl text-twilight-text-muted hover:bg-accent-primary-dim hover:text-accent-primary"
                onClick={() => setOpen(true)}
            >
                <Plus size={16} />
            </Button>
            <DialogContent className="sm:max-w-md p-6 sm:p-7 gap-5">
                <DialogHeader className="space-y-0">
                    <DialogTitle>New Project</DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-4">
                    <EmojiPickerPopover emoji={emoji} onSelect={setEmoji} />
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        placeholder="Project name…"
                        autoFocus
                        className="flex-1 rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-2.5 text-[14px] text-twilight-text outline-none transition-colors placeholder:text-twilight-text-muted/80 focus:border-accent-primary/30"
                    />
                </div>
                {/* Color picker */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    {ACCENT_OPTIONS.map((opt) => (
                        <Tip key={opt.value} label={opt.label} side="top">
                            <button
                                onClick={() => {
                                    setColorAccent(opt.value);
                                    setIsCustomColor(false);
                                }}
                                aria-label={`Select ${opt.label} color`}
                                className={`h-5 w-5 cursor-pointer rounded-full transition-[transform,opacity] duration-150 ${colorAccent === opt.value && !isCustomColor
                                    ? "ring-2 ring-offset-2 ring-offset-twilight-deep scale-110"
                                    : "opacity-60 hover:opacity-100"
                                    }`}
                                style={{ backgroundColor: opt.varName }}
                            />
                        </Tip>
                    ))}
                    <Tip label="Custom Hex Color" side="top">
                    <div className="relative flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-twilight-border">
                        <input
                            type="color"
                            value={colorAccent.startsWith("#") ? colorAccent : PROJECT_FALLBACK_COLOR}
                            onChange={(e) => {
                                setColorAccent(e.target.value);
                                setIsCustomColor(true);
                            }}
                            className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer"
                        />
                        {isCustomColor && (
                            <div className="absolute inset-0 ring-2 ring-offset-2 ring-offset-twilight-deep ring-twilight-text/50 rounded-full" />
                        )}
                    </div>
                    </Tip>
                </div>
                <Button
                    variant="primary"
                    size="md"
                    onClick={handleSubmit}
                    disabled={!name.trim()}
                    className="mt-1 w-full bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 disabled:cursor-not-allowed disabled:opacity-30"
                >
                    Create Project
                </Button>
            </DialogContent>
        </Dialog>
    );
}
