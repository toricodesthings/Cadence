import { useState } from "react";
import { Plus } from "lucide-react";
import { useCreateProject } from "../../hooks/projects";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import { Button } from "../primitives/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../primitives/Dialog";
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
                className="rounded-2xl text-twilight-text-muted hover:bg-lantern-dim hover:text-lantern"
                onClick={() => setOpen(true)}
            >
                <Plus size={16} />
            </Button>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>New Project</DialogTitle>
                </DialogHeader>
                <div className="flex gap-3 mb-4">
                    <EmojiPickerPopover emoji={emoji} onSelect={setEmoji} />
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        placeholder="Project name…"
                        autoFocus
                        className="flex-1 bg-white/[0.04] border border-twilight-border rounded-xl px-4 py-2.5 text-[15px] text-twilight-text placeholder:text-twilight-text-muted/80 outline-none focus:border-lantern/30 transition-colors"
                    />
                </div>
                {/* Color picker */}
                <div className="flex gap-2.5 mb-5 items-center flex-wrap">
                    {ACCENT_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                setColorAccent(opt.value);
                                setIsCustomColor(false);
                            }}
                            title={opt.label}
                            aria-label={`Select ${opt.label} color`}
                            className={`w-6 h-6 rounded-full transition-[transform,opacity] duration-150 cursor-pointer ${colorAccent === opt.value && !isCustomColor
                                ? "ring-2 ring-offset-2 ring-offset-twilight-deep scale-110"
                                : "opacity-60 hover:opacity-100"
                                }`}
                            style={{ backgroundColor: opt.varName }}
                        />
                    ))}
                    <div className="relative flex items-center justify-center w-6 h-6 rounded-full ring-1 ring-twilight-border overflow-hidden cursor-pointer" title="Custom Hex Color">
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
                </div>
                <Button
                    variant="primary"
                    size="md"
                    onClick={handleSubmit}
                    disabled={!name.trim()}
                    className="w-full bg-lantern/20 hover:bg-lantern/30 text-lantern disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Create Project
                </Button>
            </DialogContent>
        </Dialog>
    );
}
