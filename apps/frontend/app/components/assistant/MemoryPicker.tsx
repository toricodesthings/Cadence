import { useRef, useState, type KeyboardEvent } from "react";
import { Brain, Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { MemoryMode } from "@cadence/contracts/memory";
import { Button } from "../primitives";
import { ExternalLink } from "../shared/ExternalLink";
import { CADENCE_PRIVACY_URL } from "../../lib/constants/app-info";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useMemoryPage, useSetMemoryMode } from "../../hooks/ai/use-memory";
import { cn } from "../../lib/utils";

const CHOICES: ReadonlyArray<{ mode: Exclude<MemoryMode, "off">; title: string; body: string; badge?: string }> = [
    {
        mode: "basic",
        title: "Basic",
        badge: "Recommended",
        body: "What you tell me. I’ll remember what you say in our chats (your preferences, plans and the little things) so you never repeat yourself.",
    },
    {
        mode: "full",
        title: "Full",
        body: "Everything that helps. I’ll also learn from how you actually work: what you finish, what you move, how long things take, your task notes, and our past chats.",
    },
];

/**
 * The first-start question, shown over the assistant until it is answered (existing accounts on
 * their next open). Basic is preselected, so it takes one tap. Off is a link, not a third card:
 * it's an exit, not a choice to weigh. Rendered until the person chooses.
 */
export function MemoryPicker() {
    const { data } = useMemoryPage();
    const setMode = useSetMemoryMode();
    const reduceMotion = useReducedMotion();
    const [picked, setPicked] = useState<"basic" | "full">("basic");
    const radios = useRef<(HTMLButtonElement | null)[]>([]);

    // One tab stop; the arrows move between the two choices, as a radio group does.
    const onArrow = (e: KeyboardEvent, index: number) => {
        const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = (index + step + CHOICES.length) % CHOICES.length;
        setPicked(CHOICES[next].mode);
        radios.current[next]?.focus();
    };

    if (!data || data.mode !== null) return null;

    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="absolute inset-0 z-20 flex flex-col justify-center gap-4 overflow-y-auto bg-panel px-4 py-6"
            role="dialog"
            aria-labelledby="memory-picker-title"
        >
            <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary ring-1 ring-accent-primary/20">
                    <Brain size={22} aria-hidden />
                </span>
                <h2 id="memory-picker-title" className="font-display text-xl font-semibold tracking-tight text-twilight-text">
                    How much should I remember?
                </h2>
            </div>

            <div role="radiogroup" aria-labelledby="memory-picker-title" className="flex flex-col gap-2">
                {CHOICES.map((choice, index) => {
                    const active = picked === choice.mode;
                    return (
                        <button
                            key={choice.mode}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            tabIndex={active ? 0 : -1}
                            ref={(el) => {
                                radios.current[index] = el;
                            }}
                            onKeyDown={(e) => onArrow(e, index)}
                            onClick={() => setPicked(choice.mode)}
                            className={cn(
                                "relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50",
                                active
                                    ? "border-accent-primary/40 bg-accent-primary/12"
                                    : "border-twilight-border bg-twilight-surface/40 hover:bg-twilight-surface-hover/60",
                            )}
                        >
                            <span className="flex items-center gap-2 text-sm font-semibold text-twilight-text">
                                {choice.title}
                                {choice.badge ? <span className="text-[11px] font-medium text-accent-primary">{choice.badge}</span> : null}
                            </span>
                            <span className="text-[13px] leading-relaxed text-twilight-text-soft">{choice.body}</span>
                            {active ? (
                                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-[var(--accent-on-primary)]" aria-hidden>
                                    <Check size={12} strokeWidth={3} />
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <Button size="lg" onClick={() => setMode.mutate(picked)} disabled={setMode.isPending} autoFocus>
                Continue
            </Button>

            <div className="flex flex-col items-center gap-1 text-[13px]">
                <button
                    type="button"
                    onClick={() => setMode.mutate("off")}
                    disabled={setMode.isPending}
                    className="min-h-11 cursor-pointer px-3 text-twilight-text-soft underline-offset-4 hover:text-twilight-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    Don’t remember anything
                </button>
                <ExternalLink
                    href={`${CADENCE_PRIVACY_URL}#memory`}
                    className="inline-flex min-h-11 items-center px-3 text-twilight-text-muted underline-offset-4 hover:text-twilight-text hover:underline"
                >
                    How memory works
                </ExternalLink>
            </div>
        </motion.div>
    );
}
