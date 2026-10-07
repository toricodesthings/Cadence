import { useMemo } from "react";
import { ClipboardCopy, Download } from "lucide-react";
import { toast } from "sonner";
import { UtilitySheet } from "../../shared/UtilitySheet";
import { Button } from "../../primitives/Button";
import { cn } from "../../../lib/utils";
import { copyText, downloadMarkdown } from "./note-export";

function Version({ title, text, other, tone }: { title: string; text: string; other: string; tone: string }) {
    // A line the other version doesn't have is the difference worth seeing.
    const elsewhere = useMemo(() => new Set(other.split("\n")), [other]);
    return (
        <section aria-label={title} className="min-w-0 space-y-1.5">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted">{title}</h3>
            <div className="max-h-[32dvh] overflow-y-auto rounded-2xl bg-twilight-surface/60 p-3 text-[14px] leading-relaxed text-twilight-text-soft">
                {text.length === 0 ? <span className="text-twilight-text-muted">Empty</span> : text.split("\n").map((line, i) => (
                    <p key={i} className={cn("min-h-[1.4em] whitespace-pre-wrap break-words rounded px-1", !elsewhere.has(line) && line.trim() && tone)}>{line}</p>
                ))}
            </div>
        </section>
    );
}

/**
 * Two edits overlapped: show both and let the user pick. Nothing was merged by guess and the
 * choice you don't make stays recoverable until you discard it.
 */
export function NoteConflictSheet({
    open, onClose, mine, latest, onUseMine, onUseLatest, layer, taskTitle,
}: {
    open: boolean;
    onClose: () => void;
    mine: string;
    latest: string;
    onUseMine: () => void;
    onUseLatest: () => void;
    layer?: "route" | "room";
    taskTitle?: string;
}) {
    return (
        <UtilitySheet
            title="Review changes"
            subtitle={taskTitle ? `${taskTitle} changed in two places` : "This note changed in two places"}
            open={open}
            onClose={onClose}
            layer={layer}
            footer={
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void copyText(mine).then((ok) => toast[ok ? "success" : "error"](ok ? "Your version copied" : "Couldn’t copy"))}><ClipboardCopy size={15} aria-hidden="true" />Copy mine</Button>
                        <Button variant="ghost" size="sm" onClick={() => downloadMarkdown(mine, "my-version")}><Download size={15} aria-hidden="true" />Download</Button>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="md" onClick={onUseLatest}>Use latest</Button>
                        <Button size="md" onClick={onUseMine}>Use my version</Button>
                    </div>
                </div>
            }
        >
            <p className="text-[15px] text-twilight-text-soft">Highlighted lines are the ones the other version doesn’t have. Whichever you don’t pick is kept so you can get it back.</p>
            <div className="grid gap-4 md:grid-cols-2">
                <Version title="Latest" text={latest} other={mine} tone="bg-accent-primary/15 text-twilight-text" />
                <Version title="Yours" text={mine} other={latest} tone="bg-accent-primary/15 text-twilight-text" />
            </div>
        </UtilitySheet>
    );
}
