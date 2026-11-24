import { useState } from "react";
import { Check, X } from "lucide-react";
import { useCreateTag } from "../../hooks/tags/use-create-tag";
import { Input } from "../primitives/Input";
import { Tip } from "../primitives/Tooltip";
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
            <div className="bg-twilight-surface-muted rounded-xl border border-twilight-border p-3 space-y-3">
                <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleSubmit();
                        if (e.key === "Escape") onCancel();
                    }}
                    placeholder="Tag name"
                    aria-label="Tag name"
                />

                <div className="flex flex-wrap gap-2 px-1">
                    {TAG_COLORS.map((color) => (
                        <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`size-6 rounded-full transition-transform cursor-pointer ${
                                selectedColor === color
                                    ? "ring-1 ring-offset-1 ring-offset-twilight-surface-muted ring-accent-primary shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_30%,transparent)]"
                                    : "hover:scale-110"
                            }`}
                            style={{
                                backgroundColor: color === "default" ? "var(--color-twilight-text-muted)" : color,
                            }}
                            aria-label={`Select color ${color}`}
                        />
                    ))}
                </div>

                <div className="flex justify-end gap-1 pt-2 border-t border-twilight-border/40">
                    <Tip label="Cancel" side="bottom">
                        <button
                            onClick={onCancel}
                            className="flex size-9 items-center justify-center rounded-xl text-twilight-text-muted hover:text-feedback-error hover:bg-panel-raised/50 transition-colors cursor-pointer"
                            aria-label="Cancel"
                        >
                            <X size={16} />
                        </button>
                    </Tip>
                    <Tip label="Save tag" side="bottom">
                        <button
                            onClick={handleSubmit}
                            disabled={!name.trim()}
                            className="flex size-9 items-center justify-center rounded-xl text-accent-primary hover:bg-accent-primary/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Save tag"
                        >
                            <Check size={16} />
                        </button>
                    </Tip>
                </div>
            </div>
        </div>
    );
}
