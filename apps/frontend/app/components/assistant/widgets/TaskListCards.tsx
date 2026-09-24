/**
 * Cards that act on a list of existing tasks: `set_task_state`, `delete_tasks`
 * and `reschedule_tasks`. Each lists the tasks as rows the user can untick.
 */
import { useState } from "react";
import { CalendarClock, Check, CheckCircle2, AlertCircle, Trash2, Hourglass, RotateCcw, type LucideIcon } from "lucide-react";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { useTaskTitleLookup } from "./card-lookups";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { parseLocalDate } from "../../../lib/utils/date-format";

/** Up to four rows, then a "+ N more" reveal. */
function TaskRows({ rows, off, onToggle }: { rows: string[]; off: ReadonlySet<number>; onToggle: (i: number) => (() => void) | undefined }) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? rows : rows.slice(0, 4);
    return (
        <>
            <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                {visible.map((title, i) => (
                    <TickRow key={i} on={!off.has(i)} onToggle={onToggle(i)} label={title}>
                        <span className="text-truncate-safe">{title}</span>
                    </TickRow>
                ))}
            </div>
            {rows.length > visible.length ? (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="text-[11px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft cursor-pointer"
                >
                    + {rows.length - visible.length} more
                </button>
            ) : null}
        </>
    );
}

type State = "COMPLETE" | "ARCHIVED" | "ACTIVE" | "WAITING";

const STATE_COPY: Record<State, { eyebrow: string; glyph: LucideIcon; primary: (n: number) => string; done: (n: number, waitingOn?: string) => string; tone?: "success" }> = {
    COMPLETE: { eyebrow: "MARK DONE", glyph: CheckCircle2, primary: (n) => `Mark ${n} done`, done: (n) => `Marked ${n} done. Nice.`, tone: "success" },
    ARCHIVED: { eyebrow: "MOVE TO TRASH", glyph: Trash2, primary: () => "Move to Trash", done: (n) => `Moved ${n} to Trash.` },
    ACTIVE: { eyebrow: "REOPEN", glyph: RotateCcw, primary: () => "Reopen", done: (n) => `Reopened ${n}.` },
    WAITING: { eyebrow: "ON HOLD", glyph: Hourglass, primary: () => "Put on hold", done: (n, on) => (on ? `On hold, waiting on ${on}.` : `Put ${n} on hold.`) },
};

/** Card for `set_task_state`: done, Trash (restorable), reopen, or waiting on someone. */
export function SetStateCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const lookupTitle = useTaskTitleLookup();
    const { off, onToggle, removed } = useUnticked(ctx);
    const input = ctx.part?.input ?? {};
    const taskIds: string[] = input.taskIds ?? [];
    const copy = STATE_COPY[(input.state as State) ?? "COMPLETE"] ?? STATE_COPY.COMPLETE;
    const titles = taskIds.map(lookupTitle);
    const kept = titles.length - off.size;

    return (
        <ApprovalCard
            ctx={ctx}
            tone={copy.tone}
            eyebrow={copy.eyebrow}
            eyebrowGlyph={copy.glyph}
            ariaLabel={`${copy.eyebrow}: ${titles.join(", ")}`}
            primaryLabel={copy.primary(kept)}
            primaryGlyph={Check}
            declineLabel="Not yet"
            removed={removed(titles)}
            doneText={copy.done(ctx.part?.output?.updated ?? titles.length, input.waitingOn)}
            declinedText="Left them as they were."
        >
            {input.state === "WAITING" && input.waitingOn ? (
                <p className="text-xs text-twilight-text-soft">Waiting on {input.waitingOn}</p>
            ) : null}
            {persona.terse && titles.length > 3 ? (
                <p className="text-xs text-twilight-text-soft">{titles.length} tasks</p>
            ) : (
                <TaskRows rows={titles} off={off} onToggle={onToggle} />
            )}
        </ApprovalCard>
    );
}

/**
 * Danger card for `delete_tasks` (design §4.4): permanent, so the exact titles are
 * echoed and the frame is calm but unmistakable. Auto still waits for this tap.
 */
export function DeleteTasksCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const { off, onToggle, removed } = useUnticked(ctx);
    const targets: { taskId: string; title: string }[] = ctx.part?.input?.tasks ?? [];
    const titles = targets.map((t) => t.title);
    const kept = titles.length - off.size;

    return (
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow={titles.length > 1 ? `DELETE ${titles.length} TASKS` : "DELETE TASK"}
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete: ${titles.join(", ")}`}
            primaryLabel={titles.length > 1 ? `Delete ${kept}` : "Delete it"}
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            removed={removed(titles)}
            doneText={titles.length > 1 ? `Deleted ${ctx.part?.output?.deleted ?? titles.length}.` : `Deleted “${titles[0]}”.`}
            declinedText="Kept it."
        >
            <TaskRows rows={titles} off={off} onToggle={onToggle} />
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">These won’t come back.</p>}
        </ApprovalCard>
    );
}

function dayLabel(iso?: string): string {
    if (!iso) return "later";
    // A date-only target is a local day; `new Date("2026-09-22")` would be UTC midnight.
    const d = parseLocalDate(iso);
    if (Number.isNaN(d.getTime())) return "later";
    return d.toLocaleDateString(undefined, { weekday: "long" });
}

/**
 * Change-set card for `reschedule_tasks` (design §4.2). Load-reducing framing;
 * each task keeps its own time on the new day (the server moves them one by one).
 */
export function RescheduleCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const lookupTitle = useTaskTitleLookup();
    const { off, onToggle, removed } = useUnticked(ctx);
    const input = ctx.part?.input ?? {};
    const titles = ((input.taskIds ?? []) as string[]).map(lookupTitle);
    const day = dayLabel(input.targetDate?.slice(0, 10));
    const kept = titles.length - off.size;

    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={`RESCHEDULE ${titles.length} ${titles.length === 1 ? "ITEM" : "ITEMS"}`}
            eyebrowGlyph={CalendarClock}
            ariaLabel={`Move to ${day}: ${titles.join(", ")}`}
            primaryLabel={kept === titles.length ? `Move ${titles.length > 1 ? "all " : ""}to ${day}` : `Move ${kept} to ${day}`}
            primaryGlyph={Check}
            removed={removed(titles)}
            // Fixed blocks stay put, so the server's count is the honest one.
            doneText={`Moved ${ctx.part?.output?.moved ?? titles.length} to ${day}.`}
            declinedText="Left them where they were."
        >
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">Want me to push these to {day} so today’s lighter?</p>}
            <TaskRows rows={titles.map((title) => `${title} → ${day}`)} off={off} onToggle={onToggle} />
        </ApprovalCard>
    );
}
