import { useState, useRef, useEffect } from "react";
import { Check, X } from "lucide-react";
import { useCreateTag } from "../../hooks/tags";
import { TAG_PALETTE } from "../../lib/constants/colors";

interface CreateTagInlineProps {
    onCreated: () => void;
    onCancel: () => void;
}

const TAG_COLORS = TAG_PALETTE;

export function CreateTagInline({ onCreated, onCancel }: CreateTagInlineProps) {
    const createTag = useCreateTag();
    const [name, setName] = useState("");
    const [selectedColor, setSelectedColor] = useState("default");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const handleSubmit = async () => {
        const trimmed = name.trim();
        if (trimmed) {
            await createTag.mutateAsync({ name: trimmed, color: selectedColor });
            onCreated();
        } else {
            onCancel();
        }
    };

    return (
        <div className="px-3 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="bg-twilight-surface-muted rounded-xl border border-twilight-border p-2 focus-within:border-lantern/50 transition-colors">
                <input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleSubmit();
                        if (e.key === "Escape") onCancel();
                    }}
                    placeholder="New tag name..."
                    className="w-full bg-transparent text-[13px] text-twilight-text outline-none placeholder:text-twilight-text-muted/60 mb-2 px-1"
                />

                <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                    {TAG_COLORS.map(color => (
                        <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${selectedColor === color
                                    ? "scale-125 ring-1 ring-offset-1 ring-offset-twilight-surface-muted ring-lantern shadow-[0_0_8px_rgba(232,164,74,0.3)]"
                                    : "hover:scale-110"
                                }`}
                            style={{ backgroundColor: color === "default" ? "var(--color-twilight-text-muted)" : color }}
                            aria-label={`Select color ${color}`}
                        />
                    ))}
                </div>

                <div className="flex justify-end gap-1 mt-1 pt-1 border-t border-twilight-border/40">
                    <button
                        onClick={onCancel}
                        className="p-1.5 text-twilight-text-muted hover:text-red-400 hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer"
                        aria-label="Cancel"
                    >
                        <X size={16} />
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        className="p-1.5 text-lantern hover:bg-lantern/10 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Save tag"
                    >
                        <Check size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
