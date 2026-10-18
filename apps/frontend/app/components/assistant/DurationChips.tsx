import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DurationReportView, DurationValue } from "@cadence/contracts/memory";
import { ABSOLUTE_CHIPS, ANSWER_HINT, MORE_CHIPS, formatMinutes, formatValue, parseAnswer, relativeChips, type DurationChip } from "@cadence/domain/duration-chips";
import { toastName } from "../../lib/utils/undo-toast";

const CHIP =
    "min-h-9 pointer-coarse:min-h-11 cursor-pointer rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 text-[13px] font-medium text-twilight-text transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
const QUIET =
    "min-h-9 pointer-coarse:min-h-11 cursor-pointer rounded-full px-3 text-[13px] text-twilight-text-muted hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

type Stage = "relative" | "shorter" | "longer" | "absolute" | "more" | "other";

const point = (minutes: number): DurationValue => ({ kind: "point", minutes });

/**
 * The answers to "How long did it take?", at most six to a row. With a reference ("about 45 min?") the first row
 * compares to it, since "shorter or longer" is easier than recalling a number; without one it is steps that double.
 * `onPick` says whether the answer came from the relative stage (anchored by the number shown).
 */
export function DurationChoices({ reference, onPick, onSkip, skipLabel = "Skip", disabled = false, suggested, pointsOnly = false }: {
    reference: number | null;
    onPick: (value: DurationValue, anchored: boolean) => void;
    onSkip: () => void;
    skipLabel?: string;
    disabled?: boolean;
    /** A length to offer first and pre-selected (a guess being planned with); picking it stores it like any chip. */
    suggested?: number;
    /** One length only, no ranges (a plan has one length). */
    pointsOnly?: boolean;
}) {
    const [stage, setStage] = useState<Stage>(reference ? "relative" : "absolute");
    const [text, setText] = useState("");
    const answer = parseAnswer(text);
    const parsed = pointsOnly && answer?.kind === "range" ? null : answer;
    const chips = (list: readonly DurationChip[], anchored: boolean) =>
        list.map((c) => (
            <button key={c.minutes} type="button" disabled={disabled} onClick={() => onPick(point(c.minutes), anchored)} className={CHIP}>
                {c.label}
            </button>
        ));
    const step = (label: string, to: Stage) => (
        <button type="button" disabled={disabled} onClick={() => setStage(to)} className={CHIP}>
            {label}
        </button>
    );

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {stage === "relative" && reference ? (
                <>
                    <button type="button" disabled={disabled} onClick={() => onPick(point(reference), true)} className={CHIP}>
                        About right
                    </button>
                    {step("Shorter", "shorter")}
                    {step("Longer", "longer")}
                </>
            ) : null}
            {stage === "shorter" && reference ? chips(relativeChips(reference, "shorter"), true) : null}
            {stage === "longer" && reference ? chips(relativeChips(reference, "longer"), true) : null}
            {stage === "absolute" ? (
                <>
                    {suggested ? (
                        <button type="button" disabled={disabled} aria-pressed="true" onClick={() => onPick(point(suggested), false)} className={`${CHIP} ring-2 ring-accent-primary/50`}>
                            {formatMinutes(suggested)}
                        </button>
                    ) : null}
                    {chips(ABSOLUTE_CHIPS.filter((c) => c.minutes !== suggested), false)}
                    {step("More…", "more")}
                </>
            ) : null}
            {stage === "more" ? (
                <>
                    {chips(MORE_CHIPS, false)}
                    {step("Other", "other")}
                </>
            ) : null}
            {stage === "other" ? (
                <form
                    className="flex flex-wrap items-center gap-1.5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (parsed && !disabled) onPick(parsed, false);
                    }}
                >
                    <input
                        autoFocus
                        value={text}
                        disabled={disabled}
                        onChange={(event) => setText(event.target.value)}
                        inputMode="text"
                        aria-label="How long, for example 1h20, 90 or 30 to 60"
                        aria-describedby="duration-hint"
                        placeholder="1h20, 90, 30–60…"
                        className="min-h-9 pointer-coarse:min-h-11 w-32 rounded-full border border-accent-primary/30 bg-transparent px-3 text-[13px] text-twilight-text outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    />
                    <button type="submit" disabled={!parsed || disabled} className={`${CHIP} disabled:cursor-default disabled:opacity-50`}>
                        {parsed ? formatValue(parsed) : "Save"}
                    </button>
                    <span id="duration-hint" className="w-full text-xs text-twilight-text-muted" aria-live="polite">
                        {text.trim() && !parsed ? (pointsOnly && answer ? "One length, for example 90 or 1h30" : ANSWER_HINT) : ""}
                    </span>
                </form>
            ) : null}
            <button type="button" onClick={onSkip} className={QUIET}>
                {skipLabel}
            </button>
        </div>
    );
}

const ASK_MS = 9_000;
const SAVED_MS = 6_000;

type Phase =
    | { kind: "ask" }
    | { kind: "saving"; value: DurationValue; anchored: boolean }
    | { kind: "error"; value: DurationValue; anchored: boolean }
    | { kind: "saved"; view: DurationReportView }
    | { kind: "change"; view: DurationReportView };

const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;

/**
 * "How long did it take?": optional quick picks on completion (Full). A tap shows Saving…, then
 * "Saved · 45 min · Change" only once the server has stored it, or "Couldn't save · Retry" with the value kept.
 * The countdown waits while saving, failing, or while the pointer or focus is inside, so a keyboard or
 * screen-reader user is never timed out mid-reach. Skipping does nothing and costs nothing. If the task was
 * reopened meanwhile (409) the toast closes quietly: the person undid it themselves.
 */
export function DurationChips({
    id,
    title,
    reference,
    onShown,
    onSave,
}: {
    id: string | number;
    title: string;
    reference: number | null;
    onShown: () => void;
    onSave: (value: DurationValue, anchored: boolean) => Promise<DurationReportView | null>;
}) {
    const [phase, setPhase] = useState<Phase>({ kind: "ask" });
    const box = useRef<HTMLDivElement>(null);

    useEffect(onShown, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when it renders

    const save = async (value: DurationValue, anchored: boolean) => {
        setPhase({ kind: "saving", value, anchored });
        try {
            const view = await onSave(value, anchored);
            if (view) setPhase({ kind: "saved", view });
            else toast.dismiss(id); // stored nothing (memory is no longer Full): never a fake Saved
        } catch (error) {
            if (statusOf(error) === 409) toast.dismiss(id);
            else setPhase({ kind: "error", value, anchored });
        }
    };

    // Re-armed by every phase change. Hover and focus are read live when it fires, not counted from events: a chip
    // that unmounts while focused (picking, Shorter/Longer) never blurs, which left a count stuck and the toast open.
    const waiting = phase.kind === "saving" || phase.kind === "error" || phase.kind === "change";
    useEffect(() => {
        if (waiting) return;
        let timer: ReturnType<typeof setTimeout>;
        const arm = (ms: number) => {
            timer = setTimeout(() => {
                const el = box.current;
                if (el && (el.matches(":hover") || el.contains(document.activeElement))) arm(1_000);
                else toast.dismiss(id);
            }, ms);
        };
        arm(phase.kind === "saved" ? SAVED_MS : ASK_MS);
        return () => clearTimeout(timer);
    }, [id, waiting, phase.kind]);

    const name = toastName(title, 40);
    const label = (value: DurationValue) => formatValue(value);
    return (
        // The Cadence toast is the card: no surface of its own, or it shows a border inside a border.
        <div
            ref={box}
            role="group"
            aria-label="How long did it take?"
            onKeyDown={(event) => {
                if (event.key === "Escape" && phase.kind !== "saving") toast.dismiss(id);
            }}
            className="flex w-full max-w-sm flex-col gap-2 text-sm text-twilight-text"
        >
            <div role="status" aria-live="polite" className="contents">
                {phase.kind === "saved" ? (
                    <p className="flex flex-wrap items-center gap-x-2 leading-snug">
                        <span>
                            Saved · <span className="font-medium">{formatValue(phase.view)}</span>
                        </span>
                        <button type="button" onClick={() => setPhase({ kind: "change", view: phase.view })} className={QUIET}>
                            Change
                        </button>
                    </p>
                ) : null}
                {phase.kind === "saving" ? <p className="leading-snug">Saving… · <span className="font-medium">{label(phase.value)}</span></p> : null}
                {phase.kind === "error" ? (
                    <p className="flex flex-wrap items-center gap-x-2 leading-snug">
                        <span>
                            Couldn’t save · <span className="font-medium">{label(phase.value)}</span>
                        </span>
                        <button type="button" onClick={() => void save(phase.value, phase.anchored)} className={CHIP}>
                            Retry
                        </button>
                        <button type="button" onClick={() => toast.dismiss(id)} className={QUIET}>
                            Skip
                        </button>
                    </p>
                ) : null}
            </div>
            {phase.kind === "ask" || phase.kind === "change" ? (
                <>
                    <p className="leading-snug">
                        How long did <span className="font-medium">{name}</span> take?
                        {reference && phase.kind === "ask" ? (
                            <>
                                {" "}
                                About <span className="font-medium">{formatMinutes(reference)}</span>?
                            </>
                        ) : null}
                    </p>
                    <DurationChoices
                        reference={reference}
                        skipLabel={phase.kind === "ask" ? "Skip" : "Cancel"}
                        onSkip={() => (phase.kind === "ask" ? toast.dismiss(id) : setPhase({ kind: "saved", view: phase.view }))}
                        onPick={(value, anchored) => void save(value, anchored)}
                    />
                </>
            ) : null}
        </div>
    );
}
