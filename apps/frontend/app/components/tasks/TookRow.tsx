import { useState } from "react";
import { Hourglass } from "lucide-react";
import { formatValue } from "@cadence/domain/duration-chips";
import { useReportedDuration, useSetReportedDuration } from "../../hooks/ai/use-memory";
import { toastUndo } from "../../lib/utils/undo-toast";
import { DurationChoices } from "../assistant/DurationChips";
import { FieldRow, VALUE_BTN } from "../shared/DetailPanelSections";

/**
 * "Took 45 min" on a done task (Full only). With no answer it reads "Took · Add": the one way someone who is never
 * asked can still teach Cadence. It renders what the server stored, never its own draft: Saving… while a change is
 * on its way, and "Couldn't save · Retry" with the choice kept if it fails.
 */
export function TookRow({ taskId, completedAt, enabled }: { taskId: string; completedAt: string | null | undefined; enabled: boolean }) {
    const { data: view } = useReportedDuration(taskId, completedAt, enabled);
    const save = useSetReportedDuration(taskId, completedAt);
    const [editing, setEditing] = useState(false);
    if (!enabled) return null;

    const text = view ? formatValue(view) : null;
    const failed = save.isError;

    return (
        <FieldRow icon={Hourglass} label="Took">
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
                                const before = { value: view.lowMinutes === view.highMinutes ? { kind: "point" as const, minutes: view.lowMinutes } : { kind: "range" as const, lowMinutes: view.lowMinutes, highMinutes: view.highMinutes }, anchored: view.anchored };
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
                    aria-label={view ? `Took ${text}. Change` : "How long did it take? Add"}
                >
                    {view ? text : "Add"}
                </button>
            )}
        </FieldRow>
    );
}
