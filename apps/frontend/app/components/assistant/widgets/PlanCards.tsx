import { useMemo, useState } from "react";
import { CalendarRange, Check, Clock } from "lucide-react";
import { bucketOf } from "@cadence/domain/find-time";
import type { FitDayResult } from "@cadence/domain/fit-day";
import { Button } from "../../primitives/Button";
import { FitDayPreview } from "../../today/FitDayPreview";
import { useFitDay } from "../../../hooks/tasks/use-fit-day";
import { statusOf, useFindTime } from "../../../hooks/tasks/use-find-time";
import { useTask } from "../../../hooks/tasks/use-tasks";
import { useUpdateTask } from "../../../hooks/tasks/use-update-task";
import { useOnlineStatus } from "../../../hooks/core/use-online-status";
import { temporalOf } from "../../../lib/utils/calendar/schedule-model";
import { formatChipTime } from "../../../lib/utils/date-format";
import { toastError } from "../../../lib/utils/error-toast";
import { toastName, toastUndo } from "../../../lib/utils/undo-toast";
import { getUserZone, useToday } from "../../../lib/utils/user-zone";
import type { ToolRenderContext } from "./ApprovalCard";

const FRAME = "mt-2 w-full rounded-2xl border border-accent-primary/20 bg-accent-primary/8 bg-twilight-deep/50 p-3";
const EYEBROW = "mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-primary";
const SETTLED = "mt-2 flex w-full items-center gap-1.5 rounded-xl border border-twilight-border bg-twilight-surface p-3 text-xs italic text-twilight-text-muted";

const toInstant = (zoned: string) => new Date(zoned).toISOString();

type FitDayOutput = NonNullable<ToolRenderContext<"fit_day">["part"]["output"]>;
type FindTimeOutput = NonNullable<ToolRenderContext<"find_time">["part"]["output"]>;

/**
 * "Plan my day": `fit_day`'s result as Fit today's own preview. The tool only read; Place here is the person's tap,
 * the same `POST /tasks/place` and one Undo as on Today. A plan for a day that has passed is laid out again for today.
 */
export function FitDayCard({ ctx }: { ctx: ToolRenderContext<"fit_day"> }) {
    const output = ctx.part.state === "output-available" ? ctx.part.output : undefined;
    // Running shows the read chip's spinner; a failure is explained in the assistant's own words.
    if (!output || output.ok !== true || !output.day) return null;
    return <FitDayCardBody output={output} day={output.day} />;
}

function FitDayCardBody({ output, day: planned }: { output: FitDayOutput; day: string }) {
    const today = useToday();
    const stale = planned < today;
    const day = stale ? today : planned;
    const placedOut = output.placed ?? [];
    const didntFitOut = output.didntFit ?? [];
    const notSizedOut = output.notSized ?? [];
    const fit = useFitDay(day);
    const [state, setState] = useState<"open" | "placed" | "closed">("open");
    const initial = useMemo<FitDayResult | null>(() => (stale ? null : {
        placed: placedOut.map((p) => ({ taskId: p.id, start: toInstant(p.start), end: toInstant(p.end) })),
        didntFit: didntFitOut.map((t) => t.id),
        notSized: notSizedOut.map((t) => t.id),
    }), [output, stale]); // eslint-disable-line react-hooks/exhaustive-deps -- the arrays come from `output`
    const titles = useMemo(() => new Map([...placedOut, ...didntFitOut, ...notSizedOut].map((t) => [t.id, t.title])), [output]); // eslint-disable-line react-hooks/exhaustive-deps -- as above

    if (state === "placed") return <div className={SETTLED}><Check size={12} className="shrink-0 text-feedback-success" aria-hidden="true" /><span>Placed</span></div>;
    if (state === "closed") {
        return (
            <div className={SETTLED}>
                <span className="flex-1">Not placed</span>
                <button type="button" onClick={() => setState("open")} className="min-h-9 cursor-pointer rounded-full px-2 not-italic text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">Show again</button>
            </div>
        );
    }
    return (
        <section className={FRAME} aria-label="Plan for the day">
            <p className={EYEBROW}><CalendarRange size={12} aria-hidden="true" />Fit into {day === today ? "today’s" : "the day’s"} gaps</p>
            <FitDayPreview day={day} fit={fit} initial={initial} titles={titles} notice={stale ? "Your day changed" : undefined} onDone={(placed) => setState(placed ? "placed" : "closed")} />
        </section>
    );
}

/** One task's gap from `find_time`: one row with Place and Another time. Place is the person's tap, with Undo. */
export function FindTimeCard({ ctx }: { ctx: ToolRenderContext<"find_time"> }) {
    const output = ctx.part.state === "output-available" ? ctx.part.output : undefined;
    if (!output || output.ok !== true || !output.task) return null;
    return <FindTimeCardBody output={output} task={output.task} />;
}

function FindTimeCardBody({ output, task: about }: { output: FindTimeOutput; task: { id: string; title: string } }) {
    const task = useTask(about.id);
    const find = useFindTime();
    const updateTask = useUpdateTask();
    const online = useOnlineStatus();
    const [index, setIndex] = useState(0);
    const [placedAt, setPlacedAt] = useState<string | null>(null);
    const [placing, setPlacing] = useState(false);
    const zone = getUserZone();
    // A chat read again later never offers a time that has already passed.
    const proposals = useMemo(() => (output.proposals ?? []).map((p) => {
        const start = toInstant(p.start);
        return { start, end: toInstant(p.end), bucket: bucketOf(start, zone) };
    }).filter((p) => Date.parse(p.start) > Date.now()), [output, zone]);
    const proposal = proposals[index];

    if (!proposal) return <div className={SETTLED}><span>No gap that fits</span></div>;
    if (placedAt) return <div className={SETTLED}><Check size={12} className="shrink-0 text-feedback-success" aria-hidden="true" /><span>Placed · {placedAt}</span></div>;

    const place = async () => {
        if (!task || placing) return;
        setPlacing(true);
        const before = temporalOf(task);
        try {
            // Every time of day seen so far: a pick after comparing is what teaches, a first one kept doesn't.
            await find.write(task, proposal, [...new Set(proposals.slice(0, index + 1).map((p) => p.bucket))]);
            const label = formatChipTime(proposal.start, proposal.end);
            setPlacedAt(label);
            toastUndo(toastName(task.title, 40), () => void updateTask.mutateAsync({ id: task.id, ...before, findTime: { undo: true } }), { description: label });
        } catch (error) {
            if (statusOf(error) === 409) toastError(error, "Couldn't place it");
        } finally {
            setPlacing(false);
        }
    };

    return (
        <section className={FRAME} aria-label={`A time for ${about.title}`}>
            <p className={EYEBROW}><Clock size={12} aria-hidden="true" />A gap for {about.title}</p>
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm tabular-nums text-twilight-text" role="status" aria-live="polite">{formatChipTime(proposal.start, proposal.end)}</span>
                <Button variant="secondary" size="md" onClick={() => setIndex(index + 1)} disabled={index >= proposals.length - 1}>Another time</Button>
                <Button variant="cardPrimary" size="md" onClick={() => void place()} disabled={!task || !online || placing}>Place</Button>
            </div>
            {!online ? <p className="mt-1 text-xs text-twilight-text-muted">Needs a connection</p> : null}
        </section>
    );
}
