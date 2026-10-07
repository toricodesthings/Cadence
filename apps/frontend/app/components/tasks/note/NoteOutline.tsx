import { cn } from "../../../lib/utils";
import type { NoteHeading } from "../../../lib/notes/note-outline";

/**
 * Headings of the open note. Used as the desktop rail and inside the phone's Outline sheet.
 * The current heading is marked quietly; selecting one scrolls the real heading into view.
 */
export function NoteOutline({ headings, currentId, onJump, className }: { headings: NoteHeading[]; currentId: string | null; onJump: (heading: NoteHeading) => void; className?: string }) {
    if (headings.length === 0) {
        return <p className={cn("px-4 py-3 text-[13px] text-twilight-text-muted", className)}>Headings you add show up here.</p>;
    }
    return (
        <nav aria-label="Note outline" className={cn("flex flex-col gap-0.5 p-2", className)}>
            {headings.map((heading) => (
                <button
                    key={heading.id}
                    type="button"
                    onClick={() => onJump(heading)}
                    aria-current={heading.id === currentId ? "location" : undefined}
                    title={heading.text}
                    style={{ paddingLeft: `${(Math.min(heading.level, 4) - 1) * 12 + 12}px` }}
                    className={cn(
                        "min-h-11 w-full cursor-pointer truncate rounded-xl pr-3 text-left text-[14px] transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 [[data-density=compact]_&]:min-h-9",
                        heading.id === currentId ? "bg-white/[0.05] font-medium text-twilight-text" : "text-twilight-text-soft hover:text-twilight-text",
                    )}
                >
                    {heading.text}
                </button>
            ))}
        </nav>
    );
}
