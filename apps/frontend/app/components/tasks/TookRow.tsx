import { useState } from "react";
import { Hourglass } from "lucide-react";
import { formatValue } from "@cadence/domain/duration-chips";
import type { DurationValue } from "@cadence/contracts/memory";
import { useReportedDuration, useReportedRoutineDuration, useSetReportedDuration, useSetReportedRoutineDuration } from "../../hooks/ai/use-memory";
import { formatWallTime } from "../../lib/utils/date-format";
import { toastUndo } from "../../lib/utils/undo-toast";
import { DurationChoices } from "../assistant/DurationChips";
import { FieldRow, VALUE_BTN } from "../shared/DetailPanelSections";

interface TookSave {
    isPending: boolean;
    isError: boolean;
    variables: { value: DurationValue; anchored: boolean } | null | undefined;
    mutate: (input: { value: DurationValue; anchored: boolean } | null) => void;
}

/**
 * "Took 45 min" (Full only). With no answer it reads "Took · Add": the one way someone who is never asked can still
 * teach Cadence. It renders what the server stored, never its own draft: Saving… while a change is on its way, and
 * "Couldn't save · Retry" with the choice kept if it fails. A task's answer and a routine day's are the same row.
 */
function TookField({ view, save, label = "Took" }: { view: { lowMinutes: number; highMinutes: number } | null | undefined; save: TookSave; label?: string }) {
    const [editing, setEditing] = useState(false);
    const text = view ? formatValue(view) : null;
    const failed = save.isError;

    return (
        <FieldRow icon={Hourglass} label={label}>
            {editing ? (
                <div className="flex flex-col items-end gap-1.5">
                    <DurationChoices
                        // Their own answer, shown as the picked chip: re-saving it must not turn it into an "About right".
                        reference={null}
                        suggested={view && view.lowMinutes === view.highMinutes ? view.lowMinutes : undefined}
                        skipLabel="Cancel"
                        onSkip={() => setEditing(false)}
                        onPick={(value, anchored) => {
                            save.mutate({ value, anchored });
                            setEditing(false);
                        }}
                    />
                    {view ? (
                        <button
                            type="button"
                            onClick={() => {
                                const before = { value: view.lowMinutes === view.highMinutes ? { kind: "point" as const, minutes: view.lowMinutes } : { kind: "range" as const, lowMinutes: view.lowMinutes, highMinutes: view.highMinutes }, anchored: "anchored" in view ? Boolean(view.anchored) : false };
                                save.mutate(null);
                                setEditing(false);
                                toastUndo("Took cleared", () => save.mutate(before));
                            }}
                            className={VALUE_BTN}
                        >
                            Clear
                        </button>
                    ) : null}
                </div>
            ) : save.isPending ? (
                <span role="status" className="px-2.5 text-[13px] text-twilight-text-muted">
                    Saving…
                </span>
            ) : failed ? (
                <span role="status" className="flex items-center gap-1">
                    <span className="px-2.5 text-[13px] text-twilight-text-muted">Couldn’t save</span>
                    <button type="button" onClick={() => save.mutate(save.variables ?? null)} className={VALUE_BTN}>
                        Retry
                    </button>
                </span>
            ) : (
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className={`${VALUE_BTN} ${view ? "" : "text-twilight-text-muted"}`}
                    aria-label={view ? `${label} ${text}. Change` : "How long did it take? Add"}
                >
                    {view ? text : "Add"}
                </button>
            )}
        </FieldRow>
    );
}

export function TookRow({ taskId, completedAt, enabled }: { taskId: string; completedAt: string | null | undefined; enabled: boolean }) {
    const { data: view } = useReportedDuration(taskId, completedAt, enabled);
    const save = useSetReportedDuration(taskId, completedAt);
    if (!enabled) return null;
    return <TookField view={view} save={save} />;
}

/** The same row on a routine's marked day (or marked time): "Took · Add" until they say. Never asked for, only offered. */
export function RoutineTookRow({ habitId, day, time = null, enabled }: { habitId: string; day: string; time?: string | null; enabled: boolean }) {
    const { data: view } = useReportedRoutineDuration(habitId, day, time, enabled);
    const save = useSetReportedRoutineDuration(habitId, day, time);
    if (!enabled) return null;
    return <TookField view={view} save={save} label={time ? `Took at ${formatWallTime(time)}` : "Took"} />;
}
