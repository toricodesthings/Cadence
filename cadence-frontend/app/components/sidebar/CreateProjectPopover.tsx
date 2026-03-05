import { useState } from "react";
import * as Popover from "../primitives/Popover";
import { Plus } from "lucide-react";
import { useCreateProject } from "../../hooks/projects";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";

const ACCENT_OPTIONS = [
    { label: "Amber", value: "luminous-amber", varName: "var(--color-lantern)" },
    { label: "Blue", value: "moonlit-blue", varName: "var(--color-moonlit)" },
    { label: "Sapphire", value: "sapphire", varName: "var(--color-sapphire)" },
    { label: "Red", value: "ember-red", varName: "var(--color-ember-red)" },
    { label: "Green", value: "forest-green", varName: "var(--color-forest-green)" },
    { label: "Violet", value: "violet", varName: "var(--color-violet)" },
];

/** Popover form for creating a new project — optimistic insert */
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
        setOpen(false); // Close immediately — project appears optimistically
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button className="w-6 h-6 flex items-center justify-center text-twilight-text-muted hover:text-lantern rounded-xl hover:bg-lantern-dim transition-colors cursor-pointer">
                    <Plus size={13} />
                </button>
            </Popover.Trigger>
            <Popover.Content side="right" className="w-64">
                <p className="text-xs font-semibold text-twilight-text-muted uppercase tracking-[0.1em] mb-3">
                    New Project
                </p>
                <div className="flex gap-2 mb-3">
                    <EmojiPickerPopover emoji={emoji} onSelect={setEmoji} />
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        placeholder="Project name…"
                        autoFocus
                        className="flex-1 bg-white/[0.04] border border-twilight-border rounded-xl px-3 py-2 text-[14px] text-twilight-text placeholder:text-twilight-text-muted/80 outline-none focus:border-lantern/30 transition-colors"
                    />
                </div>
                {/* Color picker */}
                <div className="flex gap-2 mb-4 items-center flex-wrap">
                    {ACCENT_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                setColorAccent(opt.value);
                                setIsCustomColor(false);
                            }}
                            title={opt.label}
                            aria-label={`Select ${opt.label} color`}
                            className={`w-5 h-5 rounded-full transition-[transform,opacity] duration-150 cursor-pointer ${colorAccent === opt.value && !isCustomColor
                                ? "ring-2 ring-offset-2 ring-offset-twilight-surface scale-110"
                                : "opacity-60 hover:opacity-100"
                                }`}
                            style={{ backgroundColor: opt.varName }}
                        />
                    ))}
                    <div className="relative flex items-center justify-center w-5 h-5 rounded-full ring-1 ring-twilight-border overflow-hidden cursor-pointer" title="Custom Hex Color">
                        <input
                            type="color"
                            value={colorAccent.startsWith("#") ? colorAccent : "#e8a44a"}
                            onChange={(e) => {
                                setColorAccent(e.target.value);
                                setIsCustomColor(true);
                            }}
                            className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer"
                        />
                        {isCustomColor && (
                            <div className="absolute inset-0 ring-2 ring-offset-2 ring-offset-twilight-surface ring-twilight-text/50 rounded-full" />
                        )}
                    </div>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={!name.trim()}
                    className="w-full py-2 rounded-xl bg-lantern/20 hover:bg-lantern/30 text-lantern text-[14px] font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Create Project
                </button>
                <Popover.Arrow className="fill-twilight-surface" />
            </Popover.Content>
        </Popover.Root>
    );
}
