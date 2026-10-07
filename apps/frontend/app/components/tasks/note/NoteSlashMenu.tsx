import { useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import * as Popover from "../../primitives/Popover";
import { MENU_ITEM } from "../../primitives/menu-styles";
import { cn } from "../../../lib/utils";
import { caretRect } from "./note-selection";
import type { NoteCommand } from "./note-commands";

/**
 * The "/" menu, anchored at the real caret. Presentational: the editor owns the query, the
 * highlighted row and the keys, so Escape and arrows are handled in one place and nothing listens globally.
 */
export function NoteSlashMenu({
    editor,
    anchorPos,
    commands,
    index,
    bottomInset,
    onPick,
    onHover,
}: {
    editor: Editor;
    anchorPos: number;
    commands: NoteCommand[];
    index: number;
    bottomInset: number;
    onPick: (command: NoteCommand) => void;
    onHover: (index: number) => void;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const virtualRef = useMemo(() => ({ current: { getBoundingClientRect: () => caretRect(editor, anchorPos) } }), [editor, anchorPos]);

    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }, [index]);

    return (
        <Popover.Root open>
            <Popover.Anchor virtualRef={virtualRef} />
            <Popover.Content
                side="bottom"
                align="start"
                sideOffset={6}
                collisionPadding={{ top: 8, bottom: 8 + bottomInset, left: 8, right: 8 }}
                avoidCollisions
                className="w-72 rounded-xl p-1 shadow-xl"
                // The editor keeps focus and the keys; the menu is only ever pointed at.
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
            >
                {commands.length === 0 ? (
                    <p className="px-3 py-2.5 text-[15px] text-twilight-text-soft" role="status">No matches. Keep typing, or press Esc.</p>
                ) : (
                    <div ref={listRef} role="listbox" aria-label="Insert" className="max-h-72 overflow-y-auto overscroll-contain">
                        {commands.map((cmd, i) => (
                            <div
                                key={cmd.id}
                                role="option"
                                aria-selected={i === index}
                                tabIndex={-1}
                                onMouseEnter={() => onHover(i)}
                                onClick={() => onPick(cmd)}
                                className={cn(MENU_ITEM, "gap-3", i === index ? "bg-white/[0.08] text-twilight-text" : "text-twilight-text-soft")}
                            >
                                <cmd.icon size={16} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">{cmd.label}</span>
                                    <span className="block truncate text-[12px] text-twilight-text-muted">{cmd.description}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Popover.Content>
        </Popover.Root>
    );
}
