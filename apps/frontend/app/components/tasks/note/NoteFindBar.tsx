import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import { Button } from "../../primitives/Button";
import { Tip } from "../../primitives/Tooltip";
import { Reveal } from "../../shared/Reveal";
import { getFind, replaceAll, replaceCurrent, setFind, stepFind } from "../../../lib/notes/note-find";
import { cn } from "../../../lib/utils";

const FIELD = "h-11 min-w-0 flex-1 rounded-xl border border-twilight-border-light bg-white/[0.05] px-3 text-[15px] text-twilight-text placeholder:text-twilight-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40";

/** Find (and, when disclosed, replace) in the open note. Matches are decorations: nothing here edits until you replace. */
export function NoteFindBar({ editor, onClose, className }: { editor: Editor; onClose: () => void; className?: string }) {
    const [query, setQuery] = useState("");
    const [replacement, setReplacement] = useState("");
    const [replacing, setReplacing] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const find = useEditorState({
        editor,
        selector: ({ editor: e }) => {
            const s = getFind(e);
            return { count: s.matches.length, current: s.current };
        },
        equalityFn: (a, b) => !!b && a.count === b.count && a.current === b.current,
    });

    useEffect(() => {
        input.current?.focus();
        input.current?.select();
        return () => setFind(editor, { query: "", current: 0 });
    }, [editor]);

    const update = (next: string) => {
        setQuery(next);
        setFind(editor, { query: next, current: 0 });
    };
    const label = !query ? "" : find.count === 0 ? "No matches" : `${find.current + 1} of ${find.count}`;

    return (
        <div
            role="search"
            aria-label="Find in note"
            className={cn("glass-surface space-y-2 rounded-2xl p-2", className)}
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                    editor.commands.focus();
                }
            }}
        >
            <div className="flex items-center gap-1.5">
                <input
                    ref={input}
                    value={query}
                    onChange={(e) => update(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            stepFind(editor, e.shiftKey ? -1 : 1);
                        }
                    }}
                    placeholder="Find"
                    aria-label="Find"
                    className={FIELD}
                    autoComplete="off"
                />
                <span role="status" className="min-w-[4.5rem] text-center text-[13px] tabular-nums text-twilight-text-muted">{label}</span>
                <Tip label="Previous match" side="bottom"><Button variant="ghost" size="icon" aria-label="Previous match" disabled={!find.count} onClick={() => stepFind(editor, -1)}><ChevronUp size={18} aria-hidden="true" /></Button></Tip>
                <Tip label="Next match" side="bottom"><Button variant="ghost" size="icon" aria-label="Next match" disabled={!find.count} onClick={() => stepFind(editor, 1)}><ChevronDown size={18} aria-hidden="true" /></Button></Tip>
                <Tip label="Replace" side="bottom"><Button variant="ghost" size="icon" aria-label="Show replace" aria-expanded={replacing} onClick={() => setReplacing((v) => !v)}><Replace size={18} aria-hidden="true" /></Button></Tip>
                <Tip label="Close find" side="bottom"><Button variant="ghost" size="icon" aria-label="Close find" onClick={() => { onClose(); editor.commands.focus(); }}><X size={18} aria-hidden="true" /></Button></Tip>
            </div>
            <Reveal open={replacing}>
                <div className="flex items-center gap-1.5 pb-0.5">
                    <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Replace with" aria-label="Replace with" className={FIELD} autoComplete="off" />
                    <Button variant="secondary" size="sm" disabled={!find.count} onClick={() => replaceCurrent(editor, replacement)}>Replace</Button>
                    <Button variant="secondary" size="sm" disabled={!find.count} onClick={() => replaceAll(editor, replacement)}>All</Button>
                </div>
            </Reveal>
        </div>
    );
}
