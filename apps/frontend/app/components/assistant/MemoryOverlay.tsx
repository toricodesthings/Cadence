import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, SendHorizontal } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { formatInZone } from "@cadence/domain/time";
import type { MemoryFact, MemoryKind, MemoryMode } from "@cadence/contracts/memory";
import * as ScrollArea from "../primitives/ScrollArea";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button, Tip } from "../primitives";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useClearMemory, useForgetMemory, useMemoryPage, useRestoreMemory, useSetMemoryMode } from "../../hooks/ai/use-memory";
import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import { cn } from "../../lib/utils";

/** Search appears once the page is long enough to need it. */
const SEARCH_AFTER = 30;

const GROUPS: ReadonlyArray<{ title: string; kinds: readonly MemoryKind[] }> = [
    { title: "About you", kinds: ["life", "quirk"] },
    { title: "How you like to work", kinds: ["preference", "constraint", "assist"] },
    { title: "What I’ve noticed", kinds: ["pattern", "duration"] },
];

const MODES: ReadonlyArray<{ mode: MemoryMode; label: string }> = [
    { mode: "off", label: "Off" },
    { mode: "basic", label: "Basic" },
    { mode: "full", label: "Full" },
];

const SOURCE_LINE: Record<MemoryFact["source"], string> = {
    explicit: "you asked me to remember it",
    chat: "from our chat",
    note: "from a task note",
    activity: "from how you work",
    backfill: "from earlier chats",
};

const since = (fact: MemoryFact) => `since ${formatInZone(fact.saidOn, "UTC", { month: "short", year: "numeric" })} · ${SOURCE_LINE[fact.source]}`;

/**
 * "What Cadence knows": everything remembered, in plain sentences. Tapping an item shows where it came
 * from and a Forget button (one tap, with Undo). Every other change goes through the pinned chat box,
 * so there is no editor and no review queue. Same envelope as the usage overlay.
 */
export function MemoryOverlay({ onClose, onAsk }: { onClose: () => void; onAsk: (text: string) => void }) {
    const reduceMotion = useReducedMotion();
    const { data, isLoading } = useMemoryPage();
    const setMode = useSetMemoryMode();
    const forget = useForgetMemory();
    const restore = useRestoreMemory();
    const clear = useClearMemory();
    const [openId, setOpenId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [draft, setDraft] = useState("");

    const facts = data?.facts ?? [];
    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle ? facts.filter((f) => f.content.toLowerCase().includes(needle)) : facts;
    }, [facts, query]);

    const onForget = (fact: MemoryFact) => {
        // Undo waits for the forget to land, or the restore could arrive first and find nothing to bring back.
        const forgotten = forget.mutateAsync({ id: fact.id }).then(() => true, () => false);
        setOpenId(null);
        toastUndo(`Forgot “${toastName(fact.content)}”`, () => void forgotten.then((ok) => ok && restore.mutate(fact.id)), {
            description: "Gone from what I use. Undo brings it back.",
        });
    };

    const ask = () => {
        const text = draft.trim();
        if (!text) return;
        setDraft("");
        onAsk(text);
    };

    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="absolute inset-0 z-10 flex flex-col bg-panel/95 backdrop-blur-xl"
            role="dialog"
            aria-label="What Cadence knows"
        >
            <header className="flex h-(--shell-header-h) shrink-0 items-center gap-2 border-b border-twilight-border px-4">
                <Tip label="Back to conversation" side="bottom">
                    <button
                        type="button"
                        onClick={onClose}
                        autoFocus
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        aria-label="Back to conversation"
                    >
                        <ChevronLeft size={18} />
                    </button>
                </Tip>
                <h2 className="font-display text-lg font-semibold tracking-tight text-twilight-text">What Cadence knows</h2>
            </header>

            <ScrollArea.Root className="min-h-0 flex-1">
                <ScrollArea.Viewport className="flex flex-col gap-5 px-3 py-4">
                    <div role="radiogroup" aria-label="How much to remember" className="flex gap-1 rounded-full border border-twilight-border bg-twilight-surface/40 p-1">
                        {MODES.map(({ mode, label }) => (
                            <button
                                key={mode}
                                type="button"
                                role="radio"
                                aria-checked={data?.mode === mode}
                                disabled={setMode.isPending}
                                onClick={() => data?.mode !== mode && setMode.mutate(mode)}
                                className={cn(
                                    "min-h-9 flex-1 cursor-pointer rounded-full text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50",
                                    data?.mode === mode ? "bg-accent-primary/15 text-twilight-text" : "text-twilight-text-soft hover:text-twilight-text",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {data?.gettingToKnowYou ? (
                        <p role="status" className="rounded-2xl border border-accent-primary/20 bg-accent-primary/8 p-3 text-[13px] leading-relaxed text-twilight-text-soft">
                            Getting to know you: reading your last 3 months. It happens over the next few nights.
                        </p>
                    ) : null}

                    {data?.inactive && facts.length > 0 ? (
                        <p className="rounded-2xl border border-twilight-border bg-twilight-surface/40 p-3 text-[13px] leading-relaxed text-twilight-text-soft">
                            Memory is off, so none of this is used. It’s kept until you clear it.{" "}
                            <button type="button" onClick={() => setMode.mutate("basic")} className="cursor-pointer font-medium text-accent-primary hover:underline">
                                Turn on
                            </button>
                        </p>
                    ) : null}

                    {facts.length > SEARCH_AFTER ? (
                        <label className="flex min-h-11 items-center gap-2 rounded-full border border-twilight-border bg-twilight-surface/40 px-3 text-sm text-twilight-text">
                            <Search size={15} aria-hidden className="shrink-0 text-twilight-text-muted" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search what I know"
                                aria-label="Search what I know"
                                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-twilight-text-muted"
                            />
                        </label>
                    ) : null}

                    {isLoading ? null : facts.length === 0 ? (
                        <p className="py-8 text-center text-sm text-twilight-text-soft">
                            {data?.mode === "off" ? "Memory is off. Nothing is being learned." : "Nothing yet. Just talk to me and I’ll pick things up."}
                        </p>
                    ) : (
                        GROUPS.map((group) => {
                            const items = shown.filter((f) => group.kinds.includes(f.kind));
                            if (items.length === 0) return null;
                            return (
                                <section key={group.title} aria-label={group.title} className="flex flex-col gap-1.5">
                                    <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-twilight-text-muted">{group.title}</h3>
                                    <ul className="flex flex-col gap-1.5">
                                        {items.map((fact) => {
                                            const open = openId === fact.id;
                                            return (
                                                <li key={fact.id} className="surface-item rounded-2xl">
                                                    <button
                                                        type="button"
                                                        aria-expanded={open}
                                                        onClick={() => setOpenId(open ? null : fact.id)}
                                                        className="flex min-h-11 w-full cursor-pointer items-start gap-2 rounded-2xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                                                    >
                                                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                            <span className="text-sm leading-snug text-twilight-text">{fact.content}</span>
                                                            <span className="text-[11px] text-twilight-text-muted">{since(fact)}</span>
                                                        </span>
                                                        <ChevronRight size={15} aria-hidden className={cn("mt-1 shrink-0 text-twilight-text-muted transition-transform", open && "rotate-90")} />
                                                    </button>
                                                    {open ? (
                                                        <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
                                                            <Button variant="ghost" size="sm" onClick={() => onForget(fact)}>
                                                                Forget
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            );
                        })
                    )}

                    {(data?.forgotten.length ?? 0) > 0 ? (
                        <section aria-label="Things you asked me to forget" className="flex flex-col gap-1.5">
                            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-twilight-text-muted">Things you asked me to forget</h3>
                            <ul className="flex flex-wrap gap-1.5">
                                {data!.forgotten.map((item) => (
                                    <li key={item.id} className="rounded-full border border-twilight-border px-2.5 py-1 text-xs text-twilight-text-soft">
                                        {item.label}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {facts.length > 0 || (data?.forgotten.length ?? 0) > 0 ? (
                        <AlertDialog.Root>
                            <AlertDialog.Trigger asChild>
                                <button type="button" className="mx-auto min-h-11 cursor-pointer px-3 text-[13px] text-twilight-text-muted underline-offset-4 hover:text-twilight-text hover:underline">
                                    Clear everything
                                </button>
                            </AlertDialog.Trigger>
                            <AlertDialog.Content>
                                <AlertDialog.Header>
                                    <AlertDialog.Title>Clear everything I know?</AlertDialog.Title>
                                    <AlertDialog.Description>Every remembered item is deleted for good, along with what you asked me to forget. Your chats stay.</AlertDialog.Description>
                                </AlertDialog.Header>
                                <AlertDialog.Footer>
                                    <AlertDialog.Cancel asChild>
                                        <Button variant="ghost" size="md">Cancel</Button>
                                    </AlertDialog.Cancel>
                                    <AlertDialog.Action asChild>
                                        <Button variant="ghost" size="md" onClick={() => clear.mutate(false)}>Clear</Button>
                                    </AlertDialog.Action>
                                    <AlertDialog.Action asChild>
                                        <Button variant="danger" size="md" onClick={() => clear.mutate(true)}>Clear and turn off</Button>
                                    </AlertDialog.Action>
                                </AlertDialog.Footer>
                            </AlertDialog.Content>
                        </AlertDialog.Root>
                    ) : null}
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar>
                    <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
            </ScrollArea.Root>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    ask();
                }}
                className="flex shrink-0 items-center gap-2 border-t border-twilight-border px-3 py-3"
            >
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Tell me what to change"
                    aria-label="Tell me what to change"
                    maxLength={500}
                    className="min-h-11 min-w-0 flex-1 rounded-full border border-white/[0.08] bg-panel-raised/85 px-4 text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted focus-visible:border-accent-primary/35"
                />
                <Tip label="Send" side="top">
                    <button
                        type="submit"
                        disabled={!draft.trim()}
                        aria-label="Send"
                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-primary text-[var(--primary-foreground)] transition-opacity disabled:cursor-default disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <SendHorizontal size={17} aria-hidden />
                    </button>
                </Tip>
            </form>
        </motion.div>
    );
}
