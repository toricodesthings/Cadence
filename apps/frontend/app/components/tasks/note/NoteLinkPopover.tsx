import { useEffect, useMemo, useRef, useState } from "react";
import { getMarkRange, type Editor } from "@tiptap/core";
import { ExternalLink as OpenIcon, Unlink } from "lucide-react";
import * as Popover from "../../primitives/Popover";
import { Button } from "../../primitives/Button";
import { Input } from "../../primitives/Input";
import { openExternalUrl } from "../../../platform/runtime";
import { caretRect } from "./note-selection";

/** Adds https:// to a bare address; refuses schemes that run code. */
export function normalizeLink(raw: string): string | null {
    const url = raw.trim();
    if (!url) return null;
    if (/^(javascript|data|vbscript):/i.test(url)) return null;
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(url)) return url;
    return `https://${url}`;
}

/** What the popover starts with: the link under the caret, else the selected text. */
export function readLink(editor: Editor): { label: string; href: string; hasLink: boolean } {
    const { state } = editor;
    const hasLink = editor.isActive("link");
    if (hasLink) {
        const range = getMarkRange(state.selection.$from, state.schema.marks.link);
        const href = (editor.getAttributes("link").href as string | undefined) ?? "";
        return { label: range ? state.doc.textBetween(range.from, range.to) : "", href, hasLink };
    }
    const { from, to } = state.selection;
    return { label: state.doc.textBetween(from, to), href: "", hasLink };
}

/** Edit a link's label and address, anchored at the caret. Selected text stays selected text. */
export function NoteLinkPopover({ editor, open, onOpenChange }: { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void }) {
    const initial = useMemo(() => (open ? readLink(editor) : { label: "", href: "", hasLink: false }), [editor, open]);
    const [label, setLabel] = useState(initial.label);
    const [href, setHref] = useState(initial.href);
    const urlRef = useRef<HTMLInputElement>(null);
    const virtualRef = useMemo(() => ({ current: { getBoundingClientRect: () => caretRect(editor) } }), [editor]);

    useEffect(() => {
        setLabel(initial.label);
        setHref(initial.href);
    }, [initial]);

    const close = () => {
        onOpenChange(false);
        editor.commands.focus();
    };

    const apply = () => {
        const url = normalizeLink(href);
        if (!url) return;
        const text = label.trim() || url;
        const chain = editor.chain().focus();
        if (initial.hasLink) {
            chain.extendMarkRange("link");
            if (text !== initial.label) chain.insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href: url } }] });
            else chain.setLink({ href: url });
        } else if (editor.state.selection.empty) {
            chain.insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href: url } }] });
        } else if (text !== initial.label) {
            chain.insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href: url } }] });
        } else {
            chain.setLink({ href: url });
        }
        chain.run();
        onOpenChange(false);
    };

    const url = normalizeLink(href);

    return (
        <Popover.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
            <Popover.Anchor virtualRef={virtualRef} />
            <Popover.Content
                side="bottom"
                align="start"
                className="w-[min(22rem,calc(100vw-1.5rem))] space-y-2 p-3"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (initial.label ? urlRef.current : (document.getElementById("note-link-label") as HTMLElement | null))?.focus();
                }}
                onCloseAutoFocus={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        apply();
                    }
                }}
            >
                <label className="block text-[12px] font-medium text-twilight-text-soft" htmlFor="note-link-label">Text</label>
                <Input id="note-link-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Link text" autoComplete="off" />
                <label className="block text-[12px] font-medium text-twilight-text-soft" htmlFor="note-link-url">Address</label>
                <Input id="note-link-url" ref={urlRef} value={href} onChange={(e) => setHref(e.target.value)} placeholder="example.com" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} />
                <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={apply} disabled={!url} className="flex-1">{initial.hasLink ? "Update" : "Add link"}</Button>
                    {initial.hasLink && (
                        <>
                            <Button size="icon" variant="ghost" aria-label="Open link" onClick={() => url && void openExternalUrl(url)}>
                                <OpenIcon size={16} aria-hidden="true" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Remove link" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onOpenChange(false); }}>
                                <Unlink size={16} aria-hidden="true" />
                            </Button>
                        </>
                    )}
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}
