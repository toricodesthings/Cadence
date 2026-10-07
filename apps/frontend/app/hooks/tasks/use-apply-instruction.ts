import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Task } from "@cadence/contracts/task";
import { undoPatch, type InstructionPatch } from "@cadence/domain/task-instruction";
import { useUpdateTask } from "./use-update-task";
import { useAddTaskTag } from "../tags/use-task-tags";
import { queryKeys } from "../../lib/api/query-keys";

/** The most one instruction may change at once. */
export const MAX_BATCH = 25;

export interface ApplyResult { ok: string[]; failed: string[] }

const FIELD_KEYS = ["state", "dueDate", "scheduledStart", "scheduledEnd", "durationEstimate", "projectId", "sectionId", "waitingOn", "notBefore", "waitingReminder", "priority"] as const;

const pick = (task: Task, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, (task as unknown as Record<string, unknown>)[k] ?? null]));

/**
 * Apply one patch to the tasks the user selected, one by one, keeping a result per task. A task that fails stays
 * for a retry; one that succeeded is never redone. Undo puts back only the fields still holding what this wrote.
 */
export function useApplyInstruction() {
    const update = useUpdateTask();
    const addTag = useAddTaskTag();
    const queryClient = useQueryClient();
    const busy = useRef(false);

    const current = useCallback((id: string): Task | undefined => {
        for (const [, list] of queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all })) {
            const found = Array.isArray(list) ? list.find((t) => t.id === id) : undefined;
            if (found) return found;
        }
        return undefined;
    }, [queryClient]);

    const apply = useCallback(async (tasks: Task[], patch: InstructionPatch, label: string): Promise<ApplyResult> => {
        const result: ApplyResult = { ok: [], failed: [] };
        if (busy.current || tasks.length === 0) return result;
        busy.current = true;
        const { addTagIds, ...fields } = patch;
        const before = new Map(tasks.map((t) => [t.id, pick(t, Object.keys(fields))]));
        try {
            for (const task of tasks.slice(0, MAX_BATCH)) {
                try {
                    if (Object.keys(fields).length) await update.mutateAsync({ id: task.id, ...fields });
                    for (const tagId of addTagIds ?? []) if (!task.tagIds?.includes(tagId)) await addTag.mutateAsync({ taskId: task.id, tagId });
                    result.ok.push(task.id);
                } catch {
                    result.failed.push(task.id);
                }
            }
        } finally {
            busy.current = false;
        }
        if (result.ok.length) {
            toast.success(result.failed.length ? `${label}: ${result.ok.length} done, ${result.failed.length} didn't save` : label, {
                action: {
                    label: "Undo",
                    onClick: () => {
                        for (const id of result.ok) {
                            const now = current(id);
                            if (!now) continue;
                            const restore = undoPatch(fields, before.get(id) ?? {}, pick(now, FIELD_KEYS));
                            if (Object.keys(restore).length) update.mutate({ id, ...restore });
                        }
                    },
                },
            });
        }
        return result;
    }, [update, addTag, current]);

    return { apply, isPending: update.isPending };
}
