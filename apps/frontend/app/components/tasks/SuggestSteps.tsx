import { Sparkles, X } from "lucide-react";
import { STEP_MAX_CHARS } from "@cadence/contracts/planning";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives";
import { Reveal } from "../shared/Reveal";
import { useOnlineStatus } from "../../hooks/core/use-online-status";
import { isWanted, type SuggestSteps } from "../../hooks/ai/use-suggest-steps";

/**
 * The "Suggest steps" text button beside a subtask field. It never takes focus from the field (a failure leaves the
 * manual path where it was), and is disabled offline.
 */
export function SuggestStepsButton({ s }: { s: SuggestSteps }) {
    const online = useOnlineStatus();
    const button = (
        <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={s.suggest}
            disabled={!online || s.status === "drafting"}
            data-no-dnd="true"
            data-no-open="true"
            className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[13px] text-accent-primary hover:bg-accent-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-default disabled:opacity-50 pointer-coarse:min-h-11"
        >
            <Sparkles size={13} aria-hidden="true" />
            {s.status === "drafting" ? "Drafting…" : "Suggest steps"}
        </button>
    );
    return online ? button : <Tip label="Needs a connection"><span>{button}</span></Tip>;
}

/** The draft: ghost steps, all ticked, each editable; Keep steps, Smaller (once) and ×. */
export function SuggestedSteps({ s }: { s: SuggestSteps }) {
    const ticked = s.draft?.filter(isWanted).length ?? 0;
    return (
        <>
            <p role="status" aria-live="polite" className="empty:hidden">
                {s.status === "failed" ? (
                    <span className="flex items-center gap-2 px-1 py-1 text-[13px] text-twilight-text-muted">
                        Couldn’t suggest steps
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={s.retry} className="min-h-9 cursor-pointer rounded-full px-2 text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">Try again</button>
                    </span>
                ) : null}
            </p>
            <Reveal open={!!s.draft}>
                {s.draft ? (
                    <div role="group" aria-label="Suggested steps" className="surface-item mt-1 flex flex-col gap-0.5 rounded-2xl border border-dashed border-accent-primary/30 p-2" data-no-dnd="true" data-no-open="true">
                        {s.draft.length === 0 ? <p className="px-1 py-2 text-[13px] text-twilight-text-muted">No new steps to add.</p> : null}
                        {s.draft.map((step) => (
                            <div key={step.key} className="flex min-h-11 items-center gap-2 rounded-xl px-1">
                                <input
                                    type="checkbox"
                                    checked={step.ticked}
                                    onChange={(e) => s.edit(step.key, { ticked: e.target.checked })}
                                    aria-label={`Keep “${step.title}”`}
                                    className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent-primary)]"
                                />
                                <input
                                    type="text"
                                    value={step.title}
                                    maxLength={STEP_MAX_CHARS}
                                    onChange={(e) => s.edit(step.key, { title: e.target.value })}
                                    aria-label="Step"
                                    className={`min-w-0 flex-1 rounded-lg bg-transparent px-1 text-[13px] leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${step.ticked ? "text-twilight-text" : "text-twilight-text-muted line-through"}`}
                                />
                            </div>
                        ))}
                        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                            <Tip label="Discard">
                                <button type="button" onClick={s.discard} aria-label="Discard suggested steps" className="touch-target inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-twilight-text-soft hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                                    <X size={15} aria-hidden="true" />
                                </button>
                            </Tip>
                            {s.canSmaller ? <Button variant="ghost" size="sm" onClick={s.smaller} disabled={s.status === "drafting"}>Smaller</Button> : null}
                            <Button variant="cardPrimary" size="sm" onClick={s.keep} disabled={!ticked || s.keeping}>Keep steps</Button>
                        </div>
                    </div>
                ) : null}
            </Reveal>
        </>
    );
}
