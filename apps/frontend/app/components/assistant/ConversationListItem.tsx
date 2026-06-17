import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2, Check, X } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import type { ConversationSummary } from "../../hooks/ai/use-conversations";

/** Compact, calm relative time ("2m ago", "Yesterday", "Mon"). */
function relativeTime(iso: string | null): string {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diffMs = Date.now() - then;
    const min = Math.round(diffMs / 60_000);
    if (min < 1) return "Just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day === 1) return "Yesterday";
    if (day < 7) {
        return new Date(then).toLocaleDateString(undefined, { weekday: "short" });
    }
    return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A single saved-conversation row (design §7.1–§7.2). Title + relative time +
 * an overflow menu (Rename inline / Archive / Delete). The whole row is a
 * button; the menu is a Radix dropdown for full keyboard nav.
 */
export function ConversationListItem({
    conversation,
    active,
    fallbackTitle,
    onSelect,
    onRename,
    onArchive,
    onDelete,
}: {
    conversation: ConversationSummary;
    active: boolean;
    /** Client fallback when the server hasn't titled the thread yet (§5.4). */
    fallbackTitle?: string;
    onSelect: () => void;
    onRename: (title: string) => void;
    onArchive: (archived: boolean) => void;
    onDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const title = conversation.title?.trim() || fallbackTitle || "New conversation";

    useEffect(() => {
        if (editing) {
            setDraft(conversation.title?.trim() || fallbackTitle || "");
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [editing, conversation.title, fallbackTitle]);

    const commit = () => {
        const next = draft.trim();
        if (next && next !== conversation.title) onRename(next);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex items-center gap-2 rounded-xl border-l-2 border-accent-primary bg-accent-primary/8 px-3 py-2">
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commit();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing(false);
                        }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-accent-primary/40 bg-twilight-surface px-2 py-1 text-sm text-twilight-text focus:outline-none"
                    aria-label="Rename conversation"
                />
                <button
                    type="button"
                    onClick={commit}
                    className="flex h-7 w-7 min-w-7 items-center justify-center rounded-lg text-accent-primary hover:bg-twilight-surface-hover cursor-pointer"
                    aria-label="Save name"
                >
                    <Check size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex h-7 w-7 min-w-7 items-center justify-center rounded-lg text-twilight-text-muted hover:bg-twilight-surface-hover cursor-pointer"
                    aria-label="Cancel rename"
                >
                    <X size={14} />
                </button>
            </div>
        );
    }

    return (
        <div
            className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                active
                    ? "border-l-2 border-accent-primary bg-accent-primary/8 text-twilight-text"
                    : "text-twilight-text-soft hover:bg-twilight-surface-hover"
            }`}
        >
            <button
                type="button"
                onClick={onSelect}
                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                aria-current={active ? "true" : undefined}
            >
                <span className="text-truncate-safe min-w-0 flex-1 font-medium">{title}</span>
                <span className="shrink-0 text-[11px] text-twilight-text-muted">
                    {relativeTime(conversation.lastMessageAt)}
                </span>
            </button>

            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className="ml-1.5 flex h-7 w-7 min-w-7 items-center justify-center rounded-lg text-twilight-text-muted opacity-0 transition-opacity hover:bg-twilight-surface-hover hover:text-twilight-text group-hover:opacity-100 focus-visible:opacity-100 touch-reveal cursor-pointer"
                        aria-label="Conversation options"
                    >
                        <MoreHorizontal size={16} />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" className="min-w-[160px]">
                    <DropdownMenu.Item onSelect={() => setEditing(true)} className="gap-2 text-[14px]">
                        <Pencil size={14} />
                        Rename
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        onSelect={() => onArchive(!conversation.archived)}
                        className="gap-2 text-[14px]"
                    >
                        {conversation.archived ? (
                            <>
                                <ArchiveRestore size={14} />
                                Unarchive
                            </>
                        ) : (
                            <>
                                <Archive size={14} />
                                Archive
                            </>
                        )}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                        variant="danger"
                        onSelect={() => onDelete()}
                        className="gap-2 text-[14px]"
                    >
                        <Trash2 size={14} />
                        Delete
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
    );
}
