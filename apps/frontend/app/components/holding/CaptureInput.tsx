import { computeNlp, loadParse, TASK_FIELDS } from "../../hooks/use-nlp-parse";
import { resolvedNlp } from "../../lib/utils/task/resolved-nlp";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useSettings } from "../../hooks/core/use-settings";
import { useState, useRef, useEffect, useLayoutEffect, useContext, type KeyboardEvent } from "react";
import { Inbox, MessageSquare } from "lucide-react";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import { useProcessInboxToTask } from "../../hooks/inbox/use-process-inbox-to-task";
import { ComposerSubmit, COMPOSER_FIELD, type ComposerDraft } from "../shared/Composer";
import { Button } from "../primitives/Button";
import { Reveal } from "../shared/Reveal";
import { StartupReadyContext } from "../../hooks/core/use-workspace-startup";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import type { InboxItem } from "@cadence/contracts/inbox";
import { MOD_KEY } from "../../lib/constants/keys";

/** Read and write a tab-scoped draft; storage can be missing or blocked, and the draft still works without it. */
function readDraft(key: string | undefined): string {
    if (!key) return "";
    try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; }
}

/** Shared draft semantics for the page, phone composer and Quick Add. With `storageKey`, a half-written thought survives leaving the page. */
function useCaptureDraft(onSaved?: (item: InboxItem | undefined) => void, storageKey?: string) {
    const [value, setValue] = useState(() => readDraft(storageKey));
    useEffect(() => {
        if (!storageKey) return;
        try {
            if (value) sessionStorage.setItem(storageKey, value);
            else sessionStorage.removeItem(storageKey);
        } catch { /* the draft just won't outlive the page */ }
    }, [storageKey, value]);
    const [count, setCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [pasted, setPasted] = useState(false);
    const input = useRef<HTMLTextAreaElement>(null);
    const create = useCreateInboxItem();
    const process = useProcessInboxToTask();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: settings } = useSettings();
    const nlpEnabled = settings?.tasks?.intelligence?.nlpEnabled !== false;
    const dateStyle = settings?.dateTime?.dateStyle ?? "mdy";
    const confidenceThreshold = settings?.tasks?.intelligence?.confidenceThreshold ?? "medium";
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
                // Offline the create is queued and returns nothing, but the id is ours,
                // so "as task" can still be queued right behind it.
                const id = savedCapture.current?.id ?? crypto.randomUUID();
                const item = savedCapture.current ?? (await create.mutateAsync({ id, rawText: text }));
                if (asTask) {
                    savedCapture.current = item ?? savedCapture.current;
                    // Same interpretation as every composer: what is understood is sent, and the server stores it as sent.
                    const parse = await loadParse().catch(() => null);
                    const draft = computeNlp(parse, { input: text, projects, tags, capabilities: TASK_FIELDS, sourceSurface: "inbox", dateStyle, confidenceThreshold, enabled: nlpEnabled });
                    await process.mutateAsync({
                        inboxItemId: id,
                        rawText: text,
                        title: draft.cleanedTitle || text,
                        dueDate: draft.fields.dueDate,
                        scheduledStart: draft.fields.scheduledStart,
                        scheduledEnd: draft.fields.scheduledEnd,
                        recurrenceRule: draft.fields.recurrenceRule,
                        projectId: draft.fields.projectId,
                        tagIds: draft.fields.tagIds,
                        priority: draft.fields.priority,
                        durationEstimate: draft.fields.durationMinutes,
                        waitingOn: draft.fields.waitingOn,
                        reminderAt: draft.fields.reminderAt,
                        notBefore: draft.fields.notBefore,
                        nlp: resolvedNlp(text, "inbox", dateStyle, [], {}),
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
    const field = (rows: number, inline = false, spellCheck = true) => (
        <textarea
            ref={input}
            value={value}
            rows={rows}
            spellCheck={spellCheck}
            enterKeyHint="done"
            autoFocus
            data-initial-focus
            aria-label="What's on your mind?"
            aria-keyshortcuts="Meta+Enter Control+Enter"
            placeholder="What's on your mind?"
            readOnly={busy}
            onChange={(e) => {
                setValue(e.target.value);
                savedCapture.current = undefined;
            }}
            onKeyDown={keyDown}
            onPaste={(e) => setPasted(e.clipboardData.getData("text").includes("\n"))}
            className={inline
                ? "scrollbar-hidden block w-full min-w-0 resize-none bg-transparent font-display text-lg leading-7 text-twilight-text outline-none placeholder:text-twilight-text-soft group-data-draft:text-twilight-text-soft data-overflow:[mask-image:linear-gradient(transparent,#000_12px,#000_calc(100%-12px),transparent)]"
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
        input,
        splitCount: pasted && lines.length > 1 ? lines.length : 0,
        error,
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

/** The hero's keycaps share one size, so "Ctrl" and "↵" read as a pair. */
const KEYCAP = KBD.replace("text-[10px]", "text-[11px]");


/**
 * One quiet line until you type; then it grows with each line and the Capture row slides in. It stays open
 * while focus stays, so a run of captures doesn't jolt the feed (or the greeting) after every save. Leaving
 * with a draft folds the row and leaves a soft glow: the thought is waiting, and nothing looks live.
 */
export function CaptureInput() {
    const { session } = useAuthState();
    const draft = useCaptureDraft(undefined, session?.user?.id ? `cadence:capture-draft:${session.user.id}` : undefined);
    const [focused, setFocused] = useState(false);
    const [engaged, setEngaged] = useState(false);
    const hasDraft = draft.value.trim().length > 0;
    const active = focused && (engaged || hasDraft);
    // On a cold open the page mounts inert behind startup, so autoFocus misses. Take focus once it's revealed,
    // and only if nothing else has it, so "open and type" just works.
    const revealed = useContext(StartupReadyContext);
    // A restored draft carries on from its end, not its start.
    useEffect(() => {
        const el = draft.input.current;
        if (!el || !revealed) return;
        el.setSelectionRange(el.value.length, el.value.length);
        el.scrollTop = el.scrollHeight;
        if (document.activeElement === document.body) el.focus({ preventScroll: true });
    }, [revealed, draft.input]);
    const ready = Boolean(draft.value.trim()) && !draft.busy;
    // Fit to the text, and again whenever the column's width changes. A parked draft folds to two lines.
    useLayoutEffect(() => {
        const el = draft.input.current;
        if (!el) return;
        const cap = focused ? 240 : 56;
        const fit = () => {
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
            // Past the cap it scrolls; soft edges say so instead of slicing lines.
            el.toggleAttribute("data-overflow", el.scrollHeight > cap);
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        return () => observer.disconnect();
    }, [draft.value, draft.input, focused]);
    return (
        <div
            data-focus-container
            data-active={active || undefined}
            data-draft={(!active && hasDraft) || undefined}
            onInput={() => setEngaged(true)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return;
                setFocused(false);
                setEngaged(false);
                // A resting draft shows how the thought starts.
                if (draft.input.current) draft.input.current.scrollTop = 0;
            }}
            className="capture-surface group px-4 py-3.5"
        >
            <div className="flex items-start gap-3">
                <Inbox
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="mt-[5px] shrink-0 text-twilight-text-muted transition-colors duration-300 group-focus-within:text-accent-primary"
                />
                {draft.field(1, true, focused)}
            </div>
            <Reveal open={active}>
                <div className="flex items-center justify-between gap-3 pb-1 pl-7.5 pt-3">
                    {/* A multi-line paste offers its split in the hint's place; otherwise only the task shortcut needs saying. */}
                    {draft.splitCount ? (
                        <Button
                            variant="subtle"
                            size="sm"
                            disabled={draft.busy}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void draft.save(false, true)}
                            className="h-9 min-h-9 rounded-full px-4 text-[13px]"
                        >
                            Add as {draft.splitCount} thoughts
                        </Button>
                    ) : (
                        <p aria-hidden="true" className="inline-flex items-center gap-1 text-xs text-twilight-text-muted opacity-0 transition-opacity duration-300 group-focus-within:opacity-100">
                            <kbd className={KEYCAP}>{MOD_KEY}</kbd>
                            <kbd className={KEYCAP}>↵</kbd>
                            <span className="ml-0.5">as task</span>
                        </p>
                    )}
                    <Button
                        variant="cardPrimary"
                        size="sm"
                        disabled={!ready}
                        // Keep focus in the field (Safari doesn't focus a clicked button), so the row can't fold mid-click.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void draft.save()}
                        className="h-9 min-h-9 shrink-0 rounded-full px-4 text-[13px]"
                    >
                        {draft.busy ? "Capturing…" : "Capture"}
                    </Button>
                </div>
            </Reveal>
            {draft.error && (
                <p role="alert" className="pl-7.5 pt-3 text-sm text-twilight-text-muted">
                    Couldn't save. Your draft is still here.
                </p>
            )}
        </div>
    );
}
