import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ABSOLUTE_CHIPS, MORE_CHIPS, formatMinutes, parseAnswer, relativeChips, type DurationChip } from "@cadence/domain/duration-chips";
import { toastName } from "../../lib/utils/undo-toast";

const CHIP =
    "min-h-9 cursor-pointer rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 text-[13px] font-medium text-twilight-text transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
const QUIET =
    "min-h-9 cursor-pointer rounded-full px-3 text-[13px] text-twilight-text-muted hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

type Stage = "relative" | "shorter" | "longer" | "absolute" | "more" | "other";

/**
 * The answers to "How long did it take?", at most six to a row. With a reference ("about 45 min?") the first row
 * compares to it, since "shorter or longer" is easier than recalling a number; without one it is steps that double.
 */
export function DurationChoices({ reference, onPick, onSkip, skipLabel = "Skip" }: { reference: number | null; onPick: (minutes: number) => void; onSkip: () => void; skipLabel?: string }) {
    const [stage, setStage] = useState<Stage>(reference ? "relative" : "absolute");
    const [text, setText] = useState("");
    const parsed = parseAnswer(text);
    const chips = (list: readonly DurationChip[]) =>
        list.map((c) => (
            <button key={c.minutes} type="button" onClick={() => onPick(c.minutes)} className={CHIP}>
                {c.label}
            </button>
        ));
    const step = (label: string, to: Stage) => (
        <button type="button" onClick={() => setStage(to)} className={CHIP}>
            {label}
        </button>
    );

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {stage === "relative" && reference ? (
                <>
                    <button type="button" onClick={() => onPick(reference)} className={CHIP}>
                        About right
                    </button>
                    {step("Shorter", "shorter")}
                    {step("Longer", "longer")}
                </>
            ) : null}
            {stage === "shorter" && reference ? chips(relativeChips(reference, "shorter")) : null}
            {stage === "longer" && reference ? chips(relativeChips(reference, "longer")) : null}
            {stage === "absolute" ? (
                <>
                    {chips(ABSOLUTE_CHIPS)}
                    {step("More…", "more")}
                </>
            ) : null}
            {stage === "more" ? (
                <>
                    {chips(MORE_CHIPS)}
                    {step("Other", "other")}
                </>
            ) : null}
            {stage === "other" ? (
                <form
                    className="flex items-center gap-1.5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (parsed) onPick(parsed);
                    }}
                >
                    <input
                        autoFocus
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        inputMode="text"
                        aria-label="How long, for example 1h20 or 90"
                        placeholder="1h20, 90…"
                        className="min-h-9 w-28 rounded-full border border-accent-primary/30 bg-transparent px-3 text-[13px] text-twilight-text outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    />
                    <button type="submit" disabled={!parsed} className={`${CHIP} disabled:cursor-default disabled:opacity-50`}>
                        {parsed ? formatMinutes(parsed) : "Save"}
                    </button>
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

/**
 * "How long did it take?": optional quick picks on completion (Full). A tap saves and the toast stays a moment as
 * "Saved · 45 min · Change". Its countdown waits while the pointer or focus is inside it, so a keyboard or
 * screen-reader user is never timed out mid-reach. Skipping does nothing and costs nothing.
 */
export function DurationChips({
    id,
    title,
    reference,
    onShown,
    onPick,
}: {
    id: string | number;
    title: string;
    reference: number | null;
    onShown: () => void;
    onPick: (minutes: number) => void;
}) {
    const [saved, setSaved] = useState<number | null>(null);
    const [changing, setChanging] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    useEffect(onShown, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when it renders

    // Re-armed by every stage change. Hover and focus are read live when it fires, not counted from events: a chip
    // that unmounts while focused (picking, Shorter/Longer) never blurs, which left a count stuck and the toast open.
    useEffect(() => {
        if (changing) return; // choosing again: no countdown
        let timer: ReturnType<typeof setTimeout>;
        const arm = (ms: number) => {
            timer = setTimeout(() => {
                const el = box.current;
                if (el && (el.matches(":hover") || el.contains(document.activeElement))) arm(1_000);
                else toast.dismiss(id);
            }, ms);
        };
        arm(saved === null ? ASK_MS : SAVED_MS);
        return () => clearTimeout(timer);
    }, [id, changing, saved]);

    const name = toastName(title, 40);
    return (
        // The Cadence toast is the card: no surface of its own, or it shows a border inside a border.
        <div
            ref={box}
            role="group"
            aria-label="How long did it take?"
            className="flex w-full max-w-sm flex-col gap-2 text-sm text-twilight-text"
        >
            {saved !== null && !changing ? (
                <p className="flex flex-wrap items-center gap-x-2 leading-snug" role="status">
                    <span>
                        Saved · <span className="font-medium">{formatMinutes(saved)}</span>
                    </span>
                    <button type="button" onClick={() => setChanging(true)} className={QUIET}>
                        Change
                    </button>
                </p>
            ) : (
                <>
                    <p className="leading-snug">
                        How long did <span className="font-medium">{name}</span> take?
                        {reference && saved === null ? (
                            <>
                                {" "}
                                About <span className="font-medium">{formatMinutes(reference)}</span>?
                            </>
                        ) : null}
                    </p>
                    <DurationChoices
                        reference={reference}
                        skipLabel={saved === null ? "Skip" : "Cancel"}
                        onSkip={() => (saved === null ? toast.dismiss(id) : setChanging(false))}
                        onPick={(minutes) => {
                            onPick(minutes);
                            setSaved(minutes);
                            setChanging(false);
                        }}
                    />
                </>
            )}
        </div>
    );
}
