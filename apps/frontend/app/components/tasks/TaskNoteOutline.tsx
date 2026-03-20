import type { NoteHeading } from "../../lib/notes/note-outline";

interface TaskNoteOutlineProps {
    headings: NoteHeading[];
    onJump: (lineIndex: number) => void;
}

/**
 * Outline sidebar for the note room. Shows clickable heading links
 * with nested indentation.
 */
export function TaskNoteOutline({ headings, onJump }: TaskNoteOutlineProps) {
    if (headings.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-4">
                <p className="text-center text-xs text-twilight-text-muted/70">
                    No headings yet. Use ## to create sections.
                </p>
            </div>
        );
    }

    return (
        <nav className="flex flex-col gap-0.5 p-4" aria-label="Note outline">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-twilight-text-muted">
                Outline
            </p>
            {headings.map((heading, i) => (
                <button
                    key={`${heading.lineIndex}-${i}`}
                    type="button"
                    onClick={() => onJump(heading.lineIndex)}
                    className="w-full truncate rounded-lg px-2 py-1 text-left text-xs text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text"
                    style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                    title={heading.text}
                >
                    {heading.text}
                </button>
            ))}
        </nav>
    );
}
