import { useState } from "react";
import { Hourglass } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { formatMinutes } from "@cadence/domain/duration-chips";
import { useDurationGuess } from "../../hooks/ai/use-duration-guess";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { getTaskSeriesId } from "../../lib/utils/task/task-scheduling";
import { toastUndo } from "../../lib/utils/undo-toast";
import { DurationChoices } from "../assistant/DurationChips";
import { FieldRow, VALUE_BTN } from "../shared/DetailPanelSections";

export const hasTakesRow = (task: Pick<Task, "scheduledStart" | "state" | "interactionMode">) =>
    !task.scheduledStart && task.interactionMode !== "timetable" && task.state !== "COMPLETE";

export function TakesRow({ task }: { task: Task }) {
    const guess = useDurationGuess(task);
    const updateTask = useUpdateTask();
    const [editing, setEditing] = useState(false);
    const estimate = task.durationEstimate ?? null;

    const set = (minutes: number | null) => {
        const before = estimate;
        updateTask.mutate({ id: getTaskSeriesId(task), durationEstimate: minutes });
        setEditing(false);
        toastUndo(minutes === null ? "Takes cleared" : `Takes ${formatMinutes(minutes)}`, () =>
            updateTask.mutate({ id: getTaskSeriesId(task), durationEstimate: before }),
        );
    };

    const shownGuess = !estimate && guess ? guess : null;
    const label = estimate
        ? formatMinutes(estimate)
        : shownGuess
          ? `about ${formatMinutes(shownGuess.minutes)}${shownGuess.state === "tentative" ? "?" : ""}`
          : "Not set";
    const name = estimate
        ? `Takes ${formatMinutes(estimate)}. Change`
        : shownGuess
          ? `Takes about ${formatMinutes(shownGuess.minutes)}, a guess from ${shownGuess.reports} of your answers${shownGuess.state === "tentative" ? ", not yet sure" : ""}. Change`
          : "How long will it take? Set";

    return (
        <FieldRow icon={Hourglass} label="Takes">
            {editing ? (
                <div className="flex flex-col items-end gap-1.5">
                    <DurationChoices
                        reference={null}
                        pointsOnly
                        suggested={!estimate && shownGuess?.state === "supported" ? shownGuess.minutes : undefined}
                        skipLabel="Cancel"
                        onSkip={() => setEditing(false)}
                        onPick={(value) => set(value.kind === "point" ? value.minutes : null)}
                    />
                    {estimate ? (
                        <button type="button" onClick={() => set(null)} className={VALUE_BTN}>
                            Clear
                        </button>
                    ) : null}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    aria-label={name}
                    className={`${VALUE_BTN} ${estimate ? "" : "text-twilight-text-muted"}`}
                >
                    {label}
                </button>
            )}
        </FieldRow>
    );
}
