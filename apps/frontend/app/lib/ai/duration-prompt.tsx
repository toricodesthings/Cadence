import { toast } from "sonner";
import type { DurationAskResult } from "@cadence/contracts/memory";
import { DurationChips } from "../../components/assistant/DurationChips";

export interface DurationApi {
    ask: (taskId: string) => Promise<DurationAskResult>;
    shown: (token: string) => Promise<void>;
    report: (input: { taskId: string; minutes: number }) => Promise<void>;
}

/**
 * After the person completes a task, in Full, maybe ask how long it took. The server decides (its budget is one
 * shown ask a day across devices, backing off when ignored) and spends the day only once the toast has rendered.
 * Never required, and skipping records nothing; every failure is silent.
 */
export async function offerDuration(task: { id: string; title: string }, memoryMode: string | null | undefined, api: DurationApi): Promise<void> {
    if (memoryMode !== "full") return;
    try {
        const result = await api.ask(task.id);
        if (!result.ask) return;
        toast.custom(
            (id) => (
                <DurationChips
                    id={id}
                    title={task.title}
                    reference={result.reference}
                    onShown={() => void api.shown(result.token).catch(() => undefined)}
                    onPick={(minutes) => void api.report({ taskId: task.id, minutes }).catch(() => undefined)}
                />
            ),
            // Closed by the toast itself, which waits while it is hovered or focused.
            { duration: Infinity },
        );
    } catch {
        // Quiet: a question that can't be asked is not worth an error.
    }
}
