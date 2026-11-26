import { newRowId } from "../../lib/api/optimistic-id";
import { TASK_FIELDS, useNlpParse } from "../../hooks/use-nlp-parse";
import { resolvedNlp } from "../../lib/utils/task/resolved-nlp";
import { useEditableProjects } from "../../hooks/projects/use-own-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useSettings } from "../../hooks/core/use-settings";
import {
    useCallback,
    useState,
    useRef,
    useEffect,
    useLayoutEffect,
    useContext,
    useTransition,
    type KeyboardEvent,
} from "react";
import { Calendar, CheckSquare, Inbox, MessageSquare, Plus } from "lucide-react";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import { useProcessInboxToTask } from "../../hooks/inbox/use-process-inbox-to-task";
import { COMPOSER_FIELD, ComposerRow, ComposerRows, type ComposerDraft } from "../shared/Composer";
import { Switch } from "../primitives";
import { Button } from "../primitives/Button";
import { Reveal } from "../shared/Reveal";
import { StartupReadyContext } from "../../hooks/core/use-workspace-startup";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import type { InboxItem } from "@cadence/contracts/inbox";
import { MOD_KEY } from "../../lib/constants/keys";
import { DeadlineTrigger } from "../tasks/DeadlineTrigger";
import { readCaptureDraft, writeCaptureDraft } from "../../lib/utils/capture-draft";
import { isFloatingFocus } from "../../lib/utils/dom";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { ScheduleUpdates } from "../tasks/QuickScheduleSurface";
import type { DraftFields } from "@cadence/domain/nlp-draft";
import type { LocalDate } from "@cadence/domain/time";
import type { DateStyle } from "@cadence/nlp/core";

const TASK_LINE_WORDS = 12;

const isTaskLine = (text: string): boolean => {
    const line = text.trim();
    return Boolean(line) && !line.includes("\n") && line.split(/\s+/).length <= TASK_LINE_WORDS;
};

const WORDS_ONLY = { dueDate: null, scheduledStart: null, scheduledEnd: null, recurrenceRule: null } as const;

interface DayPick {
    for: string;
    schedule: ScheduleUpdates;
}

export const pickHolds = (pickedFor: string, value: string): boolean => {
    const anchor = pickedFor.trim();
    return value.trim().startsWith(anchor.slice(0, Math.ceil(anchor.length / 2)));
};

const isDated = ({ dueDate, scheduledStart }: Pick<DraftFields, "dueDate" | "scheduledStart">) =>
    Boolean(dueDate || scheduledStart);

function taskPayload(
    id: string,
    text: string,
    draft: { cleanedTitle: string; fields: DraftFields },
    endDate: LocalDate | null,
    dateStyle: DateStyle,
) {
    const { fields } = draft;
    return {
        inboxItemId: id,
        rawText: text,
        title: draft.cleanedTitle || text,
        dueDate: fields.dueDate,
        endDate,
        scheduledStart: fields.scheduledStart,
        scheduledEnd: fields.scheduledEnd,
        recurrenceRule: fields.recurrenceRule,
        projectId: fields.projectId,
        tagIds: fields.tagIds,
        priority: fields.priority,
        durationEstimate: fields.durationMinutes,
        waitingOn: fields.waitingOn,
        reminderAt: fields.reminderAt,
        notBefore: fields.notBefore,
        nlp: resolvedNlp(text, "inbox", dateStyle, [], {}),
    };
}

function useCaptureDraft(onSaved?: (item: InboxItem | undefined) => void, storageKey?: string) {
    const [value, setValue] = useState(() => readCaptureDraft(storageKey));
    useEffect(() => {
        if (!storageKey) return;
        writeCaptureDraft(storageKey, value);
    }, [storageKey, value]);
    const [count, setCount] = useState(0);
    const [busy, startSave] = useTransition();
    const [error, setError] = useState(false);
    const [pasted, setPasted] = useState(false);
    const input = useRef<HTMLTextAreaElement>(null);
    const takeFocus = useCallback((el: HTMLTextAreaElement | null) => {
        input.current = el;
        el?.focus({ preventScroll: true });
    }, []);
    const create = useCreateInboxItem();
    const process = useProcessInboxToTask();
    const { data: projects = [] } = useEditableProjects();
    const { data: tags = [] } = useTags();
    const { data: settings } = useSettings();
    const nlpEnabled = settings?.tasks?.intelligence?.nlpEnabled !== false;
    const dateStyle = settings?.dateTime?.dateStyle ?? "mdy";
    const { isTouch } = useShellMode();
    const savedCapture = useRef<InboxItem | undefined>(undefined);
    const [pick, setPick] = useState<DayPick | null>(null);
    const picked = pick && pickHolds(pick.for, value) ? pick.schedule : null;
    const nlp = useNlpParse({
        input: value,
        projects,
        tags,
        manual: picked
            ? {
                  dueDate: picked.dueDate,
                  scheduledStart: picked.scheduledStart,
                  scheduledEnd: picked.scheduledEnd,
                  recurrenceRule: picked.recurrenceRule,
              }
            : isTaskLine(value)
              ? undefined
              : WORDS_ONLY,
        capabilities: TASK_FIELDS,
        sourceSurface: "inbox",
        dateStyle,
        enabled: nlpEnabled,
    });
    const [taskMode, setTaskMode] = useState(false);
    const dated = isDated(nlp.fields);
    const asTask = dated || taskMode;
    const endDate = picked?.endDate ?? null;
    const { dueDate, scheduledStart, scheduledEnd, recurrenceRule } = nlp.fields;
    const schedule: ScheduleUpdates = { dueDate, endDate, scheduledStart, scheduledEnd, recurrenceRule };
    const lines = value
        .split(/\r?\n/)
        .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
        .filter(Boolean);
    const draftFor = (forceTask: boolean, split: boolean) => {
        const mayBeTask = !split && (forceTask || picked !== null || isTaskLine(value));
        if (!mayBeTask) return null;
        return nlp.ready ? nlp : nlp.finalize();
    };
    const saveLine = async (
        text: string,
        draft: Awaited<ReturnType<typeof draftFor>>,
        task: boolean,
        retry: InboxItem | undefined,
    ) => {
        const id = retry?.id ?? newRowId();
        const item = retry ?? (await create.mutateAsync({ id, rawText: text, placing: task }));
        try {
            if (task) await process.mutateAsync(taskPayload(id, text, draft!, endDate, dateStyle));
        } catch (err) {
            savedCapture.current = item ?? ({ id } as InboxItem);
            throw err;
        }
        return item;
    };
    const save = (forceTask = false, split = false) => {
        if (!value.trim() || busy) return;
        const original = value;
        let remaining = split ? lines : [value.trim()];
        const pending = draftFor(forceTask, split);
        const run = async (draft: Awaited<ReturnType<typeof draftFor>>) => {
            setError(false);
            const task = draft !== null && (forceTask || isDated(draft.fields));
            const retry = savedCapture.current;
            savedCapture.current = undefined;
            setValue((current) => (current === original ? "" : current));
            setPick(null);
            setPasted(false);
            input.current?.focus();
            try {
                while (remaining.length) {
                    const item = await saveLine(
                        remaining[0],
                        draft,
                        task,
                        remaining.length === 1 && !split ? retry : undefined,
                    );
                    remaining = remaining.slice(1);
                    setCount((c) => c + 1);
                    if (!split || !remaining.length) onSaved?.(item);
                }
            } catch {
                setError(true);
                const left = split ? remaining.join("\n") : original;
                setValue((current) => (current ? current : left));
            }
        };
        if (pending instanceof Promise)
            startSave(async () => {
                void run(await pending);
            });
        else void run(pending);
    };
    const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save(event.metaKey || event.ctrlKey || taskMode);
        }
        if (event.key === "Escape") {
            event.stopPropagation();
            input.current?.blur();
        }
    };
    const field = (rows: number, inline = false, spellCheck = true) => (
        <textarea
            ref={takeFocus}
            data-escape-owner
            value={value}
            rows={rows}
            spellCheck={spellCheck}
            enterKeyHint="done"
            data-initial-focus
            aria-label="What's on your mind?"
            aria-keyshortcuts="Meta+Enter Control+Enter"
            placeholder="What's on your mind?"
            readOnly={busy}
            onChange={(e) => {
                setValue(e.target.value);
                savedCapture.current = undefined;
                if (!e.target.value.trim()) setPick(null);
            }}
            onKeyDown={keyDown}
            onPaste={(e) => setPasted(e.clipboardData.getData("text").includes("\n"))}
            className={
                inline
                    ? "scrollbar-hidden block w-full min-w-0 resize-none bg-transparent font-display text-lg leading-7 text-twilight-text outline-none placeholder:text-twilight-text-soft group-data-draft:text-twilight-text-soft data-overflow:[mask-image:linear-gradient(transparent,#000_12px,#000_calc(100%-12px),transparent)]"
                    : `${COMPOSER_FIELD} resize-none text-base placeholder:text-twilight-text-muted`
            }
        />
    );
    const feedback = (
        <>
            {pasted && lines.length > 1 && (
                <Button variant="secondary" size="md" disabled={busy} onClick={() => save(false, true)}>
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
    const focusField = () => {
        const el = input.current;
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
    };
    const pickDay = (next: ScheduleUpdates) => setPick({ for: value, schedule: next });
    const dayControl = <DeadlineTrigger schedule={schedule} onChange={pickDay} returnFocus={focusField} />;
    const rows = (
        <ComposerRows>
            <ComposerRow icon={Calendar} label="Date">
                <DeadlineTrigger row schedule={schedule} onChange={pickDay} returnFocus={focusField} />
            </ComposerRow>
            <ComposerRow icon={CheckSquare} label="Task">
                <Switch checked={asTask} disabled={dated} onCheckedChange={setTaskMode} aria-label="Save as a task" />
            </ComposerRow>
        </ComposerRows>
    );
    const taskControl = asTask ? null : (
        <Button
            variant="ghost"
            size="none"
            disabled={!value.trim() || busy}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => save(true)}
            className={`shrink-0 gap-1 rounded-lg font-sans text-xs font-medium ${isTouch ? "min-h-9 px-2" : "px-1.5 py-1"}`}
        >
            {isTouch ? (
                <>
                    <Plus size={13} aria-hidden="true" />
                    As task
                </>
            ) : (
                <>
                    <kbd className={KEYCAP}>{MOD_KEY}</kbd>
                    <kbd className={KEYCAP}>↵</kbd>
                    <span className="ml-0.5">as task</span>
                </>
            )}
        </Button>
    );
    const submitLabel = busy ? (asTask ? "Adding…" : "Capturing…") : asTask ? "Add task" : "Capture";
    return {
        value,
        input,
        asTask,
        dayControl,
        taskControl,
        rows,
        taskMode,
        submitLabel,
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
            setPick(null);
            setTaskMode(false);
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
        submit: {
            onSubmit: () => draft.save(draft.taskMode),
            submitLabel: draft.submitLabel,
            icon: draft.asTask ? Plus : Inbox,
            disabled: !draft.value.trim() || draft.busy,
        },
        children: (
            <>
                {draft.field(5)}
                {draft.rows}
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

export const KBD =
    "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-twilight-border/60 bg-white/[0.04] px-1.5 font-sans text-[10px] font-medium text-twilight-text-soft";

const KEYCAP = KBD.replace("text-[10px]", "text-[11px]");

export function CaptureInput() {
    const { session } = useAuthState();
    const draft = useCaptureDraft(
        undefined,
        session?.user?.id ? `cadence:capture-draft:${session.user.id}` : undefined,
    );
    const [focused, setFocused] = useState(false);
    const [engaged, setEngaged] = useState(false);
    const hasDraft = draft.value.trim().length > 0;
    const active = focused && (engaged || hasDraft);
    const revealed = useContext(StartupReadyContext);
    useEffect(() => {
        const el = draft.input.current;
        if (!el || !revealed) return;
        el.setSelectionRange(el.value.length, el.value.length);
        el.scrollTop = el.scrollHeight;
        if (document.activeElement === document.body) el.focus({ preventScroll: true });
    }, [revealed, draft.input]);
    const ready = Boolean(draft.value.trim()) && !draft.busy;
    useLayoutEffect(() => {
        const el = draft.input.current;
        if (!el) return;
        const cap = focused ? 240 : 56;
        const fit = () => {
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
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
                if (e.currentTarget.contains(e.relatedTarget) || isFloatingFocus(e.relatedTarget)) return;
                setFocused(false);
                setEngaged(false);
                if (draft.input.current) draft.input.current.scrollTop = 0;
            }}
            className="capture-surface group px-4 py-3.5"
        >
            <div className="flex items-start gap-3">
                <MessageSquare
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="mt-[5px] shrink-0 text-twilight-text-muted transition-colors duration-300 group-focus-within:text-accent-primary"
                />
                {draft.field(1, true, focused)}
            </div>
            <Reveal open={active}>
                <div className="flex items-center justify-between gap-3 pb-1 pl-7.5 pt-3">
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
                        <div className="flex min-w-0 items-center gap-3">
                            {draft.dayControl}
                            {draft.taskControl && (
                                <div className="opacity-0 transition-opacity duration-300 group-focus-within:opacity-100">
                                    {draft.taskControl}
                                </div>
                            )}
                        </div>
                    )}
                    <Button
                        variant="cardPrimary"
                        size="sm"
                        disabled={!ready}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => draft.save()}
                        className="h-9 min-h-9 shrink-0 rounded-full px-4 text-[13px]"
                    >
                        {draft.submitLabel}
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
