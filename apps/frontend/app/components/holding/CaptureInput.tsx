import { useState, useRef, type KeyboardEvent } from "react";
import { Inbox, MessageSquare } from "lucide-react";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import { useProcessInboxToTask } from "../../hooks/inbox/use-process-inbox-to-task";
import { ComposerSubmit, COMPOSER_FIELD, type ComposerDraft } from "../shared/Composer";
import { Button } from "../primitives/Button";
import type { InboxItem } from "@cadence/contracts/inbox";

/** Shared draft semantics for the page, phone composer and Quick Add. */
function useCaptureDraft(onSaved?: (item: InboxItem | undefined) => void) {
    const [value, setValue] = useState("");
    const [count, setCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [pasted, setPasted] = useState(false);
    const input = useRef<HTMLTextAreaElement>(null);
    const create = useCreateInboxItem();
    const process = useProcessInboxToTask();
    const savedCapture = useRef<InboxItem | undefined>(undefined);
    const lines = value
        .split(/\r?\n/)
        .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
        .filter(Boolean);
    const save = async (asTask = false, split = false) => {
        if (!value.trim() || busy) return;
        setBusy(true);
        setError(false);
        const original = value;
        let remaining = split ? lines : [value.trim()];
        try {
            while (remaining.length) {
                const text = remaining[0];
                const item = savedCapture.current ?? (await create.mutateAsync(text));
                if (asTask && item) {
                    savedCapture.current = item;
                    const { parse } = await import("@cadence/nlp/parse");
                    const parsed = parse({ input: text, sourceSurface: "inbox" });
                    await process.mutateAsync({
                        inboxItemId: item.id,
                        rawText: text,
                        title: parsed.cleanedTitle || text,
                    });
                }
                savedCapture.current = undefined;
                remaining = remaining.slice(1);
                setCount((c) => c + 1);
                if (!split || !remaining.length) onSaved?.(item);
            }
            setValue((current) => (current === original ? "" : current));
            setPasted(false);
            input.current?.focus();
        } catch {
            setError(true);
            if (split) setValue(remaining.join("\n"));
        } finally {
            setBusy(false);
        }
    };
    const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void save(event.metaKey || event.ctrlKey);
        }
        if (event.key === "Escape") {
            event.stopPropagation();
            input.current?.blur();
        }
    };
    const field = (rows: number, inline = false) => (
        <textarea
            ref={input}
            value={value}
            rows={rows}
            enterKeyHint="done"
            autoFocus
            data-initial-focus
            aria-label="What's on your mind?"
            placeholder="What's on your mind?"
            readOnly={busy}
            onChange={(e) => {
                setValue(e.target.value);
                savedCapture.current = undefined;
            }}
            onKeyDown={keyDown}
            onPaste={(e) => setPasted(e.clipboardData.getData("text").includes("\n"))}
            className={inline
                ? "w-full min-w-0 resize-none bg-transparent pt-1.5 font-display text-xl leading-8 tracking-[-0.01em] text-twilight-text outline-none placeholder:text-twilight-text-soft"
                : `${COMPOSER_FIELD} resize-none text-base placeholder:text-twilight-text-muted`}
        />
    );
    const feedback = (
        <>
            {pasted && lines.length > 1 && (
                <Button variant="secondary" size="md" disabled={busy} onClick={() => void save(false, true)}>
                    Add as {lines.length} thoughts?
                </Button>
            )}
            {error && (
                <p role="alert" className="text-sm text-twilight-text-muted">
                    Couldn't save. Your draft is still here.
                </p>
            )}
        </>
    );
    return {
        value,
        count,
        busy,
        field,
        feedback,
        save,
        reset: () => {
            setValue("");
            setCount(0);
            setPasted(false);
        },
    };
}

export function useCaptureComposer({
    onSaved,
}: {
    onSaved: (created: InboxItem | null | undefined) => void;
}): ComposerDraft {
    const draft = useCaptureDraft(onSaved);
    return {
        title: "Add a thought",
        icon: MessageSquare,
        subtitle: "Get it out of your head.",
        isDirty: Boolean(draft.value.trim()),
        discardTitle: "Discard this thought?",
        reset: draft.reset,
        footer: (
            <ComposerSubmit
                onSubmit={() => void draft.save()}
                submitLabel={draft.busy ? "Capturing…" : "Capture"}
                icon={Inbox}
                disabled={!draft.value.trim() || draft.busy}
            />
        ),
        children: (
            <>
                {draft.field(5)}
                {draft.feedback}
                {draft.count > 0 && (
                    <p role="status" className="text-sm text-twilight-text-muted">
                        {draft.count} captured
                    </p>
                )}
            </>
        ),
    };
}

/** Keycap for shortcut hints, shared with the feed's shortcut line. */
export const KBD =
    "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-twilight-border/60 bg-white/[0.04] px-1.5 font-sans text-[10px] font-medium text-twilight-text-soft";

const HINTS = [
    [["↵"], "save"],
    [["⌘", "↵"], "as task"],
    [["⇧", "↵"], "new line"],
] as const;

export function CaptureInput() {
    const draft = useCaptureDraft();
    const ready = Boolean(draft.value.trim()) && !draft.busy;
    return (
        <div data-focus-container className="capture-surface px-5 pb-4 pt-5">
            <div className="flex items-start gap-4">
                <div
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-lantern"
                >
                    <MessageSquare size={18} strokeWidth={1.75} />
                </div>
                {draft.field(2, true)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 pl-14">
                <p aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-twilight-text-muted">
                    {HINTS.map(([keys, label]) => (
                        <span key={label} className="inline-flex items-center gap-1">
                            {keys.map((key) => (
                                <kbd key={key} className={KBD}>
                                    {key}
                                </kbd>
                            ))}
                            <span className="ml-0.5">{label}</span>
                        </span>
                    ))}
                </p>
                <Button
                    variant={ready ? "primary" : "ghost"}
                    size="sm"
                    disabled={!ready}
                    onClick={() => void draft.save()}
                    className="shrink-0 rounded-full px-4"
                >
                    <Inbox size={14} aria-hidden />
                    {draft.busy ? "Capturing…" : "Capture"}
                </Button>
            </div>
            {draft.feedback}
        </div>
    );
}
