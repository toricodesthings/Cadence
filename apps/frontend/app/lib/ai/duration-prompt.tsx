import { toast } from "sonner";
import type { DurationAskResult, DurationReport, DurationReportView } from "@cadence/contracts/memory";
import { relativeReference } from "@cadence/domain/duration-ask";
import { DurationChips } from "../../components/assistant/DurationChips";

export interface DurationApi {
    ask: (taskId: string) => Promise<DurationAskResult>;
    shown: (token: string) => Promise<void>;
    report: (input: DurationReport) => Promise<DurationReportView | null>;
}

/**
 * After the person completes a task, in Full, maybe ask how long it took. The server decides (its budget is one
 * ask a day across devices, reserved when it says yes, backing off when ignored). Never required, and skipping
 * records nothing; every failure to *ask* is silent. `guess` is Cadence's own number for this task: the question
 * never uses it as a reference (it would anchor the answer).
 */
export async function offerDuration(task: { id: string; title: string }, memoryMode: string | null | undefined, api: DurationApi, guess: number | null = null): Promise<void> {
    if (memoryMode !== "full") return;
    try {
        const result = await api.ask(task.id);
        if (!result.ask) return;
        toast.custom(
            (id) => (
                <DurationChips
                    id={id}
                    title={task.title}
                    reference={relativeReference(result.reference, guess)}
                    onShown={() => void api.shown(result.token).catch(() => undefined)}
                    onSave={(value, anchored) => api.report({ taskId: task.id, completedAt: result.completedAt, value, anchored, token: result.token })}
                />
            ),
            // Closed by the toast itself, which waits while it is hovered or focused.
            { duration: Infinity },
        );
    } catch {
        // Quiet: a question that can't be asked is not worth an error.
    }
}
