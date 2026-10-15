import { useState } from "react";
import { Hourglass } from "lucide-react";
import { formatMinutes } from "@cadence/domain/duration-chips";
import { useReportedDuration, useSetReportedDuration } from "../../hooks/ai/use-memory";
import { DurationChoices } from "../assistant/DurationChips";
import { FieldRow, VALUE_BTN } from "../shared/DetailPanelSections";

/** "Took 45 min" on a done task: only when an answer exists (Full). Tap to change it or clear it. */
export function TookRow({ taskId, enabled }: { taskId: string; enabled: boolean }) {
    const { data: minutes } = useReportedDuration(taskId, enabled);
    const save = useSetReportedDuration(taskId);
    const [editing, setEditing] = useState(false);
    if (!minutes) return null;

    return (
        <FieldRow icon={Hourglass} label="Took">
            {editing ? (
                <div className="flex flex-col items-end gap-1.5">
                    <DurationChoices
                        reference={minutes}
                        skipLabel="Cancel"
                        onSkip={() => setEditing(false)}
                        onPick={(next) => {
                            save.mutate(next);
                            setEditing(false);
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            save.mutate(null);
                            setEditing(false);
                        }}
                        className={VALUE_BTN}
                    >
                        Clear
                    </button>
                </div>
            ) : (
                <button type="button" onClick={() => setEditing(true)} className={VALUE_BTN} aria-label={`Took ${formatMinutes(minutes)}. Change`}>
                    {formatMinutes(minutes)}
                </button>
            )}
        </FieldRow>
    );
}
