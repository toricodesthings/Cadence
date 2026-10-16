import { useState } from "react";
import { Plus } from "lucide-react";

/** "Add section": a quiet button that turns into a one-line name field. Enter or leaving the field with a name saves it; Escape cancels. */
export function AddSectionControl({ onCreate }: { onCreate: (name: string) => void }) {
    const [name, setName] = useState("");
    const [adding, setAdding] = useState(false);

    const finish = (save: boolean) => {
        const trimmed = name.trim();
        if (save && trimmed) onCreate(trimmed);
        setName("");
        setAdding(false);
    };

    return (
        <div className="mt-4">
            {adding ? (
                <div className="flex items-center gap-2 px-4">
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Section name..."
                        className="flex-1 bg-transparent text-[13px] text-twilight-text outline-none border-b border-twilight-border/40 pb-1 placeholder:text-twilight-text-muted/40"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") finish(true);
                            if (e.key === "Escape") finish(false);
                        }}
                        onBlur={() => finish(true)}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    data-add-section-trigger
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-2 text-[12px] text-twilight-text-muted/50 hover:text-twilight-text-muted transition-colors cursor-pointer px-4 py-2"
                >
                    <Plus size={14} />
                    Add section
                </button>
            )}
        </div>
    );
}
