import { Eye, EyeOff } from "lucide-react";
import { Tip } from "../primitives";

/** Show/hide for a board column: a quiet moonlit eye on the header, 44px hit area around a 16px glyph. */
export function EyeToggle({ hidden, label, onToggle }: { hidden: boolean; label: string; onToggle: () => void }) {
    return (
        <Tip label={label} side="bottom">
            <button
                type="button"
                onClick={onToggle}
                aria-label={label}
                aria-pressed={hidden}
                className="touch-target -my-3 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-moonlit transition-colors hover:bg-moonlit/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                {hidden ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
            </button>
        </Tip>
    );
}
