import { ListChecks, Check } from "lucide-react";
import { UtilitySheet } from "../../shared/UtilitySheet";
import { Button } from "../../primitives/Button";
import { useNoteSubtasks } from "../../../hooks/tasks/use-note-subtasks";

/**
 * Preview of the lines a note would turn into subtasks. Creation happens only on the button,
 * once per batch; a series note says which occurrence receives them.
 */
export function NoteConvertSheet({
    open, onClose, taskId, taskTitle, body, seriesNote, layer,
}: {
    open: boolean;
    onClose: () => void;
    taskId: string;
    taskTitle: string;
    body: string;
    seriesNote: boolean;
    layer?: "route" | "room";
}) {
    const { lines, submitting, done, convert, undo } = useNoteSubtasks(taskId, body);
    return (
        <UtilitySheet
            title="Subtasks from lines"
            subtitle={seriesNote ? `Added to this occurrence: ${taskTitle}` : `Added to: ${taskTitle}`}
            open={open}
            onClose={onClose}
            fit
            layer={layer}
            footer={
                <div className="flex justify-end gap-2 px-4 py-3">
                    {done ? (
                        <>
                            <Button variant="ghost" size="md" onClick={undo}>Undo</Button>
                            <Button size="md" onClick={onClose}><Check size={16} aria-hidden="true" />Done</Button>
                        </>
                    ) : (
                        <Button size="md" disabled={lines.length === 0 || submitting} onClick={() => void convert()}>
                            <ListChecks size={16} aria-hidden="true" />
                            {submitting ? "Adding…" : `Create ${lines.length} subtask${lines.length === 1 ? "" : "s"}`}
                        </Button>
                    )}
                </div>
            }
        >
            {lines.length === 0 ? (
                <p className="py-2 text-[15px] text-twilight-text-soft">No list lines to turn into subtasks yet. Bullets, numbers and checklist items count.</p>
            ) : (
                <ul className="flex flex-col gap-1 py-2">
                    {lines.map((line, i) => (
                        <li key={`${i}-${line}`} className="rounded-xl bg-twilight-surface/60 px-3 py-2.5 text-[15px] text-twilight-text">{line}</li>
                    ))}
                </ul>
            )}
        </UtilitySheet>
    );
}
